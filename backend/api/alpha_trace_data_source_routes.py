from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from schemas.alpha_trace_data_source import (
    AlphaTraceDataSourceItem,
    AlphaTraceDataSourceTask,
    DataSourceListResponse,
    FileImportResponse,
    ImportedFileBatch,
    ImportedFileBatchListResponse,
    ImportedFileRow,
    ImportedFileRowsResponse,
    LocalImportFile,
    LocalImportFileListResponse,
)
from services.clickhouse_business_store import get_clickhouse_business_store, get_etf_import_table_name
from services.data_api import get_data_api_catalog
from services.data_source_store import get_data_source_store
from services.etf_file_import_service import (
    ClickHouseStoreError,
    ETF_INDEX_VALUATION_METRIC_COLUMNS,
    EtfFileImportError,
    import_etf_file_to_clickhouse,
)


router = APIRouter(prefix="/api/alpha-trace/data-sources", tags=["AlphaTrace Data Sources"])

_SUPPORTED_IMPORT_SUFFIXES = {
    ".csv",
    ".tsv",
    ".txt",
    ".json",
    ".jsonl",
    ".ndjson",
    ".xlsx",
    ".xls",
    ".parquet",
}
_SAFE_IMPORT_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _quote_ch_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _quote_table_name(table_name: str) -> str:
    parts = [part.strip() for part in table_name.split(".") if part.strip()]
    if not 1 <= len(parts) <= 2 or any(not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", part) for part in parts):
        raise HTTPException(status_code=500, detail=f"Invalid ClickHouse table name: {table_name}")
    return ".".join(f"`{part}`" for part in parts)


def _get_local_import_dir() -> Path:
    configured = os.getenv("ALPHA_TRACE_FILE_IMPORT_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "data" / "test").resolve()


def _resolve_local_import_file(relative_path: str) -> Path:
    base_dir = _get_local_import_dir()
    candidate = Path(relative_path)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise HTTPException(status_code=400, detail="Invalid local import path.")
    resolved = (base_dir / candidate).resolve()
    try:
        resolved.relative_to(base_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid local import path.") from exc
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail=f"Local import file not found: {relative_path}")
    if resolved.suffix.lower() not in _SUPPORTED_IMPORT_SUFFIXES:
        raise HTTPException(status_code=400, detail=f"Unsupported local import file type: {resolved.suffix}")
    return resolved


@router.get("", response_model=DataSourceListResponse)
def list_alpha_trace_data_sources(
    sourceType: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assetType: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    items = get_data_source_store().list_sources(
        source_type=sourceType,
        status=status,
        asset_type=assetType,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    return DataSourceListResponse(items=items, total=len(items), limit=limit, offset=offset)


@router.get("/api-catalog")
def get_alpha_trace_data_api_catalog():
    return get_data_api_catalog().to_response()


@router.get("/file-imports/local-files", response_model=LocalImportFileListResponse)
def list_alpha_trace_local_import_files():
    base_dir = _get_local_import_dir()
    if not base_dir.exists():
        return LocalImportFileListResponse(basePath=str(base_dir), items=[])

    items: list[LocalImportFile] = []
    for path in sorted(base_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in _SUPPORTED_IMPORT_SUFFIXES:
            continue
        stat = path.stat()
        items.append(
            LocalImportFile(
                relativePath=path.relative_to(base_dir).as_posix(),
                fileName=path.name,
                sizeBytes=stat.st_size,
                modifiedAt=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    return LocalImportFileListResponse(basePath=str(base_dir), items=items)


@router.post("/file-imports", response_model=FileImportResponse)
async def import_alpha_trace_etf_file(
    request: Request,
    filename: str = Query(..., min_length=1),
    sourceName: str = Query("ETF File Upload", min_length=1),
    dataCategory: str = Query("MARKET_DATA", min_length=1),
    dryRun: bool = Query(False),
    previewLimit: int = Query(5, ge=0, le=20),
):
    max_bytes = int(os.getenv("ALPHA_TRACE_FILE_IMPORT_MAX_BYTES", str(50 * 1024 * 1024)))
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Uploaded file exceeds {max_bytes} bytes.")

    safe_filename = Path(filename).name
    try:
        return import_etf_file_to_clickhouse(
            filename=safe_filename,
            content=content,
            source_name=sourceName.strip(),
            data_category=dataCategory.strip(),
            dry_run=dryRun,
            preview_limit=previewLimit,
        )
    except EtfFileImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/file-imports/local-files/import", response_model=FileImportResponse)
def import_alpha_trace_local_etf_file(
    relativePath: str = Query(..., min_length=1),
    sourceName: str = Query("data/test ETF Files", min_length=1),
    dataCategory: str = Query("MARKET_DATA", min_length=1),
    dryRun: bool = Query(False),
    previewLimit: int = Query(5, ge=0, le=20),
):
    local_file = _resolve_local_import_file(relativePath)
    max_bytes = int(os.getenv("ALPHA_TRACE_FILE_IMPORT_MAX_BYTES", str(50 * 1024 * 1024)))
    if local_file.stat().st_size > max_bytes:
        raise HTTPException(status_code=413, detail=f"Local import file exceeds {max_bytes} bytes.")
    try:
        return import_etf_file_to_clickhouse(
            filename=local_file.name,
            content=local_file.read_bytes(),
            source_name=sourceName.strip(),
            data_category=dataCategory.strip(),
            dry_run=dryRun,
            preview_limit=previewLimit,
        )
    except EtfFileImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/file-imports/imports", response_model=ImportedFileBatchListResponse)
def list_alpha_trace_file_import_batches(
    sourceName: Optional[str] = Query(None),
    fileName: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    table_name = _quote_table_name(get_etf_import_table_name())
    conditions: list[str] = []
    if sourceName:
        conditions.append(f"source_name = {_quote_ch_string(sourceName)}")
    if fileName:
        conditions.append(f"file_name = {_quote_ch_string(fileName)}")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    store = get_clickhouse_business_store()
    try:
        store.ensure_etf_import_table(get_etf_import_table_name())
        total_payload = store.query_json(
            f"""
            SELECT count() AS total
            FROM
            (
                SELECT import_id
                FROM {table_name}
                {where}
                GROUP BY import_id
            )
            FORMAT JSON
            """
        )
        payload = store.query_json(
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
            FROM {table_name}
            {where}
            GROUP BY import_id
            ORDER BY imported_at DESC
            LIMIT {limit}
            OFFSET {offset}
            FORMAT JSON
            """
        )
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    items = [
        ImportedFileBatch(
            importId=str(row.get("import_id", "")),
            sourceName=str(row.get("source_name", "")),
            fileName=str(row.get("file_name", "")),
            rows=int(row.get("rows") or 0),
            assetSymbol=str(row.get("asset_symbol", "")),
            assetName=str(row.get("asset_name", "")),
            minTradeDate=row.get("min_trade_date") or None,
            maxTradeDate=row.get("max_trade_date") or None,
            importedAt=str(row.get("imported_at", "")),
        )
        for row in payload.get("data", [])
        if isinstance(row, dict)
    ]
    total_rows = total_payload.get("data", [{}])
    total = int(total_rows[0].get("total") or 0) if total_rows and isinstance(total_rows[0], dict) else len(items)
    return ImportedFileBatchListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/file-imports/imports/{import_id}/rows", response_model=ImportedFileRowsResponse)
def list_alpha_trace_file_import_rows(
    import_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    if not _SAFE_IMPORT_ID_RE.match(import_id):
        raise HTTPException(status_code=400, detail="Invalid import_id.")
    table_name = _quote_table_name(get_etf_import_table_name())
    import_id_sql = _quote_ch_string(import_id)
    store = get_clickhouse_business_store()
    try:
        total_payload = store.query_json(
            f"""
            SELECT count() AS total
            FROM {table_name}
            WHERE import_id = {import_id_sql}
            FORMAT JSON
            """
        )
        payload = store.query_json(
            f"""
            SELECT
                row_number,
                index_code AS asset_symbol,
                index_name AS asset_name,
                trade_date,
                {", ".join(ETF_INDEX_VALUATION_METRIC_COLUMNS)}
            FROM {table_name}
            WHERE import_id = {import_id_sql}
            ORDER BY row_number ASC
            LIMIT {limit}
            OFFSET {offset}
            FORMAT JSON
            """
        )
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    items = [
        ImportedFileRow(
            rowNumber=int(row.get("row_number") or 0),
            assetSymbol=str(row.get("asset_symbol", "")),
            assetName=str(row.get("asset_name", "")),
            tradeDate=row.get("trade_date") or None,
            payload={column: row.get(column) for column in ETF_INDEX_VALUATION_METRIC_COLUMNS},
        )
        for row in payload.get("data", [])
        if isinstance(row, dict)
    ]
    total_rows = total_payload.get("data", [{}])
    total = int(total_rows[0].get("total") or 0) if total_rows and isinstance(total_rows[0], dict) else len(items)
    return ImportedFileRowsResponse(importId=import_id, items=items, total=total, limit=limit, offset=offset)


@router.get("/{source_id}", response_model=AlphaTraceDataSourceItem)
def get_alpha_trace_data_source(source_id: str):
    source = get_data_source_store().get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source not found: {source_id}")
    return source


@router.get("/{source_id}/tasks", response_model=list[AlphaTraceDataSourceTask])
def get_alpha_trace_data_source_tasks(source_id: str):
    source = get_data_source_store().get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source not found: {source_id}")
    return source.recentTasks
