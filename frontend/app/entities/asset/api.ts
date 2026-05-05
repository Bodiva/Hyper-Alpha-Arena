import type { Asset, AssetType, ETFProfile, FundProfile, FuturesProfile, IndexProfile } from "./model";
import type { Evidence } from "../evidence/model";
import type { AgentRun } from "../agent/model";
import { assetsMock } from "@/mocks/assets.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
import { agentRunsMock } from "@/mocks/agent-runs.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListAssetsParams {
  assetType?: AssetType;
  market?: string;
  tag?: string;
  keyword?: string;
  sourceName?: string;
  limit?: number;
  offset?: number;
}

const normalize = (value: string): string => value.trim().toLowerCase();

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

interface BackendAssetItem {
  assetId?: string;
  id?: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  market: string;
  currency: string;
  tags: string[];
  description: string;
  updatedAt: string;
  profile: unknown;
}

interface BackendAssetListResponse {
  items: BackendAssetItem[];
  total: number;
  limit: number;
  offset: number;
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

interface BackendAssetEvidenceResponse {
  assetId: string;
  items: BackendEvidenceItem[];
  total: number;
  limit: number;
}

export interface AlphaTraceMarketQuote {
  assetId: string;
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  nav?: number | null;
  premiumDiscount?: number | null;
  timestamp: string;
  source: string;
}

export interface AlphaTraceMarketSnapshot {
  assetId: string;
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  quote: AlphaTraceMarketQuote;
  valuation: Record<string, unknown>;
  liquidity: Record<string, unknown>;
  volatility: Record<string, unknown>;
  trend: Record<string, unknown>;
  fundFlow: Record<string, unknown>;
  premiumDiscount: Record<string, unknown>;
  source: string;
  collectedAt: string;
}

export interface AlphaTraceMarketIndicator {
  assetId: string;
  symbol: string;
  name: string;
  value: number | string;
  unit?: string | null;
  interpretation: string;
  lookbackDays?: number | null;
  source: string;
  updatedAt: string;
}

interface BackendMarketIndicatorResponse {
  assetId: string;
  symbol: string;
  items: AlphaTraceMarketIndicator[];
  total: number;
}

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

const mapBackendAsset = (item: BackendAssetItem): Asset => {
  const base = {
    id: item.id ?? item.assetId ?? item.symbol,
    symbol: item.symbol,
    name: item.name,
    assetType: item.assetType,
    market: item.market,
    currency: item.currency,
    tags: item.tags,
    description: item.description,
    updatedAt: item.updatedAt,
  };

  if (item.assetType === "ETF") {
    return { ...base, assetType: "ETF", profile: item.profile as ETFProfile };
  }
  if (item.assetType === "FUND") {
    return { ...base, assetType: "FUND", profile: item.profile as FundProfile };
  }
  if (item.assetType === "FUTURE") {
    return { ...base, assetType: "FUTURE", profile: item.profile as FuturesProfile };
  }
  return { ...base, assetType: "INDEX", profile: item.profile as IndexProfile };
};

export const listAssets = (params: ListAssetsParams = {}): Asset[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listAssets");
  }

  const keyword = params.keyword ? normalize(params.keyword) : "";

  return assetsMock.filter((asset) => {
    const typePass = !params.assetType || asset.assetType === params.assetType;
    const marketPass = !params.market || asset.market === params.market;
    const tagPass = !params.tag || asset.tags.includes(params.tag);
    const sourcePass =
      !params.sourceName ||
      evidenceMock.some((evidence) => evidence.sourceName === params.sourceName && evidence.relatedAssetIds.includes(asset.id));
    const keywordPass =
      !keyword ||
      normalize(asset.symbol).includes(keyword) ||
      normalize(asset.name).includes(keyword) ||
      asset.tags.some((tag) => normalize(tag).includes(keyword));

    return typePass && marketPass && tagPass && sourcePass && keywordPass;
  });
};

export const getAssetById = (assetId: string): Asset | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAssetById");
  }
  return assetsMock.find((asset) => asset.id === assetId);
};

export const getAssetsByType = (assetType: AssetType): Asset[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAssetsByType");
  }
  return assetsMock.filter((asset) => asset.assetType === assetType);
};

export const getAssetsByIds = (assetIds: string[]): Asset[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAssetsByIds");
  }

  const idSet = new Set(assetIds);
  return assetsMock.filter((asset) => idSet.has(asset.id));
};

export const getRelatedEvidenceForAsset = (assetId: string): Evidence[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getRelatedEvidenceForAsset");
  }
  return evidenceMock.filter((evidence) => evidence.relatedAssetIds.includes(assetId));
};

export const getRelatedAgentRunsForAsset = (assetId: string): AgentRun[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getRelatedAgentRunsForAsset");
  }
  return agentRunsMock.filter((run) => run.assetIds.includes(assetId));
};

export const listAssetsAsync = async (params: ListAssetsParams = {}, delayMs?: number): Promise<Asset[]> => {
  if (shouldUseMockData()) {
    return mockDelay(listAssets(params), delayMs);
  }

  const response = await httpClient.get<BackendAssetListResponse>(ENDPOINTS.alphaTraceAssets, {
    params: {
      assetType: params.assetType,
      market: params.market,
      keyword: params.keyword,
      tag: params.tag,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
  });
  return response.items.map(mapBackendAsset);
};

export const getAssetByIdAsync = async (assetId: string, delayMs?: number): Promise<Asset | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(getAssetById(assetId), delayMs);
  }

  return mapBackendAsset(await httpClient.get<BackendAssetItem>(ENDPOINTS.alphaTraceAssetDetail(assetId)));
};

export const getAssetEvidenceAsync = async (assetId: string, delayMs?: number): Promise<Evidence[]> => {
  if (shouldUseMockData()) {
    return mockDelay(getRelatedEvidenceForAsset(assetId), delayMs);
  }

  const response = await httpClient.get<BackendAssetEvidenceResponse>(ENDPOINTS.alphaTraceAssetEvidence(assetId));
  return response.items.map(mapBackendEvidence);
};

export const getAssetMarketQuoteAsync = async (assetId: string): Promise<AlphaTraceMarketQuote | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(undefined);
  }
  return httpClient.get<AlphaTraceMarketQuote>(ENDPOINTS.alphaTraceMarketQuote(assetId), { timeoutMs: 10000 });
};

export const getAssetMarketSnapshotAsync = async (assetId: string): Promise<AlphaTraceMarketSnapshot | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(undefined);
  }
  return httpClient.get<AlphaTraceMarketSnapshot>(ENDPOINTS.alphaTraceMarketSnapshot(assetId), { timeoutMs: 10000 });
};

export const getAssetMarketIndicatorsAsync = async (assetId: string): Promise<AlphaTraceMarketIndicator[]> => {
  if (shouldUseMockData()) {
    return mockDelay([]);
  }
  const response = await httpClient.get<BackendMarketIndicatorResponse>(ENDPOINTS.alphaTraceMarketIndicators(assetId), { timeoutMs: 10000 });
  return response.items;
};
