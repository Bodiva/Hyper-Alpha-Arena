import type { Asset, AssetType } from "../asset/model";
import type { Decision } from "../decision/model";
import type { Strategy, StrategyLifecycleStatus, StrategyStatus, StrategyStyleCode, StrategyType } from "../strategy/model";
import type { Portfolio, PortfolioPosition, PortfolioRiskLevel, RebalanceSuggestion } from "./model";
import { portfolioMock } from "@/mocks/portfolio.mock";
import { decisionsMock } from "@/mocks/decisions.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListPortfoliosParams {
  riskLevel?: PortfolioRiskLevel;
  objective?: string;
  status?: Portfolio["status"];
  keyword?: string;
  limit?: number;
  offset?: number;
}

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

interface BackendPortfolioListResponse {
  items: BackendPortfolioItem[];
  total: number;
  limit: number;
  offset: number;
}

interface BackendPortfolioItem {
  portfolioId: string;
  name: string;
  objective: string;
  riskLevel: string;
  updatedAt?: string;
  status?: string;
  holdings?: BackendHolding[];
  positions?: BackendHolding[];
  exposures?: Portfolio["exposures"];
  riskMetrics: Partial<Portfolio["riskMetrics"]> & { volatility: number; maxDrawdown: number; sharpe: number; var95: number };
  rebalanceRecommendations?: BackendRecommendation[];
  rebalanceSuggestions?: BackendRecommendation[];
}

interface BackendHolding {
  assetId: string;
  symbol: string;
  assetName?: string;
  name?: string;
  quantity?: number;
  weight: number;
  avgCost?: number;
  latestPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
}

interface BackendRecommendation {
  action: RebalanceSuggestion["action"];
  assetId: string;
  fromWeight: number;
  toWeight: number;
  reason: string;
  priority?: RebalanceSuggestion["priority"];
  expectedImpact?: string;
  riskImpact?: string;
  evidenceIds?: string[];
  relatedEvidenceIds?: string[];
  relatedDecisionIds?: string[];
  status?: RebalanceSuggestion["status"];
}

interface BackendPortfolioHoldingResponse {
  portfolioId: string;
  items: BackendHolding[];
  total: number;
  limit: number;
}

interface BackendPortfolioRecommendationResponse {
  portfolioId: string;
  items: BackendRecommendation[];
  total: number;
  limit: number;
}

interface BackendPortfolioAssetResponse {
  portfolioId: string;
  items: BackendAssetItem[];
  total: number;
  limit: number;
}

interface BackendPortfolioStrategyResponse {
  portfolioId: string;
  items: BackendStrategyItem[];
  total: number;
  limit: number;
}

interface BackendPortfolioDecisionResponse {
  portfolioId: string;
  items: Decision[];
  total: number;
  limit: number;
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
  backtestSummary: Strategy["backtestSummary"];
  rules?: Strategy["rules"];
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

const asRiskLevel = (value: string): PortfolioRiskLevel => {
  const supported: PortfolioRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
  return supported.includes(value as PortfolioRiskLevel) ? (value as PortfolioRiskLevel) : "MEDIUM";
};

const asPortfolioStatus = (value?: string): Portfolio["status"] => {
  const supported: Array<NonNullable<Portfolio["status"]>> = ["ACTIVE", "WATCH", "REBALANCING"];
  return supported.includes(value as NonNullable<Portfolio["status"]>) ? (value as Portfolio["status"]) : "ACTIVE";
};

const asStrategyType = (value: string): StrategyType => {
  const supported: StrategyType[] = ["ETF_ROTATION", "FUND_SELECTION", "FUTURES_TIMING", "MULTI_ASSET_ALLOCATION", "RULE_BASED", "AGENT_GENERATED"];
  return supported.includes(value as StrategyType) ? (value as StrategyType) : "RULE_BASED";
};

const asStyleCode = (value: string): StrategyStyleCode => {
  const supported: StrategyStyleCode[] = ["DIVIDEND_DEFENSIVE", "GROWTH_AGGRESSIVE", "MACRO_ALLOCATION", "COMMODITY_CYCLE", "LOW_VOL_STEADY", "TREND_TIMING", "MEAN_REVERSION", "RISK_PARITY"];
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

const PORTFOLIO_API_TIMEOUT_MS = 8000;
const PORTFOLIO_RELATION_TIMEOUT_MS = 20000;

const mapBackendHolding = (item: BackendHolding): PortfolioPosition => ({
  assetId: item.assetId,
  symbol: item.symbol,
  name: item.name ?? item.assetName ?? item.symbol,
  quantity: item.quantity ?? 0,
  weight: item.weight,
  avgCost: item.avgCost ?? 0,
  latestPrice: item.latestPrice ?? 0,
  marketValue: item.marketValue ?? 0,
  unrealizedPnl: item.unrealizedPnl ?? 0,
  unrealizedPnlPct: item.unrealizedPnlPct ?? 0,
});

const mapBackendRecommendation = (item: BackendRecommendation): RebalanceSuggestion => ({
  assetId: item.assetId,
  action: item.action,
  fromWeight: item.fromWeight,
  toWeight: item.toWeight,
  reason: item.reason,
  priority: item.priority ?? "MEDIUM",
  expectedImpact: item.expectedImpact,
  riskImpact: item.riskImpact,
  evidenceIds: item.evidenceIds ?? item.relatedEvidenceIds ?? [],
  relatedDecisionIds: item.relatedDecisionIds ?? [],
  status: item.status ?? "PENDING",
});

const mapBackendPortfolio = (item: BackendPortfolioItem): Portfolio => ({
  portfolioId: item.portfolioId,
  name: item.name,
  objective: item.objective,
  riskLevel: asRiskLevel(item.riskLevel),
  updatedAt: item.updatedAt,
  status: asPortfolioStatus(item.status),
  positions: (item.positions ?? item.holdings ?? []).map(mapBackendHolding),
  exposures: item.exposures ?? [],
  riskMetrics: {
    volatility: item.riskMetrics.volatility,
    maxDrawdown: item.riskMetrics.maxDrawdown,
    sharpe: item.riskMetrics.sharpe,
    sortino: item.riskMetrics.sortino ?? 0,
    beta: item.riskMetrics.beta ?? 1,
    var95: item.riskMetrics.var95,
  },
  rebalanceSuggestions: (item.rebalanceSuggestions ?? item.rebalanceRecommendations ?? []).map(mapBackendRecommendation),
});

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
  backtestSummary: item.backtestSummary,
  rules: item.rules ?? [],
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

export const listPortfolios = (): Portfolio[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listPortfolios");
  }
  return portfolioMock;
};

export const getPortfolioById = (portfolioId: string): Portfolio | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getPortfolioById");
  }
  return portfolioMock.find((portfolio) => portfolio.portfolioId === portfolioId);
};

export const getPortfolioDecisions = (portfolioId: string): Decision[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getPortfolioDecisions");
  }
  return decisionsMock.filter((decision) => decision.portfolioId === portfolioId);
};

export const listPortfoliosAsync = async (params: ListPortfoliosParams = {}, delayMs?: number): Promise<Portfolio[]> => {
  if (shouldUseMockData()) {
    return mockDelay(listPortfolios(), delayMs);
  }

  try {
    const response = await httpClient.get<BackendPortfolioListResponse>(ENDPOINTS.alphaTracePortfolios, {
      params: {
        riskLevel: params.riskLevel,
        objective: params.objective,
        status: params.status,
        keyword: params.keyword,
        limit: params.limit ?? 100,
        offset: params.offset ?? 0,
      },
      timeoutMs: PORTFOLIO_API_TIMEOUT_MS,
    });
    return response.items.map(mapBackendPortfolio);
  } catch (error) {
    throw error;
  }
};

export const getPortfolioByIdAsync = async (portfolioId: string, delayMs?: number): Promise<Portfolio | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(getPortfolioById(portfolioId), delayMs);
  }
  try {
    return mapBackendPortfolio(await httpClient.get<BackendPortfolioItem>(ENDPOINTS.alphaTracePortfolioDetail(portfolioId), { timeoutMs: PORTFOLIO_API_TIMEOUT_MS }));
  } catch (error) {
    throw error;
  }
};

export const getPortfolioHoldingsAsync = async (portfolioId: string, delayMs?: number): Promise<PortfolioPosition[]> => {
  if (shouldUseMockData()) {
    return mockDelay(getPortfolioById(portfolioId)?.positions ?? [], delayMs);
  }
  try {
    const response = await httpClient.get<BackendPortfolioHoldingResponse>(ENDPOINTS.alphaTracePortfolioHoldings(portfolioId), { timeoutMs: PORTFOLIO_API_TIMEOUT_MS });
    return response.items.map(mapBackendHolding);
  } catch {
    return [];
  }
};

export const getPortfolioRecommendationsAsync = async (portfolioId: string, delayMs?: number): Promise<RebalanceSuggestion[]> => {
  if (shouldUseMockData()) {
    return mockDelay(getPortfolioById(portfolioId)?.rebalanceSuggestions ?? [], delayMs);
  }
  try {
    const response = await httpClient.get<BackendPortfolioRecommendationResponse>(ENDPOINTS.alphaTracePortfolioRecommendations(portfolioId), {
      params: { limit: 30 },
      timeoutMs: PORTFOLIO_RELATION_TIMEOUT_MS,
    });
    return response.items.map(mapBackendRecommendation);
  } catch {
    return [];
  }
};

export const getPortfolioAssetsAsync = async (portfolioId: string, delayMs?: number): Promise<Asset[]> => {
  if (shouldUseMockData()) {
    return mockDelay([], delayMs);
  }
  try {
    const response = await httpClient.get<BackendPortfolioAssetResponse>(ENDPOINTS.alphaTracePortfolioAssets(portfolioId), { timeoutMs: PORTFOLIO_API_TIMEOUT_MS });
    return response.items.map(mapBackendAsset);
  } catch {
    return [];
  }
};

export const getPortfolioStrategiesAsync = async (portfolioId: string, delayMs?: number): Promise<Strategy[]> => {
  if (shouldUseMockData()) {
    return mockDelay([], delayMs);
  }
  try {
    const response = await httpClient.get<BackendPortfolioStrategyResponse>(ENDPOINTS.alphaTracePortfolioStrategies(portfolioId), { timeoutMs: PORTFOLIO_API_TIMEOUT_MS });
    return response.items.map(mapBackendStrategy);
  } catch {
    return [];
  }
};

export const getPortfolioDecisionsAsync = async (portfolioId: string, delayMs?: number): Promise<Decision[]> => {
  if (shouldUseMockData()) {
    return mockDelay(getPortfolioDecisions(portfolioId), delayMs);
  }
  try {
    const response = await httpClient.get<BackendPortfolioDecisionResponse>(ENDPOINTS.alphaTracePortfolioDecisions(portfolioId), {
      params: { limit: 20 },
      timeoutMs: PORTFOLIO_RELATION_TIMEOUT_MS,
    });
    return response.items;
  } catch {
    return [];
  }
};
