import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import type { ResearchArtifactType } from "./taxonomy";

export type { ResearchRunType, ResearchArtifactType, RuntimeAgentRole } from "./taxonomy";

export interface WorkspaceMemory {
  researchObjective: string;
  currentThesis: string;
  confirmedFacts: string[];
  openQuestions: string[];
  riskConstraints: string[];
  lastDecision?: {
    runId?: string;
    action?: string;
    horizon?: string;
    confidence?: number;
    summary?: string;
    updatedAt?: string;
  } | null;
  updatedAt?: string | null;
}

export interface ResearchWorkspace {
  workspaceId: string;
  name: string;
  description: string;
  type: "asset" | "portfolio" | "strategy" | "theme";
  primaryAssetId?: string | null;
  portfolioId?: string | null;
  strategyId?: string | null;
  status: "active" | "archived";
  pinnedRunId?: string | null;
  memory: WorkspaceMemory;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceThread {
  threadId: string;
  workspaceId: string;
  title: string;
  status: "active" | "archived";
  linkedRunIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceTimelineEvent {
  eventId: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  type: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceArtifact {
  artifactId: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  artifactType: ResearchArtifactType | string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ResearchWorkspaceSnapshot {
  workspace: ResearchWorkspace;
  threads: WorkspaceThread[];
  timeline: WorkspaceTimelineEvent[];
  artifacts: WorkspaceArtifact[];
}

export interface ResearchWorkspaceTaxonomy {
  researchRunTypes: string[];
  researchArtifactTypes: string[];
  runtimeAgentRoles: string[];
  legacyTaskTypeMapping: Record<string, string>;
}

export type ResearchReviewStatus = "pending" | "approved" | "rejected" | "needs_revision";

export interface ResearchReviewUpdate {
  runId: string;
  status: ResearchReviewStatus;
  note?: string;
  reviewer?: string;
  threadId?: string;
}

export interface ResearchReviewRecord {
  runId: string;
  status: ResearchReviewStatus;
  note?: string;
  reviewer?: string;
  updatedAt: string;
}

export const ensureResearchWorkspaceAsync = async (payload: {
  assetId?: string;
  portfolioId?: string;
  strategyId?: string;
  name?: string;
  description?: string;
}): Promise<ResearchWorkspace> => httpClient.post<ResearchWorkspace>(ENDPOINTS.alphaTraceResearchWorkspaceEnsure, payload);

export const createResearchWorkspaceThreadAsync = async (
  workspaceId: string,
  payload: { threadId?: string; title?: string },
): Promise<WorkspaceThread> => httpClient.post<WorkspaceThread>(ENDPOINTS.alphaTraceResearchWorkspaceThreads(workspaceId), payload);

export const getResearchWorkspaceSnapshotAsync = async (workspaceId: string): Promise<ResearchWorkspaceSnapshot> =>
  httpClient.get<ResearchWorkspaceSnapshot>(ENDPOINTS.alphaTraceResearchWorkspaceDetail(workspaceId), { timeoutMs: 8000 });

export const getResearchWorkspaceTaxonomyAsync = async (): Promise<ResearchWorkspaceTaxonomy> =>
  httpClient.get<ResearchWorkspaceTaxonomy>(ENDPOINTS.alphaTraceResearchWorkspaceTaxonomy, { timeoutMs: 8000 });

export const updateResearchWorkspaceReviewAsync = async (
  workspaceId: string,
  payload: ResearchReviewUpdate,
): Promise<ResearchReviewRecord> =>
  httpClient.post<ResearchReviewRecord>(ENDPOINTS.alphaTraceResearchWorkspaceReviews(workspaceId), payload, { timeoutMs: 8000 });
