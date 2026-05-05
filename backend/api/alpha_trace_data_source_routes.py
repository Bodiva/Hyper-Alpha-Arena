from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from schemas.alpha_trace_data_source import (
    AlphaTraceDataSourceItem,
    AlphaTraceDataSourceTask,
    DataSourceListResponse,
    FileImportResponse,
    LocalImportFile,
    LocalImportFileListResponse,
)
from services.data_api import get_data_api_catalog
from services.data_source_store import get_data_source_store
from services.etf_file_import_service import (
    ClickHouseStoreError,
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
