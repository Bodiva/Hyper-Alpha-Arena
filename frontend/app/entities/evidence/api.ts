import type { AssetType } from "../asset/model";
import type { Decision } from "../decision/model";
import type { AgentRun } from "../agent/model";
import type { Evidence, EvidenceType } from "./model";
import { evidenceMock } from "@/mocks/evidence.mock";
import { assetsMock } from "@/mocks/assets.mock";
import { agentRunsMock } from "@/mocks/agent-runs.mock";
import { decisionsMock } from "@/mocks/decisions.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListEvidenceParams {
  evidenceType?: EvidenceType;
  assetId?: string;
  assetType?: AssetType;
  sourceName?: string;
  keyword?: string;
  minQualityScore?: number;
  minReliabilityScore?: number;
  limit?: number;
}

export interface SearchEvidenceParams {
  assetId?: string;
  q?: string;
  taskType?: string;
  limit?: number;
}

export interface EvidenceUsedBy {
  agentRuns: AgentRun[];
  decisions: Decision[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

interface BackendExtractedField {
  field: string;
  value: string;
  confidence?: number;
}

interface BackendEvidenceItem {
  id?: string;
  evidenceId: string;
  title: string;
  evidenceType: string;
  sourceName: string;
  sourceType?: string;
  url?: string;
  publishedAt?: string;
  collectedAt?: string;
  relatedAssetIds?: string[];
  summary: string;
  qualityScore: number;
  reliabilityScore?: number;
  extractedFields?: BackendExtractedField[] | Record<string, unknown>;
  usedByAgentRunIds?: string[];
  usedByDecisionIds?: string[];
}

interface BackendEvidenceListResponse {
  items: BackendEvidenceItem[];
  total: number;
  limit: number;
  offset?: number;
}

interface BackendEvidenceSearchResponse {
  items: BackendEvidenceItem[];
  total: number;
  query?: string;
  assetId?: string;
  taskType?: string;
  limit: number;
}

const mapEvidenceType = (evidenceType: string): EvidenceType => {
  const normalized = evidenceType.trim().toLowerCase();
  const supported: EvidenceType[] = [
    "news",
    "announcement",
    "research_report",
    "fund_quarterly_report",
    "macro_data",
    "market_snapshot",
    "industry_data",
    "user_upload",
  ];
  return supported.includes(normalized as EvidenceType) ? (normalized as EvidenceType) : "market_snapshot";
};

const mapExtractedFields = (fields: BackendEvidenceItem["extractedFields"]): Evidence["extractedFields"] => {
  if (!fields) return [];
  if (Array.isArray(fields)) {
    return fields.map((field) => ({
      field: field.field,
      value: field.value,
      confidence: field.confidence ?? 0.8,
    }));
  }
  return Object.entries(fields).map(([field, value]) => ({
    field,
    value: String(value),
    confidence: 0.8,
  }));
};

const mapBackendEvidenceItem = (item: BackendEvidenceItem): Evidence => ({
  id: item.id ?? item.evidenceId,
  title: item.title,
  evidenceType: mapEvidenceType(item.evidenceType),
  sourceName: item.sourceName,
  url: item.url ?? "#",
  publishedAt: item.publishedAt ?? "",
  collectedAt: item.collectedAt ?? item.publishedAt ?? "",
  relatedAssetIds: item.relatedAssetIds ?? [],
  summary: item.summary,
  qualityScore: item.qualityScore,
  reliabilityScore: item.reliabilityScore ?? item.qualityScore,
  extractedFields: mapExtractedFields(item.extractedFields),
  usedByAgentRunIds: item.usedByAgentRunIds ?? [],
});

export const listEvidence = (params: ListEvidenceParams = {}): Evidence[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listEvidence");
  }

  const keyword = params.keyword ? normalize(params.keyword) : "";
  const assetsById = new Map(assetsMock.map((asset) => [asset.id, asset]));

  return evidenceMock.filter((evidence) => {
    const typePass = !params.evidenceType || evidence.evidenceType === params.evidenceType;
    const assetPass = !params.assetId || evidence.relatedAssetIds.includes(params.assetId);
    const assetTypePass =
      !params.assetType ||
      evidence.relatedAssetIds.some((assetId) => assetsById.get(assetId)?.assetType === params.assetType);
    const sourcePass = !params.sourceName || evidence.sourceName === params.sourceName;
    const qualityPass = params.minQualityScore === undefined || evidence.qualityScore >= params.minQualityScore;
    const reliabilityPass =
      params.minReliabilityScore === undefined || evidence.reliabilityScore >= params.minReliabilityScore;
    const keywordPass =
      !keyword ||
      normalize(evidence.title).includes(keyword) ||
      normalize(evidence.summary).includes(keyword) ||
      normalize(evidence.sourceName).includes(keyword);

    return typePass && assetPass && assetTypePass && sourcePass && qualityPass && reliabilityPass && keywordPass;
  });
};

export const getEvidenceById = (evidenceId: string): Evidence | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getEvidenceById");
  }
  return evidenceMock.find((evidence) => evidence.id === evidenceId);
};

export const getEvidenceByIds = (evidenceIds: string[]): Evidence[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getEvidenceByIds");
  }

  const idSet = new Set(evidenceIds);
  return evidenceMock.filter((evidence) => idSet.has(evidence.id));
};

export const getEvidenceByAssetId = (assetId: string): Evidence[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getEvidenceByAssetId");
  }
  return evidenceMock.filter((evidence) => evidence.relatedAssetIds.includes(assetId));
};

export const getEvidenceBySourceName = (sourceName: string): Evidence[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getEvidenceBySourceName");
  }
  return evidenceMock.filter((evidence) => evidence.sourceName === sourceName);
};

export const getEvidenceUsedBy = (evidenceId: string): EvidenceUsedBy => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getEvidenceUsedBy");
  }

  const agentRuns = agentRunsMock.filter(
    (run) => run.evidenceIds.includes(evidenceId) || run.toolCalls.some((call) => call.evidenceIds?.includes(evidenceId)),
  );
  const decisions = decisionsMock.filter((decision) => decision.evidenceIds.includes(evidenceId));
  return { agentRuns, decisions };
};

export const listEvidenceAsync = async (params: ListEvidenceParams = {}, delayMs?: number): Promise<Evidence[]> => {
  if (shouldUseMockData()) {
    return mockDelay(listEvidence(params), delayMs);
  }

  const response = await httpClient.get<BackendEvidenceListResponse>(ENDPOINTS.alphaTraceEvidence, {
    params: {
      assetId: params.assetId,
      evidenceType: params.evidenceType,
      sourceName: params.sourceName,
      keyword: params.keyword,
      minQualityScore: params.minQualityScore,
      limit: params.limit ?? 100,
    },
  });
  return response.items.map(mapBackendEvidenceItem);
};

export const getEvidenceByIdAsync = async (evidenceId: string, delayMs?: number): Promise<Evidence | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(getEvidenceById(evidenceId), delayMs);
  }
  return mapBackendEvidenceItem(await httpClient.get<BackendEvidenceItem>(ENDPOINTS.alphaTraceEvidenceDetail(evidenceId)));
};

export const searchEvidenceAsync = async (params: SearchEvidenceParams = {}, delayMs?: number): Promise<Evidence[]> => {
  if (shouldUseMockData()) {
    return mockDelay(
      listEvidence({
        assetId: params.assetId,
        keyword: params.q,
      }).slice(0, params.limit ?? 5),
      delayMs,
    );
  }

  const response = await httpClient.get<BackendEvidenceSearchResponse>(ENDPOINTS.alphaTraceEvidenceSearch, {
    params: {
      assetId: params.assetId,
      q: params.q,
      taskType: params.taskType ?? "single_asset_analysis",
      limit: params.limit ?? 5,
    },
  });
  return response.items.map(mapBackendEvidenceItem);
};
