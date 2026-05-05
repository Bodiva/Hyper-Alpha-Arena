import type { AssetType } from "../asset/model";
import type { Evidence } from "../evidence/model";
import type { DataCategory, DataSource, DataSourceStatus, DataSourceTask, DataSourceType } from "./model";
import { dataSourcesMock } from "@/mocks/data-sources.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
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
    : listRealDataSources(params);

export const getDataSourceByIdAsync = (sourceId: string, delayMs?: number): Promise<DataSource | undefined> =>
  shouldUseMockData()
    ? mockDelay(getDataSourceById(sourceId), delayMs)
    : httpClient.get<DataSource>(ENDPOINTS.alphaTraceDataSourceDetail(sourceId));

export const getDataSourceTasksAsync = (sourceId: string, delayMs?: number): Promise<DataSourceTask[]> =>
  shouldUseMockData()
    ? mockDelay(getDataSourceTasks(sourceId), delayMs)
    : httpClient.get<DataSourceTask[]>(ENDPOINTS.alphaTraceDataSourceTasks(sourceId));

export const getDataApiCatalogAsync = (): Promise<DataApiCatalogResponse> =>
  httpClient.get<DataApiCatalogResponse>(ENDPOINTS.alphaTraceDataApiCatalog);

const listRealDataSources = async (params: ListDataSourcesParams = {}): Promise<DataSource[]> => {
  const response = await httpClient.get<BackendDataSourceListResponse>(ENDPOINTS.alphaTraceDataSources, {
    params: {
      sourceType: params.sourceType,
      status: params.status,
      assetType: params.assetType,
      keyword: params.keyword,
      limit: 100,
    },
  });
  return response.items ?? [];
};
