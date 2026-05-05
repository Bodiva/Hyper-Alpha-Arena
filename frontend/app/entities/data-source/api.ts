import type { AssetType } from "../asset/model";
import type { Evidence } from "../evidence/model";
import type { DataCategory, DataSource, DataSourceStatus, DataSourceTask, DataSourceType } from "./model";
import { dataSourcesMock } from "@/mocks/data-sources.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
import { API_BASE_URL } from "@/shared/api/api-config";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListDataSourcesParams {
  sourceType?: DataSourceType;
  status?: DataSourceStatus;
  assetType?: AssetType;
  keyword?: string;
}

interface BackendDataSourceListResponse {
  items: DataSource[];
  total: number;
  limit: number;
  offset?: number;
}

export interface DataApiResource {
  resource_id: string;
  domain: string;
  display_name: string;
  path: string;
  operations: string[];
  provider_id: string;
  store_type: string;
  status: string;
  notes?: string;
}

export interface DataApiProvider {
  provider_id: string;
  display_name: string;
  provider_type: string;
  status: string;
  domains: string[];
  requires_secret: boolean;
  credential_source: string;
  operations: string[];
  notes?: string;
}

export interface DataApiCatalogResponse {
  catalogId: string;
  resources: DataApiResource[];
  providers: DataApiProvider[];
  total: number;
  providerTotal: number;
  policies?: Record<string, unknown>;
  message?: string;
}

export interface FileImportPreviewRow {
  rowNumber: number;
  assetSymbol: string;
  assetName: string;
  tradeDate?: string | null;
  payload: Record<string, unknown>;
}

export interface FileImportResponse {
  importId: string;
  sourceName: string;
  fileName: string;
  tableName: string;
  status: string;
  dryRun: boolean;
  recordsFetched: number;
  recordsSucceeded: number;
  recordsFailed: number;
  columns: string[];
  sourceColumns: string[];
  fieldMapping: Record<string, string>;
  previewRows: FileImportPreviewRow[];
  message: string;
}

export interface UploadEtfFileImportParams {
  file: File;
  sourceName?: string;
  dataCategory?: string;
  dryRun?: boolean;
  previewLimit?: number;
  fieldMapping?: Record<string, string>;
}

export interface LocalImportFile {
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface LocalImportFileListResponse {
  basePath: string;
  items: LocalImportFile[];
}

export interface ImportLocalEtfFileParams {
  relativePath: string;
  sourceName?: string;
  dataCategory?: string;
  dryRun?: boolean;
  previewLimit?: number;
  fieldMapping?: Record<string, string>;
}

export interface ImportedFileBatch {
  importId: string;
  sourceName: string;
  fileName: string;
  rows: number;
  assetSymbol: string;
  assetName: string;
  minTradeDate?: string | null;
  maxTradeDate?: string | null;
  importedAt: string;
}

export interface ImportedFileBatchListResponse {
  items: ImportedFileBatch[];
  total: number;
  limit: number;
  offset: number;
}

export interface ImportedFileRow {
  rowNumber: number;
  assetSymbol: string;
  assetName: string;
  tradeDate?: string | null;
  payload: Record<string, unknown>;
}

export interface ImportedFileRowsResponse {
  importId: string;
  items: ImportedFileRow[];
  total: number;
  limit: number;
  offset: number;
}

const normalize = (value: string): string => value.trim().toLowerCase();

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

export const listDataSources = (params: ListDataSourcesParams = {}): DataSource[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listDataSources");
  }

  const keyword = params.keyword ? normalize(params.keyword) : "";

  return dataSourcesMock.filter((source) => {
    const typePass = !params.sourceType || source.sourceType === params.sourceType;
    const statusPass = !params.status || source.status === params.status;
    const assetPass = !params.assetType || source.supportedAssetTypes.includes(params.assetType);
    const keywordPass =
      !keyword ||
      normalize(source.name).includes(keyword) ||
      normalize(source.vendor).includes(keyword) ||
      normalize(source.sourceType).includes(keyword);

    return typePass && statusPass && assetPass && keywordPass;
  });
};

export const getDataSourceById = (sourceId: string): DataSource | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDataSourceById");
  }
  return dataSourcesMock.find((source) => source.sourceId === sourceId);
};

export const getDataSourceTasks = (sourceId: string): DataSourceTask[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDataSourceTasks");
  }
  return getDataSourceById(sourceId)?.recentTasks ?? [];
};

export const getDataSourceEvidence = (sourceName: string): Evidence[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDataSourceEvidence");
  }
  return evidenceMock.filter((evidence) => evidence.sourceName === sourceName);
};

export const listDataSourcesAsync = (params: ListDataSourcesParams = {}, delayMs?: number): Promise<DataSource[]> =>
  shouldUseMockData()
    ? mockDelay(listDataSources(params), delayMs)
    : listRealDataSources(params).catch(() => listDataSourcesFromMock(params));

export const getDataSourceByIdAsync = (sourceId: string, delayMs?: number): Promise<DataSource | undefined> =>
  shouldUseMockData()
    ? mockDelay(getDataSourceById(sourceId), delayMs)
    : httpClient
        .get<DataSource>(ENDPOINTS.alphaTraceDataSourceDetail(sourceId), { timeoutMs: 1200 })
        .catch(() => dataSourcesMock.find((source) => source.sourceId === sourceId));

export const getDataSourceTasksAsync = (sourceId: string, delayMs?: number): Promise<DataSourceTask[]> =>
  shouldUseMockData()
    ? mockDelay(getDataSourceTasks(sourceId), delayMs)
    : httpClient
        .get<DataSourceTask[]>(ENDPOINTS.alphaTraceDataSourceTasks(sourceId), { timeoutMs: 1200 })
        .catch(() => dataSourcesMock.find((source) => source.sourceId === sourceId)?.recentTasks ?? []);

export const getDataApiCatalogAsync = (): Promise<DataApiCatalogResponse> =>
  httpClient.get<DataApiCatalogResponse>(ENDPOINTS.alphaTraceDataApiCatalog);

export const listLocalEtfImportFilesAsync = (): Promise<LocalImportFileListResponse> =>
  httpClient.get<LocalImportFileListResponse>(ENDPOINTS.alphaTraceDataSourceLocalImportFiles);

export const listImportedFileBatchesAsync = (): Promise<ImportedFileBatchListResponse> =>
  httpClient.get<ImportedFileBatchListResponse>(ENDPOINTS.alphaTraceDataSourceImportBatches, {
    params: { limit: 50 },
  });

export const listImportedFileRowsAsync = (importId: string): Promise<ImportedFileRowsResponse> =>
  httpClient.get<ImportedFileRowsResponse>(ENDPOINTS.alphaTraceDataSourceImportRows(encodeURIComponent(importId)), {
    params: { limit: 100 },
  });

export const importLocalEtfFileAsync = ({
  relativePath,
  sourceName = "data/test ETF Files",
  dataCategory = "MARKET_DATA",
  dryRun = false,
  previewLimit = 5,
  fieldMapping,
}: ImportLocalEtfFileParams): Promise<FileImportResponse> =>
  httpClient.post<FileImportResponse>(
    ENDPOINTS.alphaTraceDataSourceLocalImport,
    undefined,
    {
      params: {
        relativePath,
        sourceName,
        dataCategory,
        dryRun,
        previewLimit,
        fieldMapping: fieldMapping ? JSON.stringify(fieldMapping) : undefined,
      },
      timeoutMs: 60000,
    },
  );

export const uploadEtfFileImportAsync = async ({
  file,
  sourceName = "ETF File Upload",
  dataCategory = "MARKET_DATA",
  dryRun = false,
  previewLimit = 5,
  fieldMapping,
}: UploadEtfFileImportParams): Promise<FileImportResponse> => {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const params = new URLSearchParams({
    filename: file.name,
    sourceName,
    dataCategory,
    dryRun: String(dryRun),
    previewLimit: String(previewLimit),
  });
  if (fieldMapping) {
    params.set("fieldMapping", JSON.stringify(fieldMapping));
  }

  const response = await fetch(`${base}${ENDPOINTS.alphaTraceDataSourceFileImports}?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const message =
      typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.message === "string"
          ? payload.message
          : `File import failed: HTTP ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as FileImportResponse;
};

const listRealDataSources = async (params: ListDataSourcesParams = {}): Promise<DataSource[]> => {
  const response = await httpClient.get<BackendDataSourceListResponse>(ENDPOINTS.alphaTraceDataSources, {
    params: {
      sourceType: params.sourceType,
      status: params.status,
      assetType: params.assetType,
      keyword: params.keyword,
      limit: 100,
    },
    timeoutMs: 1200,
  });
  return response.items ?? [];
};

const listDataSourcesFromMock = (params: ListDataSourcesParams = {}): DataSource[] => {
  const keyword = params.keyword ? normalize(params.keyword) : "";

  return dataSourcesMock.filter((source) => {
    const typePass = !params.sourceType || source.sourceType === params.sourceType;
    const statusPass = !params.status || source.status === params.status;
    const assetPass = !params.assetType || source.supportedAssetTypes.includes(params.assetType);
    const keywordPass =
      !keyword ||
      normalize(source.name).includes(keyword) ||
      normalize(source.vendor).includes(keyword) ||
      normalize(source.sourceType).includes(keyword);

    return typePass && statusPass && assetPass && keywordPass;
  });
};
