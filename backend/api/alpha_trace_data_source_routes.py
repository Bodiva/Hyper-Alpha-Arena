from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from database.connection import SessionLocal

from schemas.alpha_trace_data_source import (
    AlphaTraceDataSourceItem,
    AlphaTraceDataSourceTask,
    DataSourceListResponse,
    DatasetBindingListResponse,
    DatasetBindingRequest,
    ClickHouseColumn,
    ClickHouseOverviewResponse,
    ClickHouseTableRowsResponse,
    ClickHouseTableSummary,
    ClickHouseTopValue,
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
from services.dataset_binding_store import (
    DatasetBindingError,
    delete_dataset_binding,
    list_dataset_bindings,
    save_dataset_binding,
)
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


def get_db():
    if os.getenv("ALPHA_TRACE_DOMAIN_STORE", "").strip().lower() == "mysql":
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _quote_ch_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _quote_table_name(table_name: str) -> str:
    parts = [part.strip() for part in table_name.split(".") if part.strip()]
    if not 1 <= len(parts) <= 2 or any(not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", part) for part in parts):
        raise HTTPException(status_code=500, detail=f"Invalid ClickHouse table name: {table_name}")
    return ".".join(f"`{part}`" for part in parts)


def _split_clickhouse_table_name(table_name: str) -> tuple[str, str]:
    parts = [part.strip() for part in table_name.split(".") if part.strip()]
    if len(parts) == 1:
        return "default", parts[0]
    if len(parts) == 2:
        return parts[0], parts[1]
    raise HTTPException(status_code=500, detail=f"Invalid ClickHouse table name: {table_name}")


def _validate_clickhouse_identifier(value: str, label: str) -> str:
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", value):
        raise HTTPException(status_code=400, detail=f"Invalid ClickHouse {label}.")
    return value


def _parse_field_mapping(value: Optional[str]) -> Optional[dict[str, str]]:
    if not value:
        return None
    try:
        payload = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="fieldMapping must be a JSON object.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="fieldMapping must be a JSON object.")
    return {str(key): str(mapped) for key, mapped in payload.items() if mapped not in (None, "")}


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
    fieldMapping: Optional[str] = Query(None),
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
            field_mapping=_parse_field_mapping(fieldMapping),
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
    fieldMapping: Optional[str] = Query(None),
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
            field_mapping=_parse_field_mapping(fieldMapping),
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


@router.get("/clickhouse/overview", response_model=ClickHouseOverviewResponse)
def get_alpha_trace_clickhouse_overview():
    configured_table_name = get_etf_import_table_name()
    database_name, table_only_name = _split_clickhouse_table_name(configured_table_name)
    store = get_clickhouse_business_store()
    try:
        version_payload = store.query_json("SELECT version() AS version FORMAT JSON")
        columns_payload = store.query_json(
            f"""
            SELECT
                name,
                type,
                position
            FROM system.columns
            WHERE database = {_quote_ch_string(database_name)}
              AND table = {_quote_ch_string(table_only_name)}
            ORDER BY position ASC
            FORMAT JSON
            """
        )
        tables_payload = store.query_json(
            """
            SELECT
                database,
                name,
                ifNull(total_rows, 0) AS rows,
                ifNull(total_bytes, 0) AS bytes,
                metadata_modification_time AS modified_at
            FROM system.tables
            WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
            ORDER BY rows DESC, database ASC, name ASC
            FORMAT JSON
            """
        )
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    version_rows = version_payload.get("data", [])
    version = str(version_rows[0].get("version", "")) if version_rows and isinstance(version_rows[0], dict) else ""

    columns = [
        ClickHouseColumn(
            name=str(row.get("name", "")),
            type=str(row.get("type", "")),
            position=int(row.get("position") or 0),
        )
        for row in columns_payload.get("data", [])
        if isinstance(row, dict)
    ]
    tables = [
        ClickHouseTableSummary(
            database=str(row.get("database", "")),
            name=str(row.get("name", "")),
            rows=int(row.get("rows") or 0),
            bytes=int(row.get("bytes") or 0),
            modifiedAt=row.get("modified_at") or None,
        )
        for row in tables_payload.get("data", [])
        if isinstance(row, dict)
    ]
    configured_table = next(
        (table for table in tables if table.database == database_name and table.name == table_only_name),
        None,
    )
    top_sources: list[ClickHouseTopValue] = []
    top_assets: list[ClickHouseTopValue] = []

    return ClickHouseOverviewResponse(
        status="OK",
        tableName=configured_table_name,
        version=version,
        totalRows=configured_table.rows if configured_table else 0,
        importBatches=0,
        files=0,
        sources=0,
        minTradeDate=None,
        maxTradeDate=None,
        latestImportedAt=configured_table.modifiedAt if configured_table else None,
        columns=columns,
        tables=tables,
        topSources=top_sources,
        topAssets=top_assets,
        message="ClickHouse metadata is reachable.",
    )


@router.get("/clickhouse/tables/{database_name}/{table_name}/rows", response_model=ClickHouseTableRowsResponse)
def get_alpha_trace_clickhouse_table_rows(
    database_name: str,
    table_name: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    database = _validate_clickhouse_identifier(database_name, "database")
    table = _validate_clickhouse_identifier(table_name, "table")
    quoted_table_name = f"`{database}`.`{table}`"
    store = get_clickhouse_business_store()
    try:
        columns_payload = store.query_json(
            f"""
            SELECT
                name,
                type,
                position
            FROM system.columns
            WHERE database = {_quote_ch_string(database)}
              AND table = {_quote_ch_string(table)}
            ORDER BY position ASC
            FORMAT JSON
            """
        )
        if not columns_payload.get("data"):
            raise HTTPException(status_code=404, detail=f"ClickHouse table not found: {database}.{table}")

        total_payload = store.query_json(
            f"""
            SELECT count() AS total
            FROM {quoted_table_name}
            FORMAT JSON
            """
        )
        rows_payload = store.query_json(
            f"""
            SELECT *
            FROM {quoted_table_name}
            LIMIT {limit}
            OFFSET {offset}
            FORMAT JSON
            """
        )
    except HTTPException:
        raise
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    columns = [
        ClickHouseColumn(
            name=str(row.get("name", "")),
            type=str(row.get("type", "")),
            position=int(row.get("position") or 0),
        )
        for row in columns_payload.get("data", [])
        if isinstance(row, dict)
    ]
    total_rows = total_payload.get("data", [{}])
    total = int(total_rows[0].get("total") or 0) if total_rows and isinstance(total_rows[0], dict) else 0
    rows = [row for row in rows_payload.get("data", []) if isinstance(row, dict)]
    return ClickHouseTableRowsResponse(
        tableName=f"{database}.{table}",
        columns=columns,
        rows=rows,
        total=total,
        limit=limit,
        offset=offset,
    )


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


@router.get("/dataset-bindings", response_model=DatasetBindingListResponse)
def list_alpha_trace_dataset_bindings(
    assetId: Optional[str] = Query(None),
    datasetId: Optional[str] = Query(None),
    activeOnly: bool = Query(False),
    db: Optional[Session] = Depends(get_db),
):
    items = list_dataset_bindings(db, asset_id=assetId, dataset_id=datasetId, active_only=activeOnly)
    return DatasetBindingListResponse(items=items, total=len(items))


@router.post("/dataset-bindings", response_model=DatasetBindingListResponse)
def save_alpha_trace_dataset_binding(
    payload: DatasetBindingRequest,
    db: Optional[Session] = Depends(get_db),
):
    try:
        save_dataset_binding(payload, db)
    except DatasetBindingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    items = list_dataset_bindings(db)
    return DatasetBindingListResponse(items=items, total=len(items))


@router.delete("/dataset-bindings/{binding_id}", response_model=DatasetBindingListResponse)
def delete_alpha_trace_dataset_binding(
    binding_id: str,
    db: Optional[Session] = Depends(get_db),
):
    try:
        items = delete_dataset_binding(binding_id, db)
    except DatasetBindingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DatasetBindingListResponse(items=items, total=len(items))


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
