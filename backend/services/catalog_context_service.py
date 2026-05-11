from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional

from schemas.alpha_trace_agent_runtime import SubmitAgentRunRequest
from services.clickhouse_business_store import (
    ClickHouseBusinessStore,
    ClickHouseStoreError,
    get_clickhouse_business_store,
    get_etf_import_table_name,
)
from services.asset_store.asset_store import get_static_asset_store
from services.dataset_binding_store import get_default_dataset_binding_for_asset
from services.evidence_retrieval.static_evidence_seed import EvidenceItem
from services.etf_file_import_service import ETF_INDEX_VALUATION_METRIC_COLUMNS


_SAFE_DATASET_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_SAFE_SYMBOL_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class CatalogContextError(RuntimeError):
    pass


def _quote_ch_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _quote_table_name(table_name: str) -> str:
    parts = [part.strip() for part in table_name.split(".") if part.strip()]
    if len(parts) == 1:
        parts = ["default", parts[0]]
    if len(parts) != 2 or any(not _IDENTIFIER_RE.match(part) for part in parts):
        raise CatalogContextError(f"Invalid ClickHouse table name: {table_name}")
    return ".".join(f"`{part}`" for part in parts)


def _to_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _metric_summary(rows: list[dict[str, Any]]) -> dict[str, dict[str, Optional[float]]]:
    summary: dict[str, dict[str, Optional[float]]] = {}
    for column in ETF_INDEX_VALUATION_METRIC_COLUMNS:
        values = [_to_float(row.get(column)) for row in rows]
        values = [value for value in values if value is not None]
        if not values:
            continue
        summary[column] = {
            "latest": _to_float(rows[0].get(column)),
            "min": min(values),
            "max": max(values),
            "avg": round(sum(values) / len(values), 6),
        }
    return summary


def _request_data_context(request: SubmitAgentRunRequest) -> dict[str, Any]:
    extra = request.runnerConfig.extraParams or {}
    data_context = extra.get("dataContext") if isinstance(extra, dict) else None
    return data_context if isinstance(data_context, dict) else {}


def _symbol_variants(value: str) -> list[str]:
    normalized = str(value or "").strip().upper()
    if not normalized:
        return []
    variants = {normalized}
    if "." in normalized:
        code, suffix = normalized.split(".", 1)
        if code and suffix:
            variants.add(code)
            variants.add(f"{suffix}{code}")
    elif len(normalized) == 8 and normalized[:2] in {"SH", "SZ"} and normalized[2:].isdigit():
        code = normalized[2:]
        variants.add(code)
        variants.add(f"{code}.{normalized[:2]}")
    elif len(normalized) == 6 and normalized.isdigit():
        if normalized.startswith(("5", "6", "0")):
            variants.add(f"{normalized}.SH")
            variants.add(f"SH{normalized}")
        if normalized.startswith(("0", "1", "3")):
            variants.add(f"{normalized}.SZ")
            variants.add(f"SZ{normalized}")
    return [item for item in variants if _SAFE_SYMBOL_RE.match(item)]


def _asset_symbol_candidates(request: SubmitAgentRunRequest) -> list[str]:
    data_context = _request_data_context(request)
    raw_values: list[Any] = [
        data_context.get("assetSymbol"),
        data_context.get("symbol"),
        request.assetId,
    ]
    try:
        asset = get_static_asset_store().get_asset(str(request.assetId or ""))
    except Exception:
        asset = None
    if asset:
        raw_values.extend([asset.assetId, asset.id, asset.symbol, asset.name, *asset.aliases])
        profile = asset.profile if isinstance(asset.profile, dict) else {}
        tracking_index = str(profile.get("trackingIndex") or "")
        if tracking_index:
            raw_values.append(tracking_index)
        searchable = " ".join(str(value or "") for value in [asset.name, asset.description, tracking_index, *asset.tags]).lower()
        if "沪深300" in searchable or "csi 300" in searchable or "csi300" in searchable:
            raw_values.extend(["000300.SH", "SH000300", "CSI 300", "CSI300", "沪深300"])

    candidates: list[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        for variant in _symbol_variants(str(raw or "")):
            if variant not in seen:
                candidates.append(variant)
                seen.add(variant)
    return candidates


def _normalize_context_scope(request: SubmitAgentRunRequest) -> tuple[str, str, bool]:
    data_context = _request_data_context(request)
    dataset_id = str(data_context.get("datasetId") or data_context.get("importId") or "").strip()
    asset_symbol = str(data_context.get("assetSymbol") or "").strip()
    if not dataset_id:
        candidates = _asset_symbol_candidates(request)
        return "", candidates[0] if candidates else "", True
    if not _SAFE_DATASET_ID_RE.match(dataset_id):
        raise CatalogContextError("Invalid dataContext.datasetId.")
    if asset_symbol and not _SAFE_SYMBOL_RE.match(asset_symbol):
        raise CatalogContextError("Invalid dataContext.assetSymbol.")
    return dataset_id, asset_symbol, False


def _find_latest_dataset_for_symbols(
    store: ClickHouseBusinessStore,
    quoted_table: str,
    candidates: list[str],
) -> Optional[dict[str, Any]]:
    safe_candidates = [candidate for candidate in candidates if _SAFE_SYMBOL_RE.match(candidate)]
    if not safe_candidates:
        return None
    symbols_sql = ", ".join(_quote_ch_string(candidate) for candidate in safe_candidates[:30])
    payload = store.query_json(
        f"""
        SELECT
            import_id,
            any(index_code) AS asset_symbol,
            any(index_name) AS asset_name,
            count() AS rows,
            max(imported_at) AS imported_at,
            max(trade_date) AS max_trade_date
        FROM {quoted_table}
        WHERE index_code IN ({symbols_sql})
        GROUP BY import_id
        ORDER BY imported_at DESC, max_trade_date DESC
        LIMIT 1
        FORMAT JSON
        """
    )
    rows = [row for row in payload.get("data", []) if isinstance(row, dict)]
    return rows[0] if rows else None


def load_catalog_market_context(request: SubmitAgentRunRequest, limit: int = 120) -> Optional[dict[str, Any]]:
    limit = max(10, min(int(limit or 120), 500))
    dataset_id, asset_symbol, auto_matched = _normalize_context_scope(request)
    symbol_candidates = _asset_symbol_candidates(request)
    binding = None
    if not dataset_id and request.assetId:
        binding = get_default_dataset_binding_for_asset(request.assetId)
        if binding:
            dataset_id = binding.datasetId
            asset_symbol = binding.dataSymbol or binding.assetSymbol or asset_symbol
            auto_matched = False

    table_name = binding.tableName if binding else get_etf_import_table_name()
    quoted_table = _quote_table_name(table_name)

    store = get_clickhouse_business_store()
    try:
        store.ensure_etf_import_table(table_name)
        if not dataset_id:
            matched = _find_latest_dataset_for_symbols(store, quoted_table, symbol_candidates)
            if not matched:
                return None
            dataset_id = str(matched.get("import_id") or "")
            asset_symbol = str(matched.get("asset_symbol") or asset_symbol or "")
            auto_matched = True
        if not dataset_id:
            return None

        dataset_sql = _quote_ch_string(dataset_id)
        conditions = [f"import_id = {dataset_sql}"]
        if asset_symbol:
            conditions.append(f"index_code = {_quote_ch_string(asset_symbol)}")
        where_sql = " AND ".join(conditions)
        batch_payload = store.query_json(
            f"""
            SELECT
                import_id,
                any(source_name) AS source_name,
                any(file_name) AS file_name,
                count() AS rows,
                any(index_code) AS asset_symbol,
                any(index_name) AS asset_name,
                min(trade_date) AS min_trade_date,
                max(trade_date) AS max_trade_date,
                max(imported_at) AS imported_at
            FROM {quoted_table}
            WHERE {where_sql}
            GROUP BY import_id
            FORMAT JSON
            """
        )
        rows_payload = store.query_json(
            f"""
            SELECT
                row_number,
                index_code AS asset_symbol,
                index_name AS asset_name,
                trade_date,
                {", ".join(ETF_INDEX_VALUATION_METRIC_COLUMNS)}
            FROM {quoted_table}
            WHERE {where_sql}
            ORDER BY trade_date DESC, row_number DESC
            LIMIT {limit}
            FORMAT JSON
            """
        )
    except ClickHouseStoreError as exc:
        raise CatalogContextError(str(exc)) from exc

    batch_rows = [row for row in batch_payload.get("data", []) if isinstance(row, dict)]
    data_rows = [row for row in rows_payload.get("data", []) if isinstance(row, dict)]
    if not batch_rows or not data_rows:
        return {
            "source": "clickhouse_catalog",
            "status": "empty",
            "datasetId": dataset_id,
            "assetSymbol": asset_symbol,
            "tableName": table_name,
            "rowCount": 0,
            "recentRows": [],
        }

    batch = batch_rows[0]
    latest = data_rows[0]
    return {
        "source": "clickhouse_catalog",
        "status": "available",
        "datasetId": dataset_id,
        "bindingId": binding.bindingId if binding else None,
        "bindingName": binding.name if binding else None,
        "matchMode": "binding" if binding else ("auto" if auto_matched else "explicit"),
        "symbolCandidates": symbol_candidates,
        "tableName": table_name,
        "sourceName": batch.get("source_name"),
        "fileName": batch.get("file_name"),
        "assetSymbol": batch.get("asset_symbol") or asset_symbol,
        "assetName": batch.get("asset_name"),
        "rowCount": int(batch.get("rows") or len(data_rows)),
        "dateRange": {
            "start": batch.get("min_trade_date"),
            "end": batch.get("max_trade_date"),
        },
        "importedAt": batch.get("imported_at"),
        "latest": latest,
        "metricSummary": _metric_summary(data_rows),
        "recentRows": list(reversed(data_rows)),
    }


def build_catalog_evidence_items(request: SubmitAgentRunRequest, limit: int = 120) -> list[EvidenceItem]:
    context = load_catalog_market_context(request, limit=limit)
    if not context or context.get("status") != "available":
        return []

    dataset_id = str(context["datasetId"])
    safe_dataset_id = re.sub(r"[^A-Za-z0-9_]+", "_", dataset_id).strip("_") or "dataset"
    latest = context.get("latest") if isinstance(context.get("latest"), dict) else {}
    metric_summary = context.get("metricSummary") if isinstance(context.get("metricSummary"), dict) else {}
    date_range = context.get("dateRange") if isinstance(context.get("dateRange"), dict) else {}
    asset_symbol = str(context.get("assetSymbol") or "")
    asset_name = str(context.get("assetName") or asset_symbol or "Catalog dataset")
    latest_close = latest.get("close_price")
    latest_date = latest.get("trade_date")
    pe_latest = (metric_summary.get("pe_etf_weighted") or {}).get("latest")
    pb_latest = (metric_summary.get("pb_etf_weighted") or {}).get("latest")
    dividend_latest = (metric_summary.get("dividend_yield_pct") or {}).get("latest")
    summary_parts = [
        f"ClickHouse Catalog dataset {dataset_id} contains {context.get('rowCount')} rows",
        f"covering {date_range.get('start') or '-'} to {date_range.get('end') or '-'}",
    ]
    if latest_close is not None:
        summary_parts.append(f"latest close is {latest_close} on {latest_date or 'latest trade date'}")
    if pe_latest is not None:
        summary_parts.append(f"latest ETF-weighted PE is {pe_latest}")
    if pb_latest is not None:
        summary_parts.append(f"latest ETF-weighted PB is {pb_latest}")
    if dividend_latest is not None:
        summary_parts.append(f"latest dividend yield is {dividend_latest}%")

    related_asset_ids = [item for item in [request.assetId, asset_symbol, dataset_id] if item]
    collected_at = datetime.now().astimezone().isoformat(timespec="seconds")
    return [
        EvidenceItem(
            evidenceId=f"ck_import_{safe_dataset_id}_valuation",
            title=f"{asset_symbol or dataset_id} ClickHouse valuation dataset",
            sourceName="AlphaTrace Data Catalog / ClickHouse",
            sourceType="clickhouse_catalog",
            evidenceType="market_dataset",
            relatedAssetIds=related_asset_ids,
            publishedAt=str(latest_date or collected_at),
            qualityScore=88,
            reliabilityScore=86,
            summary="; ".join(summary_parts) + ".",
            extractedFields={
                "datasetId": dataset_id,
                "bindingId": context.get("bindingId"),
                "bindingName": context.get("bindingName"),
                "matchMode": context.get("matchMode"),
                "tableName": context.get("tableName"),
                "assetSymbol": asset_symbol,
                "assetName": asset_name,
                "dateRange": date_range,
                "rowCount": context.get("rowCount"),
                "latest": latest,
                "metricSummary": metric_summary,
                "recentRows": context.get("recentRows"),
            },
        )
    ]


__all__ = [
    "CatalogContextError",
    "build_catalog_evidence_items",
    "load_catalog_market_context",
]
