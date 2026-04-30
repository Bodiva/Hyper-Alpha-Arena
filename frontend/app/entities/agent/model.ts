export type AgentTeam =
  | "ANALYST_TEAM"
  | "RESEARCH_TEAM"
  | "STRATEGY_TEAM"
  | "RISK_TEAM"
  | "PORTFOLIO_TEAM";

export type AgentRole =
  | "MARKET_ANALYST"
  | "MACRO_ANALYST"
  | "ETF_FUND_ANALYST"
  | "FUTURES_ANALYST"
  | "NEWS_ANALYST"
  | "FLOW_ANALYST"
  | "BULL_RESEARCHER"
  | "BEAR_RESEARCHER"
  | "RESEARCH_MANAGER"
  | "ALLOCATION_AGENT"
  | "TIMING_AGENT"
  | "STRATEGY_AGENT"
  | "DRAWDOWN_ANALYST"
  | "LIQUIDITY_ANALYST"
  | "CONCENTRATION_ANALYST"
  | "SCENARIO_ANALYST"
  | "PORTFOLIO_MANAGER";

export type AgentStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export type AgentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentRunTaskType =
  | "SINGLE_ASSET_ANALYSIS"
  | "MULTI_ASSET_COMPARISON"
  | "PORTFOLIO_DIAGNOSTIC"
  | "EVENT_IMPACT_ANALYSIS"
  | "REBALANCE_SUGGESTION";

export type ToolCallStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface Agent {
  agentId: string;
  name: string;
  role: AgentRole;
  team: AgentTeam;
  status: AgentStatus;
}

export interface ToolCall {
  callId: string;
  runId: string;
  agentId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  evidenceIds?: string[];
}

export interface AgentReport {
  reportId: string;
  runId: string;
  agentId: string;
  title: string;
  summary: string;
  createdAt: string;
}

export type AgentDecisionAction =
  | "OVERWEIGHT"
  | "UNDERWEIGHT"
  | "HOLD"
  | "WATCH"
  | "NO_ACTION";

export type AgentDecisionHorizon = "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

export interface AgentDecision {
  action: AgentDecisionAction;
  horizon: AgentDecisionHorizon;
  confidence: number;
  thesis: string;
  risks: string[];
  evidenceIds: string[];
  summary?: string;
  triggerConditions?: string[];
  invalidationConditions?: string[];
  observationIndicators?: string[];
}

export type AgentEvent =
  | {
      type: "agent.started";
      runId: string;
      agentId: string;
      timestamp: string;
    }
  | {
      type: "agent.completed";
      runId: string;
      agentId: string;
      timestamp: string;
    }
  | {
      type: "agent.failed";
      runId: string;
      agentId: string;
      error: string;
      timestamp: string;
    }
  | {
      type: "tool.called";
      runId: string;
      agentId: string;
      toolName: string;
      args: Record<string, unknown>;
      timestamp: string;
    }
  | {
      type: "tool.result";
      runId: string;
      agentId: string;
      toolName: string;
      summary: string;
      evidenceIds?: string[];
      timestamp: string;
    }
  | {
      type: "reasoning.chunk";
      runId: string;
      agentId: string;
      content: string;
      timestamp: string;
    }
  | {
      type: "report.generated";
      runId: string;
      agentId: string;
      reportId: string;
      title: string;
      timestamp: string;
    }
  | {
      type: "debate.message";
      runId: string;
      agentId: string;
      stance: "BULL" | "BEAR" | "NEUTRAL";
      content: string;
      timestamp: string;
    }
  | {
      type: "risk.warning";
      runId: string;
      agentId: string;
      level: "LOW" | "MEDIUM" | "HIGH";
      content: string;
      timestamp: string;
    }
  | {
      type: "decision.updated";
      runId: string;
      action: AgentDecisionAction;
      confidence: number;
      timestamp: string;
    };

export interface AgentRunMetrics {
  llmCalls: number;
  toolCalls: number;
  generatedReports: number;
  durationSeconds: number;
  estimatedCostUsd?: number;
}

export interface AgentRun {
  runId: string;
  name: string;
  target: string;
  taskType: AgentRunTaskType;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  status: AgentRunStatus;
  assetIds: string[];
  portfolioId?: string;
  triggeredBy: string;
  modelName?: string;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
  agents: Agent[];
  toolCalls: ToolCall[];
  reports: AgentReport[];
  events: AgentEvent[];
  evidenceIds: string[];
  finalDecision: AgentDecision;
  metrics: AgentRunMetrics;
}

export type {
  AgentRuntimeAgentState,
  AgentRuntimeEvent,
  AgentRuntimeEventPayload,
  AgentRuntimeEventType,
  AgentRuntimeSnapshot,
  AgentRuntimeStatus,
  AgentRuntimeTimelineItem,
  RuntimeTransportType,
} from "./runtime-events";
