import type { AssetType } from "../asset/model";
import type { Evidence } from "../evidence/model";
import type { DataSource, DataSourceStatus, DataSourceTask, DataSourceType } from "./model";
import { dataSourcesMock } from "@/mocks/data-sources.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListDataSourcesParams {
  sourceType?: DataSourceType;
  status?: DataSourceStatus;
  assetType?: AssetType;
  keyword?: string;
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
  mockDelay(listDataSources(params), delayMs);

export const getDataSourceByIdAsync = (sourceId: string, delayMs?: number): Promise<DataSource | undefined> =>
  mockDelay(getDataSourceById(sourceId), delayMs);
