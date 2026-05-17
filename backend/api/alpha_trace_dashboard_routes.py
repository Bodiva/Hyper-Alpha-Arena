from __future__ import annotations

import html
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from functools import lru_cache
from hashlib import sha1
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from schemas.alpha_trace_dashboard import (
    AlphaTraceDashboardCounts,
    AlphaTraceDashboardSummary,
    AlphaTraceFundTrendSeries,
    AlphaTraceFundTrendsResponse,
    AlphaTraceTrendPoint,
)
from services.clickhouse_business_store import (
    ClickHouseStoreError,
    get_clickhouse_business_store,
    get_etf_import_table_name,
)
from services.domain_store.mysql_domain_store import (
    get_domain_store_type,
    get_mysql_domain_database_url,
    get_mysql_domain_store,
)
from services.evidence_retrieval.external_search import ExternalEvidenceSearch


router = APIRouter(prefix="/api/alpha-trace/dashboard", tags=["AlphaTrace Dashboard"])

_CLICKHOUSE_FUND_TRENDS_UNAVAILABLE_MESSAGE = "ClickHouse ETF 走势数据暂不可用，请确认数据源连接和业务表是否已同步。"
_CLICKHOUSE_FUND_TRENDS_EMPTY_MESSAGE = "ClickHouse 暂无可展示的基金/ETF 走势数据。"


def _clickhouse_sql_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _clickhouse_table_parts(table_name: str) -> tuple[str, str]:
    parts = [part.strip() for part in table_name.split(".") if part.strip()]
    if len(parts) == 1:
        parts = ["default", parts[0]]
    if len(parts) != 2 or any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part) for part in parts):
        raise ClickHouseStoreError(f"Invalid ClickHouse table name: {table_name}")
    return parts[0], parts[1]


def _quote_clickhouse_table(table_name: str) -> str:
    database, table = _clickhouse_table_parts(table_name)
    return f"`{database}`.`{table}`"


def _clickhouse_existing_tables(table_names: list[str]) -> set[str]:
    if not table_names:
        return set()
    normalized = []
    clauses = []
    for table_name in table_names:
        database, table = _clickhouse_table_parts(table_name)
        normalized_name = f"{database}.{table}"
        normalized.append(normalized_name)
        clauses.append(f"(database = {_clickhouse_sql_string(database)} AND name = {_clickhouse_sql_string(table)})")
    query = f"""
        SELECT database, name
        FROM system.tables
        WHERE {" OR ".join(clauses)}
        FORMAT JSON
    """
    payload = get_clickhouse_business_store().query_json(query)
    existing = set()
    for row in payload.get("data", []):
        if not isinstance(row, dict):
            continue
        existing.add(f"{row.get('database')}.{row.get('name')}")
    return {table_name for table_name in normalized if table_name in existing}


def _ensure_dashboard_domain_tables() -> None:
    if get_domain_store_type() == "mysql":
        get_mysql_domain_store()


class DashboardTestNewsItem(BaseModel):
    id: str
    title: str
    source: str
    time: str
    tickers: list[str] = Field(default_factory=list)
    summary: str
    url: str | None = None
    publishedAt: str | None = None
    isHot: bool = False


class DashboardTestInsightSource(BaseModel):
    title: str
    source: str
    url: str | None = None
    summary: str


class DashboardTestInsight(BaseModel):
    market_insight_id: str
    type: str = "market_update"
    headline: str
    summary: str
    summaryHtml: str | None = None
    completed_at: str
    topics: list[dict[str, str]] = Field(default_factory=list)
    sources: list[DashboardTestInsightSource] = Field(default_factory=list)


class DashboardTestBochaResponse(BaseModel):
    status: str
    query: str
    message: str | None = None
    newsItems: list[DashboardTestNewsItem] = Field(default_factory=list)
    insight: DashboardTestInsight | None = None
    cacheHit: bool = False
    cachedAt: str | None = None
    cacheExpiresAt: str | None = None


class DashboardTestMarketCard(BaseModel):
    assetId: str
    name: str
    symbol: str
    assetType: str
    semanticLabel: str
    price: float = 0
    change: float = 0
    changePercent: float = 0
    isPositive: bool = True
    asOfDate: str | None = None
    dataSource: str = "clickhouse"
    sourceName: str | None = None
    sparklineData: list[dict[str, Any]] = Field(default_factory=list)


class DashboardTestMarketCardsResponse(BaseModel):
    status: str
    message: str | None = None
    cards: list[DashboardTestMarketCard] = Field(default_factory=list)


DASHBOARD_TEST_MARKET_QUERY = (
    "今日 A股 美股 港股 国际市场 国内市场 市场收评 财经新闻 新浪财经 东方财富 财联社 证券日报"
)
DASHBOARD_TEST_MARKET_SOURCE_QUERIES: tuple[dict[str, Any], ...] = (
    {
        "label": "雪球",
        "query": "site:xueqiu.com 今日 A股 美股 港股 市场动态 ETF 基金 指数 板块",
        "hosts": ("xueqiu.com",),
    },
    {
        "label": "东方财富",
        "query": "site:finance.eastmoney.com 今日 A股 美股 港股 市场动态 财经新闻 收评",
        "hosts": ("eastmoney.com", "finance.eastmoney.com"),
    },
    {
        "label": "新浪财经",
        "query": "site:finance.sina.com.cn 今日 A股 美股 港股 市场动态 财经新闻 收评",
        "hosts": ("sina.com.cn", "finance.sina.com.cn"),
    },
    {
        "label": "财联社",
        "query": "site:cls.cn 今日 A股 美股 港股 市场动态 财经新闻 盘面",
        "hosts": ("cls.cn",),
    },
    {
        "label": "证券时报",
        "query": "site:stcn.com 今日 A股 美股 港股 市场动态 财经新闻 ETF 基金",
        "hosts": ("stcn.com",),
    },
)
DASHBOARD_QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DASHBOARD_QWEN_DEFAULT_MODEL = "qwen-plus"
DASHBOARD_QWEN_TIMEOUT_SECONDS = 18
DASHBOARD_TEST_BOCHA_CACHE_TTL_SECONDS = 30 * 60
DASHBOARD_TEST_BOCHA_DEFAULT_LIMIT = 10

_DASHBOARD_TEST_BOCHA_REFRESH_LOCK = threading.Lock()
_DASHBOARD_TEST_BOCHA_SCHEDULER_STARTED = False

_TICKER_KEYWORDS: dict[str, tuple[str, ...]] = {
    "AAPL": ("苹果", "Apple", "iPhone"),
    "NVDA": ("英伟达", "NVIDIA", "半导体", "芯片", "AI"),
    "MSFT": ("微软", "Microsoft", "Azure"),
    "TSLA": ("特斯拉", "Tesla", "马斯克"),
    "SPY": ("标普", "S&P", "美股"),
    "QQQ": ("纳斯达克", "Nasdaq", "科技股"),
    "GLD": ("黄金", "Gold"),
    "FXI": ("中概", "中国资产", "港股"),
}

_EXCLUDED_DASHBOARD_NEWS_HOST_PARTS = (
    "guba.eastmoney.com",
    "caifuhao.eastmoney.com",
    "stockpage.10jqka.com.cn",
    "q.stock.sohu.com",
    "bbs.cnnb.com.cn",
    "cngold.org",
    "cnfol.com",
    "downkr.com",
    "m.yxdown.com",
    "prnasia.com",
    "huanqiuw.com",
    "lawpa.cn",
    "kysec.cn/html/touzizhejiaoyujidi",
    "v.douyin.com",
)

_PREFERRED_DASHBOARD_NEWS_SOURCES = (
    "雪球",
    "东方财富",
    "新浪财经",
    "财联社",
    "证券时报",
)

_DASHBOARD_MODEL_FORBIDDEN_TEXT = (
    "Bocha",
    "bocha",
    "BOCHA",
    "实时检索",
    "检索词",
    "模型名",
    "接口名",
)

_EXCLUDED_DASHBOARD_NEWS_TEXT_PARTS = (
    "郑重声明",
    "免责声明",
    "版权所有",
    "ICP备案",
    "行情_走势图",
    "交易状态",
    "APP下载",
    "股吧",
    "财富号",
    "投资者教育基地",
    "投教",
    "媒体报道链接",
    "法律顾问",
    "山寨",
    "盘口异动",
    "不构成投资建议",
    "仅供参考",
    "风险自担",
    "知之小站",
    "标签_网易出品",
    "数据中心",
    "股票回购",
    "NIFD季报",
    "走势图",
    "查股票",
    "行情查询软件",
    "金融理财",
    "当可下载站",
    "上市公司信息披露-产品",
    "股票几点收盘",
    "搜狐证券",
    "Powered by Discuz",
    "论坛",
    "手机版",
)

_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)


@lru_cache(maxsize=1)
def _engine() -> Engine:
    return create_engine(
        get_mysql_domain_database_url(),
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args={"connect_timeout": 2, "read_timeout": 5, "write_timeout": 5},
    )


def _source_from_url(url: str | None, fallback: str) -> str:
    if not url:
        return fallback or "Bocha"
    hostname = urlparse(url).netloc.lower().removeprefix("www.")
    if not hostname:
        return fallback or "Bocha"
    source_map = {
        "finance.sina.com.cn": "新浪财经",
        "sina.com.cn": "新浪财经",
        "eastmoney.com": "东方财富",
        "finance.eastmoney.com": "东方财富",
        "em.com.cn": "东方财富",
        "xueqiu.com": "雪球",
        "cls.cn": "财联社",
        "stcn.com": "证券时报",
        "cnstock.com": "上海证券报",
        "zqrb.cn": "证券日报",
        "reuters.com": "Reuters",
        "bloomberg.com": "Bloomberg",
        "cnbc.com": "CNBC",
        "wsj.com": "WSJ",
    }
    for key, label in source_map.items():
        if key in hostname:
            return label
    return fallback or hostname


def _url_matches_hosts(url: str | None, hosts: tuple[str, ...]) -> bool:
    if not url:
        return False
    hostname = urlparse(url).netloc.lower().removeprefix("www.")
    return any(hostname == host or hostname.endswith(f".{host}") for host in hosts)


def _clean_dashboard_model_text(value: str, limit: int) -> str:
    clean = str(value or "")
    clean = re.sub(r"\b[Bb][Oo][Cc][Hh][Aa]\b\s*(?:实时检索|检索)?[:：]?", "", clean)
    clean = clean.replace("实时检索：", "").replace("实时检索:", "")
    clean = clean.replace("基于 对", "基于").replace("基于  对", "基于")
    for forbidden in _DASHBOARD_MODEL_FORBIDDEN_TEXT:
        clean = clean.replace(forbidden, "")
    clean = re.sub(r"\s{2,}", " ", clean).strip(" ：:，,")
    return _compact_summary(clean, limit)


def _compact_summary(value: str, limit: int = 220) -> str:
    compact = " ".join(str(value or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit].rstrip()}..."


def _clean_news_text(value: str, limit: int = 260) -> str:
    compact = " ".join(str(value or "").split())
    compact = _URL_RE.sub("", compact)
    compact = re.sub(r"\d+(?:\.\d+)?K?次浏览", "", compact, flags=re.IGNORECASE)
    for marker in ("郑重声明", "免责声明", "版权所有", "ICP备案", "交易状态", "APP下载", "风险提示"):
        marker_index = compact.find(marker)
        if marker_index >= 24:
            compact = compact[:marker_index]
        elif marker_index >= 0:
            compact = compact.replace(marker, "")
    compact = compact.replace("----", " ").replace("——", " ")
    compact = " ".join(compact.split())
    return _compact_summary(compact, limit)


def _clean_news_title(title: str, summary: str) -> str:
    clean_title = _clean_news_text(title, 96)
    generic_title_markers = ("财经资讯动态", "股市行情", "财经资讯", "热点", "行情中心")
    if summary and any(marker in clean_title for marker in generic_title_markers):
        candidate = re.split(r"[。；;]", summary, maxsplit=1)[0].strip()
        if len(candidate) >= 8:
            return _compact_summary(candidate, 64)
    return clean_title


def _is_dashboard_news_noise(item: DashboardTestNewsItem) -> bool:
    url = (item.url or "").lower()
    if any(part in url for part in _EXCLUDED_DASHBOARD_NEWS_HOST_PARTS):
        return True
    text_blob = f"{item.title} {item.summary}"
    if any(part in text_blob for part in _EXCLUDED_DASHBOARD_NEWS_TEXT_PARTS):
        return True
    if re.search(r"^[\u4e00-\u9fa5A-Za-z0-9 ._-]{2,16}:\s*\d+(?:\.\d+)?\s+", item.title):
        return True
    if len(item.title.strip()) < 8 or len(item.summary.strip()) < 18:
        return True
    return False


def _to_float_or_zero(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _canonical_market_index_code(symbol: str) -> str:
    value = str(symbol or "").strip().upper()
    if not value:
        return ""
    if value.startswith(("SH", "SZ")) and len(value) > 2:
        return value[2:]
    if value.endswith((".SH", ".SZ")):
        return value.split(".", 1)[0]
    return value


def _build_market_card_from_points(
    *,
    asset_id: str,
    name: str,
    symbol: str,
    asset_type: str,
    semantic_label: str,
    source_name: str,
    data_source: str,
    points: list[tuple[str, float]],
) -> DashboardTestMarketCard | None:
    if not points:
        return None
    points = [(date, value) for date, value in points if value]
    if not points:
        return None
    latest_price = points[-1][1]
    prev_price = points[-2][1] if len(points) > 1 else latest_price
    change = latest_price - prev_price
    change_percent = (change / prev_price * 100) if prev_price else 0.0
    return DashboardTestMarketCard(
        assetId=asset_id,
        name=name,
        symbol=symbol,
        assetType=asset_type,
        semanticLabel=semantic_label,
        price=round(latest_price, 4),
        change=round(change, 4),
        changePercent=round(change_percent, 4),
        isPositive=change >= 0,
        asOfDate=points[-1][0],
        dataSource=data_source,
        sourceName=source_name,
        sparklineData=[{"time": date, "val": value} for date, value in points[-24:]],
    )


def _clickhouse_monitor_market_cards(limit: int = 5) -> list[DashboardTestMarketCard]:
    try:
        from services.clickhouse_business_store import get_clickhouse_business_store

        target = max(1, min(limit, 8))
        store = get_clickhouse_business_store()
        index_payload = store.query_json(
            """
            SELECT
                p.stock_code AS symbol,
                any(i.name) AS name,
                groupArray((p.date, p.close)) AS points
            FROM
            (
                SELECT stock_code, date, close
                FROM monitor.factor_index_price_daily
                WHERE stock_code IN ('000300', '000905', '399006')
                  AND point_type = 'normal'
                  AND close IS NOT NULL
                ORDER BY stock_code ASC, date DESC
                LIMIT 32 BY stock_code
            ) AS p
            LEFT JOIN monitor.dim_lixinger_index AS i ON i.stock_code = p.stock_code
            GROUP BY p.stock_code
            ORDER BY indexOf(['000300', '000905', '399006'], p.stock_code)
            FORMAT JSON
            """
        )
        cards: list[DashboardTestMarketCard] = []
        index_labels = {
            "000300": "宽基指数：沪深300",
            "000905": "宽基指数：中证500",
            "399006": "成长风格：创业板指",
        }
        for row in [item for item in index_payload.get("data", []) if isinstance(item, dict)]:
            symbol = str(row.get("symbol") or "")
            raw_points = row.get("points") if isinstance(row.get("points"), list) else []
            parsed_points = list(reversed([
                (str(point[0]), _to_float_or_zero(point[1]))
                for point in raw_points
                if isinstance(point, (list, tuple)) and len(point) >= 2
            ]))
            card = _build_market_card_from_points(
                asset_id=f"ck_index_{symbol}",
                name=str(row.get("name") or symbol),
                symbol=symbol,
                asset_type="INDEX",
                semantic_label=index_labels.get(symbol, "指数行情"),
                source_name="monitor.factor_index_price_daily",
                data_source="clickhouse_monitor_index_price_daily",
                points=parsed_points,
            )
            if card:
                cards.append(card)

        fund_payload = store.query_json(
            """
            SELECT
                n.fund_code AS symbol,
                any(f.short_name) AS name,
                any(f.fund_second_level) AS fund_type,
                groupArray((n.trade_date, n.net_value)) AS points
            FROM
            (
                SELECT fund_code, trade_date, net_value
                FROM monitor.factor_fund_net_value_daily AS n
                WHERE fund_code IN ('009669', '010856', '006263')
                  AND net_value IS NOT NULL
                ORDER BY fund_code ASC, trade_date DESC
                LIMIT 32 BY fund_code
            ) AS n
            LEFT JOIN monitor.dim_lixinger_fund AS f ON f.stock_code = n.fund_code
            GROUP BY n.fund_code
            ORDER BY indexOf(['009669', '010856', '006263'], n.fund_code)
            FORMAT JSON
            """
        )
        fund_labels = {
            "hybrid": "主动权益基金",
            "bond": "固收与债基",
            "QDII": "QDII/跨境",
        }
        def append_fund_cards(rows: list[dict[str, Any]]) -> None:
            seen_asset_ids = {card.assetId for card in cards}
            for row in rows:
                symbol = str(row.get("symbol") or "")
                if not symbol:
                    continue
                asset_id = f"ck_fund_{symbol}"
                if asset_id in seen_asset_ids:
                    continue
                fund_type = str(row.get("fund_type") or "")
                label = fund_labels.get(fund_type, "基金净值")
                raw_points = row.get("points") if isinstance(row.get("points"), list) else []
                parsed_points = list(reversed([
                    (str(point[0]), _to_float_or_zero(point[1]))
                    for point in raw_points
                    if isinstance(point, (list, tuple)) and len(point) >= 2
                ]))
                card = _build_market_card_from_points(
                    asset_id=asset_id,
                    name=str(row.get("name") or label),
                    symbol=symbol,
                    asset_type="FUND",
                    semantic_label=label,
                    source_name="monitor.factor_fund_net_value_daily",
                    data_source="clickhouse_monitor_fund_net_value_daily",
                    points=parsed_points,
                )
                if card:
                    cards.append(card)
                    seen_asset_ids.add(asset_id)

        append_fund_cards([item for item in fund_payload.get("data", []) if isinstance(item, dict)])

        if len(cards) < target:
            fill_limit = target - len(cards)
            excluded_symbols = [_clickhouse_sql_string(card.symbol) for card in cards if card.symbol]
            excluded_clause = f"AND fund_code NOT IN ({', '.join(excluded_symbols)})" if excluded_symbols else ""
            dynamic_fund_payload = store.query_json(
                f"""
                SELECT
                    n.fund_code AS symbol,
                    any(f.short_name) AS name,
                    any(f.fund_second_level) AS fund_type,
                    groupArray((n.trade_date, n.net_value)) AS points,
                    max(n.trade_date) AS max_trade_date
                FROM
                (
                    SELECT fund_code, trade_date, net_value
                    FROM monitor.factor_fund_net_value_daily
                    WHERE fund_code IN
                    (
                        SELECT fund_code
                        FROM monitor.factor_fund_net_value_daily
                        WHERE net_value IS NOT NULL
                          {excluded_clause}
                        GROUP BY fund_code
                        HAVING count() >= 12
                        ORDER BY max(trade_date) DESC, fund_code ASC
                        LIMIT {max(fill_limit * 3, fill_limit)}
                    )
                      AND net_value IS NOT NULL
                    ORDER BY fund_code ASC, trade_date DESC
                    LIMIT 32 BY fund_code
                ) AS n
                LEFT JOIN monitor.dim_lixinger_fund AS f ON f.stock_code = n.fund_code
                GROUP BY n.fund_code
                ORDER BY max_trade_date DESC, symbol ASC
                LIMIT {fill_limit}
                FORMAT JSON
                """
            )
            append_fund_cards([item for item in dynamic_fund_payload.get("data", []) if isinstance(item, dict)])

        priority = {
            "000300": 0,
            "399006": 1,
            "009669": 2,
            "010856": 3,
            "006263": 4,
            "000905": 5,
        }
        cards.sort(key=lambda card: priority.get(card.symbol, 99))
        return cards[:target]
    except Exception:
        return []


def _clickhouse_import_market_cards(limit: int = 5) -> list[DashboardTestMarketCard]:
    try:
        from services.clickhouse_business_store import get_clickhouse_business_store, get_etf_import_table_name
        from services.catalog_context_service import _quote_table_name

        store = get_clickhouse_business_store()
        table_name = get_etf_import_table_name()
        store.ensure_etf_import_table(table_name)
        quoted_table = _quote_table_name(table_name)
        latest_import_payload = store.query_json(
            f"""
            SELECT import_id
            FROM {quoted_table}
            GROUP BY import_id
            ORDER BY max(imported_at) DESC, max(trade_date) DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        latest_import_rows = [row for row in latest_import_payload.get("data", []) if isinstance(row, dict)]
        if not latest_import_rows:
            return []
        import_id = str(latest_import_rows[0].get("import_id") or "")
        if not import_id:
            return []
        import_id_sql = "'" + import_id.replace("\\", "\\\\").replace("'", "\\'") + "'"
        rows_payload = store.query_json(
            f"""
            SELECT
                index_code,
                any(index_name) AS index_name,
                groupArray((trade_date, close_price)) AS points,
                any(source_name) AS source_name,
                max(trade_date) AS max_trade_date,
                max(imported_at) AS imported_at
            FROM
            (
                SELECT index_code, index_name, source_name, imported_at, trade_date, close_price
                FROM {quoted_table}
                WHERE import_id = {import_id_sql} AND close_price IS NOT NULL
                ORDER BY index_code ASC, trade_date DESC, row_number DESC
                LIMIT 48 BY index_code
            )
            GROUP BY index_code
            ORDER BY max_trade_date DESC, index_code ASC
            LIMIT {max(1, min(limit, 10))}
            FORMAT JSON
            """
        )
        cards: list[DashboardTestMarketCard] = []
        for row in [item for item in rows_payload.get("data", []) if isinstance(item, dict)]:
            raw_points = row.get("points") if isinstance(row.get("points"), list) else []
            parsed_points: list[tuple[str, float]] = []
            for point in raw_points:
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    parsed_points.append((str(point[0]), _to_float_or_zero(point[1])))
            parsed_points = list(reversed(parsed_points))
            raw_symbol = str(row.get("index_code") or "")
            symbol = _canonical_market_index_code(raw_symbol)
            name = str(row.get("index_name") or symbol)
            card = _build_market_card_from_points(
                asset_id=f"ck_index_{symbol}" if symbol else f"ck_etf_index_{len(cards)}",
                name=name,
                symbol=symbol,
                asset_type="INDEX",
                semantic_label="ETF/基金估值库映射",
                source_name=str(row.get("source_name") or "ClickHouse"),
                data_source="clickhouse_etf_index_valuation_daily",
                points=parsed_points,
            )
            if card:
                cards.append(card)
        return cards
    except Exception:
        return []


def _clickhouse_market_cards(limit: int = 5) -> list[DashboardTestMarketCard]:
    target = max(1, min(limit, 8))
    cards = _clickhouse_monitor_market_cards(limit=target)
    if len(cards) < target:
        seen = {card.assetId for card in cards}
        for card in _clickhouse_import_market_cards(limit=target):
            if card.assetId in seen:
                continue
            cards.append(card)
            seen.add(card.assetId)
            if len(cards) >= target:
                break
    return cards[:target]


def _relative_time_label(value: str | None) -> str:
    if not value:
        return "刚刚"
    try:
        from datetime import datetime, timezone

        normalized = value.replace("Z", "+00:00")
        published_at = datetime.fromisoformat(normalized)
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        diff_seconds = max(0, int((datetime.now(timezone.utc) - published_at.astimezone(timezone.utc)).total_seconds()))
        minutes = diff_seconds // 60
        if minutes < 1:
            return "刚刚"
        if minutes < 60:
            return f"{minutes} min"
        hours = minutes // 60
        if hours < 24:
            return f"{hours} hrs"
        return f"{hours // 24} days"
    except Exception:
        return "刚刚"


def _infer_tickers(text: str) -> list[str]:
    matched: list[str] = []
    lower_text = text.lower()
    for symbol, keywords in _TICKER_KEYWORDS.items():
        if any(keyword.lower() in lower_text for keyword in keywords):
            matched.append(symbol)
    return matched[:4]


def _topic_trend(topic: str) -> str:
    down_terms = ("风险", "下跌", "回调", "承压", "降息推迟", "地缘", "关税", "通胀")
    up_terms = ("上涨", "反弹", "修复", "增长", "AI", "科技", "黄金", "政策")
    if any(term in topic for term in down_terms):
        return "down"
    if any(term in topic for term in up_terms):
        return "up"
    return "neutral"


def _derive_topics(items: list[DashboardTestNewsItem]) -> list[dict[str, str]]:
    candidates = [
        ("A股", ("A股", "沪指", "创业板", "上证")),
        ("美股", ("美股", "标普", "纳斯达克", "道指")),
        ("港股", ("港股", "恒生", "港交所")),
        ("AI", ("AI", "人工智能", "英伟达", "算力")),
        ("半导体", ("半导体", "芯片", "光刻", "晶圆")),
        ("黄金", ("黄金", "金价", "贵金属")),
        ("政策", ("政策", "央行", "财政", "监管")),
        ("关税", ("关税", "贸易", "出口")),
    ]
    combined = " ".join(f"{item.title} {item.summary}" for item in items)
    topics = [
        {"text": label, "trend": _topic_trend(label)}
        for label, keywords in candidates
        if any(keyword.lower() in combined.lower() for keyword in keywords)
    ]
    return topics[:5] or [
        {"text": "市场动态", "trend": "neutral"},
        {"text": "全球资产", "trend": "neutral"},
        {"text": "宏观政策", "trend": "neutral"},
    ]


def _build_dashboard_test_insight(
    items: list[DashboardTestNewsItem],
    query: str,
    status: str,
    message: str | None,
) -> DashboardTestInsight:
    from datetime import datetime, timezone

    if not items:
        return DashboardTestInsight(
            market_insight_id="insight_market_empty",
            headline="暂未返回可用市场动态",
            summary=message or "当前未检索到可用于生成洞察的财经信息。请确认实时数据源已配置，或稍后重试。",
            summaryHtml="<p>当前未检索到可用于生成洞察的财经信息。请确认实时数据源已配置，或稍后重试。</p>",
            completed_at=datetime.now(timezone.utc).isoformat(),
            topics=[{"text": "市场动态", "trend": "neutral"}],
            sources=[],
        )

    top_titles = "；".join(_compact_summary(item.title, 56) for item in items[:3])
    source_names = "、".join(dict.fromkeys(item.source for item in items[:4]))
    def source_summary_html(item: DashboardTestNewsItem) -> str:
        summary = item.summary.rstrip("。")
        title = item.title.rstrip("。")
        extra = "" if summary.startswith(title) or title.startswith(summary) else f"。{html.escape(_compact_summary(item.summary, 120))}"
        return f"<li><strong>{html.escape(item.source)}</strong>：{html.escape(title)}{extra}</li>"

    summary = (
        f"实时财经检索显示，当前市场动态主要集中在：{top_titles}。"
        f" 主要来源包括 {source_names}，可打开完整简报查看来源与摘要。"
    )
    summary_html = (
        f"<p>实时财经检索显示，当前市场动态主要集中在：{html.escape(top_titles)}。</p>"
        "<ul>"
        + "".join(source_summary_html(item) for item in items[:5])
        + "</ul>"
    )
    digest = sha1("|".join(item.id for item in items[:8]).encode("utf-8")).hexdigest()[:12]
    return DashboardTestInsight(
        market_insight_id=f"insight_bocha_{digest}",
        headline=f"今日市场动态：{_compact_summary(items[0].title, 64)}",
        summary=_compact_summary(summary, 760),
        summaryHtml=summary_html,
        completed_at=datetime.now(timezone.utc).isoformat(),
        topics=_derive_topics(items),
        sources=[
            DashboardTestInsightSource(
                title=item.title,
                source=item.source,
                url=item.url,
                summary=item.summary,
            )
            for item in items[:6]
        ],
    )


def _resolve_dashboard_qwen_config() -> dict[str, str] | None:
    try:
        from database.connection import SessionLocal
        from services.research_ai_service import get_llm_config

        db = SessionLocal()
        try:
            config = get_llm_config(db)
        finally:
            db.close()
        provider = str(config.get("provider") or "").lower()
        model = str(config.get("model") or DASHBOARD_QWEN_DEFAULT_MODEL)
        base_url = str(config.get("base_url") or DASHBOARD_QWEN_DEFAULT_BASE_URL).rstrip("/")
        if config.get("api_key") and (provider == "qwen" or model.lower().startswith("qwen") or "dashscope.aliyuncs.com" in base_url.lower()):
            return {
                "api_key": str(config["api_key"]),
                "base_url": base_url,
                "model": model,
                "api_format": str(config.get("api_format") or "openai"),
            }
    except Exception:
        pass

    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        return None
    return {
        "api_key": api_key,
        "base_url": (os.getenv("QWEN_BASE_URL") or DASHBOARD_QWEN_DEFAULT_BASE_URL).rstrip("/"),
        "model": os.getenv("QWEN_MODEL") or DASHBOARD_QWEN_DEFAULT_MODEL,
        "api_format": "openai",
    }


def _extract_json_object(value: str) -> dict[str, Any] | None:
    text_value = (value or "").strip()
    if text_value.startswith("```"):
        text_value = re.sub(r"^```(?:json)?\s*", "", text_value, flags=re.IGNORECASE)
        text_value = re.sub(r"\s*```$", "", text_value)
    start = text_value.find("{")
    end = text_value.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(text_value[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _coerce_trend(value: Any) -> str:
    trend = str(value or "neutral").lower()
    return trend if trend in {"up", "down", "neutral"} else "neutral"


def _dashboard_news_payload(items: list[DashboardTestNewsItem], limit: int = 10) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "source": item.source,
            "title": item.title,
            "summary": item.summary,
            "time": item.time,
            "tickers": item.tickers,
            "url": item.url,
        }
        for item in items[:limit]
    ]


def _call_dashboard_qwen_json(messages: list[dict[str, str]], max_tokens: int = 900) -> dict[str, Any] | None:
    config = _resolve_dashboard_qwen_config()
    if not config:
        return None
    try:
        from services.ai_decision_service import (
            _extract_text_from_message,
            build_chat_completion_endpoints,
            build_llm_headers,
            build_llm_payload,
        )

        endpoints = build_chat_completion_endpoints(config["base_url"], config["model"])
        if not endpoints:
            return None
        body = build_llm_payload(
            model=config["model"],
            messages=messages,
            api_format=config.get("api_format") or "openai",
            max_tokens=max_tokens,
            temperature=0.1,
            stream=False,
        )
        response = requests.post(
            endpoints[0],
            headers=build_llm_headers(config.get("api_format") or "openai", config["api_key"], endpoints[0]),
            json=body,
            timeout=int(os.getenv("DASHBOARD_QWEN_TIMEOUT_SECONDS", DASHBOARD_QWEN_TIMEOUT_SECONDS)),
        )
        response.raise_for_status()
        payload = response.json()
        content = ""
        choices = payload.get("choices") if isinstance(payload, dict) else None
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            if isinstance(message, dict):
                content = _extract_text_from_message(message.get("content"))
        return _extract_json_object(content)
    except Exception:
        return None


def _try_build_qwen_dashboard_test_package(
    items: list[DashboardTestNewsItem],
    query: str,
) -> tuple[list[DashboardTestNewsItem], DashboardTestInsight] | None:
    if not items:
        return None

    try:
        from datetime import datetime, timezone

        evidence_payload = _dashboard_news_payload(items, limit=12)
        messages = [
            {
                "role": "system",
                "content": (
                    "你是面向证券投研 dashboard 的中文市场简报证据筛选与摘要生成器。"
                    "你的第一任务是过滤检索噪声，只保留能支持“今日市场动态/完整市场简报”的证据。"
                    "可保留：今日或近期的 A股/美股/港股指数表现、重要板块/行业主线、宏观政策、资金面、商品/汇率等影响市场的新闻。"
                    "必须剔除：PDF资料页、标签页、广告/产品页、数据中心栏目页、个股静态行情/回购页面、投教页面、旧报告、与今日市场简报无关的网页。"
                    "在相关性合格的前提下，尽量保留不同信息源的覆盖，每个来源保留 1-2 条。"
                    "只允许基于检索结果 JSON 中提供的 source/title/summary 生成内容，不得编造未列出的来源或主题。"
                    "输出必须是 JSON 对象，不要 Markdown，不要代码围栏。"
                    "summaryHtml 只允许使用 <p><ul><li><strong><em><br> 标签。"
                ),
            },
            {
                "role": "user",
                "content": (
                    "请先筛选证据，再基于保留证据生成 dashboard 可展示的简短洞察。\n"
                    "要求：\n"
                    "1. keepIds 只包含真正相关且质量可用的 id；宁可少留，不要保留边缘噪声。\n"
                    "2. 如果页面只是 PDF、标签、数据栏目、股票回购、旧报告、泛内容页，必须剔除。\n"
                    "3. 优先覆盖雪球、东方财富、新浪财经、财联社、证券时报等不同来源，每个来源最多 2 条；如其他来源质量更高且能支持市场简报，也可以保留。\n"
                    "4. headline 以“今日市场动态：”开头，60 字以内。\n"
                    "5. summary 120-220 字，中文，只总结 keepIds 对应内容。\n"
                    "6. summaryHtml 使用一个 <p> 加一个 <ul>，列出 2-5 条要点。\n"
                    "7. topics 是 2-5 个对象，字段 text 和 trend；trend 只能是 up/down/neutral。\n"
                    "8. 不要出现 Bocha、检索词、模型名、接口名。\n\n"
                    f"检索主题：{query}\n"
                    f"检索结果 JSON：{json.dumps(evidence_payload, ensure_ascii=False)}\n\n"
                    '返回 JSON schema: {"keepIds": ["..."], "headline": "...", "summary": "...", "summaryHtml": "...", "topics": [{"text": "...", "trend": "neutral"}]}'
                ),
            },
        ]
        parsed = _call_dashboard_qwen_json(messages, max_tokens=1100)
        if not parsed:
            return None

        keep_ids_value = parsed.get("keepIds")
        if not isinstance(keep_ids_value, list):
            return None
        keep_ids = {str(item) for item in keep_ids_value if str(item)}
        kept_items = [item for item in items if item.id in keep_ids]
        headline = _clean_dashboard_model_text(str(parsed.get("headline") or ""), 72)
        summary = _clean_dashboard_model_text(str(parsed.get("summary") or ""), 360)
        summary_html = str(parsed.get("summaryHtml") or "")
        for forbidden in _DASHBOARD_MODEL_FORBIDDEN_TEXT:
            summary_html = summary_html.replace(forbidden, "")
        summary_html = re.sub(r"\b[Bb][Oo][Cc][Hh][Aa]\b\s*(?:实时检索|检索)?[:：]?", "", summary_html)
        topics_value = parsed.get("topics")
        topics: list[dict[str, str]] = []
        if isinstance(topics_value, list):
            for topic in topics_value:
                if not isinstance(topic, dict):
                    continue
                text_value = str(topic.get("text") or "").strip()
                if text_value:
                    topics.append({"text": text_value[:18], "trend": _coerce_trend(topic.get("trend"))})
        if not kept_items or not headline or not summary:
            return None
        for index, item in enumerate(kept_items):
            item.isHot = index < 3
        digest = sha1("|".join(item.id for item in kept_items[:8]).encode("utf-8")).hexdigest()[:12]
        insight = DashboardTestInsight(
            market_insight_id=f"insight_bocha_{digest}",
            headline=headline,
            summary=summary,
            summaryHtml=summary_html or None,
            completed_at=datetime.now(timezone.utc).isoformat(),
            topics=topics[:5] or _derive_topics(kept_items),
            sources=[
                DashboardTestInsightSource(title=item.title, source=item.source, url=item.url, summary=item.summary)
                for item in kept_items[:6]
            ],
        )
        return kept_items, insight
    except Exception:
        return None


def _bocha_items_to_news_items(items: list[Any], *, apply_noise_filter: bool = True) -> list[DashboardTestNewsItem]:
    news_items: list[DashboardTestNewsItem] = []
    for index, item in enumerate(items):
        url = item.url
        summary = _clean_news_text(item.summary, 260)
        title = _clean_news_title(item.title, summary)
        text_blob = f"{title} {summary}"
        source = _source_from_url(url, item.sourceName)
        item_id = item.evidenceId or f"bocha_news_{index}"
        news_items.append(
            DashboardTestNewsItem(
                id=item_id,
                title=title,
                source=source,
                time=_relative_time_label(item.publishedAt),
                tickers=_infer_tickers(text_blob),
                summary=summary,
                url=url,
                publishedAt=item.publishedAt,
                isHot=False,
            )
        )
    filtered = [item for item in news_items if not _is_dashboard_news_noise(item)] if apply_noise_filter else [
        item for item in news_items if item.title.strip() and item.summary.strip()
    ]
    for index, item in enumerate(filtered):
        item.isHot = index < 3
    return filtered


def _dedupe_dashboard_news_items(items: list[DashboardTestNewsItem]) -> list[DashboardTestNewsItem]:
    deduped: list[DashboardTestNewsItem] = []
    seen: set[str] = set()
    for item in items:
        url_key = (item.url or "").strip().lower().rstrip("/")
        title_key = re.sub(r"\s+", "", item.title.lower())
        key = url_key or title_key
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_preferred_dashboard_news(item: DashboardTestNewsItem) -> bool:
    return item.source in _PREFERRED_DASHBOARD_NEWS_SOURCES


def _dashboard_test_bocha_cache_ttl_seconds() -> int:
    try:
        return max(60, int(os.getenv("ALPHA_TRACE_DASHBOARD_BOCHA_CACHE_TTL_SECONDS", str(DASHBOARD_TEST_BOCHA_CACHE_TTL_SECONDS))))
    except ValueError:
        return DASHBOARD_TEST_BOCHA_CACHE_TTL_SECONDS


def _dashboard_test_bocha_cache_dir() -> Path:
    configured = os.getenv("ALPHA_TRACE_DASHBOARD_CACHE_DIR")
    cache_dir = Path(configured) if configured else Path(__file__).resolve().parents[1] / "data" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _dashboard_test_bocha_cache_path(*, query: str, limit: int, llm: bool) -> Path:
    cache_key = sha1(json.dumps(
        {"query": query, "limit": limit, "llm": llm, "version": 2},
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")).hexdigest()[:16]
    mode = "llm" if llm else "fast"
    return _dashboard_test_bocha_cache_dir() / f"dashboard_bocha_{mode}_{cache_key}.json"


def _model_to_plain_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")  # type: ignore[attr-defined]
    return model.dict()


def _load_dashboard_test_bocha_cache(*, query: str, limit: int, llm: bool) -> DashboardTestBochaResponse | None:
    cache_path = _dashboard_test_bocha_cache_path(query=query, limit=limit, llm=llm)
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        cached_at = str(payload.get("cached_at") or "")
        expires_at = str(payload.get("expires_at") or "")
        expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires_dt <= datetime.now(timezone.utc):
            return None
        response_payload = payload.get("response")
        if not isinstance(response_payload, dict):
            return None
        response = DashboardTestBochaResponse(**response_payload)
        response.cacheHit = True
        response.cachedAt = cached_at
        response.cacheExpiresAt = expires_at
        return response
    except Exception:
        return None


def _write_dashboard_test_bocha_cache(
    *,
    query: str,
    limit: int,
    llm: bool,
    response: DashboardTestBochaResponse,
) -> DashboardTestBochaResponse:
    if response.status != "completed" or not response.newsItems:
        return response
    now = datetime.now(timezone.utc)
    ttl_seconds = _dashboard_test_bocha_cache_ttl_seconds()
    cached_at = now.isoformat()
    expires_at = datetime.fromtimestamp(now.timestamp() + ttl_seconds, tz=timezone.utc).isoformat()
    response.cacheHit = False
    response.cachedAt = cached_at
    response.cacheExpiresAt = expires_at
    cache_path = _dashboard_test_bocha_cache_path(query=query, limit=limit, llm=llm)
    tmp_path = cache_path.with_suffix(".tmp")
    payload = {
        "cached_at": cached_at,
        "expires_at": expires_at,
        "ttl_seconds": ttl_seconds,
        "response": _model_to_plain_dict(response),
    }
    try:
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp_path, cache_path)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
    return response


def _build_dashboard_test_bocha_response(
    *,
    query: str | None,
    limit: int,
    llm: bool,
) -> DashboardTestBochaResponse:
    search_query = (query or DASHBOARD_TEST_MARKET_QUERY).strip()
    status, executed_query, news_items = _dashboard_test_source_feed(limit=limit, query=query, fast=not llm)
    public_message = _public_dashboard_feed_message(status, None)
    qwen_package = _try_build_qwen_dashboard_test_package(news_items, executed_query or search_query) if llm else None
    if qwen_package:
        qwen_items, insight = qwen_package
        clean_qwen_items = _dedupe_dashboard_news_items(qwen_items)
        news_items = clean_qwen_items[:limit] if len(clean_qwen_items) >= 2 else _merge_dashboard_news_for_display(news_items, qwen_items, limit)
    else:
        insight = _build_dashboard_test_insight(
            items=news_items,
            query=executed_query or search_query,
            status=status,
            message=public_message,
        )
    response = DashboardTestBochaResponse(
        status=status,
        query=executed_query or search_query,
        message=public_message,
        newsItems=news_items,
        insight=insight,
    )
    return _write_dashboard_test_bocha_cache(query=search_query, limit=limit, llm=llm, response=response)


def _dashboard_test_bocha_cache_pending_response(*, query: str, limit: int, llm: bool) -> DashboardTestBochaResponse:
    now = datetime.now(timezone.utc).isoformat()
    message = "市场动态缓存正在更新，请稍后重试或点击手动更新。"
    return DashboardTestBochaResponse(
        status="updating",
        query=query,
        message=message,
        newsItems=[],
        insight=DashboardTestInsight(
            market_insight_id="insight_market_cache_pending",
            headline="市场动态缓存正在更新",
            summary=message,
            summaryHtml=f"<p>{html.escape(message)}</p>",
            completed_at=now,
            topics=[{"text": "市场动态", "trend": "neutral"}],
            sources=[],
        ),
    )


def refresh_dashboard_test_bocha_cache_once(*, query: str | None = None, limit: int = DASHBOARD_TEST_BOCHA_DEFAULT_LIMIT) -> None:
    if not _DASHBOARD_TEST_BOCHA_REFRESH_LOCK.acquire(blocking=False):
        return
    try:
        _build_dashboard_test_bocha_response(query=query, limit=limit, llm=False)
        _build_dashboard_test_bocha_response(query=query, limit=limit, llm=True)
    except Exception:
        return
    finally:
        _DASHBOARD_TEST_BOCHA_REFRESH_LOCK.release()


def start_dashboard_test_bocha_refresh_scheduler() -> None:
    global _DASHBOARD_TEST_BOCHA_SCHEDULER_STARTED
    if _DASHBOARD_TEST_BOCHA_SCHEDULER_STARTED:
        return
    _DASHBOARD_TEST_BOCHA_SCHEDULER_STARTED = True
    interval_seconds = _dashboard_test_bocha_cache_ttl_seconds()

    def _loop() -> None:
        refresh_dashboard_test_bocha_cache_once()
        while True:
            time.sleep(interval_seconds)
            refresh_dashboard_test_bocha_cache_once()

    threading.Thread(target=_loop, name="dashboard-bocha-cache-refresh", daemon=True).start()


def _dashboard_test_broad_bocha_feed(
    *,
    search_client: ExternalEvidenceSearch,
    limit: int,
    query: str | None,
) -> tuple[str, str, list[DashboardTestNewsItem]]:
    question = (
        query.strip()
        if query and query.strip()
        else "今日 A股 港股 美股 市场收评 板块资金 财经新闻 site:finance.sina.com.cn OR site:finance.eastmoney.com OR site:cls.cn OR site:stcn.com"
    )
    result = search_client.search(
        asset_id=None,
        question=question,
        task_type="dashboard_market_overview",
        limit=max(10, min(limit * 2, 20)),
    )
    items = _bocha_items_to_news_items(result.items)
    if not items and result.items:
        items = _bocha_items_to_news_items(result.items, apply_noise_filter=False)
    items = _dedupe_dashboard_news_items(items)[:limit]
    for index, item in enumerate(items):
        item.isHot = index < 3
    return result.status, result.query, items


def _dashboard_test_source_feed(
    limit: int,
    query: str | None = None,
    *,
    fast: bool = True,
) -> tuple[str, str, list[DashboardTestNewsItem]]:
    per_source_limit = 2 if limit >= 8 else 1
    source_queries = list(DASHBOARD_TEST_MARKET_SOURCE_QUERIES)
    search_client = ExternalEvidenceSearch()
    api_key = search_client._read_bocha_api_key()  # noqa: SLF001 - avoids four slow config-store misses.
    grouped: dict[str, list[DashboardTestNewsItem]] = {source["label"]: [] for source in source_queries}
    statuses: list[str] = []
    query_parts: list[str] = []
    query_suffix = f" {query.strip()}" if query and query.strip() else ""

    if not api_key:
        executed_query = " | ".join(
            search_client._build_query(None, f"{source['query']}{query_suffix}", "dashboard_market_overview")
            for source in source_queries
        )
        return "disabled", executed_query or DASHBOARD_TEST_MARKET_QUERY, []

    broad_status, broad_query, broad_items = _dashboard_test_broad_bocha_feed(
        search_client=search_client,
        limit=limit,
        query=query,
    )
    preferred_broad_items = [item for item in broad_items if _is_preferred_dashboard_news(item)]
    if fast and len(preferred_broad_items) >= min(limit, 4):
        return "completed", broad_query or DASHBOARD_TEST_MARKET_QUERY, preferred_broad_items[:limit]

    def search_one(source: dict[str, Any]) -> tuple[str, Any]:
        return source["label"], search_client.search(
            asset_id=None,
            question=f"{source['query']}{query_suffix}",
            task_type="dashboard_market_overview",
            limit=max(4, per_source_limit * 3),
        )

    with ThreadPoolExecutor(max_workers=min(4, len(source_queries))) as executor:
        future_map = {executor.submit(search_one, source): source for source in source_queries}
        for future in as_completed(future_map):
            source = future_map[future]
            label = source["label"]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001 - source-specific failures should not fail the feed.
                statuses.append("failed")
                continue
            _, search_result = result
            statuses.append(search_result.status)
            if search_result.query:
                query_parts.append(search_result.query)
            source_items = _bocha_items_to_news_items(search_result.items)
            allowed_hosts = tuple(str(host) for host in source.get("hosts", ()))
            matched = [
                item
                for item in source_items
                if item.source == label and _url_matches_hosts(item.url, allowed_hosts)
            ]
            grouped[label] = _dedupe_dashboard_news_items(matched)[:per_source_limit]

    merged: list[DashboardTestNewsItem] = []
    for source in source_queries:
        merged.extend(grouped.get(source["label"], []))
    merged = _dedupe_dashboard_news_items(merged)[:limit]
    for index, item in enumerate(merged):
        item.isHot = index < 3
    if any(status == "completed" for status in statuses):
        status = "completed"
    elif any(status == "failed" for status in statuses):
        status = "failed"
    else:
        status = statuses[0] if statuses else "disabled"
    if broad_query:
        query_parts.append(broad_query)
    if broad_items:
        merged = _dedupe_dashboard_news_items([*merged, *preferred_broad_items])[:limit]
        status = "completed"
    elif status != "completed":
        status = broad_status
    if status == "completed" and not merged:
        status = "empty"
    return status, " | ".join(query_parts) or DASHBOARD_TEST_MARKET_QUERY, merged


def _merge_dashboard_news_for_display(
    source_items: list[DashboardTestNewsItem],
    qwen_items: list[DashboardTestNewsItem],
    limit: int,
) -> list[DashboardTestNewsItem]:
    merged = _dedupe_dashboard_news_items(qwen_items + source_items)
    source_counts: dict[str, int] = {}
    balanced: list[DashboardTestNewsItem] = []
    preferred_order = {source: index for index, source in enumerate(_PREFERRED_DASHBOARD_NEWS_SOURCES)}
    merged.sort(key=lambda item: (preferred_order.get(item.source, 99), item.source, item.time))
    for item in merged:
        source_count = source_counts.get(item.source, 0)
        if source_count >= 2:
            continue
        source_counts[item.source] = source_count + 1
        balanced.append(item)
        if len(balanced) >= limit:
            break
    if len(balanced) < min(limit, len(merged)):
        existing = {item.id for item in balanced}
        for item in merged:
            if item.id in existing:
                continue
            balanced.append(item)
            if len(balanced) >= limit:
                break
    for index, item in enumerate(balanced):
        item.isHot = index < 3
    return balanced


def _public_dashboard_feed_message(status: str, message: str | None) -> str | None:
    if status == "completed":
        return None
    if status == "empty":
        return "实时财经检索源已连接，但本次未返回通过质量过滤的市场动态。"
    if status == "disabled":
        return "实时财经数据源未配置，当前不展示离线样例，避免误读。"
    if status == "failed":
        return "实时财经数据源暂时不可用，当前不展示离线样例，避免误读。"
    return message


@router.get("/summary", response_model=AlphaTraceDashboardSummary)
@router.get("/statistics", response_model=AlphaTraceDashboardSummary)
def get_alpha_trace_dashboard_summary() -> AlphaTraceDashboardSummary:
    _ensure_dashboard_domain_tables()
    sql = text(
        """
        SELECT
            (SELECT COUNT(*) FROM alpha_trace_assets) AS assets,
            (
                (SELECT COUNT(*) FROM alpha_trace_evidence_items)
                + (
                    SELECT COUNT(DISTINCT er.evidence_id)
                    FROM alpha_trace_evidence_refs er
                    LEFT JOIN alpha_trace_evidence_items ei ON ei.evidence_id = er.evidence_id
                    WHERE ei.evidence_id IS NULL
                )
            ) AS evidence,
            (SELECT COUNT(*) FROM alpha_trace_agent_runs) AS agent_runs,
            (SELECT COUNT(*) FROM alpha_trace_strategies) AS strategies,
            (SELECT COUNT(*) FROM alpha_trace_portfolios) AS portfolios,
            (SELECT COUNT(*) FROM alpha_trace_decisions) AS decisions,
            (SELECT COUNT(*) FROM alpha_trace_data_sources) AS data_sources,
            (
                (SELECT COUNT(*) FROM alpha_trace_strategies)
                + (
                    SELECT COUNT(DISTINCT task_type)
                    FROM alpha_trace_agent_runs
                    WHERE (strategy_id IS NULL OR strategy_id = '')
                      AND task_type IS NOT NULL
                      AND task_type != ''
                )
            ) AS leaderboard
        """
    )
    with _engine().begin() as conn:
        row = conn.execute(sql).mappings().one()
    return AlphaTraceDashboardSummary(
        counts=AlphaTraceDashboardCounts(
            assets=int(row["assets"] or 0),
            evidence=int(row["evidence"] or 0),
            agentRuns=int(row["agent_runs"] or 0),
            strategies=int(row["strategies"] or 0),
            portfolios=int(row["portfolios"] or 0),
            decisions=int(row["decisions"] or 0),
            dataSources=int(row["data_sources"] or 0),
            leaderboard=int(row["leaderboard"] or 0),
        )
    )


@router.get("/fund-trends", response_model=AlphaTraceFundTrendsResponse)
def get_alpha_trace_dashboard_fund_trends(
    limit: int = Query(4, ge=1, le=8),
    points: int = Query(180, ge=30, le=360),
    etfOnly: bool = Query(True),
) -> AlphaTraceFundTrendsResponse:
    table_name = ""
    try:
        store = get_clickhouse_business_store()
        import_table_name = get_etf_import_table_name()
        monitor_price_table = "monitor.factor_fund_price_daily"
        monitor_dim_table = "monitor.dim_lixinger_fund"
        existing_tables = _clickhouse_existing_tables([monitor_price_table, monitor_dim_table, import_table_name])

        if monitor_price_table in existing_tables and monitor_dim_table in existing_tables:
            table_name = monitor_price_table
            price_table = _quote_clickhouse_table(monitor_price_table)
            dim_table = _quote_clickhouse_table(monitor_dim_table)
            keyword_clause = "AND positionCaseInsensitive(ifNull(f.short_name, ''), 'ETF') > 0" if etfOnly else ""
            query = f"""
                WITH sampled AS (
                    SELECT
                        p.stock_code AS code,
                        any(ifNull(nullIf(f.short_name, ''), p.stock_code)) AS name
                    FROM {price_table} p
                    LEFT JOIN {dim_table} f ON f.stock_code = p.stock_code
                    WHERE p.close IS NOT NULL
                      AND p.date >= today() - 900
                      {keyword_clause}
                    GROUP BY p.stock_code
                    HAVING count() >= 120
                    ORDER BY rand()
                    LIMIT {limit}
                ),
                ranked AS (
                    SELECT
                        p.stock_code AS code,
                        any(s.name) OVER (PARTITION BY p.stock_code) AS name,
                        p.date AS trade_date,
                        p.close AS value,
                        row_number() OVER (PARTITION BY p.stock_code ORDER BY p.date DESC) AS rn
                    FROM {price_table} p
                    INNER JOIN sampled s ON s.code = p.stock_code
                    WHERE p.close IS NOT NULL
                )
                SELECT code, name, trade_date, value
                FROM ranked
                WHERE rn <= {points}
                ORDER BY code ASC, trade_date ASC
                FORMAT JSON
            """
            asset_type = "etf" if etfOnly else "fund"
            asset_id_prefix = "ck_fund_"
        else:
            table_name = import_table_name
            if import_table_name not in existing_tables:
                store.ensure_etf_import_table(import_table_name)
            import_table = _quote_clickhouse_table(import_table_name)
            query = f"""
                WITH sampled AS (
                    SELECT
                        index_code AS code,
                        any(ifNull(nullIf(index_name, ''), index_code)) AS name
                    FROM {import_table}
                    WHERE close_price IS NOT NULL
                      AND trade_date IS NOT NULL
                    GROUP BY index_code
                    HAVING count() >= 30
                    ORDER BY rand()
                    LIMIT {limit}
                ),
                ranked AS (
                    SELECT
                        p.index_code AS code,
                        any(s.name) OVER (PARTITION BY p.index_code) AS name,
                        p.trade_date AS trade_date,
                        p.close_price AS value,
                        row_number() OVER (PARTITION BY p.index_code ORDER BY p.trade_date DESC, p.row_number DESC) AS rn
                    FROM {import_table} p
                    INNER JOIN sampled s ON s.code = p.index_code
                    WHERE p.close_price IS NOT NULL
                      AND p.trade_date IS NOT NULL
                )
                SELECT code, name, trade_date, value
                FROM ranked
                WHERE rn <= {points}
                ORDER BY code ASC, trade_date ASC
                FORMAT JSON
            """
            asset_type = "etf"
            asset_id_prefix = "ck_index_"

        payload = store.query_json(query)
    except ClickHouseStoreError:
        return AlphaTraceFundTrendsResponse(
            status="unavailable",
            tableName=table_name or get_etf_import_table_name(),
            message=_CLICKHOUSE_FUND_TRENDS_UNAVAILABLE_MESSAGE,
            series=[],
        )

    grouped: dict[str, dict[str, Any]] = {}
    for row in payload.get("data", []):
        if not isinstance(row, dict):
            continue
        code = _canonical_market_index_code(str(row.get("code") or "")) if asset_id_prefix == "ck_index_" else str(row.get("code") or "")
        if not code:
            continue
        group = grouped.setdefault(
            code,
            {
                "name": str(row.get("name") or code),
                "assetId": f"{asset_id_prefix}{code}",
                "points": [],
            },
        )
        try:
            value = float(row.get("value"))
        except (TypeError, ValueError):
            continue
        group["points"].append(
            AlphaTraceTrendPoint(
                date=str(row.get("trade_date") or ""),
                value=value,
            )
        )

    series = [
        AlphaTraceFundTrendSeries(
            code=code,
            name=str(group["name"]),
            assetId=str(group["assetId"]),
            assetType=asset_type,
            valueField="close",
            points=group["points"],
        )
        for code, group in grouped.items()
        if group["points"]
    ]
    target_count = max(1, min(limit, 8))
    message = None
    if series and len(series) < target_count:
        message = f"当前数据源仅有 {len(series)} 个可用标的，导入更多基金或 ETF 后会自动展示更多走势。"
    return AlphaTraceFundTrendsResponse(
        status="completed" if series else "empty",
        tableName=table_name or get_etf_import_table_name(),
        message=message if series else _CLICKHOUSE_FUND_TRENDS_EMPTY_MESSAGE,
        series=series,
    )


@router.get("/test/market-cards", response_model=DashboardTestMarketCardsResponse)
def get_dashboard_test_market_cards(
    limit: int = Query(5, ge=3, le=8),
) -> DashboardTestMarketCardsResponse:
    cards = _clickhouse_market_cards(limit=limit)
    if cards:
        return DashboardTestMarketCardsResponse(
            status="completed",
            message=None,
            cards=cards,
        )
    return DashboardTestMarketCardsResponse(
        status="unavailable",
        message="ClickHouse ETF/基金估值数据暂不可用，未展示静态样例以避免误读。",
        cards=[],
    )


@router.get("/test/bocha", response_model=DashboardTestBochaResponse)
def get_dashboard_test_bocha_feed(
    query: str | None = None,
    limit: int = Query(DASHBOARD_TEST_BOCHA_DEFAULT_LIMIT, ge=3, le=20),
    llm: bool = Query(True),
    refresh: bool = Query(False),
) -> DashboardTestBochaResponse:
    search_query = (query or DASHBOARD_TEST_MARKET_QUERY).strip()
    if refresh:
        return _build_dashboard_test_bocha_response(query=query, limit=limit, llm=llm)
    cached_response = _load_dashboard_test_bocha_cache(query=search_query, limit=limit, llm=llm)
    if cached_response:
        return cached_response
    return _dashboard_test_bocha_cache_pending_response(query=search_query, limit=limit, llm=llm)
