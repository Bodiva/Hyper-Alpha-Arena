from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AlphaTraceDataSourceTask(BaseModel):
    taskId: str
    taskName: str
    taskType: Optional[str] = None
    status: str
    startedAt: str
    endedAt: Optional[str] = None
    finishedAt: Optional[str] = None
    durationSeconds: Optional[int] = None
    recordsFetched: Optional[int] = None
    recordsSucceeded: Optional[int] = None
    recordsFailed: Optional[int] = None
    errorMessage: Optional[str] = None
    warningMessage: Optional[str] = None
    nextRetryAt: Optional[str] = None
    message: Optional[str] = None


class AlphaTraceDataSourceItem(BaseModel):
    sourceId: str
    name: str
    sourceType: str
    vendor: str
    status: str
    reliabilityScore: int
    qualityScore: int
    lastSyncAt: str
    syncFrequency: str
    supportedAssetTypes: List[str] = Field(default_factory=list)
    dataCategories: List[str] = Field(default_factory=list)
    evidenceSources: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    configState: str = "configured"
    governanceNotes: List[str] = Field(default_factory=list)
    recentTasks: List[AlphaTraceDataSourceTask] = Field(default_factory=list)


class DataSourceListResponse(BaseModel):
    items: List[AlphaTraceDataSourceItem]
    total: int
    limit: int
    offset: int = 0


class FileImportPreviewRow(BaseModel):
    rowNumber: int
    assetSymbol: str = ""
    assetName: str = ""
    tradeDate: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class FileImportResponse(BaseModel):
    importId: str
    sourceName: str
    fileName: str
    tableName: str
    status: str
    dryRun: bool = False
    recordsFetched: int
    recordsSucceeded: int
    recordsFailed: int
    columns: List[str] = Field(default_factory=list)
    sourceColumns: List[str] = Field(default_factory=list)
    fieldMapping: Dict[str, str] = Field(default_factory=dict)
    previewRows: List[FileImportPreviewRow] = Field(default_factory=list)
    message: str


class LocalImportFile(BaseModel):
    relativePath: str
    fileName: str
    sizeBytes: int
    modifiedAt: str


class LocalImportFileListResponse(BaseModel):
    basePath: str
    items: List[LocalImportFile] = Field(default_factory=list)


class ImportedFileBatch(BaseModel):
    importId: str
    sourceName: str
    fileName: str
    rows: int
    assetSymbol: str = ""
    assetName: str = ""
    minTradeDate: Optional[str] = None
    maxTradeDate: Optional[str] = None
    importedAt: str


class ImportedFileBatchListResponse(BaseModel):
    items: List[ImportedFileBatch] = Field(default_factory=list)
    total: int
    limit: int
    offset: int = 0


class ImportedFileRow(BaseModel):
    rowNumber: int
    assetSymbol: str = ""
    assetName: str = ""
    tradeDate: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class ImportedFileRowsResponse(BaseModel):
    importId: str
    items: List[ImportedFileRow] = Field(default_factory=list)
    total: int
    limit: int
    offset: int = 0
