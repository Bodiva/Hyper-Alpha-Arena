import type {
  Agent,
  AgentDecision,
  AgentDecisionAction,
  AgentDecisionHorizon,
  AgentEvent,
  AgentReport,
  AgentRole,
  AgentRun,
  AgentRunMetrics,
  AgentRunStatus,
  AgentRunTaskType,
  AgentStatus,
  AgentTeam,
  ToolCall,
  ToolCallStatus,
} from "./model";
import type { Evidence, EvidenceType } from "../evidence/model";
import { agentRunsMock } from "@/mocks/agent-runs.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { createEventStreamClient, type EventStreamClient, type EventStreamClientOptions } from "@/shared/api/event-stream-client";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";
import { buildMockRuntimeEventsFromAgentRun } from "./mock-runtime-replay";
import type { AgentRuntimeEvent, AgentRuntimeEventType, RuntimeTransportType } from "./runtime-events";

export interface ListAgentRunsParams {
  status?: AgentRunStatus;
  assetId?: string;
  taskType?: AgentRunTaskType;
  portfolioId?: string;
}

export interface CreateDemoAgentRunPayload {
  assetId?: string;
  taskType: AgentRunTaskType | string;
  question: string;
  portfolioId?: string;
  strategyId?: string;
}

export interface SubmitAgentRunPayload {
  assetId?: string;
  portfolioId?: string;
  strategyId?: string;
  taskType: AgentRunTaskType | string;
  question: string;
  horizon?: "short_term" | "medium_term" | "long_term";
  riskPreference?: "conservative" | "balanced" | "aggressive";
  evidenceScope?: {
    includeNews?: boolean;
    includeReports?: boolean;
    includeMacro?: boolean;
    includeMarketSnapshot?: boolean;
  };
  runnerConfig?: {
    runnerType?: "stub" | "qwen" | "alphatrace_native" | "tradingagents" | "langalpha" | "custom_runner";
    modelProvider?: string;
    modelName?: string;
    enableStreaming?: boolean;
    extraParams?: Record<string, unknown>;
  };
}

export interface AgentRunnerStatusItem {
  runnerType: "stub" | "qwen" | "alphatrace_native" | "tradingagents" | "langalpha" | "custom_runner";
  executionMode?: "in_process" | "subprocess" | "external_disabled" | "custom" | string;
  executionPolicyReason?: string;
  capabilities?: {
    runner_type?: string;
    runnerType?: string;
    execution_mode?: string;
    executionMode?: string;
    supported_task_types?: string[];
    supportedTaskTypes?: string[];
    supports_streaming?: boolean;
    supportsStreaming?: boolean;
    supports_evidence?: boolean;
    supportsEvidence?: boolean;
    supports_portfolio_context?: boolean;
    supportsPortfolioContext?: boolean;
    supports_external_tools?: boolean;
    supportsExternalTools?: boolean;
    production_ready?: boolean;
    productionReady?: boolean;
    notes?: string;
  };
  enabled: boolean;
  available: boolean;
  status: string;
  message: string;
  repoPathConfigured?: boolean;
  repoPathExists?: boolean | null;
  repoPath?: string | null;
  importable?: boolean;
  importError?: string | null;
  qwenKeyConfigured?: boolean;
  qwenConfigSource?: string;
}

export interface AgentRunnerCapability {
  runner_type?: string;
  runnerType?: string;
  execution_mode?: string;
  executionMode?: string;
  supported_task_types?: string[];
  supportedTaskTypes?: string[];
  supports_streaming?: boolean;
  supportsStreaming?: boolean;
  supports_evidence?: boolean;
  supportsEvidence?: boolean;
  supports_portfolio_context?: boolean;
  supportsPortfolioContext?: boolean;
  supports_external_tools?: boolean;
  supportsExternalTools?: boolean;
  production_ready?: boolean;
  productionReady?: boolean;
  notes?: string;
}

export interface AgentRunnerRecommendation {
  requestedRunnerType?: string | null;
  recommendedRunnerType: string;
  taskType: string;
  supported: boolean;
  reason: string;
  capability?: AgentRunnerCapability;
}

export interface AgentRunnerCapabilitiesResponse {
  capabilities: AgentRunnerCapability[];
  recommendation: AgentRunnerRecommendation;
  message: string;
}

export interface AgentRuntimeLogResponse {
  path: string;
  source?: string;
  exists: boolean;
  limit: number;
  truncated: boolean;
  lines: string[];
  candidates?: string[];
  message?: string;
}

export interface AgentWorkerArtifactFileStatus {
  path: string;
  exists: boolean;
  sizeBytes: number;
}

export interface AgentWorkerArtifactsResponse {
  runId: string;
  workerRoot: string;
  workDir: string;
  exists: boolean;
  files: Record<string, AgentWorkerArtifactFileStatus>;
  stdoutLines: string[];
  stderrLines: string[];
  events: Array<Record<string, unknown>>;
  result?: Record<string, unknown> | null;
  message?: string | null;
}

export interface AgentRuntimeWorkerStatus {
  runId: string;
  pid: number;
  running: boolean;
  returnCode?: number | null;
}

export interface AgentRuntimeWorkersResponse {
  workerType: string;
  activeCount: number;
  registeredCount: number;
  workers: AgentRuntimeWorkerStatus[];
}

interface BackendAgentRunnerStatusResponse {
  runners: AgentRunnerStatusItem[];
}

interface BackendSubmitAgentRunResponse {
  runId: string;
  status: string;
  mode: "stub" | "qwen" | "tradingagents" | "langalpha" | "custom_runner";
  message: string;
  run: BackendAgentRun;
}

interface BackendAgentRunListResponse {
  items: BackendAgentRun[];
  total: number;
  limit: number;
  offset: number;
}

interface BackendAgentRun {
  runId: string;
  name: string;
  target: string;
  taskType: string;
  riskLevel: string;
  status: string;
  assetIds?: string[];
  portfolioId?: string | null;
  triggeredBy?: string;
  modelName?: string | null;
  startedAt: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  agents?: BackendAgent[];
  toolCalls?: BackendToolCall[];
  reports?: BackendAgentReport[];
  events?: BackendRuntimeEvent[];
  evidenceIds?: string[];
  finalDecision?: BackendAgentDecision;
  metrics?: Partial<AgentRunMetrics>;
}

interface BackendAgent {
  agentId: string;
  name: string;
  role: string;
  team: string;
  status: string;
}

interface BackendToolCall {
  callId: string;
  runId: string;
  agentId?: string;
  agentName?: string;
  toolName: string;
  args?: Record<string, unknown>;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  summary?: string | null;
  evidenceIds?: string[];
}

interface BackendAgentReport {
  reportId: string;
  runId: string;
  agentId?: string;
  agentName?: string;
  title: string;
  summary: string;
  createdAt: string;
}

interface BackendAgentDecision {
  action: string;
  horizon: string;
  confidence: number;
  thesis: string;
  risks?: string[];
  evidenceIds?: string[];
  summary?: string | null;
  triggerConditions?: string[];
  invalidationConditions?: string[];
  observationIndicators?: string[];
}

interface BackendEvidenceReference {
  evidenceId: string;
  title: string;
  evidenceType: string;
  sourceName: string;
  sourceType?: string;
  qualityScore: number;
  reliabilityScore?: number;
  summary: string;
  url?: string | null;
  publishedAt?: string | null;
  collectedAt?: string | null;
  relatedAssetIds?: string[];
  extractedFields?: Array<{ field: string; value: string; confidence?: number }> | Record<string, unknown>;
  usedByAgentRunIds?: string[];
  usedByDecisionIds?: string[];
  metadata?: Record<string, unknown>;
}

interface BackendRuntimeEvent {
  eventId: string;
  runId: string;
  type: AgentRuntimeEventType;
  timestamp: string;
  sequence: number;
  agentId?: string;
  agentName?: string | null;
  team?: string | null;
  payload?: Record<string, unknown>;
}

const realModeNotImplemented = (operation: string): never => {
  throw new Error(`Real API mode for ${operation} is not implemented yet.`);
};

const AGENT_RUN_SUBMIT_TIMEOUT_MS = 150000;

const upperSnake = (value?: string | null): string => (value ?? "").replace(/[-\s]+/g, "_").toUpperCase();

const mapRunStatus = (status: string): AgentRunStatus => {
  const normalized = upperSnake(status);
  if (["QUEUED", "RUNNING", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(normalized)) {
    return normalized as AgentRunStatus;
  }
  return "QUEUED";
};

const mapAgentStatus = (status: string): AgentStatus => {
  const normalized = upperSnake(status);
  if (["IDLE", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"].includes(normalized)) return normalized as AgentStatus;
  return "IDLE";
};

const mapToolStatus = (status: string): ToolCallStatus => {
  const normalized = upperSnake(status);
  if (["RUNNING", "COMPLETED", "FAILED"].includes(normalized)) return normalized as ToolCallStatus;
  return "COMPLETED";
};

const mapTaskType = (taskType: string): AgentRunTaskType => {
  const normalized = upperSnake(taskType);
  if (
    [
      "SINGLE_ASSET_ANALYSIS",
      "MULTI_ASSET_COMPARISON",
      "PORTFOLIO_DIAGNOSTIC",
      "PORTFOLIO_DIAGNOSIS",
      "EVENT_IMPACT_ANALYSIS",
      "REBALANCE_SUGGESTION",
    ].includes(normalized)
  ) {
    if (normalized === "PORTFOLIO_DIAGNOSIS") return "PORTFOLIO_DIAGNOSTIC";
    return normalized as AgentRunTaskType;
  }
  return "SINGLE_ASSET_ANALYSIS";
};

const mapRiskLevel = (riskLevel: string): AgentRun["riskLevel"] => {
  const normalized = upperSnake(riskLevel);
  if (["LOW", "MEDIUM", "HIGH"].includes(normalized)) return normalized as AgentRun["riskLevel"];
  return "MEDIUM";
};

const mapAgentTeam = (team: string): AgentTeam => {
  const normalized = upperSnake(team);
  if (["ANALYST_TEAM", "RESEARCH_TEAM", "STRATEGY_TEAM", "RISK_TEAM", "PORTFOLIO_TEAM"].includes(normalized)) {
    return normalized as AgentTeam;
  }
  return "ANALYST_TEAM";
};

const mapAgentRole = (role: string): AgentRole => {
  const normalized = upperSnake(role);
  const roles: AgentRole[] = [
    "MARKET_ANALYST",
    "MACRO_ANALYST",
    "ETF_FUND_ANALYST",
    "FUTURES_ANALYST",
    "NEWS_ANALYST",
    "FLOW_ANALYST",
    "BULL_RESEARCHER",
    "BEAR_RESEARCHER",
    "RESEARCH_MANAGER",
    "ALLOCATION_AGENT",
    "TIMING_AGENT",
    "STRATEGY_AGENT",
    "DRAWDOWN_ANALYST",
    "LIQUIDITY_ANALYST",
    "CONCENTRATION_ANALYST",
    "SCENARIO_ANALYST",
    "PORTFOLIO_MANAGER",
  ];
  return roles.includes(normalized as AgentRole) ? (normalized as AgentRole) : "MARKET_ANALYST";
};

const mapDecisionAction = (action: string): AgentDecisionAction => {
  const normalized = upperSnake(action);
  if (["OVERWEIGHT", "UNDERWEIGHT", "HOLD", "WATCH", "NO_ACTION"].includes(normalized)) {
    return normalized as AgentDecisionAction;
  }
  return "WATCH";
};

const mapDecisionHorizon = (horizon: string): AgentDecisionHorizon => {
  const normalized = upperSnake(horizon);
  if (["SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"].includes(normalized)) {
    return normalized as AgentDecisionHorizon;
  }
  return "MEDIUM_TERM";
};

const mapEvidenceType = (evidenceType: string): EvidenceType => {
  const normalized = evidenceType.trim().toLowerCase();
  const types: EvidenceType[] = [
    "news",
    "announcement",
    "research_report",
    "fund_quarterly_report",
    "macro_data",
    "market_snapshot",
    "industry_data",
    "user_upload",
    "external_search",
    "runtime_context",
  ];
  return types.includes(normalized as EvidenceType) ? (normalized as EvidenceType) : "market_snapshot";
};

const mapBackendExtractedFields = (fields: BackendEvidenceReference["extractedFields"]): Evidence["extractedFields"] => {
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

const findAgentIdByName = (agents: Agent[], agentName?: string | null): string => {
  if (!agentName) return agents[0]?.agentId ?? "runtime-agent";
  return agents.find((agent) => agent.name === agentName)?.agentId ?? agents[0]?.agentId ?? "runtime-agent";
};

const mapRuntimeEvent = (event: BackendRuntimeEvent): AgentRuntimeEvent => ({
  eventId: event.eventId,
  runId: event.runId,
  type: event.type,
  timestamp: event.timestamp,
  agentId: event.agentId,
  agentName: event.agentName ?? undefined,
  team: event.team ? mapAgentTeam(event.team) : undefined,
  sequence: event.sequence,
  payload: event.payload ?? {},
});

const mapRuntimeEventToAgentEvent = (event: BackendRuntimeEvent, agents: Agent[]): AgentEvent | undefined => {
  const agentId = event.agentId ?? findAgentIdByName(agents, event.agentName);
  const payload = event.payload ?? {};
  const stringValue = (key: string): string => (typeof payload[key] === "string" ? String(payload[key]) : "");
  const evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map(String) : undefined;

  switch (event.type) {
    case "agent.started":
      return { type: "agent.started", runId: event.runId, agentId, timestamp: event.timestamp };
    case "agent.completed":
      return { type: "agent.completed", runId: event.runId, agentId, timestamp: event.timestamp };
    case "agent.failed":
      return { type: "agent.failed", runId: event.runId, agentId, error: stringValue("error") || "Agent failed", timestamp: event.timestamp };
    case "tool.called":
      return { type: "tool.called", runId: event.runId, agentId, toolName: stringValue("toolName") || "tool", args: (payload.args as Record<string, unknown>) ?? {}, timestamp: event.timestamp };
    case "tool.result":
      return { type: "tool.result", runId: event.runId, agentId, toolName: stringValue("toolName") || "tool", summary: stringValue("summary") || "Tool result received", evidenceIds, timestamp: event.timestamp };
    case "reasoning.chunk":
      return { type: "reasoning.chunk", runId: event.runId, agentId, content: stringValue("content") || "Reasoning updated", timestamp: event.timestamp };
    case "report.generated":
      return { type: "report.generated", runId: event.runId, agentId, reportId: stringValue("reportId") || event.eventId, title: stringValue("title") || "Runtime report", timestamp: event.timestamp };
    case "debate.message":
      return { type: "debate.message", runId: event.runId, agentId, stance: (upperSnake(stringValue("stance")) as "BULL" | "BEAR" | "NEUTRAL") || "NEUTRAL", content: stringValue("content") || "Debate message", timestamp: event.timestamp };
    case "risk.warning":
      return { type: "risk.warning", runId: event.runId, agentId, level: (upperSnake(stringValue("level")) as "LOW" | "MEDIUM" | "HIGH") || "MEDIUM", content: stringValue("content") || "Risk warning", timestamp: event.timestamp };
    case "decision.updated":
      return { type: "decision.updated", runId: event.runId, action: mapDecisionAction(stringValue("action")), confidence: typeof payload.confidence === "number" ? payload.confidence : 0, timestamp: event.timestamp };
    default:
      return undefined;
  }
};

const mapBackendAgentReport = (report: BackendAgentReport, agents: Agent[] = []): AgentReport => ({
  reportId: report.reportId,
  runId: report.runId,
  agentId: report.agentId ?? findAgentIdByName(agents, report.agentName),
  title: report.title,
  summary: report.summary,
  createdAt: report.createdAt,
});

const mapBackendAgentDecision = (decision?: BackendAgentDecision): AgentDecision => ({
  action: mapDecisionAction(decision?.action ?? "watch"),
  horizon: mapDecisionHorizon(decision?.horizon ?? "medium_term"),
  confidence: decision?.confidence ?? 0,
  thesis: decision?.thesis ?? "No decision thesis returned by backend stub.",
  risks: decision?.risks ?? [],
  evidenceIds: decision?.evidenceIds ?? [],
  summary: decision?.summary ?? undefined,
  triggerConditions: decision?.triggerConditions ?? [],
  invalidationConditions: decision?.invalidationConditions ?? [],
  observationIndicators: decision?.observationIndicators ?? [],
});

const mapBackendEvidenceReference = (item: BackendEvidenceReference, runId: string): Evidence => ({
  id: item.evidenceId,
  title: item.title,
  evidenceType: mapEvidenceType(item.evidenceType),
  sourceName: item.sourceName,
  sourceType: item.sourceType,
  url: item.url ?? "#",
  publishedAt: item.publishedAt ?? "",
  collectedAt: item.collectedAt ?? item.publishedAt ?? "",
  relatedAssetIds: item.relatedAssetIds ?? [],
  summary: item.summary,
  qualityScore: item.qualityScore,
  reliabilityScore: item.reliabilityScore ?? item.qualityScore,
  extractedFields: mapBackendExtractedFields(item.extractedFields),
  usedByAgentRunIds: item.usedByAgentRunIds?.length ? item.usedByAgentRunIds : [runId],
  usedByDecisionIds: item.usedByDecisionIds ?? [],
  metadata: item.metadata,
});

const mapBackendAgentRun = (run: BackendAgentRun): AgentRun => {
  const agents = (run.agents ?? []).map<Agent>((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    role: mapAgentRole(agent.role),
    team: mapAgentTeam(agent.team),
    status: mapAgentStatus(agent.status),
  }));

  const toolCalls = (run.toolCalls ?? []).map<ToolCall>((call) => ({
    callId: call.callId,
    runId: call.runId,
    agentId: call.agentId ?? findAgentIdByName(agents, call.agentName),
    toolName: call.toolName,
    args: call.args ?? {},
    status: mapToolStatus(call.status),
    startedAt: call.startedAt,
    completedAt: call.completedAt ?? undefined,
    summary: call.summary ?? undefined,
    evidenceIds: call.evidenceIds,
  }));

  const reports = (run.reports ?? []).map((report) => mapBackendAgentReport(report, agents));

  const events = (run.events ?? [])
    .map((event) => mapRuntimeEventToAgentEvent(event, agents))
    .filter((event): event is AgentEvent => Boolean(event));

  const decision = mapBackendAgentDecision(run.finalDecision);

  return {
    runId: run.runId,
    name: run.name,
    target: run.target,
    taskType: mapTaskType(run.taskType),
    riskLevel: mapRiskLevel(run.riskLevel),
    status: mapRunStatus(run.status),
    assetIds: run.assetIds ?? [],
    portfolioId: run.portfolioId ?? undefined,
    triggeredBy: run.triggeredBy ?? "backend_stub",
    modelName: run.modelName ?? undefined,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt ?? undefined,
    completedAt: run.completedAt ?? undefined,
    agents,
    toolCalls,
    reports,
    events,
    evidenceIds: run.evidenceIds ?? [],
    finalDecision: decision,
    metrics: {
      llmCalls: run.metrics?.llmCalls ?? 0,
      toolCalls: run.metrics?.toolCalls ?? toolCalls.length,
      generatedReports: run.metrics?.generatedReports ?? reports.length,
      durationSeconds: run.metrics?.durationSeconds ?? 0,
      estimatedCostUsd: run.metrics?.estimatedCostUsd,
    },
  };
};

const getMockAgentRuns = (params: ListAgentRunsParams = {}): AgentRun[] =>
  agentRunsMock.filter((run) => {
    const statusPass = !params.status || run.status === params.status;
    const assetPass = !params.assetId || run.assetIds.includes(params.assetId);
    const taskTypePass = !params.taskType || run.taskType === params.taskType;
    const portfolioPass = !params.portfolioId || run.portfolioId === params.portfolioId;
    return statusPass && assetPass && taskTypePass && portfolioPass;
  });

export const listAgentRuns = (params: ListAgentRunsParams = {}): AgentRun[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("listAgentRuns sync access");
  }
  return getMockAgentRuns(params);
};

export const getAgentRunById = (runId: string): AgentRun | undefined => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAgentRunById sync access");
  }
  return agentRunsMock.find((run) => run.runId === runId);
};

export const getAgentRunsByAssetId = (assetId: string): AgentRun[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAgentRunsByAssetId");
  }
  return agentRunsMock.filter((run) => run.assetIds.includes(assetId));
};

export const getAgentRunsByPortfolioId = (portfolioId: string): AgentRun[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAgentRunsByPortfolioId");
  }
  return agentRunsMock.filter((run) => run.portfolioId === portfolioId);
};

export const getAgentRunEvents = (runId: string): AgentEvent[] => getAgentRunById(runId)?.events ?? [];

export const getAgentRunReports = (runId: string): AgentReport[] => getAgentRunById(runId)?.reports ?? [];

export const getAgentRunEvidence = (runId: string): Evidence[] => {
  const run = getAgentRunById(runId);
  if (!run) return [];
  return evidenceMock.filter((evidence) => run.evidenceIds.includes(evidence.id) || evidence.usedByAgentRunIds.includes(runId));
};

export const getAgentRunRuntimeEvents = (runId: string): AgentRuntimeEvent[] => {
  if (!shouldUseMockData()) {
    realModeNotImplemented("getAgentRunRuntimeEvents sync access");
  }

  const run = getAgentRunById(runId);
  return run ? buildMockRuntimeEventsFromAgentRun(run) : [];
};

export type CreateAgentRuntimeEventStreamOptions = Omit<
  EventStreamClientOptions,
  "runId" | "transport"
> & {
  transport?: RuntimeTransportType;
};

export const createAgentRuntimeEventStream = (
  runId: string,
  options: CreateAgentRuntimeEventStreamOptions,
): EventStreamClient => {
  const transport = options.transport ?? "mock";
  return createEventStreamClient({
    ...options,
    runId,
    transport,
    url: options.url ?? (transport === "sse" ? ENDPOINTS.alphaTraceAgentRunEventsStream(runId) : undefined),
  });
};

export const listAgentRunsAsync = async (params: ListAgentRunsParams = {}, delayMs?: number): Promise<AgentRun[]> => {
  if (shouldUseMockData()) {
    return mockDelay(getMockAgentRuns(params), delayMs);
  }

  try {
    const response = await httpClient.get<BackendAgentRunListResponse>(ENDPOINTS.alphaTraceAgentRuns, {
      params: {
        assetId: params.assetId,
        portfolioId: params.portfolioId,
        status: params.status?.toLowerCase(),
        taskType: params.taskType?.toLowerCase(),
      },
      timeoutMs: 1200,
    });
    const items = response.items.map(mapBackendAgentRun);
    return items.length > 0 ? items : getMockAgentRuns(params);
  } catch {
    return getMockAgentRuns(params);
  }
};

export const getAgentRunByIdAsync = async (runId: string, delayMs?: number): Promise<AgentRun | undefined> => {
  if (shouldUseMockData()) {
    return mockDelay(agentRunsMock.find((run) => run.runId === runId), delayMs);
  }

  try {
    return mapBackendAgentRun(await httpClient.get<BackendAgentRun>(ENDPOINTS.alphaTraceAgentRunDetail(runId), { timeoutMs: 1200 }));
  } catch {
    return agentRunsMock.find((run) => run.runId === runId);
  }
};

export const getAgentRunRuntimeEventsAsync = async (runId: string, delayMs?: number): Promise<AgentRuntimeEvent[]> => {
  if (shouldUseMockData()) {
    const run = agentRunsMock.find((item) => item.runId === runId);
    return mockDelay(run ? buildMockRuntimeEventsFromAgentRun(run) : [], delayMs);
  }

  const events = await httpClient.get<BackendRuntimeEvent[]>(ENDPOINTS.alphaTraceAgentRunEvents(runId));
  return events.map(mapRuntimeEvent);
};

export const getAgentRunReportsAsync = async (runId: string, delayMs?: number): Promise<AgentReport[]> => {
  if (shouldUseMockData()) {
    const run = agentRunsMock.find((item) => item.runId === runId);
    return mockDelay(run?.reports ?? [], delayMs);
  }

  const reports = await httpClient.get<BackendAgentReport[]>(ENDPOINTS.alphaTraceAgentRunReports(runId));
  return reports.map((report) => mapBackendAgentReport(report));
};

export const getAgentRunEvidenceAsync = async (runId: string, delayMs?: number): Promise<Evidence[]> => {
  if (shouldUseMockData()) {
    const run = agentRunsMock.find((item) => item.runId === runId);
    if (!run) return mockDelay([], delayMs);
    const evidence = evidenceMock.filter(
      (item) => run.evidenceIds.includes(item.id) || item.usedByAgentRunIds.includes(runId),
    );
    return mockDelay(evidence, delayMs);
  }

  const evidence = await httpClient.get<BackendEvidenceReference[]>(ENDPOINTS.alphaTraceAgentRunEvidence(runId));
  return evidence.map((item) => mapBackendEvidenceReference(item, runId));
};

export const getAgentRunDecisionAsync = async (runId: string, delayMs?: number): Promise<AgentDecision | undefined> => {
  if (shouldUseMockData()) {
    const run = agentRunsMock.find((item) => item.runId === runId);
    return mockDelay(run?.finalDecision, delayMs);
  }

  return mapBackendAgentDecision(await httpClient.get<BackendAgentDecision>(ENDPOINTS.alphaTraceAgentRunDecision(runId)));
};

export const cancelAgentRunAsync = async (runId: string): Promise<AgentRun> => {
  if (shouldUseMockData()) {
    const run = agentRunsMock.find((item) => item.runId === runId);
    if (!run) throw new Error("Mock Agent Run not found.");
    return mockDelay({ ...run, status: "CANCELLED" });
  }

  return mapBackendAgentRun(await httpClient.post<BackendAgentRun>(ENDPOINTS.alphaTraceAgentRunCancel(runId), {}));
};

export const createDemoAgentRunAsync = async (
  payload: CreateDemoAgentRunPayload,
  delayMs?: number,
): Promise<AgentRun> => {
  if (shouldUseMockData()) {
    // Mock mode does not create a backend run; it returns a local sample run for navigation rehearsal.
    const mockRun =
      (payload.assetId ? agentRunsMock.find((run) => run.assetIds.includes(payload.assetId as string)) : undefined) ??
      agentRunsMock[0];
    if (!mockRun) {
      throw new Error("Mock Mode 暂无可用于 Demo Agent Run 的本地样例。");
    }
    return mockDelay(mockRun, delayMs);
  }

  try {
    const response = await httpClient.post<BackendAgentRun>(ENDPOINTS.alphaTraceDemoAgentRun, {
      assetId: payload.assetId,
      taskType: payload.taskType,
      question: payload.question,
      portfolioId: payload.portfolioId,
      strategyId: payload.strategyId,
    });
    return mapBackendAgentRun(response);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message)
          : "Demo Agent Run 创建失败";
    throw new Error(`Failed to create demo agent run: ${message}`);
  }
};

export const submitAgentRunAsync = async (
  payload: SubmitAgentRunPayload,
  delayMs?: number,
): Promise<AgentRun> => {
  if (shouldUseMockData()) {
    // Mock mode does not submit a real task; it returns a local sample run and leaves the submit contract dormant.
    const mockRun =
      (payload.assetId ? agentRunsMock.find((run) => run.assetIds.includes(payload.assetId as string)) : undefined) ??
      agentRunsMock[0];
    if (!mockRun) {
      throw new Error("Mock Mode 暂无可用于 Submit Agent Task 的本地样例。");
    }
    return mockDelay(mockRun, delayMs);
  }

  try {
    const response = await httpClient.post<BackendSubmitAgentRunResponse>(
      ENDPOINTS.alphaTraceSubmitAgentRun,
      {
        assetId: payload.assetId,
        portfolioId: payload.portfolioId,
        strategyId: payload.strategyId,
        taskType: payload.taskType,
        question: payload.question,
        horizon: payload.horizon ?? "medium_term",
        riskPreference: payload.riskPreference ?? "balanced",
        evidenceScope: {
          includeNews: payload.evidenceScope?.includeNews ?? true,
          includeReports: payload.evidenceScope?.includeReports ?? true,
          includeMacro: payload.evidenceScope?.includeMacro ?? true,
          includeMarketSnapshot: payload.evidenceScope?.includeMarketSnapshot ?? true,
        },
        runnerConfig: {
          runnerType: payload.runnerConfig?.runnerType ?? "stub",
          modelProvider: payload.runnerConfig?.modelProvider ?? "none",
          modelName: payload.runnerConfig?.modelName ?? "none",
          enableStreaming: payload.runnerConfig?.enableStreaming ?? true,
          extraParams: payload.runnerConfig?.extraParams ?? {},
        },
      },
      { timeoutMs: AGENT_RUN_SUBMIT_TIMEOUT_MS },
    );
    return mapBackendAgentRun(response.run);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message)
          : "Agent task submit failed";
    throw new Error(`Failed to submit agent task: ${message}`);
  }
};

export const getAgentRunnerStatusAsync = async (): Promise<AgentRunnerStatusItem[]> => {
  if (shouldUseMockData()) {
    return [
      {
        runnerType: "stub",
        executionMode: "in_process",
        executionPolicyReason: "Mock mode uses in-process sample data.",
        capabilities: {
          supportedTaskTypes: ["single_asset_analysis"],
          supportsStreaming: false,
          supportsEvidence: false,
          supportsPortfolioContext: false,
          supportsExternalTools: false,
          productionReady: false,
          notes: "Mock sample data only.",
        },
        enabled: true,
        available: true,
        status: "ready",
        message: "Mock mode uses local sample AgentRun data.",
      },
      {
        runnerType: "qwen",
        executionMode: "in_process",
        executionPolicyReason: "Qwen real runner is not called in Mock Mode.",
        capabilities: {
          supportedTaskTypes: ["single_asset_analysis", "portfolio_diagnosis"],
          supportsStreaming: true,
          supportsEvidence: true,
          supportsPortfolioContext: true,
          supportsExternalTools: true,
          productionReady: false,
          notes: "Real API mode only.",
        },
        enabled: false,
        available: false,
        status: "mock",
        message: "Qwen real runner is not called in Mock Mode.",
      },
      {
        runnerType: "tradingagents",
        executionMode: "subprocess",
        executionPolicyReason: "TradingAgents PoC uses subprocess isolation in Real API mode.",
        capabilities: {
          supportedTaskTypes: ["single_asset_analysis"],
          supportsStreaming: true,
          supportsEvidence: true,
          supportsPortfolioContext: false,
          supportsExternalTools: true,
          productionReady: false,
          notes: "Real API PoC only.",
        },
        enabled: false,
        available: false,
        status: "mock",
        message: "TradingAgents PoC requires Real API mode and local backend 8812.",
      },
      {
        runnerType: "langalpha",
        executionMode: "external_disabled",
        executionPolicyReason: "LangAlpha is design-only.",
        capabilities: {
          supportedTaskTypes: [],
          supportsStreaming: false,
          supportsEvidence: false,
          supportsPortfolioContext: false,
          supportsExternalTools: false,
          productionReady: false,
          notes: "Design-only.",
        },
        enabled: false,
        available: false,
        status: "design_only",
        message: "LangAlpha is design-only.",
      },
    ];
  }

  const response = await httpClient.get<BackendAgentRunnerStatusResponse>(
    ENDPOINTS.alphaTraceAgentRunnerStatus,
    { timeoutMs: 5000 },
  );
  return response.runners;
};

export const getAgentRunnerCapabilitiesAsync = async (
  params: { taskType?: string; requestedRunnerType?: string } = {},
): Promise<AgentRunnerCapabilitiesResponse> => {
  if (shouldUseMockData()) {
    return mockDelay({
      capabilities: [
        {
          runnerType: "stub",
          executionMode: "in_process",
          supportedTaskTypes: ["single_asset_analysis"],
          supportsStreaming: false,
          supportsEvidence: false,
          supportsPortfolioContext: false,
          supportsExternalTools: false,
          productionReady: false,
          notes: "Mock sample data only.",
        },
        {
          runnerType: "qwen",
          executionMode: "in_process",
          supportedTaskTypes: ["single_asset_analysis", "portfolio_diagnosis"],
          supportsStreaming: true,
          supportsEvidence: true,
          supportsPortfolioContext: true,
          supportsExternalTools: true,
          productionReady: false,
          notes: "Default MVP research runner.",
        },
        {
          runnerType: "tradingagents",
          executionMode: "subprocess",
          supportedTaskTypes: ["single_asset_analysis"],
          supportsStreaming: true,
          supportsEvidence: true,
          supportsPortfolioContext: false,
          supportsExternalTools: true,
          productionReady: false,
          notes: "PoC only.",
        },
      ],
      recommendation: {
        requestedRunnerType: params.requestedRunnerType ?? null,
        recommendedRunnerType: params.requestedRunnerType ?? "qwen",
        taskType: params.taskType ?? "single_asset_analysis",
        supported: true,
        reason: "Mock Mode preview mirrors the AlphaTrace capability matrix.",
      },
      message: "Mock runner capability preview.",
    });
  }

  return httpClient.get<AgentRunnerCapabilitiesResponse>(ENDPOINTS.alphaTraceAgentRunnerCapabilities, {
    params: {
      taskType: params.taskType,
      requestedRunnerType: params.requestedRunnerType,
    },
    timeoutMs: 5000,
  });
};

export const getAgentRuntimeLogsAsync = async (limit = 400): Promise<AgentRuntimeLogResponse> => {
  if (shouldUseMockData()) {
    return mockDelay({
      path: "mock",
      exists: false,
      limit,
      truncated: false,
      lines: [],
      message: "Mock Mode does not expose backend runtime logs.",
    });
  }

  return httpClient.get<AgentRuntimeLogResponse>(ENDPOINTS.alphaTraceAgentRuntimeLogs, {
    params: { limit },
    timeoutMs: 5000,
  });
};

export const getAgentWorkerArtifactsAsync = async (
  runId: string,
  logLimit = 200,
  eventLimit = 200,
): Promise<AgentWorkerArtifactsResponse> => {
  if (shouldUseMockData()) {
    return mockDelay({
      runId,
      workerRoot: "mock",
      workDir: "mock",
      exists: false,
      files: {},
      stdoutLines: [],
      stderrLines: [],
      events: [],
      result: null,
      message: "Mock Mode does not expose worker artifacts.",
    });
  }

  return httpClient.get<AgentWorkerArtifactsResponse>(ENDPOINTS.alphaTraceAgentRunWorkerArtifacts(runId), {
    params: { logLimit, eventLimit },
    timeoutMs: 5000,
  });
};

export const getAgentRuntimeWorkersAsync = async (): Promise<AgentRuntimeWorkersResponse> => {
  if (shouldUseMockData()) {
    return mockDelay({
      workerType: "subprocess",
      activeCount: 0,
      registeredCount: 0,
      workers: [],
    });
  }

  return httpClient.get<AgentRuntimeWorkersResponse>(ENDPOINTS.alphaTraceAgentRuntimeWorkers, {
    timeoutMs: 5000,
  });
};
