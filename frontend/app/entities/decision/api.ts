import type { Decision, DecisionAction, DecisionHorizon } from "./model";
import { decisionsMock } from "@/mocks/decisions.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { mockDelay } from "@/shared/api/mock-delay";

export interface ListDecisionsParams {
  action?: DecisionAction;
  horizon?: DecisionHorizon;
  assetId?: string;
  runId?: string;
  portfolioId?: string;
}

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

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
  mockDelay(listDecisions(params), delayMs);

export const getDecisionByIdAsync = (decisionId: string, delayMs?: number): Promise<Decision | undefined> =>
  mockDelay(getDecisionById(decisionId), delayMs);
