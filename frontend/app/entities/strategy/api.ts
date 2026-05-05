import type { Asset, AssetType } from "../asset/model";
import type { Evidence } from "../evidence/model";
import type {
  BacktestSummary,
  LeaderboardItem,
  Strategy,
  StrategyLifecycleStatus,
  StrategyRule,
  StrategyStatus,
  StrategyStyleCode,
  StrategyType,
} from "./model";
import { strategiesMock } from "@/mocks/strategies.mock";
import { leaderboardMock } from "@/mocks/leaderboard.mock";
import { assetsMock } from "@/mocks/assets.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListStrategiesParams {
  strategyType?: StrategyType;
  style?: StrategyStyleCode;
  assetType?: AssetType;
  status?: StrategyStatus | StrategyLifecycleStatus;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface ListLeaderboardParams {
  strategyId?: string;
  runMode?: LeaderboardItem["runMode"];
  timeRange?: LeaderboardItem["timeRange"];
  style?: StrategyStyleCode;
  assetType?: AssetType;
}

interface BackendStrategyListResponse {
  items: BackendStrategyItem[];
  total: number;
  limit: number;
  offset: number;
}

interface BackendStrategyAssetResponse {
  strategyId: string;
  items: BackendAssetItem[];
  total: number;
  limit: number;
}

interface BackendStrategyEvidenceResponse {
  strategyId: string;
  items: BackendEvidenceItem[];
  total: number;
  limit: number;
}

interface BackendLeaderboardListResponse {
  items: BackendLeaderboardItem[];
  total: number;
  limit: number;
  offset: number;
}

interface BackendLeaderboardItem extends LeaderboardItem {
  runtimeQualityScore?: number;
  completedRuns?: number;
  failedRuns?: number;
  averageConfidence?: number;
  evidenceCount?: number;
  reportCount?: number;
  riskWarnings?: number;
  decisionCount?: number;
}

interface BackendBacktestSummary extends Partial<BacktestSummary> {
  startDate: string;
  endDate: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  winRate: number;
}

interface BackendStrategyRule extends Partial<StrategyRule> {
  ruleId: string;
  name: string;
  expression: string;
}

interface BackendStrategyItem {
  strategyId: string;
  strategyName?: string;
  name?: string;
  strategyType: string;
  style: string;
  styleLabel?: string;
  assetTypes?: string[];
  description: string;
  status?: string;
  lifecycleStatus?: string;
  ownerAgentId?: string;
  backtestSummary: BackendBacktestSummary;
  rules?: BackendStrategyRule[];
  triggerConditions?: string[];
  rebalanceFrequency?: string;
  riskConstraints?: string[];
  observationIndicators?: string[];
  applicableScenarios?: string[];
  invalidationConditions?: string[];
  majorRisks?: string[];
  relatedAssetIds?: string[];
  relatedEvidenceIds?: string[];
  relatedDecisionIds?: string[];
  relatedPortfolioIds?: string[];
}

interface BackendAssetItem {
  assetId?: string;
  id?: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  market: string;
  currency: string;
  tags?: string[];
  description?: string;
  updatedAt?: string;
  profile?: unknown;
}

interface BackendEvidenceItem {
  id?: string;
  evidenceId: string;
  title: string;
  evidenceType: string;
  sourceName: string;
  url?: string;
  publishedAt?: string;
  collectedAt?: string;
  relatedAssetIds?: string[];
  summary: string;
  qualityScore: number;
  reliabilityScore?: number;
  extractedFields?: Array<{ field: string; value: string; confidence?: number }> | Record<string, unknown>;
  usedByAgentRunIds?: string[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

const asStrategyType = (value: string): StrategyType => {
  const supported: StrategyType[] = [
    "ETF_ROTATION",
    "FUND_SELECTION",
    "FUTURES_TIMING",
    "MULTI_ASSET_ALLOCATION",
    "RULE_BASED",
    "AGENT_GENERATED",
  ];
  return supported.includes(value as StrategyType) ? (value as StrategyType) : "RULE_BASED";
};

const asStyleCode = (value: string): StrategyStyleCode => {
  const supported: StrategyStyleCode[] = [
    "DIVIDEND_DEFENSIVE",
    "GROWTH_AGGRESSIVE",
    "MACRO_ALLOCATION",
    "COMMODITY_CYCLE",
    "LOW_VOL_STEADY",
    "TREND_TIMING",
    "MEAN_REVERSION",
    "RISK_PARITY",
  ];
  return supported.includes(value as StrategyStyleCode) ? (value as StrategyStyleCode) : "MACRO_ALLOCATION";
};

const asStrategyStatus = (value?: string): StrategyStatus => {
  const supported: StrategyStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];
  return supported.includes(value as StrategyStatus) ? (value as StrategyStatus) : "ACTIVE";
};

const asLifecycleStatus = (value?: string): StrategyLifecycleStatus | undefined => {
  const supported: StrategyLifecycleStatus[] = ["DRAFT", "VERIFIED", "RUNNING", "PAUSED", "ARCHIVED"];
  return supported.includes(value as StrategyLifecycleStatus) ? (value as StrategyLifecycleStatus) : undefined;
};

const asAssetTypes = (values?: string[]): AssetType[] => {
  const supported: AssetType[] = ["ETF", "FUND", "FUTURE", "INDEX"];
  return (values ?? []).filter((value): value is AssetType => supported.includes(value as AssetType));
};

const toExtractedFields = (fields: BackendEvidenceItem["extractedFields"]): Evidence["extractedFields"] => {
  if (!fields) return [];
  if (Array.isArray(fields)) {
    return fields.map((field) => ({
      field: field.field,
      value: field.value,
      confidence: field.confidence ?? 0.8,
    }));
  }
  return Object.entries(fields).map(([field, value]) => ({ field, value: String(value), confidence: 0.8 }));
};

const mapBackendAsset = (item: BackendAssetItem): Asset => ({
  id: item.id ?? item.assetId ?? item.symbol,
  symbol: item.symbol,
  name: item.name,
  assetType: item.assetType,
  market: item.market,
  currency: item.currency,
  tags: item.tags ?? [],
  description: item.description ?? "",
  updatedAt: item.updatedAt ?? "",
  profile: item.profile as Asset["profile"],
} as Asset);

const mapBackendEvidence = (item: BackendEvidenceItem): Evidence => ({
  id: item.id ?? item.evidenceId,
  title: item.title,
  evidenceType: item.evidenceType as Evidence["evidenceType"],
  sourceName: item.sourceName,
  url: item.url ?? "#",
  publishedAt: item.publishedAt ?? "",
  collectedAt: item.collectedAt ?? item.publishedAt ?? "",
  relatedAssetIds: item.relatedAssetIds ?? [],
  summary: item.summary,
  qualityScore: item.qualityScore,
  reliabilityScore: item.reliabilityScore ?? item.qualityScore,
  extractedFields: toExtractedFields(item.extractedFields),
  usedByAgentRunIds: item.usedByAgentRunIds ?? [],
});

const mapBackendStrategy = (item: BackendStrategyItem): Strategy => ({
  strategyId: item.strategyId,
  name: item.name ?? item.strategyName ?? item.strategyId,
  strategyType: asStrategyType(item.strategyType),
  style: asStyleCode(item.style),
  styleLabel: item.styleLabel ?? item.style,
  assetTypes: asAssetTypes(item.assetTypes),
  description: item.description,
  status: asStrategyStatus(item.status),
  lifecycleStatus: asLifecycleStatus(item.lifecycleStatus),
  ownerAgentId: item.ownerAgentId ?? "strategy_agent",
  backtestSummary: {
    startDate: item.backtestSummary.startDate,
    endDate: item.backtestSummary.endDate,
    totalReturn: item.backtestSummary.totalReturn,
    annualizedReturn: item.backtestSummary.annualizedReturn,
    maxDrawdown: item.backtestSummary.maxDrawdown,
    volatility: item.backtestSummary.volatility,
    sharpe: item.backtestSummary.sharpe,
    winRate: item.backtestSummary.winRate,
    turnover: item.backtestSummary.turnover,
    benchmark: item.backtestSummary.benchmark,
    excessReturn: item.backtestSummary.excessReturn,
  },
  rules: (item.rules ?? []).map((rule) => ({
    ruleId: rule.ruleId,
    name: rule.name,
    expression: rule.expression,
    note: rule.note,
  })),
  triggerConditions: item.triggerConditions ?? [],
  rebalanceFrequency: item.rebalanceFrequency,
  riskConstraints: item.riskConstraints ?? [],
  observationIndicators: item.observationIndicators ?? [],
  applicableScenarios: item.applicableScenarios ?? [],
  invalidationConditions: item.invalidationConditions ?? [],
  majorRisks: item.majorRisks ?? [],
  relatedAssetIds: item.relatedAssetIds ?? [],
  relatedEvidenceIds: item.relatedEvidenceIds ?? [],
  relatedDecisionIds: item.relatedDecisionIds ?? [],
  relatedPortfolioIds: item.relatedPortfolioIds ?? [],
});

export const listStrategies = (params: ListStrategiesParams = {}): Strategy[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listStrategies");
  }

  const keyword = params.keyword ? normalize(params.keyword) : "";

  return strategiesMock.filter((strategy) => {
    const typePass = !params.strategyType || strategy.strategyType === params.strategyType;
    const stylePass = !params.style || strategy.style === params.style;
    const assetTypePass = !params.assetType || strategy.assetTypes.includes(params.assetType);
    const statusPass = !params.status || strategy.status === params.status || strategy.lifecycleStatus === params.status;
    const keywordPass =
      !keyword ||
      normalize(strategy.name).includes(keyword) ||
      normalize(strategy.description).includes(keyword) ||
      strategy.rules.some((rule) => normalize(rule.name).includes(keyword) || normalize(rule.expression).includes(keyword));

    return typePass && stylePass && assetTypePass && statusPass && keywordPass;
  });
};

export const getStrategyById = (strategyId: string): Strategy | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getStrategyById");
  }
  return strategiesMock.find((strategy) => strategy.strategyId === strategyId);
};

export const getStrategiesByAssetType = (assetType: AssetType): Strategy[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getStrategiesByAssetType");
  }
  return strategiesMock.filter((strategy) => strategy.assetTypes.includes(assetType));
};

export const listLeaderboard = (params: ListLeaderboardParams = {}): LeaderboardItem[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listLeaderboard");
  }

  return leaderboardMock.filter((item) => {
    const strategyPass = !params.strategyId || item.strategyId === params.strategyId;
    const runModePass = !params.runMode || item.runMode === params.runMode;
    const timeRangePass = !params.timeRange || item.timeRange === params.timeRange;
    const stylePass = !params.style || item.style === params.style;
    const assetPass = !params.assetType || item.assetTypes.includes(params.assetType);
    return strategyPass && runModePass && timeRangePass && stylePass && assetPass;
  });
};

export const getLeaderboardItemByStrategyId = (strategyId: string): LeaderboardItem | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getLeaderboardItemByStrategyId");
  }
  return leaderboardMock.find((item) => item.strategyId === strategyId);
};

export const listStrategiesAsync = async (params: ListStrategiesParams = {}, delayMs?: number): Promise<Strategy[]> => {
  if (shouldUseMockData()) {
    return mockDelay(listStrategies(params), delayMs);
  }

  try {
    const response = await httpClient.get<BackendStrategyListResponse>(ENDPOINTS.alphaTraceStrategies, {
      params: {
        strategyType: params.strategyType,
        style: params.style,
        assetType: params.assetType,
        status: params.status,
        keyword: params.keyword,
        limit: params.limit ?? 100,
        offset: params.offset ?? 0,
      },
      timeoutMs: 1200,
    });
    const items = response.items.map(mapBackendStrategy);
    return items.length > 0 ? items : strategiesMock;
  } catch {
    return strategiesMock;
  }
};

export const getStrategyByIdAsync = async (strategyId: string, delayMs?: number): Promise<Strategy | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(getStrategyById(strategyId), delayMs);
  }
  try {
    return mapBackendStrategy(await httpClient.get<BackendStrategyItem>(ENDPOINTS.alphaTraceStrategyDetail(strategyId), { timeoutMs: 1200 }));
  } catch {
    return strategiesMock.find((strategy) => strategy.strategyId === strategyId);
  }
};

export const getStrategyAssetsAsync = async (strategyId: string, delayMs?: number): Promise<Asset[]> => {
  if (shouldUseMockData()) {
    const strategy = getStrategyById(strategyId);
    if (!strategy) return mockDelay([], delayMs);
    const relatedIds = new Set(strategy.relatedAssetIds ?? []);
    const relatedAssets = assetsMock.filter(
      (asset) => relatedIds.has(asset.id) || (relatedIds.size === 0 && strategy.assetTypes.includes(asset.assetType)),
    );
    return mockDelay(relatedAssets, delayMs);
  }

  try {
    const response = await httpClient.get<BackendStrategyAssetResponse>(ENDPOINTS.alphaTraceStrategyAssets(strategyId), { timeoutMs: 1200 });
    return response.items.map(mapBackendAsset);
  } catch {
    const strategy = strategiesMock.find((item) => item.strategyId === strategyId);
    const relatedIds = new Set(strategy?.relatedAssetIds ?? []);
    return assetsMock.filter((asset) => relatedIds.has(asset.id));
  }
};

export const getStrategyEvidenceAsync = async (strategyId: string, delayMs?: number): Promise<Evidence[]> => {
  if (shouldUseMockData()) {
    const strategy = getStrategyById(strategyId);
    if (!strategy) return mockDelay([], delayMs);
    const relatedIds = new Set(strategy.relatedEvidenceIds ?? []);
    const relatedAssetIds = new Set(strategy.relatedAssetIds ?? []);
    const relatedEvidence = evidenceMock.filter(
      (evidence) =>
        relatedIds.has(evidence.id) ||
        (relatedIds.size === 0 && evidence.relatedAssetIds.some((assetId) => relatedAssetIds.has(assetId))),
    );
    return mockDelay(relatedEvidence, delayMs);
  }

  try {
    const response = await httpClient.get<BackendStrategyEvidenceResponse>(ENDPOINTS.alphaTraceStrategyEvidence(strategyId), { timeoutMs: 1200 });
    return response.items.map(mapBackendEvidence);
  } catch {
    const strategy = strategiesMock.find((item) => item.strategyId === strategyId);
    const relatedIds = new Set(strategy?.relatedEvidenceIds ?? []);
    return evidenceMock.filter((evidence) => relatedIds.has(evidence.id));
  }
};

export const listLeaderboardAsync = (params: ListLeaderboardParams = {}, delayMs?: number): Promise<LeaderboardItem[]> =>
  shouldUseMockData()
    ? mockDelay(listLeaderboard(params), delayMs)
    : httpClient
        .get<BackendLeaderboardListResponse>(ENDPOINTS.alphaTraceLeaderboard, {
          params: {
            strategyId: params.strategyId,
            assetType: params.assetType,
            style: params.style,
            limit: 100,
          },
          timeoutMs: 1200,
        })
        .then((response) => response.items)
        .catch(() => leaderboardMock);
