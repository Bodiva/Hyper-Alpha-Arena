from __future__ import annotations

import math
import re
from datetime import date, datetime, time
from typing import Any, Literal, Optional

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_market_data import (
    AlphaTraceMarketIndicator,
    AlphaTraceMarketKline,
    AlphaTraceMarketQuote,
    AlphaTraceMarketSnapshot,
)
from services.clickhouse_business_store import (
    ClickHouseBusinessStore,
    ClickHouseStoreError,
    get_clickhouse_business_store,
)


AssetKind = Literal["fund", "index"]

_CODE_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_WIDE_TABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

_WIDE_TECHNICAL_FIELDS = {
    "source_request_id",
    "request_hash",
    "source_job_name",
    "api_id",
    "slice_key",
    "request_stock_code",
    "request_start_date",
    "request_end_date",
    "row_index",
    "raw_row_json",
    "stock_code",
    "fund_code",
    "index_code",
    "ingested_at",
    "business_updated_at",
    "updated_at",
}

_FUND_WIDE_SOURCES: tuple[tuple[str, str, str], ...] = (
    ("wide_lixinger_cn_fund_hot_f_as", "cn_fund_hot_f_as", "规模热度"),
    ("wide_lixinger_cn_fund_hot_f_nlacan", "cn_fund_hot_f_nlacan", "净值/场内快照"),
    ("wide_lixinger_cn_fund_hot_fet_s", "cn_fund_hot_fet_s", "交易型基金快照"),
    ("wide_lixinger_cn_fund_hot_ff", "cn_fund_hot_ff", "费率快照"),
    ("wide_lixinger_cn_fund_hot_fp", "cn_fund_hot_fp", "收益表现"),
    ("wide_lixinger_cn_fund_hot_fpr", "cn_fund_hot_fpr", "收益排名"),
    ("wide_lixinger_cn_fund_hot_fss", "cn_fund_hot_fss", "份额快照"),
)

_INDEX_WIDE_SOURCES: tuple[tuple[str, str, str], ...] = (
    ("wide_lixinger_cn_index_hot_cp", "cn_index_hot_cp", "涨跌表现"),
    ("wide_lixinger_cn_index_hot_ic", "cn_index_hot_ic", "成分数量"),
    ("wide_lixinger_cn_index_hot_ifet_sni", "cn_index_hot_ifet_sni", "关联ETF"),
    ("wide_lixinger_cn_index_hot_mm_ha", "cn_index_hot_mm_ha", "互联互通"),
    ("wide_lixinger_cn_index_hot_mtasl", "cn_index_hot_mtasl", "两融余额"),
    ("wide_lixinger_cn_index_hot_tr", "cn_index_hot_tr", "成交热度"),
    ("wide_lixinger_cn_index_hot_tr_cp", "cn_index_hot_tr_cp", "成交涨跌"),
)

_WIDE_FIELD_LABELS = {
    "last_data_date": "数据日期",
    "f_tas": "基金资产规模",
    "f_tas_d": "规模日期",
    "fet_as": "场内规模",
    "fet_as_d": "场内规模日期",
    "f_nv": "单位净值",
    "f_nv_cr": "净值涨跌幅",
    "f_nv_d": "净值日期",
    "f_c_c": "累计净值",
    "f_c_cr": "累计涨跌幅",
    "f_pnv_pr": "估算溢折价",
    "f_pnv_pr_avg_d5": "5日平均溢折价",
    "f_pnv_pr_avg_d10": "10日平均溢折价",
    "f_pnv_pr_avg_d20": "20日平均溢折价",
    "f_p_r_m1": "近1月收益",
    "f_p_r_m3": "近3月收益",
    "f_p_r_m6": "近6月收益",
    "f_p_r_y1": "近1年收益",
    "f_p_r_y3": "近3年收益",
    "f_p_r_y5": "近5年收益",
    "f_cagr_p_r_fs": "成立以来年化收益",
    "f_cagr_p_r_fs_ssc": "成立以来年化同类样本",
    "f_cagr_p_r_fs_ssrp": "成立以来年化同类分位",
    "f_p_r_fys": "今年以来收益",
    "f_p_r_fys_ssc": "今年以来同类样本",
    "f_p_r_fys_ssrp": "今年以来同类分位",
    "f_h_a": "持有人户数",
    "f_ind_h_s_r": "个人持有份额占比",
    "f_ind_h_s_r_c_1y": "个人持有占比1年变化",
    "f_fr_d": "费率日期",
    "f_c_fr": "托管费率",
    "f_m_fr": "管理费率",
    "f_mac_fr": "管理+托管费率",
    "cp_cac_y1": "近1年涨幅",
    "cp_cac_y3": "近3年涨幅",
    "cp_cac_y5": "近5年涨幅",
    "cpc": "涨跌幅",
    "cpc_m1": "近1月涨跌幅",
    "cpc_m3": "近3月涨跌幅",
    "cpc_m6": "近6月涨跌幅",
    "cpc_y1": "近1年涨跌幅",
    "ic_num": "成分数量",
    "ic_t10_ws": "前十大权重",
}


def _escape_sql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _safe_code(value: str) -> str:
    if not _CODE_RE.match(value):
        raise ClickHouseStoreError(f"Invalid asset code: {value}")
    return value


def make_ck_asset_id(kind: AssetKind, code: str) -> str:
    return f"ck_{kind}_{code}"


def parse_ck_asset_id(asset_id: str) -> tuple[AssetKind, str]:
    if asset_id.startswith("ck_fund_"):
        return "fund", _safe_code(asset_id.removeprefix("ck_fund_"))
    if asset_id.startswith("ck_index_"):
        return "index", _safe_code(asset_id.removeprefix("ck_index_"))
    if asset_id.startswith("ck_monitor_fund_"):
        return "fund", _safe_code(asset_id.removeprefix("ck_monitor_fund_"))
    if asset_id.startswith("ck_monitor_index_"):
        return "index", _safe_code(asset_id.removeprefix("ck_monitor_index_"))
    if asset_id.startswith("ck_etf_index_"):
        return "index", _safe_code(asset_id.removeprefix("ck_etf_index_"))
    raise ClickHouseStoreError(f"Unsupported ClickHouse asset id: {asset_id}")


def _rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    return data if isinstance(data, list) else []


def _in_clause(values: list[str]) -> str:
    safe_values = [_escape_sql_string(_safe_code(value)) for value in values if value]
    if not safe_values:
        return "('')"
    return "(" + ", ".join(f"'{value}'" for value in safe_values) + ")"


def _number(value: Any, default: float = 0) -> float:
    if value is None or value == "":
        return default
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return result


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(_number(value, default))
    except (TypeError, ValueError):
        return default


def _string(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text or default


def _date_text(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return _string(value)


def _iso_datetime(value: Any) -> str:
    text = _date_text(value)
    if not text:
        return datetime.utcnow().isoformat()
    if "T" in text or " " in text:
        return text.replace(" ", "T")
    return f"{text}T00:00:00"


def _wide_field_label(field: str) -> str:
    if field in _WIDE_FIELD_LABELS:
        return _WIDE_FIELD_LABELS[field]
    return field


def _wide_field_score(field: str) -> int:
    lower = field.lower()
    score = 0
    for token in ("rank", "rnk", "score", "ratio", "rate", "return", "drawdown", "scale", "asset", "amount", "share"):
        if token in lower:
            score += 5
    if lower.endswith(("_d", "_date")) or lower in {"last_data_date", "date"}:
        score += 3
    if lower in _WIDE_FIELD_LABELS:
        score += 8
    return score


def _format_wide_value(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)):
        number = _number(value)
        if abs(number) >= 100_000_000:
            return f"{number / 100_000_000:.2f}亿"
        if abs(number) >= 10_000:
            return f"{number / 10_000:.2f}万"
        return f"{number:.4g}"
    text = _string(value)
    if not text or text.startswith("{") or text.startswith("["):
        return ""
    return text[:40]


def _compact_wide_row(row: dict[str, Any], *, limit: int = 4) -> str:
    candidates: list[tuple[int, str, str]] = []
    for field, value in row.items():
        if field in _WIDE_TECHNICAL_FIELDS:
            continue
        formatted = _format_wide_value(value)
        if not formatted:
            continue
        candidates.append((_wide_field_score(field), _wide_field_label(field), formatted))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return "；".join(f"{label} {value}" for _, label, value in candidates[:limit])


def _join_wide_summaries(summaries: list[str], *, limit: int = 2) -> str:
    compact = [item for item in summaries if item]
    if not compact:
        return ""
    return " / ".join(compact[:limit])


def _timestamp(value: Any) -> int:
    text = _date_text(value)
    if not text:
        return int(datetime.utcnow().timestamp())
    try:
        if len(text) == 10:
            return int(datetime.combine(date.fromisoformat(text), time()).timestamp())
        return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return int(datetime.utcnow().timestamp())


def _days_between(start_value: Any, end_value: Any | None = None) -> Optional[int]:
    start_text = _date_text(start_value)[:10]
    if not start_text:
        return None
    end_text = (_date_text(end_value)[:10] if end_value else date.today().isoformat())
    try:
        return (date.fromisoformat(end_text) - date.fromisoformat(start_text)).days
    except ValueError:
        return None


def _annualized_return(total_return: Any, days: Any) -> Optional[float]:
    value = _number(total_return)
    day_count = _number(days)
    if day_count <= 30 or value <= -0.9999:
        return None
    try:
        annualized = (1 + value) ** (365 / day_count) - 1
    except (OverflowError, ValueError):
        return None
    if math.isnan(annualized) or math.isinf(annualized):
        return None
    return annualized


def _display_market(area_code: Any, market: Any) -> str:
    area = _string(area_code).lower()
    raw_market = _string(market).lower()
    if area in {"cn", "mainland"} or raw_market in {"cn", "sh", "sz", "shz", "sse", "szse"}:
        return "A股"
    if area == "hk" or raw_market in {"hk", "hkg"}:
        return "港股"
    if area == "us" or raw_market in {"us", "nasdaq", "nyse"}:
        return "美股"
    return "其他"


def _currency(area_code: Any, market: Any) -> str:
    area = _string(area_code).lower()
    raw_market = _string(market).lower()
    if area == "hk" or raw_market == "hk":
        return "HKD"
    if area == "us" or raw_market in {"us", "nasdaq", "nyse"}:
        return "USD"
    return "CNY"


def _is_etf(row: dict[str, Any]) -> bool:
    haystack = " ".join(
        [
            _string(row.get("name")),
            _string(row.get("short_name")),
            _string(row.get("fund_first_level")),
            _string(row.get("fund_second_level")),
        ]
    ).lower()
    return "etf" in haystack or "交易型开放式" in haystack


def _fund_asset_type(row: dict[str, Any]) -> str:
    return "ETF" if _is_etf(row) else "FUND"


def _fund_tags(row: dict[str, Any]) -> list[str]:
    tags = ["投研数据仓库"]
    if _is_etf(row):
        tags.append("ETF")
    first = _string(row.get("fund_first_level"))
    second = _string(row.get("fund_second_level"))
    for item in (first, second):
        if item and item not in tags:
            tags.append(item)
    return tags


def _index_tags(row: dict[str, Any]) -> list[str]:
    tags = ["投研数据仓库", "指数"]
    series = _string(row.get("series"))
    source = _string(row.get("source"))
    for item in (series, source):
        if item and item not in tags:
            tags.append(item)
    return tags


def _liquidity_score(amount: float, volume: float) -> int:
    raw = math.log10(max(amount, volume, 1)) * 12
    return max(30, min(95, int(raw)))


def _fund_asset_from_row(row: dict[str, Any]) -> AlphaTraceAssetItem:
    code = _string(row.get("stock_code"))
    name = _string(row.get("name"), code)
    short_name = _string(row.get("short_name"), name)
    amount = _number(row.get("latest_amount"))
    volume = _number(row.get("latest_volume"))
    latest_close = _number(row.get("latest_close"))
    latest_date = _iso_datetime(row.get("latest_date") or row.get("updated_at"))
    asset_type = _fund_asset_type(row)
    market = _display_market(row.get("area_code"), row.get("market"))
    currency = _currency(row.get("area_code"), row.get("market"))
    fund_level = _string(row.get("fund_second_level")) or _string(row.get("fund_first_level")) or "基金"

    if asset_type == "ETF":
        profile = {
            "trackingIndex": "投研数据仓库: monitor.factor_fund_price_daily",
            "fundCompany": "",
            "aum": amount,
            "expenseRatio": 0,
            "trackingError": 0,
            "liquidityScore": _liquidity_score(amount, volume),
            "premiumDiscount": 0,
            "holdings": [],
            "exposures": [],
        }
    else:
        profile = {
            "fundManager": "",
            "fundCompany": "",
            "fundType": fund_level,
            "nav": latest_close,
            "aum": amount,
            "expenseRatio": 0,
            "holdings": [],
            "styleExposure": [],
            "drawdown": 0,
        }

    return AlphaTraceAssetItem(
        assetId=make_ck_asset_id("fund", code),
        id=make_ck_asset_id("fund", code),
        symbol=code,
        name=short_name,
        assetType=asset_type,
        market=market,
        currency=currency,
        tags=_fund_tags(row),
        description=f"理杏仁基金维表 + 投研数据仓库日线因子，最新交易日 {latest_date[:10] if latest_date else '-'}。",
        updatedAt=latest_date,
        liquidityLevel="high" if _liquidity_score(amount, volume) >= 75 else "medium",
        metrics={
            "latestClose": latest_close,
            "latestAmount": amount,
            "latestVolume": volume,
            "pricePoints": _int(row.get("price_points")),
        },
        profile=profile,
        aliases=[name, short_name],
    )


def _index_asset_from_row(row: dict[str, Any]) -> AlphaTraceAssetItem:
    code = _string(row.get("stock_code"))
    name = _string(row.get("name"), code)
    latest_close = _number(row.get("latest_close"), 100)
    latest_date = _iso_datetime(row.get("latest_date") or row.get("updated_at"))
    market = _display_market(row.get("area_code"), row.get("market"))
    currency = _currency(row.get("area_code"), row.get("market"))
    return AlphaTraceAssetItem(
        assetId=make_ck_asset_id("index", code),
        id=make_ck_asset_id("index", code),
        symbol=code,
        name=name,
        assetType="INDEX",
        market=market,
        currency=currency,
        tags=_index_tags(row),
        description=f"理杏仁指数维表 + 投研数据仓库指数价格/估值因子，最新交易日 {latest_date[:10] if latest_date else '-'}。",
        updatedAt=latest_date,
        metrics={
            "latestClose": latest_close,
            "latestAmount": _number(row.get("latest_amount")),
            "latestVolume": _number(row.get("latest_volume")),
            "pricePoints": _int(row.get("price_points")),
        },
        profile={
            "provider": _string(row.get("source"), "Lixinger"),
            "constituents": [],
            "sectorExposure": [],
            "styleExposure": [],
        },
        aliases=[name],
    )


class ClickHouseAssetStore:
    def __init__(self, store: Optional[ClickHouseBusinessStore] = None) -> None:
        self.store = store or get_clickhouse_business_store()
        self._wide_column_cache: dict[str, set[str]] = {}

    def list_assets(
        self,
        *,
        asset_type: Optional[str] = None,
        market: Optional[str] = None,
        keyword: Optional[str] = None,
        tag: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[AlphaTraceAssetItem], int]:
        items: list[AlphaTraceAssetItem] = []
        normalized_type = _string(asset_type).upper()
        fetch_limit = min(max(limit + offset, 50), 500)
        if normalized_type in {"", "ETF", "FUND"}:
            items.extend(_fund_asset_from_row(row) for row in self._query_funds(keyword=keyword, limit=fetch_limit))
        if normalized_type in {"", "INDEX"}:
            items.extend(_index_asset_from_row(row) for row in self._query_indexes(keyword=keyword, limit=fetch_limit))

        if normalized_type:
            items = [item for item in items if item.assetType == normalized_type]
        if market:
            items = [item for item in items if item.market == market]
        if tag:
            items = [item for item in items if tag in item.tags]

        items.sort(key=lambda item: (item.updatedAt, item.metrics.get("latestAmount", 0)), reverse=True)
        return items[offset : offset + limit], len(items)

    def get_asset(self, asset_id: str) -> Optional[AlphaTraceAssetItem]:
        kind, code = parse_ck_asset_id(asset_id)
        if kind == "fund":
            rows = self._query_funds(code=code, limit=1)
            return _fund_asset_from_row(rows[0]) if rows else None
        rows = self._query_indexes(code=code, limit=1)
        return _index_asset_from_row(rows[0]) if rows else None

    def get_quote(self, asset_id: str) -> Optional[AlphaTraceMarketQuote]:
        asset = self.get_asset(asset_id)
        if not asset:
            return None
        kind, code = parse_ck_asset_id(asset_id)
        table = "monitor.factor_fund_price_daily" if kind == "fund" else "monitor.factor_index_price_daily"
        code_col = "stock_code"
        point_filter = "" if kind == "fund" else "AND point_type IN ('cp', 'normal', '')"
        rows = _rows(
            self.store.query_json(
                f"""
                SELECT
                    {code_col},
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    amount,
                    change
                FROM {table}
                WHERE {code_col} = '{_escape_sql_string(code)}'
                  AND close IS NOT NULL
                  {point_filter}
                ORDER BY date DESC
                LIMIT 1
                FORMAT JSON
                """
            )
        )
        if not rows and kind == "fund":
            rows = _rows(
                self.store.query_json(
                    f"""
                    SELECT
                        fund_code AS stock_code,
                        trade_date AS date,
                        net_value AS open,
                        net_value AS high,
                        net_value AS low,
                        net_value AS close,
                        0 AS volume,
                        0 AS amount,
                        0 AS change
                    FROM monitor.factor_fund_net_value_daily
                    WHERE fund_code = '{_escape_sql_string(code)}'
                      AND net_value IS NOT NULL
                    ORDER BY trade_date DESC
                    LIMIT 1
                    FORMAT JSON
                    """
                )
            )
        if not rows:
            return None
        row = rows[0]
        change = _number(row.get("change"))
        close = _number(row.get("close"))
        return AlphaTraceMarketQuote(
            assetId=asset.id,
            symbol=asset.symbol,
            name=asset.name,
            assetType=asset.assetType,
            market=asset.market,
            currency=asset.currency,
            price=close,
            change=change,
            changePercent=change,
            volume=_number(row.get("volume")),
            amount=_number(row.get("amount")),
            nav=close if asset.assetType == "FUND" else None,
            premiumDiscount=None,
            timestamp=_iso_datetime(row.get("date")),
            source=f"投研数据仓库 {table}",
        )

    def get_klines(self, asset_id: str, *, period: str = "1d", limit: int = 240) -> list[AlphaTraceMarketKline]:
        kind, code = parse_ck_asset_id(asset_id)
        table = "monitor.factor_fund_price_daily" if kind == "fund" else "monitor.factor_index_price_daily"
        point_filter = "" if kind == "fund" else "AND point_type IN ('cp', 'normal', '')"
        rows = _rows(
            self.store.query_json(
                f"""
                SELECT
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    amount
                FROM {table}
                WHERE stock_code = '{_escape_sql_string(code)}'
                  AND close IS NOT NULL
                  {point_filter}
                ORDER BY date DESC
                LIMIT {min(max(limit, 1), 2000)}
                FORMAT JSON
                """
            )
        )
        source_table = table
        if not rows and kind == "fund":
            source_table = "monitor.factor_fund_net_value_daily"
            rows = _rows(
                self.store.query_json(
                    f"""
                    SELECT
                        trade_date AS date,
                        net_value AS open,
                        net_value AS high,
                        net_value AS low,
                        net_value AS close,
                        0 AS volume,
                        0 AS amount
                    FROM monitor.factor_fund_net_value_daily
                    WHERE fund_code = '{_escape_sql_string(code)}'
                      AND net_value IS NOT NULL
                    ORDER BY trade_date DESC
                    LIMIT {min(max(limit, 1), 2000)}
                    FORMAT JSON
                    """
                )
            )
        rows.reverse()
        return [
            AlphaTraceMarketKline(
                assetId=asset_id,
                symbol=code,
                period=period,
                timestamp=_timestamp(row.get("date")),
                datetime=_iso_datetime(row.get("date")),
                open=_number(row.get("open"), _number(row.get("close"))),
                high=_number(row.get("high"), _number(row.get("close"))),
                low=_number(row.get("low"), _number(row.get("close"))),
                close=_number(row.get("close")),
                volume=_number(row.get("volume")),
                amount=_number(row.get("amount")),
                source=f"投研数据仓库 {source_table}",
            )
            for row in rows
        ]

    def get_snapshot(self, asset_id: str) -> Optional[AlphaTraceMarketSnapshot]:
        asset = self.get_asset(asset_id)
        quote = self.get_quote(asset_id) if asset else None
        if not asset or not quote:
            return None
        kind, code = parse_ck_asset_id(asset_id)
        if kind == "fund":
            valuation, liquidity, volatility, trend, fund_flow, premium_discount = self._fund_snapshot_sections(
                asset_id=asset_id,
                code=code,
                quote=quote,
                asset_metrics=asset.metrics,
            )
        else:
            valuation, liquidity, volatility, trend, fund_flow, premium_discount = self._index_snapshot_sections(
                code=code,
                quote=quote,
                asset_metrics=asset.metrics,
            )
        return AlphaTraceMarketSnapshot(
            assetId=asset.id,
            symbol=asset.symbol,
            name=asset.name,
            assetType=asset.assetType,
            market=asset.market,
            currency=asset.currency,
            quote=quote,
            valuation=valuation,
            liquidity=liquidity,
            volatility=volatility,
            trend=trend,
            fundFlow=fund_flow,
            premiumDiscount=premium_discount,
            source=quote.source,
            collectedAt=datetime.utcnow().isoformat(),
        )

    def get_fund_manager_profiles(self, asset_id: str, *, include_external: bool = False) -> dict[str, Any] | None:
        asset = self.get_asset(asset_id)
        if not asset:
            return None
        kind, code = parse_ck_asset_id(asset_id)
        if kind != "fund":
            return {
                "assetId": asset.id,
                "symbol": asset.symbol,
                "managers": [],
                "source": "投研数据仓库 monitor.fund_manager_relation",
                "collectedAt": datetime.utcnow().isoformat(),
            }

        safe_code = _escape_sql_string(code)
        selected_relations = self._query_rows(
            f"""
            SELECT manager_code, manager_name, appointment_date, departure_date
            FROM monitor.fund_manager_relation
            WHERE stock_code = '{safe_code}'
            ORDER BY isNull(departure_date) DESC, appointment_date DESC
            LIMIT 12
            FORMAT JSON
            """
        )
        managers: list[dict[str, Any]] = []
        for relation in selected_relations:
            manager_code = _string(relation.get("manager_code"))
            if not manager_code:
                continue
            managers.append(self._build_manager_profile(asset=asset, relation=relation, include_external=include_external))

        return {
            "assetId": asset.id,
            "symbol": asset.symbol,
            "managers": managers,
            "source": "投研数据仓库 fund_manager_relation / v_llm_fund_manager_basic / factor_fund_*",
            "collectedAt": datetime.utcnow().isoformat(),
        }

    def get_indicators(self, asset_id: str) -> list[AlphaTraceMarketIndicator]:
        asset = self.get_asset(asset_id)
        if not asset:
            return []
        indicators = [
            AlphaTraceMarketIndicator(
                assetId=asset.id,
                symbol=asset.symbol,
                name="最新收盘",
                value=_number(asset.metrics.get("latestClose")),
                unit=asset.currency,
                interpretation="来自投研数据仓库最新日线。",
                lookbackDays=None,
                source="投研数据仓库",
                updatedAt=asset.updatedAt,
            )
        ]
        kind, code = parse_ck_asset_id(asset_id)
        if kind != "index":
            return indicators
        rows = _rows(
            self.store.query_json(
                f"""
                SELECT date, pe_ttm_mcw, pb_mcw, dyr_mcw
                FROM monitor.factor_index_valuation_daily
                WHERE stock_code = '{_escape_sql_string(code)}'
                ORDER BY date DESC
                LIMIT 1
                FORMAT JSON
                """
            )
        )
        if not rows:
            return indicators
        row = rows[0]
        for field, label in (("pe_ttm_mcw", "PE TTM"), ("pb_mcw", "PB"), ("dyr_mcw", "股息率")):
            value = row.get(field)
            if value is None:
                continue
            indicators.append(
                AlphaTraceMarketIndicator(
                    assetId=asset.id,
                    symbol=asset.symbol,
                    name=label,
                    value=_number(value),
                    unit=None,
                    interpretation="来自投研数据仓库指数估值因子。",
                    lookbackDays=None,
                    source="投研数据仓库 monitor.factor_index_valuation_daily",
                    updatedAt=_iso_datetime(row.get("date")),
                )
            )
        return indicators

    def _first_row(self, query: str) -> dict[str, Any]:
        rows = _rows(self.store.query_json(query))
        return rows[0] if rows else {}

    def _query_rows(self, query: str) -> list[dict[str, Any]]:
        return _rows(self.store.query_json(query))

    def _wide_columns(self, table_name: str) -> set[str]:
        if table_name in self._wide_column_cache:
            return self._wide_column_cache[table_name]
        if not _WIDE_TABLE_RE.match(table_name):
            return set()
        try:
            rows = self._query_rows(
                f"""
                SELECT name
                FROM system.columns
                WHERE database = 'monitor'
                  AND table = '{_escape_sql_string(table_name)}'
                FORMAT JSON
                """
            )
        except ClickHouseStoreError:
            rows = []
        columns = {_string(row.get("name")) for row in rows if _string(row.get("name"))}
        self._wide_column_cache[table_name] = columns
        return columns

    def _wide_row_for_code(self, table_name: str, code: str) -> dict[str, Any]:
        columns = self._wide_columns(table_name)
        if not columns:
            return {}
        code_column = next((field for field in ("stock_code", "fund_code", "index_code") if field in columns), "")
        if not code_column:
            return {}
        order_fields = [
            field
            for field in ("last_data_date", "date", "business_updated_at", "ingested_at", "updated_at", "row_index")
            if field in columns
        ]
        order_by = ", ".join(f"{field} DESC" for field in order_fields) or code_column
        try:
            return self._first_row(
                f"""
                SELECT *
                FROM monitor.{table_name}
                WHERE {code_column} = '{_escape_sql_string(code)}'
                ORDER BY {order_by}
                LIMIT 1
                FORMAT JSON
                """
            )
        except ClickHouseStoreError:
            return {}

    def _wide_summary_for_code(self, table_name: str, api_id: str, label: str, code: str) -> str:
        row = self._wide_row_for_code(table_name, code)
        summary = _compact_wide_row(row)
        if not summary:
            return ""
        return f"{label}（理杏仁API {api_id}）：{summary}"

    def _fund_wide_summaries(self, code: str) -> dict[str, str]:
        summaries = {
            api_id: self._wide_summary_for_code(table_name, api_id, label, code)
            for table_name, api_id, label in _FUND_WIDE_SOURCES
        }
        return {key: value for key, value in summaries.items() if value}

    def _index_wide_summaries(self, code: str) -> dict[str, str]:
        summaries = {
            api_id: self._wide_summary_for_code(table_name, api_id, label, code)
            for table_name, api_id, label in _INDEX_WIDE_SOURCES
        }
        return {key: value for key, value in summaries.items() if value}

    def _build_manager_profile(
        self,
        *,
        asset: AlphaTraceAssetItem,
        relation: dict[str, Any],
        include_external: bool,
    ) -> dict[str, Any]:
        manager_code = _safe_code(_string(relation.get("manager_code")))
        safe_manager_code = _escape_sql_string(manager_code)
        manager_name = _string(relation.get("manager_name"), manager_code)
        basic = self._first_row(
            f"""
            SELECT fund_manager_code, fund_manager_name, gender, birth_year, resume, business_updated_at
            FROM monitor.v_llm_fund_manager_basic
            WHERE fund_manager_code = '{safe_manager_code}'
            LIMIT 1
            FORMAT JSON
            """
        )
        career = self._first_row(
            f"""
            SELECT
                count() AS total_funds,
                countIf(departure_date IS NULL) AS active_funds,
                min(appointment_date) AS first_appointment,
                max(ifNull(departure_date, today())) AS latest_role_date
            FROM monitor.fund_manager_relation
            WHERE manager_code = '{safe_manager_code}'
            FORMAT JSON
            """
        )
        relations = self._query_rows(
            f"""
            SELECT stock_code, manager_name, appointment_date, departure_date
            FROM monitor.fund_manager_relation
            WHERE manager_code = '{safe_manager_code}'
            ORDER BY isNull(departure_date) DESC, appointment_date DESC
            LIMIT 80
            FORMAT JSON
            """
        )
        fund_codes = list(dict.fromkeys(_string(row.get("stock_code")) for row in relations if _string(row.get("stock_code"))))
        profile_by_code: dict[str, dict[str, Any]] = {}
        scale_by_code: dict[str, dict[str, Any]] = {}
        return_by_code: dict[str, dict[str, Any]] = {}
        tenure_roi_by_key: dict[str, dict[str, Any]] = {}
        tenure_nav_roi_by_key: dict[str, dict[str, Any]] = {}
        drawdown_by_code: dict[str, dict[str, Any]] = {}
        turnover_by_code: dict[str, dict[str, Any]] = {}
        if fund_codes:
            code_clause = _in_clause(fund_codes)
            profile_by_code = {
                _string(row.get("stock_code")): row
                for row in self._query_rows(
                    f"""
                    SELECT
                        stock_code,
                        argMax(exchange_traded_short_name, updated_at) AS fund_name,
                        argMax(fund_company_name, updated_at) AS fund_company_name,
                        argMax(operation_mode, updated_at) AS operation_mode
                    FROM monitor.dim_lixinger_fund_profile
                    WHERE stock_code IN {code_clause}
                    GROUP BY stock_code
                    FORMAT JSON
                    """
                )
            }
            scale_by_code = {
                _string(row.get("stock_code")): row
                for row in self._query_rows(
                    f"""
                    SELECT
                        stock_code,
                        argMax(exchange_traded_asset_scale, date) AS exchange_traded_asset_scale,
                        argMax(asset_scale, date) AS asset_scale,
                        max(date) AS scale_date
                    FROM monitor.factor_fund_shares
                    WHERE stock_code IN {code_clause}
                    GROUP BY stock_code
                    FORMAT JSON
                    """
                )
            }
            return_by_code = {
                _string(row.get("stock_code")): row
                for row in self._query_rows(
                    f"""
                    SELECT
                        stock_code,
                        min(date) AS start_date,
                        max(date) AS end_date,
                        argMin(close, date) AS start_close,
                        argMax(close, date) AS end_close,
                        if(argMin(close, date) > 0, argMax(close, date) / argMin(close, date) - 1, NULL) AS return_1y
                    FROM monitor.factor_fund_price_daily
                    WHERE stock_code IN {code_clause}
                      AND date >= addYears(today(), -1)
                      AND close IS NOT NULL
                    GROUP BY stock_code
                    FORMAT JSON
                    """
                )
            }
            tenure_roi_by_key = {
                f"{_string(row.get('stock_code'))}|{_date_text(row.get('appointment_date'))}|{_date_text(row.get('departure_date'))}": row
                for row in self._query_rows(
                    f"""
                    SELECT
                        rel.stock_code AS stock_code,
                        rel.appointment_date AS appointment_date,
                        rel.departure_date AS departure_date,
                        min(price.date) AS roi_start_date,
                        max(price.date) AS roi_end_date,
                        argMin(price.close, price.date) AS roi_start_value,
                        argMax(price.close, price.date) AS roi_end_value,
                        if(argMin(price.close, price.date) > 0, argMax(price.close, price.date) / argMin(price.close, price.date) - 1, NULL) AS tenure_roi
                    FROM
                    (
                        SELECT stock_code, appointment_date, departure_date
                        FROM monitor.fund_manager_relation
                        WHERE manager_code = '{safe_manager_code}'
                          AND stock_code IN {code_clause}
                    ) AS rel
                    INNER JOIN monitor.factor_fund_price_daily AS price
                        ON price.stock_code = rel.stock_code
                    WHERE price.close IS NOT NULL
                      AND price.date >= rel.appointment_date
                      AND (rel.departure_date IS NULL OR price.date <= rel.departure_date)
                    GROUP BY rel.stock_code, rel.appointment_date, rel.departure_date
                    FORMAT JSON
                    """
                )
            }
            tenure_nav_roi_by_key = {
                f"{_string(row.get('stock_code'))}|{_date_text(row.get('appointment_date'))}|{_date_text(row.get('departure_date'))}": row
                for row in self._query_rows(
                    f"""
                    SELECT
                        rel.stock_code AS stock_code,
                        rel.appointment_date AS appointment_date,
                        rel.departure_date AS departure_date,
                        min(nav.trade_date) AS roi_start_date,
                        max(nav.trade_date) AS roi_end_date,
                        argMin(nav.net_value, nav.trade_date) AS roi_start_value,
                        argMax(nav.net_value, nav.trade_date) AS roi_end_value,
                        if(argMin(nav.net_value, nav.trade_date) > 0, argMax(nav.net_value, nav.trade_date) / argMin(nav.net_value, nav.trade_date) - 1, NULL) AS tenure_roi
                    FROM
                    (
                        SELECT stock_code, appointment_date, departure_date
                        FROM monitor.fund_manager_relation
                        WHERE manager_code = '{safe_manager_code}'
                          AND stock_code IN {code_clause}
                    ) AS rel
                    INNER JOIN monitor.factor_fund_net_value_daily AS nav
                        ON nav.fund_code = rel.stock_code
                    WHERE nav.net_value IS NOT NULL
                      AND nav.trade_date >= rel.appointment_date
                      AND (rel.departure_date IS NULL OR nav.trade_date <= rel.departure_date)
                    GROUP BY rel.stock_code, rel.appointment_date, rel.departure_date
                    FORMAT JSON
                    """
                )
            }
            drawdown_by_code = {
                _string(row.get("stock_code")): row
                for row in self._query_rows(
                    f"""
                    SELECT stock_code, argMax(drawdown, date) AS drawdown, max(date) AS drawdown_date
                    FROM monitor.factor_fund_drawdown
                    WHERE stock_code IN {code_clause}
                    GROUP BY stock_code
                    FORMAT JSON
                    """
                )
            }
            turnover_by_code = {
                _string(row.get("stock_code")): row
                for row in self._query_rows(
                    f"""
                    SELECT stock_code, argMax(turnover_rate, date) AS turnover_rate, max(date) AS turnover_date
                    FROM monitor.factor_fund_turnover
                    WHERE stock_code IN {code_clause}
                    GROUP BY stock_code
                    FORMAT JSON
                    """
                )
            }

        managed_funds = []
        for item in relations:
            fund_code = _string(item.get("stock_code"))
            profile = profile_by_code.get(fund_code, {})
            scale = scale_by_code.get(fund_code, {})
            returns = return_by_code.get(fund_code, {})
            roi_key = f"{fund_code}|{_date_text(item.get('appointment_date'))}|{_date_text(item.get('departure_date'))}"
            tenure_roi = tenure_roi_by_key.get(roi_key) or tenure_nav_roi_by_key.get(roi_key) or {}
            drawdown = drawdown_by_code.get(fund_code, {})
            turnover = turnover_by_code.get(fund_code, {})
            scale_value = _number(scale.get("exchange_traded_asset_scale")) or _number(scale.get("asset_scale"))
            tenure_days = _days_between(item.get("appointment_date"), item.get("departure_date"))
            tenure_roi_value = tenure_roi.get("tenure_roi")
            managed_funds.append(
                {
                    "fundCode": fund_code,
                    "fundName": _string(profile.get("fund_name"), fund_code),
                    "fundCompanyName": _string(profile.get("fund_company_name"), "-"),
                    "operationMode": _string(profile.get("operation_mode"), "-"),
                    "appointmentDate": _date_text(item.get("appointment_date")) or "-",
                    "departureDate": _date_text(item.get("departure_date")) or None,
                    "isActive": item.get("departure_date") is None,
                    "tenureDays": tenure_days,
                    "latestScale": scale_value,
                    "scaleDate": _date_text(scale.get("scale_date")) or "-",
                    "tenureRoi": tenure_roi_value,
                    "annualizedRoi": _annualized_return(tenure_roi_value, tenure_days),
                    "roiStartDate": _date_text(tenure_roi.get("roi_start_date")) or "-",
                    "roiEndDate": _date_text(tenure_roi.get("roi_end_date")) or "-",
                    "roiStartValue": tenure_roi.get("roi_start_value"),
                    "roiEndValue": tenure_roi.get("roi_end_value"),
                    "roiSource": "价格日线" if roi_key in tenure_roi_by_key else ("单位净值" if roi_key in tenure_nav_roi_by_key else "-"),
                    "return1y": returns.get("return_1y"),
                    "returnStartDate": _date_text(returns.get("start_date")) or "-",
                    "returnEndDate": _date_text(returns.get("end_date")) or "-",
                    "latestDrawdown": drawdown.get("drawdown"),
                    "drawdownDate": _date_text(drawdown.get("drawdown_date")) or "-",
                    "turnoverRate": turnover.get("turnover_rate"),
                    "turnoverDate": _date_text(turnover.get("turnover_date")) or "-",
                }
            )
        managed_funds.sort(key=lambda row: (bool(row["isActive"]), _number(row.get("latestScale"))), reverse=True)

        hot_fmi = self._first_row(
            f"""
            SELECT fm_a_mfn, fm_as, fm_mfn, fm_my, fm_nb_as, fm_r_fd, business_updated_at
            FROM monitor.wide_lixinger_cn_fund_manager_hot_fmi
            WHERE stock_code = '{safe_manager_code}' OR request_stock_code = '{safe_manager_code}'
            LIMIT 1
            FORMAT JSON
            """
        )
        hot_fmp = self._first_row(
            f"""
            SELECT
                fm_cagr_p_r_fs,
                fm_p_r_m1,
                fm_p_r_m3,
                fm_p_r_m6,
                fm_p_r_y1,
                fm_p_r_y3,
                fm_p_r_y5,
                fm_p_r_y10,
                fm_p_r_d,
                business_updated_at
            FROM monitor.wide_lixinger_cn_fund_manager_hot_fmp
            WHERE stock_code = '{safe_manager_code}' OR request_stock_code = '{safe_manager_code}'
            LIMIT 1
            FORMAT JSON
            """
        )

        active_funds = [item for item in managed_funds if item["isActive"]]
        active_scale = sum(_number(item.get("latestScale")) for item in active_funds)
        active_returns = [float(item["return1y"]) for item in active_funds if item.get("return1y") is not None]
        active_roi = [float(item["tenureRoi"]) for item in active_funds if item.get("tenureRoi") is not None]
        active_annualized_roi = [float(item["annualizedRoi"]) for item in active_funds if item.get("annualizedRoi") is not None]
        weighted_roi_items = [
            (_number(item.get("latestScale")), float(item["tenureRoi"]))
            for item in active_funds
            if item.get("tenureRoi") is not None and _number(item.get("latestScale")) > 0
        ]
        weighted_roi_denominator = sum(weight for weight, _ in weighted_roi_items)
        active_drawdowns = [float(item["latestDrawdown"]) for item in active_funds if item.get("latestDrawdown") is not None]
        resume = _string(basic.get("resume"))
        selected_tenure_days = _days_between(relation.get("appointment_date"), relation.get("departure_date"))
        external_search = self._manager_external_search(asset.id, asset.name, manager_name, include_external)

        return {
            "managerCode": manager_code,
            "managerName": _string(basic.get("fund_manager_name"), manager_name),
            "status": "在任" if relation.get("departure_date") is None else "离任",
            "currentFund": {
                "fundCode": asset.symbol,
                "fundName": asset.name,
                "appointmentDate": _date_text(relation.get("appointment_date")) or "-",
                "departureDate": _date_text(relation.get("departure_date")) or None,
                "tenureDays": selected_tenure_days,
            },
            "basic": {
                "gender": _string(basic.get("gender"), "-"),
                "birthYear": basic.get("birth_year"),
                "resume": resume,
                "businessUpdatedAt": _iso_datetime(basic.get("business_updated_at")) if basic else "-",
            },
            "career": {
                "totalFunds": _int(career.get("total_funds")),
                "activeFunds": _int(career.get("active_funds")),
                "firstAppointment": _date_text(career.get("first_appointment")) or "-",
                "careerDays": _days_between(career.get("first_appointment")),
                "selectedFundTenureDays": selected_tenure_days,
                "activeScale": active_scale,
                "averageActiveReturn1y": sum(active_returns) / len(active_returns) if active_returns else None,
                "averageActiveTenureRoi": sum(active_roi) / len(active_roi) if active_roi else None,
                "averageActiveAnnualizedRoi": sum(active_annualized_roi) / len(active_annualized_roi) if active_annualized_roi else None,
                "scaleWeightedActiveTenureRoi": (
                    sum(weight * roi for weight, roi in weighted_roi_items) / weighted_roi_denominator
                    if weighted_roi_denominator > 0
                    else None
                ),
                "worstActiveDrawdown": min(active_drawdowns) if active_drawdowns else None,
            },
            "styleSignals": self._infer_manager_tags(resume, managed_funds),
            "performance": {
                "经理收益CAGR": hot_fmp.get("fm_cagr_p_r_fs"),
                "近1月": hot_fmp.get("fm_p_r_m1"),
                "近3月": hot_fmp.get("fm_p_r_m3"),
                "近6月": hot_fmp.get("fm_p_r_m6"),
                "近1年": hot_fmp.get("fm_p_r_y1"),
                "近3年": hot_fmp.get("fm_p_r_y3"),
                "近5年": hot_fmp.get("fm_p_r_y5"),
                "近10年": hot_fmp.get("fm_p_r_y10"),
                "收益日期": _date_text(hot_fmp.get("fm_p_r_d")) or "-",
                "热度管理基金数": hot_fmi.get("fm_mfn"),
                "热度总规模": hot_fmi.get("fm_as"),
                "从业年限": hot_fmi.get("fm_my"),
            },
            "managedFunds": managed_funds[:18],
            "externalSearch": external_search,
        }

    def _infer_manager_tags(self, resume: str, managed_funds: list[dict[str, Any]]) -> list[str]:
        text = resume + " " + " ".join(_string(item.get("fundName")) for item in managed_funds[:20])
        rules = [
            ("指数投资", ["指数", "ETF", "交易型开放式"]),
            ("量化/增强", ["量化", "增强", "Smart Beta", "低波动"]),
            ("跨境/QDII", ["QDII", "恒生", "纳斯达克", "港股"]),
            ("红利/价值", ["红利", "价值", "股息"]),
            ("行业主题", ["科技", "医药", "消费", "半导体", "新能源"]),
            ("固收/债券", ["债", "信用", "久期"]),
        ]
        tags = [label for label, keywords in rules if any(keyword.lower() in text.lower() for keyword in keywords)]
        if not tags and managed_funds:
            tags.append("多基金管理")
        return tags[:6]

    def _manager_external_search(
        self,
        asset_id: str,
        asset_name: str,
        manager_name: str,
        include_external: bool,
    ) -> dict[str, Any]:
        query = f"{manager_name} 基金经理 {asset_name} 投资风格 履历 最新"
        if not include_external:
            return {"status": "ready", "query": query, "items": [], "message": "点击外部检索后使用 Bocha 补充公开信息。"}
        try:
            from services.evidence_retrieval.external_search import ExternalEvidenceSearch

            result = ExternalEvidenceSearch().search(asset_id, query, "single_asset_analysis", limit=3)
            return {
                "status": result.status,
                "query": result.query,
                "message": result.message,
                "items": [
                    {
                        "title": item.title,
                        "sourceName": item.sourceName,
                        "summary": item.summary,
                        "url": item.url,
                        "publishedAt": item.publishedAt,
                    }
                    for item in result.items
                ],
            }
        except Exception as exc:  # noqa: BLE001 - external evidence is optional.
            return {"status": "failed", "query": query, "items": [], "message": f"Bocha 外部检索失败：{exc}"}

    def _fund_snapshot_sections(
        self,
        *,
        asset_id: str,
        code: str,
        quote: AlphaTraceMarketQuote,
        asset_metrics: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
        safe_code = _escape_sql_string(code)
        profile = self._first_row(
            f"""
            SELECT *
            FROM monitor.dim_lixinger_fund_profile
            WHERE stock_code = '{safe_code}'
            ORDER BY report_date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        fee = self._first_row(
            f"""
            SELECT *
            FROM monitor.fund_fee
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        shares = self._first_row(
            f"""
            SELECT *
            FROM monitor.factor_fund_shares
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        asset_combo = self._first_row(
            f"""
            SELECT *
            FROM monitor.fund_asset_combination
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        unit_nav = self._first_row(
            f"""
            SELECT trade_date, net_value
            FROM monitor.factor_fund_net_value_daily
            WHERE fund_code = '{safe_code}'
              AND net_value IS NOT NULL
            ORDER BY trade_date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        total_nav = self._first_row(
            f"""
            SELECT trade_date, total_net_value
            FROM monitor.factor_fund_total_net_value_daily
            WHERE fund_code = '{safe_code}'
              AND total_net_value IS NOT NULL
            ORDER BY trade_date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        reinvestment_nav = self._first_row(
            f"""
            SELECT trade_date, reinvestment_net_value
            FROM monitor.factor_fund_reinvestment_net_value_daily
            WHERE fund_code = '{safe_code}'
              AND reinvestment_net_value IS NOT NULL
            ORDER BY trade_date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        drawdown = self._first_row(
            f"""
            SELECT date, granularity, drawdown
            FROM monitor.factor_fund_drawdown
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        turnover = self._first_row(
            f"""
            SELECT date, turnover_rate
            FROM monitor.factor_fund_turnover
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        managers = self._query_rows(
            f"""
            SELECT manager_code, manager_name, appointment_date, departure_date
            FROM monitor.fund_manager_relation
            WHERE stock_code = '{safe_code}'
            ORDER BY isNull(departure_date) DESC, appointment_date DESC
            LIMIT 5
            FORMAT JSON
            """
        )
        holdings = self._query_rows(
            f"""
            SELECT holding_stock_code, stock_area_code, holdings, market_cap, net_value_ratio, date
            FROM monitor.fund_shareholding
            WHERE fund_code = '{safe_code}'
              AND date = (SELECT max(date) FROM monitor.fund_shareholding WHERE fund_code = '{safe_code}')
            ORDER BY net_value_ratio DESC NULLS LAST, market_cap DESC NULLS LAST
            LIMIT 10
            FORMAT JSON
            """
        )
        industries = self._query_rows(
            f"""
            SELECT industry_code, industry_name, market_cap, net_value_ratio, date
            FROM monitor.fund_asset_industry_combination
            WHERE stock_code = '{safe_code}'
              AND date = (SELECT max(date) FROM monitor.fund_asset_industry_combination WHERE stock_code = '{safe_code}')
            ORDER BY net_value_ratio DESC NULLS LAST, market_cap DESC NULLS LAST
            LIMIT 8
            FORMAT JSON
            """
        )
        klines = self.get_klines(asset_id, limit=260)
        returns = self._return_metrics(klines)
        wide_summaries = self._fund_wide_summaries(code)
        latest_nav = _number(unit_nav.get("net_value")) if unit_nav.get("net_value") is not None else None
        total_nav_value = (
            _number(total_nav.get("total_net_value")) if total_nav.get("total_net_value") is not None else None
        )
        reinvestment_nav_value = (
            _number(reinvestment_nav.get("reinvestment_net_value"))
            if reinvestment_nav.get("reinvestment_net_value") is not None
            else None
        )
        nav_dates = [
            _date_text(value)
            for value in (
                unit_nav.get("trade_date"),
                total_nav.get("trade_date"),
                reinvestment_nav.get("trade_date"),
            )
            if _date_text(value)
        ]
        premium = (quote.price / latest_nav - 1) if latest_nav and latest_nav > 0 else None

        valuation = {
            "净值日期": max(nav_dates) if nav_dates else "-",
            "单位净值": latest_nav,
            "累计净值": total_nav_value,
            "复权净值": reinvestment_nav_value,
            "交易价格": quote.price,
        }
        liquidity = {
            "最新成交额": quote.amount,
            "最新成交量": quote.volume,
            "场内份额": _number(shares.get("exchange_traded_shares")),
            "场内规模": _number(shares.get("exchange_traded_asset_scale")) or _number(asset_metrics.get("latestAmount")),
            "规模日期": _date_text(shares.get("date")) or quote.timestamp[:10],
            "规模/份额热度": _join_wide_summaries(
                [wide_summaries.get("cn_fund_hot_f_as", ""), wide_summaries.get("cn_fund_hot_fss", "")]
            ),
        }
        volatility = {
            "近1月收益": returns.get("return_1m"),
            "近3月收益": returns.get("return_3m"),
            "近1年收益": returns.get("return_1y"),
            "近1年最大回撤": _number(drawdown.get("drawdown")),
            "回撤口径": _string(drawdown.get("granularity"), "-"),
            "换手率": _number(turnover.get("turnover_rate")),
            "换手日期": _date_text(turnover.get("date")) or "-",
            "收益/排名画像": _join_wide_summaries(
                [wide_summaries.get("cn_fund_hot_fp", ""), wide_summaries.get("cn_fund_hot_fpr", "")]
            ),
        }
        trend = {
            "基金公司": _string(profile.get("fund_company_name"), "-"),
            "托管人": _string(profile.get("custodian_name"), "-"),
            "成立日": _date_text(profile.get("inception_date")) or "-",
            "运作方式": _string(profile.get("operation_mode"), "-"),
            "业绩基准": _string(profile.get("performance_comparison_benchmark"), "-"),
            "风险收益特征": _string(profile.get("risk_return_characteristics"), "-"),
            "费率/基础画像": _join_wide_summaries([wide_summaries.get("cn_fund_hot_ff", "")]),
        }
        fund_flow = {
            "管理人": managers,
            "费用": {
                "管理费率": fee.get("management_fee_rate"),
                "托管费率": fee.get("custody_fee_rate"),
                "费率日期": _date_text(fee.get("date")) or "-",
            },
            "资产配置": {
                "报告期": _date_text(asset_combo.get("date")) or "-",
                "股票占比": asset_combo.get("equity_investment_ratio"),
                "固收占比": asset_combo.get("fixed_income_investment_ratio"),
                "现金占比": asset_combo.get("bank_deposit_and_settlement_reserve_ratio"),
                "其他占比": asset_combo.get("other_assets_ratio"),
            },
            "行业配置": industries,
            "前十大持仓": holdings,
        }
        premium_discount = {
            "估算溢折价": premium,
            "单位净值": latest_nav,
            "交易价格": quote.price,
            "说明": "按最新交易价与最新单位净值粗略估算，非实时 IOPV。",
            "场内快照": _join_wide_summaries(
                [wide_summaries.get("cn_fund_hot_f_nlacan", ""), wide_summaries.get("cn_fund_hot_fet_s", "")]
            ),
        }
        for section in (liquidity, volatility, trend, premium_discount):
            for key in list(section.keys()):
                if section[key] == "":
                    section.pop(key)
        return valuation, liquidity, volatility, trend, fund_flow, premium_discount

    def _index_snapshot_sections(
        self,
        *,
        code: str,
        quote: AlphaTraceMarketQuote,
        asset_metrics: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
        safe_code = _escape_sql_string(code)
        valuation = self._first_row(
            f"""
            SELECT *
            FROM monitor.factor_index_valuation_daily
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        constituents = self._query_rows(
            f"""
            SELECT constituent_stock_code, weighting, date
            FROM monitor.index_constituent_weighting
            WHERE index_code = '{safe_code}'
              AND date = (SELECT max(date) FROM monitor.index_constituent_weighting WHERE index_code = '{safe_code}')
            ORDER BY weighting DESC NULLS LAST
            LIMIT 10
            FORMAT JSON
            """
        )
        drawdown = self._first_row(
            f"""
            SELECT date, granularity, drawdown
            FROM monitor.factor_index_drawdown
            WHERE stock_code = '{safe_code}'
            ORDER BY date DESC
            LIMIT 1
            FORMAT JSON
            """
        )
        wide_summaries = self._index_wide_summaries(code)
        valuation_section = {
            "估值日期": _date_text(valuation.get("date")) or "-",
            "PE_TTM_MC": valuation.get("pe_ttm_mcw"),
            "PE_TTM_等权": valuation.get("pe_ttm_ew"),
            "PB_MC": valuation.get("pb_mcw"),
            "PB_等权": valuation.get("pb_ew"),
            "股息率": valuation.get("dyr_mcw"),
            "市值": valuation.get("mc"),
            "涨跌表现画像": _join_wide_summaries([wide_summaries.get("cn_index_hot_cp", "")]),
        }
        liquidity_section = {
            "最新成交额": quote.amount,
            "最新成交量": quote.volume,
            "样本点数": asset_metrics.get("pricePoints"),
            "成交热度画像": _join_wide_summaries(
                [wide_summaries.get("cn_index_hot_tr", ""), wide_summaries.get("cn_index_hot_tr_cp", "")]
            ),
        }
        volatility_section = {
            "近1年最大回撤": _number(drawdown.get("drawdown")),
            "回撤口径": _string(drawdown.get("granularity"), "-"),
            "回撤日期": _date_text(drawdown.get("date")) or "-",
        }
        trend_section = {
            "最新日期": quote.timestamp[:10],
            "最新点位": quote.price,
            "成分/ETF画像": _join_wide_summaries(
                [wide_summaries.get("cn_index_hot_ic", ""), wide_summaries.get("cn_index_hot_ifet_sni", "")]
            ),
            "资金互联画像": _join_wide_summaries(
                [wide_summaries.get("cn_index_hot_mm_ha", ""), wide_summaries.get("cn_index_hot_mtasl", "")]
            ),
        }
        for section in (valuation_section, liquidity_section, volatility_section, trend_section):
            for key in list(section.keys()):
                if section[key] == "":
                    section.pop(key)
        return valuation_section, liquidity_section, volatility_section, trend_section, {"前十大成分": constituents}, {}

    def _return_metrics(self, klines: list[AlphaTraceMarketKline]) -> dict[str, Optional[float]]:
        if len(klines) < 2:
            return {"return_1m": None, "return_3m": None, "return_1y": None}
        latest = klines[-1].close

        def calc(days: int) -> Optional[float]:
            if latest <= 0 or len(klines) <= days:
                return None
            base = klines[-days - 1].close
            return latest / base - 1 if base > 0 else None

        return {
            "return_1m": calc(21),
            "return_3m": calc(63),
            "return_1y": calc(252),
        }

    def _query_funds(self, *, keyword: Optional[str] = None, code: Optional[str] = None, limit: int = 100) -> list[dict[str, Any]]:
        filters = []
        if code:
            filters.append(f"f.stock_code = '{_escape_sql_string(code)}'")
        if keyword:
            safe_keyword = _escape_sql_string(keyword)
            filters.append(
                "positionCaseInsensitiveUTF8(concat(f.stock_code, ' ', f.name, ' ', f.short_name, ' ', "
                f"f.fund_first_level, ' ', f.fund_second_level), '{safe_keyword}') > 0"
            )
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        return _rows(
            self.store.query_json(
                f"""
                SELECT
                    f.stock_code AS stock_code,
                    any(f.name) AS name,
                    any(f.short_name) AS short_name,
                    any(f.area_code) AS area_code,
                    any(f.market) AS market,
                    any(f.fund_first_level) AS fund_first_level,
                    any(f.fund_second_level) AS fund_second_level,
                    any(f.updated_at) AS updated_at,
                    max(p.date) AS latest_date,
                    argMax(p.close, p.date) AS latest_close,
                    argMax(p.amount, p.date) AS latest_amount,
                    argMax(p.volume, p.date) AS latest_volume,
                    uniqExactIf(p.date, p.close IS NOT NULL) AS price_points
                FROM monitor.dim_lixinger_fund AS f
                LEFT JOIN monitor.factor_fund_price_daily AS p ON p.stock_code = f.stock_code
                {where}
                GROUP BY f.stock_code
                ORDER BY latest_date DESC, latest_amount DESC
                LIMIT {min(max(limit, 1), 500)}
                FORMAT JSON
                """
            )
        )

    def _query_indexes(self, *, keyword: Optional[str] = None, code: Optional[str] = None, limit: int = 100) -> list[dict[str, Any]]:
        filters = []
        if code:
            filters.append(f"i.stock_code = '{_escape_sql_string(code)}'")
        if keyword:
            safe_keyword = _escape_sql_string(keyword)
            filters.append(
                "positionCaseInsensitiveUTF8(concat(i.stock_code, ' ', i.name, ' ', i.source, ' ', i.series), "
                f"'{safe_keyword}') > 0"
            )
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        return _rows(
            self.store.query_json(
                f"""
                SELECT
                    i.stock_code AS stock_code,
                    any(i.name) AS name,
                    any(i.area_code) AS area_code,
                    any(i.market) AS market,
                    any(i.source) AS source,
                    any(i.series) AS series,
                    any(i.updated_at) AS updated_at,
                    max(p.date) AS latest_date,
                    argMax(p.close, p.date) AS latest_close,
                    argMax(p.amount, p.date) AS latest_amount,
                    argMax(p.volume, p.date) AS latest_volume,
                    uniqExactIf(p.date, p.close IS NOT NULL) AS price_points
                FROM monitor.dim_lixinger_index AS i
                LEFT JOIN monitor.factor_index_price_daily AS p
                  ON p.stock_code = i.stock_code AND p.point_type IN ('cp', 'normal', '')
                {where}
                GROUP BY i.stock_code
                ORDER BY latest_date DESC, latest_amount DESC
                LIMIT {min(max(limit, 1), 500)}
                FORMAT JSON
                """
            )
        )


def get_clickhouse_asset_store() -> ClickHouseAssetStore:
    return ClickHouseAssetStore()
