from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Any, Iterable, Optional

from services.clickhouse_business_store import ClickHouseBusinessStore, ClickHouseStoreError, get_clickhouse_business_store
from services.evidence_retrieval.static_evidence_seed import EvidenceItem


_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SIX_DIGIT_RE = re.compile(r"(?<!\d)(\d{6})(?!\d)")


class LixingerClickHouseContextError(RuntimeError):
    pass


def _enabled() -> bool:
    value = os.getenv("ALPHA_TRACE_ENABLE_LIXINGER_CLICKHOUSE_EVIDENCE", "true")
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _database_name() -> str:
    database = (
        os.getenv("ALPHA_TRACE_LIXINGER_CLICKHOUSE_DATABASE")
        or os.getenv("CLICKHOUSE_DATABASE")
        or "monitor"
    ).strip()
    if not _IDENTIFIER_RE.match(database):
        raise LixingerClickHouseContextError(f"Invalid ClickHouse database name: {database}")
    return database


def _table(table_name: str, database: str) -> str:
    if not _IDENTIFIER_RE.match(table_name):
        raise LixingerClickHouseContextError(f"Invalid ClickHouse table name: {table_name}")
    return f"`{database}`.`{table_name}`"


def _quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _safe_code(value: str) -> Optional[str]:
    code = str(value or "").strip().upper()
    if "." in code:
        code = code.split(".", 1)[0]
    if len(code) == 8 and code[:2] in {"SH", "SZ"} and code[2:].isdigit():
        code = code[2:]
    if len(code) == 6 and code.isdigit():
        return code
    return None


def _infer_codes(asset_id: str | None, question: str) -> tuple[list[str], list[str]]:
    text = " ".join(value for value in [asset_id or "", question or ""] if value)
    fund_codes: list[str] = []
    index_codes: list[str] = []

    def add_unique(target: list[str], code: str) -> None:
        if code not in target:
            target.append(code)

    for raw_code in _SIX_DIGIT_RE.findall(text):
        code = _safe_code(raw_code)
        if not code:
            continue
        if code.startswith(("5", "1")):
            add_unique(fund_codes, code)
        if code.startswith(("0", "3", "8", "9")):
            add_unique(index_codes, code)

    lowered = text.lower()
    if any(marker in text for marker in ["沪深300", "沪深 300"]) or "csi300" in lowered or "csi 300" in lowered:
        add_unique(index_codes, "000300")
    if "asset_etf_510300" in lowered or "510300" in text or "沪深300ETF" in text or "沪深 300 ETF" in text:
        add_unique(fund_codes, "510300")
        add_unique(index_codes, "000300")

    return fund_codes[:5], index_codes[:5]


def _query_rows(store: ClickHouseBusinessStore, query: str) -> list[dict[str, Any]]:
    payload = store.query_json(query)
    return [row for row in payload.get("data", []) if isinstance(row, dict)]


def _first_non_empty(values: Iterable[Any]) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _num(value: Any, digits: int = 4) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _pct(value: Any, digits: int = 2) -> Optional[float]:
    number = _num(value, digits + 2)
    if number is None:
        return None
    return round(number * 100, digits)


def _raw_pct(value: Any, digits: int = 2) -> Optional[float]:
    return _num(value, digits)


def _sanitize_id_part(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]+", "_", str(value or "")).strip("_") or "unknown"


def _collected_at() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _fund_overview_items(
    *,
    store: ClickHouseBusinessStore,
    database: str,
    fund_codes: list[str],
    related_asset_id: str | None,
) -> tuple[list[EvidenceItem], list[str]]:
    if not fund_codes:
        return [], []
    codes_sql = ", ".join(_quote(code) for code in fund_codes)
    rows = _query_rows(
        store,
        f"""
        SELECT *
        FROM {_table("v_llm_fund_latest_overview", database)}
        WHERE fund_code IN ({codes_sql})
        ORDER BY latest_date DESC
        LIMIT {len(fund_codes)}
        FORMAT JSON
        """,
    )
    items: list[EvidenceItem] = []
    tracking_index_codes: list[str] = []
    for row in rows:
        fund_code = str(row.get("fund_code") or "")
        tracking_codes = [
            code.strip()
            for code in str(row.get("tracking_index_codes_csv") or "").split(",")
            if _safe_code(code.strip())
        ]
        for code in tracking_codes:
            if code not in tracking_index_codes:
                tracking_index_codes.append(code)
        title = _first_non_empty([row.get("fund_short_name"), row.get("fund_name"), fund_code])
        latest_date = str(row.get("latest_date") or _collected_at())
        summary_parts = [
            f"{title} 最新交易日 {latest_date}",
            f"收盘价 {row.get('latest_price')}" if row.get("latest_price") is not None else "",
            f"日涨跌幅 {_raw_pct(row.get('day_change_pct'))}%" if row.get("day_change_pct") is not None else "",
            f"近一年回撤 {_pct(row.get('drawdown_y1'))}%" if row.get("drawdown_y1") is not None else "",
            f"基础费率 {_pct(row.get('total_basic_fee_rate'))}%" if row.get("total_basic_fee_rate") is not None else "",
            f"换手率 {_raw_pct(row.get('turnover_rate'))}%" if row.get("turnover_rate") is not None else "",
            f"跟踪指数 {','.join(tracking_codes)}" if tracking_codes else "",
        ]
        items.append(
            EvidenceItem(
                evidenceId=f"ev_lixinger_sync_fund_overview_{_sanitize_id_part(fund_code)}",
                title=f"理杏仁基金概览：{title}",
                sourceName="理杏仁同步数据",
                sourceType="lixinger_local_sync",
                sourceApiName="lixinger.cn_fund / cn_fund_profile / cn_fund_fees",
                snapshotId=f"lixinger_sync_fund_overview_{fund_code}_{latest_date}",
                snapshotCapturedAt=latest_date,
                evidenceType="fund_profile",
                relatedAssetIds=[item for item in [related_asset_id, fund_code, f"{fund_code}.SH", *tracking_codes] if item],
                publishedAt=latest_date,
                qualityScore=94,
                reliabilityScore=96,
                summary="；".join(part for part in summary_parts if part) + "。",
                extractedFields={
                    "apiId": "cn_fund / cn_fund_profile / cn_fund_fees",
                    "queryTable": "v_llm_fund_latest_overview",
                    "fundCode": fund_code,
                    "fundName": row.get("fund_name"),
                    "fundShortName": row.get("fund_short_name"),
                    "fundCompanyName": row.get("fund_company_name"),
                    "trackingIndexCodes": tracking_codes,
                    "latest": row,
                    "dataPolicy": "queried from synchronized Lixinger local dataset; no OpenAPI call",
                },
            )
        )
    return items, tracking_index_codes


def _index_valuation_items(
    *,
    store: ClickHouseBusinessStore,
    database: str,
    index_codes: list[str],
    related_asset_id: str | None,
) -> list[EvidenceItem]:
    if not index_codes:
        return []
    codes_sql = ", ".join(_quote(code) for code in index_codes)
    rows = _query_rows(
        store,
        f"""
        SELECT *
        FROM {_table("v_llm_index_latest_valuation", database)}
        WHERE index_code IN ({codes_sql})
        ORDER BY latest_date DESC
        LIMIT {len(index_codes)}
        FORMAT JSON
        """,
    )
    items: list[EvidenceItem] = []
    for row in rows:
        index_code = str(row.get("index_code") or "")
        index_name = _first_non_empty([row.get("index_name"), index_code])
        latest_date = str(row.get("latest_date") or _collected_at())
        pe_pos = _pct(row.get("pe_ttm_y10_mcw_cvpos"))
        pb_pos = _pct(row.get("pb_y10_mcw_cvpos"))
        summary_parts = [
            f"{index_name} 最新估值日 {latest_date}",
            f"点位 {row.get('close_point')}" if row.get("close_point") is not None else "",
            f"PE-TTM 市值加权 {_num(row.get('pe_ttm_mcw'), 2)}" if row.get("pe_ttm_mcw") is not None else "",
            f"PE 十年分位 {pe_pos}%" if pe_pos is not None else "",
            f"PB 市值加权 {_num(row.get('pb_mcw'), 2)}" if row.get("pb_mcw") is not None else "",
            f"PB 十年分位 {pb_pos}%" if pb_pos is not None else "",
            f"股息率 {_pct(row.get('dyr_mcw'))}%" if row.get("dyr_mcw") is not None else "",
            f"成交额 {_num(row.get('turnover_amount'), 0)}" if row.get("turnover_amount") is not None else "",
        ]
        items.append(
            EvidenceItem(
                evidenceId=f"ev_lixinger_sync_index_valuation_{_sanitize_id_part(index_code)}",
                title=f"理杏仁指数估值：{index_name}",
                sourceName="理杏仁同步数据",
                sourceType="lixinger_local_sync",
                sourceApiName="lixinger.cn_index_fundamental",
                snapshotId=f"lixinger_sync_index_valuation_{index_code}_{latest_date}",
                snapshotCapturedAt=latest_date,
                evidenceType="index_valuation",
                relatedAssetIds=[item for item in [related_asset_id, index_code, f"{index_code}.SH", "asset_index_000300" if index_code == "000300" else None] if item],
                publishedAt=latest_date,
                qualityScore=95,
                reliabilityScore=96,
                summary="；".join(part for part in summary_parts if part) + "。",
                extractedFields={
                    "apiId": "cn_index_fundamental",
                    "queryTable": "v_llm_index_latest_valuation",
                    "indexCode": index_code,
                    "indexName": index_name,
                    "latest": row,
                    "keyMetrics": {
                        "peTtmMcw": _num(row.get("pe_ttm_mcw"), 4),
                        "peTtmY10McwCvpos": _num(row.get("pe_ttm_y10_mcw_cvpos"), 4),
                        "pbMcw": _num(row.get("pb_mcw"), 4),
                        "pbY10McwCvpos": _num(row.get("pb_y10_mcw_cvpos"), 4),
                        "dyrMcw": _num(row.get("dyr_mcw"), 4),
                        "turnoverAmount": _num(row.get("turnover_amount"), 0),
                    },
                    "dataPolicy": "queried from synchronized Lixinger local dataset; no OpenAPI call",
                },
            )
        )
    return items


def _index_constituent_items(
    *,
    store: ClickHouseBusinessStore,
    database: str,
    index_codes: list[str],
    related_asset_id: str | None,
    limit_per_index: int = 8,
) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []
    for index_code in index_codes[:3]:
        rows = _query_rows(
            store,
            f"""
            SELECT
                index_code,
                date,
                constituent_stock_code,
                weighting
            FROM {_table("index_constituent_weighting", database)}
            WHERE index_code = {_quote(index_code)}
            ORDER BY date DESC, weighting DESC
            LIMIT {max(1, min(limit_per_index, 20))}
            FORMAT JSON
            """,
        )
        if not rows:
            continue
        latest_date = str(rows[0].get("date") or _collected_at())
        top_holdings = [
            {
                "stockCode": row.get("constituent_stock_code"),
                "weighting": _num(row.get("weighting"), 6),
            }
            for row in rows
        ]
        top_summary = "、".join(
            f"{item['stockCode']}({_pct(item.get('weighting'))}%)"
            for item in top_holdings[:5]
            if item.get("stockCode") and item.get("weighting") is not None
        )
        items.append(
            EvidenceItem(
                evidenceId=f"ev_lixinger_sync_index_constituents_{_sanitize_id_part(index_code)}",
                title=f"理杏仁指数权重：{index_code}",
                sourceName="理杏仁同步数据",
                sourceType="lixinger_local_sync",
                sourceApiName="lixinger.cn_index_constituent_weightings",
                snapshotId=f"lixinger_sync_index_constituents_{index_code}_{latest_date}",
                snapshotCapturedAt=latest_date,
                evidenceType="index_constituents",
                relatedAssetIds=[item for item in [related_asset_id, index_code, f"{index_code}.SH"] if item],
                publishedAt=latest_date,
                qualityScore=92,
                reliabilityScore=95,
                summary=f"{index_code} 最新成分权重日期 {latest_date}，前五大权重样本：{top_summary or '暂无可展示权重'}。",
                extractedFields={
                    "apiId": "cn_index_constituent_weightings",
                    "queryTable": "index_constituent_weighting",
                    "indexCode": index_code,
                    "latestDate": latest_date,
                    "topConstituents": top_holdings,
                    "rowLimit": len(rows),
                    "dataPolicy": "queried from synchronized Lixinger local dataset; no OpenAPI call",
                },
            )
        )
    return items


def build_lixinger_clickhouse_evidence_items(
    *,
    asset_id: str | None,
    question: str,
    limit: int = 6,
) -> list[EvidenceItem]:
    if not _enabled():
        return []

    fund_codes, index_codes = _infer_codes(asset_id, question)
    if not fund_codes and not index_codes:
        return []

    store = get_clickhouse_business_store()
    database = _database_name()
    try:
        fund_items, tracking_codes = _fund_overview_items(
            store=store,
            database=database,
            fund_codes=fund_codes,
            related_asset_id=asset_id,
        )
        for code in tracking_codes:
            if code not in index_codes:
                index_codes.append(code)
        items = [
            *fund_items,
            *_index_valuation_items(store=store, database=database, index_codes=index_codes, related_asset_id=asset_id),
            *_index_constituent_items(store=store, database=database, index_codes=index_codes, related_asset_id=asset_id),
        ]
    except ClickHouseStoreError as exc:
        raise LixingerClickHouseContextError(str(exc)) from exc

    deduped: list[EvidenceItem] = []
    seen: set[str] = set()
    for item in items:
        if item.evidenceId in seen:
            continue
        deduped.append(item)
        seen.add(item.evidenceId)
        if len(deduped) >= max(1, limit):
            break
    return deduped


__all__ = [
    "LixingerClickHouseContextError",
    "build_lixinger_clickhouse_evidence_items",
]
