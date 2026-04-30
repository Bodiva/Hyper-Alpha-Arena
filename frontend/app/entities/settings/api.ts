import {
  ASSET_TYPE_OPTIONS,
  DATA_SOURCE_STATUS_OPTIONS,
  DECISION_STATUS_OPTIONS,
  EVIDENCE_QUALITY_OPTIONS,
  LEADERBOARD_SORT_OPTIONS,
  MARKET_OPTIONS,
  TAG_OPTIONS,
  settingsMock,
  type DataSourceDefaultStatus,
  type DecisionDefaultStatus,
  type EvidenceQualityThreshold,
  type LeaderboardSortMetric,
  type SettingsMock,
} from "@/mocks/settings.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";

export type {
  DataSourceDefaultStatus,
  DecisionDefaultStatus,
  EvidenceQualityThreshold,
  LeaderboardSortMetric,
  SettingsMock,
};

export {
  ASSET_TYPE_OPTIONS,
  DATA_SOURCE_STATUS_OPTIONS,
  DECISION_STATUS_OPTIONS,
  EVIDENCE_QUALITY_OPTIONS,
  LEADERBOARD_SORT_OPTIONS,
  MARKET_OPTIONS,
  TAG_OPTIONS,
};

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

export const getSettings = (): SettingsMock => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getSettings");
  }
  return settingsMock;
};
