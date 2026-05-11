import type { Agent, AgentReport, AgentRun, ToolCall } from "./model";
import type {
  AgentRuntimeAgentState,
  AgentRuntimeDebatePayload,
  AgentRuntimeDecisionPayload,
  AgentRuntimeEvent,
  AgentRuntimeEvidencePayload,
  AgentRuntimeMetricPayload,
  AgentRuntimeReportPayload,
  AgentRuntimeRiskPayload,
  AgentRuntimeSnapshot,
  AgentRuntimeToolPayload,
} from "./runtime-events";

const isToolPayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeToolPayload =>
  "toolName" in payload;

const isReportPayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeReportPayload =>
  "reportId" in payload && "title" in payload;

const isDebatePayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeDebatePayload =>
  "stance" in payload && "content" in payload;

const isRiskPayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeRiskPayload =>
  "level" in payload && "content" in payload;

const isDecisionPayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeDecisionPayload =>
  "action" in payload || "confidence" in payload || "thesis" in payload;

const isEvidencePayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeEvidencePayload =>
  "evidenceIds" in payload && Array.isArray(payload.evidenceIds);

const isMetricPayload = (payload: AgentRuntimeEvent["payload"]): payload is AgentRuntimeMetricPayload =>
  "metrics" in payload;

const summarizeRuntimeEvent = (event: AgentRuntimeEvent): string => {
  const agentLabel = event.agentName ?? event.agentId ?? "System";

  switch (event.type) {
    case "agent.run.started":
      return "Agent Run started";
    case "agent.run.completed":
      return "Agent Run completed";
    case "agent.run.failed":
      return `Agent Run failed${"error" in event.payload ? `: ${event.payload.error}` : ""}`;
    case "agent.started":
      return `${agentLabel} started`;
    case "agent.completed":
      return `${agentLabel} completed`;
    case "agent.failed":
      return `${agentLabel} failed${"error" in event.payload ? `: ${event.payload.error}` : ""}`;
    case "tool.called":
      return isToolPayload(event.payload) ? `${agentLabel} called ${event.payload.toolName}` : `${agentLabel} called a tool`;
    case "tool.result":
      return isToolPayload(event.payload) ? event.payload.summary ?? `${event.payload.toolName} returned` : "Tool result received";
    case "reasoning.chunk":
      return "content" in event.payload ? event.payload.content : "Reasoning updated";
    case "report.generated":
      return isReportPayload(event.payload) ? `Report generated: ${event.payload.title}` : "Report generated";
    case "debate.message":
      return isDebatePayload(event.payload) ? `${event.payload.stance}: ${event.payload.content}` : "Debate message";
    case "risk.warning":
      return isRiskPayload(event.payload) ? `${event.payload.level} risk: ${event.payload.content}` : "Risk warning";
    case "decision.updated":
      return isDecisionPayload(event.payload) ? `Decision updated${event.payload.action ? `: ${event.payload.action}` : ""}` : "Decision updated";
    case "evidence.linked":
      return isEvidencePayload(event.payload) ? `Evidence linked: ${event.payload.evidenceIds.join(", ")}` : "Evidence linked";
    case "metric.updated":
      if (isMetricPayload(event.payload)) {
        const metrics = normalizeRuntimeMetrics(event.payload.metrics);
        if (typeof metrics.totalTokens === "number") {
          return `Runtime metrics updated · tokens ${Math.round(metrics.totalTokens).toLocaleString("en-US")}`;
        }
      }
      return "Runtime metrics updated";
    case "checkpoint.created":
      return "label" in event.payload ? `Checkpoint: ${event.payload.label}` : "Checkpoint created";
    default:
      return event.type;
  }
};

const ensureAgentState = (snapshot: AgentRuntimeSnapshot, event: AgentRuntimeEvent): AgentRuntimeAgentState | undefined => {
  if (!event.agentId) return undefined;

  const existing = snapshot.agents[event.agentId];
  if (existing) {
    return existing;
  }

  const agentState: AgentRuntimeAgentState = {
    agentId: event.agentId,
    agentName: event.agentName ?? event.agentId,
    team: event.team,
    status: "IDLE",
    reportCount: 0,
  };
  snapshot.agents[event.agentId] = agentState;
  return agentState;
};

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values));

const metricNumber = (metrics: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
    }
  }
  return undefined;
};

const normalizeRuntimeMetrics = (metrics: Record<string, unknown>): AgentRuntimeSnapshot["metrics"] => {
  const promptTokens = metricNumber(metrics, [
    "promptTokens",
    "prompt_tokens",
    "inputTokens",
    "input_tokens",
    "inputTokenCount",
    "input_token_count",
  ]);
  const completionTokens = metricNumber(metrics, [
    "completionTokens",
    "completion_tokens",
    "outputTokens",
    "output_tokens",
    "outputTokenCount",
    "output_token_count",
  ]);
  const explicitTotalTokens = metricNumber(metrics, ["totalTokens", "total_tokens", "tokenCount", "token_count"]);
  const inferredTotalTokens =
    promptTokens !== undefined || completionTokens !== undefined ? (promptTokens ?? 0) + (completionTokens ?? 0) : undefined;
  const normalized: AgentRuntimeSnapshot["metrics"] = {};

  const llmCalls = metricNumber(metrics, ["llmCalls", "llm_calls", "modelCalls", "model_calls"]);
  const toolCalls = metricNumber(metrics, ["toolCalls", "tool_calls"]);
  const generatedReports = metricNumber(metrics, ["generatedReports", "generated_reports"]);
  const durationSeconds = metricNumber(metrics, ["durationSeconds", "duration_seconds"]);
  const totalTokens = explicitTotalTokens && explicitTotalTokens > 0 ? explicitTotalTokens : inferredTotalTokens;

  if (llmCalls !== undefined) normalized.llmCalls = llmCalls;
  if (toolCalls !== undefined) normalized.toolCalls = toolCalls;
  if (generatedReports !== undefined) normalized.generatedReports = generatedReports;
  if (durationSeconds !== undefined) normalized.durationSeconds = durationSeconds;
  if (promptTokens !== undefined) normalized.promptTokens = promptTokens;
  if (completionTokens !== undefined) normalized.completionTokens = completionTokens;
  if (totalTokens !== undefined) normalized.totalTokens = totalTokens;

  const estimatedCostUsd = metrics.estimatedCostUsd ?? metrics.estimated_cost_usd;
  if (typeof estimatedCostUsd === "number" && Number.isFinite(estimatedCostUsd)) {
    normalized.estimatedCostUsd = estimatedCostUsd;
  }

  return normalized;
};

export const createInitialRuntimeSnapshot = (runId: string): AgentRuntimeSnapshot => ({
  runId,
  status: "QUEUED",
  transport: "mock",
  sequence: 0,
  agents: {},
  toolCalls: [],
  reports: [],
  debateMessages: [],
  riskWarnings: [],
  evidenceIds: [],
  metrics: {},
  checkpoints: [],
  timeline: [],
  events: [],
});

export const applyRuntimeEvent = (snapshot: AgentRuntimeSnapshot, event: AgentRuntimeEvent): AgentRuntimeSnapshot => {
  const next: AgentRuntimeSnapshot = {
    ...snapshot,
    sequence: Math.max(snapshot.sequence, event.sequence),
    agents: { ...snapshot.agents },
    toolCalls: [...snapshot.toolCalls],
    reports: [...snapshot.reports],
    debateMessages: [...snapshot.debateMessages],
    riskWarnings: [...snapshot.riskWarnings],
    evidenceIds: [...snapshot.evidenceIds],
    finalDecision: snapshot.finalDecision ? { ...snapshot.finalDecision } : undefined,
    metrics: { ...snapshot.metrics },
    checkpoints: [...snapshot.checkpoints],
    timeline: [...snapshot.timeline],
    events: [...snapshot.events, event],
  };

  const agentState = ensureAgentState(next, event);
  if (agentState) {
    agentState.lastEvent = event;
  }

  switch (event.type) {
    case "agent.run.started":
      next.status = "RUNNING";
      next.startedAt = event.timestamp;
      break;
    case "agent.run.completed":
      next.status = "COMPLETED";
      next.completedAt = event.timestamp;
      break;
    case "agent.run.failed":
      next.status = "FAILED";
      next.completedAt = event.timestamp;
      break;
    case "agent.started":
      if (agentState) agentState.status = "RUNNING";
      break;
    case "agent.completed":
      if (agentState) agentState.status = "COMPLETED";
      break;
    case "agent.failed":
      if (agentState) agentState.status = "FAILED";
      break;
    case "tool.called":
      if (isToolPayload(event.payload)) {
        next.toolCalls.push({ ...event.payload, status: event.payload.status ?? "RUNNING" });
      }
      break;
    case "tool.result":
      if (isToolPayload(event.payload)) {
        const callIndex = next.toolCalls.findIndex(
          (call) => call.callId === event.payload.callId || call.toolName === event.payload.toolName,
        );
        if (callIndex >= 0) {
          next.toolCalls[callIndex] = { ...next.toolCalls[callIndex], ...event.payload, status: event.payload.status ?? "COMPLETED" };
        } else {
          next.toolCalls.push({ ...event.payload, status: event.payload.status ?? "COMPLETED" });
        }
        if (event.payload.evidenceIds) {
          next.evidenceIds = uniqueStrings([...next.evidenceIds, ...event.payload.evidenceIds]);
        }
      }
      break;
    case "report.generated":
      if (isReportPayload(event.payload)) {
        next.reports.push(event.payload);
        if (agentState) agentState.reportCount += 1;
      }
      break;
    case "debate.message":
      if (isDebatePayload(event.payload)) {
        next.debateMessages.push(event.payload);
        if (event.payload.evidenceIds) next.evidenceIds = uniqueStrings([...next.evidenceIds, ...event.payload.evidenceIds]);
      }
      break;
    case "risk.warning":
      if (isRiskPayload(event.payload)) {
        next.riskWarnings.push(event.payload);
        if (event.payload.evidenceIds) next.evidenceIds = uniqueStrings([...next.evidenceIds, ...event.payload.evidenceIds]);
      }
      break;
    case "decision.updated":
      if (isDecisionPayload(event.payload)) {
        next.finalDecision = { ...(next.finalDecision ?? {}), ...event.payload };
        if (event.payload.evidenceIds) next.evidenceIds = uniqueStrings([...next.evidenceIds, ...event.payload.evidenceIds]);
      }
      break;
    case "evidence.linked":
      if (isEvidencePayload(event.payload)) {
        next.evidenceIds = uniqueStrings([...next.evidenceIds, ...event.payload.evidenceIds]);
      }
      break;
    case "metric.updated":
      if (isMetricPayload(event.payload)) {
        next.metrics = { ...next.metrics, ...normalizeRuntimeMetrics(event.payload.metrics) };
      }
      break;
    case "checkpoint.created":
      if ("checkpointId" in event.payload && "label" in event.payload) {
        next.checkpoints.push(event.payload);
      }
      break;
    default:
      break;
  }

  next.timeline.push({
    eventId: event.eventId,
    type: event.type,
    timestamp: event.timestamp,
    agentName: event.agentName,
    summary: summarizeRuntimeEvent(event),
  });

  return next;
};

export const applyRuntimeEvents = (
  snapshot: AgentRuntimeSnapshot,
  events: AgentRuntimeEvent[],
): AgentRuntimeSnapshot => events.reduce((current, event) => applyRuntimeEvent(current, event), snapshot);

export const mapRuntimeSnapshotToAgentRun = (
  snapshot: AgentRuntimeSnapshot,
  fallbackAgentRun?: AgentRun,
): AgentRun | undefined => {
  if (!fallbackAgentRun) return undefined;

  const runtimeAgentsById = snapshot.agents;
  const agents: Agent[] = fallbackAgentRun.agents.map((agent) => {
    const runtimeAgent = runtimeAgentsById[agent.agentId];
    return runtimeAgent ? { ...agent, status: runtimeAgent.status } : agent;
  });

  const reports: AgentReport[] = snapshot.reports.length
    ? snapshot.reports.map((report) => ({
        reportId: report.reportId,
        runId: snapshot.runId,
        agentId: fallbackAgentRun.agents[0]?.agentId ?? "runtime",
        title: report.title,
        summary: report.summary ?? "Runtime generated report",
        createdAt: fallbackAgentRun.updatedAt ?? fallbackAgentRun.startedAt,
      }))
    : fallbackAgentRun.reports;

  const toolCalls: ToolCall[] = snapshot.toolCalls.length
    ? snapshot.toolCalls.map((call, index) => ({
        callId: call.callId ?? `runtime_tool_${index + 1}`,
        runId: snapshot.runId,
        agentId: fallbackAgentRun.agents[0]?.agentId ?? "runtime",
        toolName: call.toolName,
        args: call.args ?? {},
        status: call.status ?? "COMPLETED",
        startedAt: fallbackAgentRun.startedAt,
        summary: call.summary,
        evidenceIds: call.evidenceIds,
      }))
    : fallbackAgentRun.toolCalls;

  return {
    ...fallbackAgentRun,
    status: snapshot.status,
    agents,
    toolCalls,
    reports,
    evidenceIds: snapshot.evidenceIds.length ? snapshot.evidenceIds : fallbackAgentRun.evidenceIds,
    finalDecision: snapshot.finalDecision
      ? { ...fallbackAgentRun.finalDecision, ...snapshot.finalDecision }
      : fallbackAgentRun.finalDecision,
    metrics: { ...fallbackAgentRun.metrics, ...snapshot.metrics },
  };
};
