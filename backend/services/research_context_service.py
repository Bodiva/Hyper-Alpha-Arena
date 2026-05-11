from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from schemas.alpha_trace_agent_runtime import SubmitAgentRunRequest
from services.catalog_context_service import (
    CatalogContextError,
    build_catalog_evidence_items,
    load_catalog_market_context,
)
from services.evidence_retrieval.static_evidence_seed import EvidenceItem


DEFAULT_RECENT_ROW_LIMIT = 120
MAX_RECENT_ROW_LIMIT = 500


def _bounded_recent_limit(value: int | None) -> int:
    return max(10, min(int(value or DEFAULT_RECENT_ROW_LIMIT), MAX_RECENT_ROW_LIMIT))


def _request_data_context(request: SubmitAgentRunRequest) -> dict[str, Any]:
    extra = request.runnerConfig.extraParams or {}
    data_context = extra.get("dataContext") if isinstance(extra, dict) else None
    return data_context if isinstance(data_context, dict) else {}


def _source_refs(catalog_context: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    if not catalog_context or catalog_context.get("status") != "available":
        return []
    return [
        {
            "source": "clickhouse_catalog",
            "datasetId": catalog_context.get("datasetId"),
            "bindingId": catalog_context.get("bindingId"),
            "tableName": catalog_context.get("tableName"),
            "assetSymbol": catalog_context.get("assetSymbol"),
            "dateRange": catalog_context.get("dateRange"),
            "rowCount": catalog_context.get("rowCount"),
        }
    ]


def merge_research_context_into_market_context(
    market_context: Optional[dict[str, Any]],
    research_context: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    if not research_context or research_context.get("status") != "available":
        return market_context

    catalog_context = research_context.get("catalogContext")
    if not isinstance(catalog_context, dict) or catalog_context.get("status") != "available":
        return market_context

    merged = dict(market_context or {})
    source = str(merged.get("source") or "alphatrace_static_market_seed")
    merged["source"] = f"{source}+clickhouse_catalog" if source else "clickhouse_catalog"
    merged["catalogContext"] = catalog_context
    merged["researchContext"] = research_context
    return merged


def build_research_context(
    request: SubmitAgentRunRequest,
    *,
    market_context: Optional[dict[str, Any]] = None,
    recent_limit: int | None = DEFAULT_RECENT_ROW_LIMIT,
) -> dict[str, Any]:
    data_context = _request_data_context(request)
    catalog_context: Optional[dict[str, Any]] = None
    errors: list[str] = []

    try:
        catalog_context = load_catalog_market_context(request, limit=_bounded_recent_limit(recent_limit))
    except CatalogContextError:
        raise
    except Exception as exc:
        errors.append(str(exc))

    status = "available" if catalog_context and catalog_context.get("status") == "available" else "empty"
    research_context: dict[str, Any] = {
        "source": "alphatrace_research_context",
        "status": status,
        "builtAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "request": {
            "assetId": request.assetId,
            "portfolioId": request.portfolioId,
            "strategyId": request.strategyId,
            "taskType": request.taskType,
            "dataContext": data_context,
        },
        "dataPolicy": {
            "rawDataPolicy": "raw datasets stay in ClickHouse/database; only bounded windows, summaries, metrics, and source references are sent to LLMs",
            "recentRowLimit": _bounded_recent_limit(recent_limit),
            "maxRecentRowLimit": MAX_RECENT_ROW_LIMIT,
        },
        "dataset": {
            "datasetId": catalog_context.get("datasetId") if catalog_context else data_context.get("datasetId"),
            "assetSymbol": catalog_context.get("assetSymbol") if catalog_context else data_context.get("assetSymbol"),
            "assetName": catalog_context.get("assetName") if catalog_context else None,
            "tableName": catalog_context.get("tableName") if catalog_context else None,
            "rowCount": catalog_context.get("rowCount") if catalog_context else 0,
            "dateRange": catalog_context.get("dateRange") if catalog_context else None,
            "matchMode": catalog_context.get("matchMode") if catalog_context else ("explicit" if data_context.get("datasetId") else "auto"),
        },
        "catalogContext": catalog_context,
        "statistics": catalog_context.get("metricSummary") if catalog_context else {},
        "latest": catalog_context.get("latest") if catalog_context else None,
        "recentRows": catalog_context.get("recentRows") if catalog_context else [],
        "sourceRefs": _source_refs(catalog_context),
        "errors": errors,
    }
    research_context["marketContext"] = merge_research_context_into_market_context(market_context, research_context)
    return research_context


def build_research_evidence_items(
    request: SubmitAgentRunRequest,
    *,
    recent_limit: int | None = DEFAULT_RECENT_ROW_LIMIT,
) -> list[EvidenceItem]:
    return build_catalog_evidence_items(request, limit=_bounded_recent_limit(recent_limit))


__all__ = [
    "CatalogContextError",
    "build_research_context",
    "build_research_evidence_items",
    "merge_research_context_into_market_context",
]
