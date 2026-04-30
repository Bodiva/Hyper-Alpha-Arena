import type {
  AgentDecision,
  AgentDecisionAction,
  AgentDecisionHorizon,
  AgentRunMetrics,
  AgentRunStatus,
  AgentStatus,
  AgentTeam,
  ToolCallStatus,
} from "./model";

export type AgentRuntimeEventType =
  | "agent.run.started"
  | "agent.run.completed"
  | "agent.run.failed"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "tool.called"
  | "tool.result"
  | "reasoning.chunk"
  | "report.generated"
  | "debate.message"
  | "risk.warning"
  | "decision.updated"
  | "evidence.linked"
  | "metric.updated"
  | "checkpoint.created";

export type AgentRuntimeStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type RuntimeTransportType = "mock" | "sse" | "websocket";

export interface AgentRuntimeToolPayload {
  callId?: string;
  toolName: string;
  args?: Record<string, unknown>;
  status?: ToolCallStatus;
  summary?: string;
  evidenceIds?: string[];
}

export interface AgentRuntimeReportPayload {
  reportId: string;
  title: string;
  summary?: string;
}

export interface AgentRuntimeDebatePayload {
  stance: "BULL" | "BEAR" | "NEUTRAL";
  content: string;
  evidenceIds?: string[];
}

export interface AgentRuntimeRiskPayload {
  level: "LOW" | "MEDIUM" | "HIGH";
  content: string;
  evidenceIds?: string[];
}

export interface AgentRuntimeDecisionPayload extends Partial<AgentDecision> {
  action?: AgentDecisionAction;
  horizon?: AgentDecisionHorizon;
  confidence?: number;
}

export interface AgentRuntimeMetricPayload {
  metrics: Partial<AgentRunMetrics> & Record<string, number | undefined>;
}

export interface AgentRuntimeCheckpointPayload {
  checkpointId: string;
  label: string;
  summary?: string;
}

export interface AgentRuntimeErrorPayload {
  error: string;
}

export interface AgentRuntimeReasoningPayload {
  content: string;
  accumulatedLength?: number;
  sectionHint?: "market_view" | "bull_view" | "bear_view" | "risk_review" | "final_decision" | "unknown";
  streaming?: boolean;
  stepId?: string;
  dependsOn?: string[];
  progress?: number;
}

export interface AgentRuntimeEvidencePayload {
  evidenceIds: string[];
  summary?: string;
}

export type AgentRuntimeEventPayload =
  | AgentRuntimeToolPayload
  | AgentRuntimeReportPayload
  | AgentRuntimeDebatePayload
  | AgentRuntimeRiskPayload
  | AgentRuntimeDecisionPayload
  | AgentRuntimeMetricPayload
  | AgentRuntimeCheckpointPayload
  | AgentRuntimeErrorPayload
  | AgentRuntimeReasoningPayload
  | AgentRuntimeEvidencePayload
  | Record<string, never>;

export interface AgentRuntimeEvent {
  eventId: string;
  runId: string;
  type: AgentRuntimeEventType;
  timestamp: string;
  agentId?: string;
  agentName?: string;
  team?: AgentTeam;
  sequence: number;
  payload: AgentRuntimeEventPayload;
}

export interface AgentRuntimeAgentState {
  agentId: string;
  agentName: string;
  team?: AgentTeam;
  status: AgentStatus;
  lastEvent?: AgentRuntimeEvent;
  reportCount: number;
}

export interface AgentRuntimeTimelineItem {
  eventId: string;
  type: AgentRuntimeEventType;
  timestamp: string;
  agentName?: string;
  summary: string;
}

export interface AgentRuntimeSnapshot {
  runId: string;
  status: AgentRunStatus;
  transport: RuntimeTransportType;
  sequence: number;
  startedAt?: string;
  completedAt?: string;
  agents: Record<string, AgentRuntimeAgentState>;
  toolCalls: AgentRuntimeToolPayload[];
  reports: AgentRuntimeReportPayload[];
  debateMessages: AgentRuntimeDebatePayload[];
  riskWarnings: AgentRuntimeRiskPayload[];
  evidenceIds: string[];
  finalDecision?: AgentRuntimeDecisionPayload;
  metrics: Partial<AgentRunMetrics> & Record<string, number | undefined>;
  checkpoints: AgentRuntimeCheckpointPayload[];
  timeline: AgentRuntimeTimelineItem[];
  events: AgentRuntimeEvent[];
}

