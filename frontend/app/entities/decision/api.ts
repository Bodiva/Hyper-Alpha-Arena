import type { Decision, DecisionAction, DecisionHorizon } from "./model";
import { decisionsMock } from "@/mocks/decisions.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListDecisionsParams {
  action?: DecisionAction;
  horizon?: DecisionHorizon;
  assetId?: string;
  runId?: string;
  portfolioId?: string;
  limit?: number;
  offset?: number;
  compact?: boolean;
}

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

interface BackendDecisionExpectedOutcome {
  targetReturn?: number;
  expectedMaxDrawdown?: number;
  reviewDate?: string;
  note?: string;
}

interface BackendDecisionActualOutcome {
  realizedReturn?: number;
  realizedMaxDrawdown?: number;
  status?: "PENDING" | "ACHIEVED" | "PARTIAL" | "MISSED";
  asOf?: string;
  note?: string;
}

interface BackendDecisionAttributionFactor {
  factor: string;
  contribution?: number;
  explanation: string;
}

interface BackendDecisionAttribution {
  summary?: string;
  factors?: BackendDecisionAttributionFactor[];
  riskReview?: {
    correctlyIdentified?: string[];
    underestimated?: string[];
  };
  mistakeReview?: Decision["attribution"]["mistakeReview"];
  agentContributions?: Decision["attribution"]["agentContributions"];
  learningPoints?: string[];
}

interface BackendDecisionItem {
  decisionId: string;
  runId: string;
  assetIds?: string[];
  portfolioId?: string | null;
  action: string;
  horizon: string;
  confidence: number;
  thesis: string;
  risks?: string[];
  evidenceIds?: string[];
  expectedOutcome?: BackendDecisionExpectedOutcome;
  actualOutcome?: BackendDecisionActualOutcome | null;
  attribution?: BackendDecisionAttribution;
  createdAt: string;
}

interface BackendDecisionListResponse {
  items: BackendDecisionItem[];
  total: number;
  limit: number;
  offset: number;
}

const upperSnake = (value?: string | null): string => (value ?? "").replace(/[-\s]+/g, "_").toUpperCase();

const mapDecisionAction = (action: string): DecisionAction => {
  const normalized = upperSnake(action);
  if (["OVERWEIGHT", "UNDERWEIGHT", "HOLD", "WATCH", "NO_ACTION"].includes(normalized)) {
    return normalized as DecisionAction;
  }
  if (normalized === "AVOID") return "NO_ACTION";
  return "WATCH";
};

const mapDecisionHorizon = (horizon: string): DecisionHorizon => {
  const normalized = upperSnake(horizon);
  if (["SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"].includes(normalized)) return normalized as DecisionHorizon;
  return "MEDIUM_TERM";
};

const mapBackendDecision = (item: BackendDecisionItem): Decision => ({
  decisionId: item.decisionId,
  runId: item.runId,
  assetIds: item.assetIds ?? [],
  portfolioId: item.portfolioId ?? undefined,
  action: mapDecisionAction(item.action),
  horizon: mapDecisionHorizon(item.horizon),
  confidence: item.confidence,
  thesis: item.thesis,
  risks: item.risks ?? [],
  evidenceIds: item.evidenceIds ?? [],
  expectedOutcome: {
    targetReturn: item.expectedOutcome?.targetReturn ?? 0,
    expectedMaxDrawdown: item.expectedOutcome?.expectedMaxDrawdown ?? 0,
    reviewDate: item.expectedOutcome?.reviewDate ?? item.createdAt,
    note: item.expectedOutcome?.note ?? "Agent Runtime decision trace.",
  },
  actualOutcome: item.actualOutcome
    ? {
        realizedReturn: item.actualOutcome.realizedReturn ?? 0,
        realizedMaxDrawdown: item.actualOutcome.realizedMaxDrawdown ?? 0,
        status: item.actualOutcome.status ?? "PENDING",
        asOf: item.actualOutcome.asOf ?? item.createdAt,
        note: item.actualOutcome.note ?? "Pending validation.",
      }
    : undefined,
  attribution: {
    summary: item.attribution?.summary ?? "Derived from AlphaTrace Agent Runtime.",
    factors:
      item.attribution?.factors?.map((factor) => ({
        factor: factor.factor,
        contribution: factor.contribution ?? 0,
        explanation: factor.explanation,
      })) ?? [],
    riskReview: item.attribution?.riskReview
      ? {
          correctlyIdentified: item.attribution.riskReview.correctlyIdentified ?? [],
          underestimated: item.attribution.riskReview.underestimated ?? [],
        }
      : undefined,
    mistakeReview: item.attribution?.mistakeReview,
    agentContributions: item.attribution?.agentContributions,
    learningPoints: item.attribution?.learningPoints,
  },
  createdAt: item.createdAt,
});

export const listDecisions = (params: ListDecisionsParams = {}): Decision[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listDecisions");
  }

  return decisionsMock.filter((decision) => {
    const actionPass = !params.action || decision.action === params.action;
    const horizonPass = !params.horizon || decision.horizon === params.horizon;
    const assetPass = !params.assetId || decision.assetIds.includes(params.assetId);
    const runPass = !params.runId || decision.runId === params.runId;
    const portfolioPass = !params.portfolioId || decision.portfolioId === params.portfolioId;
    return actionPass && horizonPass && assetPass && runPass && portfolioPass;
  });
};

export const getDecisionById = (decisionId: string): Decision | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDecisionById");
  }
  return decisionsMock.find((decision) => decision.decisionId === decisionId);
};

export const getDecisionsByAssetId = (assetId: string): Decision[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDecisionsByAssetId");
  }
  return decisionsMock.filter((decision) => decision.assetIds.includes(assetId));
};

export const getDecisionsByRunId = (runId: string): Decision[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDecisionsByRunId");
  }
  return decisionsMock.filter((decision) => decision.runId === runId);
};

export const getDecisionsByPortfolioId = (portfolioId: string): Decision[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getDecisionsByPortfolioId");
  }
  return decisionsMock.filter((decision) => decision.portfolioId === portfolioId);
};

export const listDecisionsAsync = (params: ListDecisionsParams = {}, delayMs?: number): Promise<Decision[]> =>
  shouldUseMockData()
    ? mockDelay(listDecisions(params), delayMs)
    : httpClient
        .get<BackendDecisionListResponse>(ENDPOINTS.alphaTraceDecisions, {
          params: {
            assetId: params.assetId,
            portfolioId: params.portfolioId,
            runId: params.runId,
            action: params.action?.toLowerCase(),
            horizon: params.horizon?.toLowerCase(),
            limit: params.limit ?? 100,
            offset: params.offset ?? 0,
            compact: params.compact ?? true,
          },
          timeoutMs: 1200,
        })
        .then((response) => response.items.map(mapBackendDecision))
        .catch(() => []);

export const getDecisionByIdAsync = (decisionId: string, delayMs?: number): Promise<Decision | undefined> =>
  shouldUseMockData()
    ? mockDelay(getDecisionById(decisionId), delayMs)
    : httpClient
        .get<BackendDecisionItem>(ENDPOINTS.alphaTraceDecisionDetail(decisionId), { timeoutMs: 1200 })
        .then(mapBackendDecision)
        .catch((error) => {
          if (error instanceof Error && /404/.test(error.message)) return undefined;
          return undefined;
        });
