import type { AssetType } from "../asset/model";

export type DataSourceType =
  | "API"
  | "CRAWLER"
  | "FILE_IMPORT"
  | "MANUAL_UPLOAD"
  | "DATABASE_SYNC"
  | "THIRD_PARTY";

export type DataSourceStatus = "HEALTHY" | "DEGRADED" | "OUTAGE" | "MAINTENANCE";

export type DataSyncFrequency =
  | "REALTIME"
  | "INTRADAY"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "ON_DEMAND";

export type DataCategory =
  | "MARKET_DATA"
  | "NEWS"
  | "ANNOUNCEMENT"
  | "RESEARCH_REPORT"
  | "FUND_QUARTERLY_REPORT"
  | "MACRO_DATA"
  | "INDUSTRY_DATA"
  | "FUTURES_STRUCTURE";

export interface DataSourceTask {
  taskId: string;
  taskName: string;
  taskType?: string;
  status: "SUCCESS" | "RUNNING" | "FAILED";
  startedAt: string;
  endedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
  recordsFetched?: number;
  recordsSucceeded?: number;
  recordsFailed?: number;
  errorMessage?: string;
  warningMessage?: string;
  nextRetryAt?: string;
  message?: string;
}

export interface DataSource {
  sourceId: string;
  name: string;
  sourceType: DataSourceType;
  vendor: string;
  status: DataSourceStatus;
  reliabilityScore: number;
  qualityScore: number;
  lastSyncAt: string;
  syncFrequency: DataSyncFrequency;
  supportedAssetTypes: AssetType[];
  dataCategories?: DataCategory[];
  evidenceSources?: string[];
  recentTasks: DataSourceTask[];
}
