export const RESEARCH_RUN_TYPES = [
  "market_scan",
  "asset_research",
  "etf_screening",
  "fund_screening",
  "strategy_generation",
  "portfolio_analysis",
  "risk_review",
  "trade_plan_generation",
  "post_trade_review",
] as const;

export type ResearchRunType = (typeof RESEARCH_RUN_TYPES)[number];

export const RESEARCH_ARTIFACT_TYPES = [
  "market_brief",
  "asset_research_report",
  "etf_comparison_table",
  "fund_comparison_table",
  "strategy_card",
  "portfolio_exposure_report",
  "risk_review_report",
  "trade_plan",
  "post_trade_review",
  "evidence_bundle",
] as const;

export type ResearchArtifactType = (typeof RESEARCH_ARTIFACT_TYPES)[number];

export const RUNTIME_AGENT_ROLES = [
  "market_analyst",
  "asset_screener",
  "bull_researcher",
  "bear_researcher",
  "quant_analyst",
  "liquidity_analyst",
  "portfolio_analyst",
  "risk_manager",
  "strategy_composer",
  "review_agent",
] as const;

export type RuntimeAgentRole = (typeof RUNTIME_AGENT_ROLES)[number];

export interface ResearchProfile {
  profileId: string;
  name: string;
  runTypes: ResearchRunType[];
  defaultHorizon?: "short_term" | "medium_term" | "long_term";
  defaultUniverse?: string[];
  evidencePolicy?: string;
}

export interface StrategyProfile {
  profileId: string;
  name: string;
  runTypes: ResearchRunType[];
  style?: string;
  constraints?: string[];
  reviewPolicy?: string;
}

export interface RuntimeAgentTeamSpec {
  teamId: string;
  name: string;
  roles: RuntimeAgentRole[];
  runTypes: ResearchRunType[];
}

export interface DataSnapshot {
  snapshotId: string;
  sourceId: string;
  sourceName: string;
  capturedAt: string;
  apiName?: string;
  payloadRef?: string;
  metadata?: Record<string, unknown>;
}

export interface DecisionTrace {
  traceId: string;
  runId: string;
  artifactIds: string[];
  evidenceIds: string[];
  reviewerStatus: "pending" | "approved" | "rejected" | "needs_revision";
  summary?: string;
  createdAt: string;
}
