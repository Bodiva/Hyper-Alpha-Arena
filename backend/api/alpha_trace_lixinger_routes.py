from __future__ import annotations

import os
import re
import json
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from integrations.lixinger import LixingerApiError, get_lixinger_client
from schemas.alpha_trace_data_source import LixingerLlmContextResponse


router = APIRouter(prefix="/api/alpha-trace/lixinger", tags=["AlphaTrace Lixinger"])

LixingerResource = Literal["all", "cn_index", "cn_fund", "cn_fund_manager"]

_RESOURCE_META: dict[str, dict[str, str]] = {
    "cn_index": {
        "label": "CN Index",
        "labelZh": "中国指数",
        "endpoint": "/cn/index",
        "description": "指数基础信息与相关字段。",
    },
    "cn_fund": {
        "label": "CN Fund",
        "labelZh": "中国基金",
        "endpoint": "/cn/fund",
        "description": "基金基础信息列表，支持 stockCodes 和分页。",
    },
    "cn_fund_manager": {
        "label": "CN Fund Manager",
        "labelZh": "基金经理",
        "endpoint": "/cn/fund/manager",
        "description": "按基金代码检索基金经理信息。",
    },
}


class LixingerSearchRequest(BaseModel):
    query: str = Field("", description="Keyword or security/fund/index code entered by the user.")
    resource: LixingerResource = "all"
    stockCodes: list[str] = Field(default_factory=list)
    pageIndex: int = Field(0, ge=0, le=1000)


class LixingerResourceResult(BaseModel):
    resource: str
    label: str
    labelZh: str
    endpoint: str
    ok: bool
    rowCount: int = 0
    total: Optional[int] = None
    message: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)
    raw: Optional[dict[str, Any]] = None


class LixingerSearchResponse(BaseModel):
    ok: bool
    query: str
    stockCodes: list[str]
    tokenConfigured: bool
    results: list[LixingerResourceResult]


def _token_configured() -> bool:
    return bool((os.getenv("ALPHATRACE_LIXINGER_TOKEN") or os.getenv("LIXINGER_TOKEN") or "").strip())


def _get_lixinger_data_project_dir() -> Path:
    configured = os.getenv("LIXINGER_DATA_PROJECT_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path("H:/git0412/data_lixingren").resolve()


def _read_text_preview(path: Path, max_chars: int = 16000) -> str:
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    return text[:max_chars]


def _read_json_list(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _normalize_stock_codes(query: str, stock_codes: list[str]) -> list[str]:
    candidates: list[str] = []
    candidates.extend(stock_codes)
    candidates.extend(re.findall(r"(?<![A-Za-z0-9])([A-Za-z0-9][A-Za-z0-9._-]{2,19})(?![A-Za-z0-9])", query))

    normalized: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        value = str(candidate or "").strip().upper()
        value = value.strip("$,;，； ")
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized[:100]


def _rows_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("data")
    if isinstance(rows, list):
        return [row for row in rows if isinstance(row, dict)]
    if isinstance(rows, dict):
        return [rows]
    return []


def _result_from_payload(resource: str, payload: dict[str, Any]) -> LixingerResourceResult:
    meta = _RESOURCE_META[resource]
    rows = _rows_from_payload(payload)
    return LixingerResourceResult(
        resource=resource,
        label=meta["label"],
        labelZh=meta["labelZh"],
        endpoint=meta["endpoint"],
        ok=True,
        rowCount=len(rows),
        total=payload.get("total") if isinstance(payload.get("total"), int) else None,
        message=str(payload.get("message") or "success"),
        rows=rows[:50],
        raw={key: value for key, value in payload.items() if key != "token"},
    )


def _error_result(resource: str, error: Exception) -> LixingerResourceResult:
    meta = _RESOURCE_META[resource]
    return LixingerResourceResult(
        resource=resource,
        label=meta["label"],
        labelZh=meta["labelZh"],
        endpoint=meta["endpoint"],
        ok=False,
        message=str(error),
    )


def _resolve_resources(resource: LixingerResource, stock_codes: list[str]) -> list[str]:
    if resource != "all":
        return [resource]
    resources = ["cn_index", "cn_fund"]
    if stock_codes:
        resources.append("cn_fund_manager")
    return resources


def _call_resource(resource: str, stock_codes: list[str], page_index: int) -> dict[str, Any]:
    client = get_lixinger_client()
    if resource == "cn_index":
        return client.get_cn_indices(stock_codes or None)
    if resource == "cn_fund":
        return client.get_cn_funds(stock_codes or None, page_index=page_index)
    if resource == "cn_fund_manager":
        if not stock_codes:
            raise LixingerApiError("stockCodes is required for fund manager queries.")
        return client.get_cn_fund_managers(stock_codes)
    raise LixingerApiError(f"Unsupported Lixinger resource: {resource}")


@router.get("/status")
def get_lixinger_status():
    return {
        "provider": "lixinger",
        "displayName": "理杏仁 Lixinger",
        "baseUrl": os.getenv("ALPHATRACE_LIXINGER_BASE_URL", "https://open.lixinger.com/api"),
        "tokenConfigured": _token_configured(),
        "resources": [
            {"id": key, **value}
            for key, value in _RESOURCE_META.items()
        ],
    }


@router.get("/llm-context", response_model=LixingerLlmContextResponse)
def get_lixinger_llm_context():
    source_root = _get_lixinger_data_project_dir()
    docs_dir = source_root / "docs"
    sql_dir = source_root / "sql"
    table_catalog_path = docs_dir / "llm_table_catalog.json"
    data_dictionary_path = docs_dir / "llm_data_dictionary.md"
    query_templates_path = docs_dir / "llm_query_templates.md"
    sync_audit_path = docs_dir / "final_lixinger_sync_audit.md"
    llm_views_path = sql_dir / "030_llm_views.sql"

    if not source_root.exists():
        raise HTTPException(status_code=404, detail=f"Lixinger data project not found: {source_root}")

    usage_rules = [
        "不要直接调用理杏仁 OpenAPI；默认查询 ClickHouse 中已同步的数据。",
        "先根据 api_id / asset_type / endpoint_type 查 llm_table_catalog 或 v_llm_api_table_catalog，确认 query_table。",
        "基金概览优先 v_llm_fund_latest_overview；指数估值优先 v_llm_index_latest_valuation。",
        "基金公司基础信息优先 v_llm_fund_company_basic；基金经理基础信息优先 v_llm_fund_manager_basic。",
        "hot / ranking / snapshot 问题优先 wide_lixinger_<api_id> 表。",
        "历史序列优先 factor_*_daily、fund_*、index_* 等业务表。",
        "不要直接查询 raw_lixinger_api_response，除非审计、排错或字段追溯。",
        "SQL 生成前先确认字段名，并尽量加 LIMIT，避免无约束扫大表。",
    ]

    dictionary_preview = _read_text_preview(data_dictionary_path, max_chars=24000)
    generated_at = None
    match = re.search(r"生成时间：([^\n]+)", dictionary_preview)
    if match:
        generated_at = match.group(1).strip()

    return LixingerLlmContextResponse(
        sourceRoot=str(source_root),
        generatedAt=generated_at,
        tableCatalog=_read_json_list(table_catalog_path),
        usageRules=usage_rules,
        queryTemplatesMarkdown=_read_text_preview(query_templates_path, max_chars=24000),
        dataDictionaryPreview=dictionary_preview,
        syncAuditPreview=_read_text_preview(sync_audit_path, max_chars=16000),
        llmViewsSqlPreview=_read_text_preview(llm_views_path, max_chars=24000),
        sourcePaths={
            "dataDictionary": str(data_dictionary_path),
            "queryTemplates": str(query_templates_path),
            "tableCatalog": str(table_catalog_path),
            "syncAudit": str(sync_audit_path),
            "llmViewsSql": str(llm_views_path),
        },
        message="Lixinger ClickHouse LLM context loaded from local data project.",
    )


@router.post("/search", response_model=LixingerSearchResponse)
def search_lixinger(request: LixingerSearchRequest, failFast: bool = Query(False)):
    stock_codes = _normalize_stock_codes(request.query, request.stockCodes)
    resources = _resolve_resources(request.resource, stock_codes)

    if request.resource == "cn_fund_manager" and not stock_codes:
        raise HTTPException(status_code=400, detail="基金经理接口需要输入基金代码，如 005827。")
    if not _token_configured():
        raise HTTPException(status_code=503, detail="Lixinger token is not configured on the backend.")

    results: list[LixingerResourceResult] = []
    for resource in resources:
        try:
            payload = _call_resource(resource, stock_codes, request.pageIndex)
            results.append(_result_from_payload(resource, payload))
        except LixingerApiError as exc:
            if failFast or request.resource != "all":
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            results.append(_error_result(resource, exc))

    return LixingerSearchResponse(
        ok=any(item.ok for item in results),
        query=request.query,
        stockCodes=stock_codes,
        tokenConfigured=True,
        results=results,
    )
