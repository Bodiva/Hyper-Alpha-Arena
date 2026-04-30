export const ENDPOINTS = {
  assets: "/assets",
  assetDetail: (assetId = ":assetId") => `/assets/${assetId}`,

  evidence: "/evidence",
  evidenceDetail: (evidenceId = ":evidenceId") => `/evidence/${evidenceId}`,
  evidenceUsedBy: (evidenceId = ":evidenceId") => `/evidence/${evidenceId}/used-by`,

  agentRuns: "/agent-runs",
  agentRunDetail: (runId = ":runId") => `/agent-runs/${runId}`,
  agentRunEvents: (runId = ":runId") => `/agent-runs/${runId}/events`,
  agentRunEventStream: (runId = ":runId") => `/agent-runs/${runId}/events/stream`,
  agentRunReports: (runId = ":runId") => `/agent-runs/${runId}/reports`,
  agentRunEvidence: (runId = ":runId") => `/agent-runs/${runId}/evidence`,
  agentRunDecision: (runId = ":runId") => `/agent-runs/${runId}/decision`,

  decisions: "/decisions",
  decisionDetail: (decisionId = ":decisionId") => `/decisions/${decisionId}`,

  portfolios: "/portfolios",
  portfolioDetail: (portfolioId = ":portfolioId") => `/portfolios/${portfolioId}`,

  strategies: "/strategies",
  strategyDetail: (strategyId = ":strategyId") => `/strategies/${strategyId}`,
  leaderboard: "/leaderboard",

  dataSources: "/data-sources",
  dataSourceDetail: (sourceId = ":sourceId") => `/data-sources/${sourceId}`,
  dataSourceTasks: (sourceId = ":sourceId") => `/data-sources/${sourceId}/tasks`,

  settings: "/settings",

  alphaTraceAgentRuns: "/alpha-trace/agent-runs",
  alphaTraceAgentRunDetail: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}`,
  alphaTraceAgentRunEvents: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/events`,
  alphaTraceAgentRunEventsStream: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/events/stream`,
  alphaTraceAgentRunReports: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/reports`,
  alphaTraceAgentRunEvidence: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/evidence`,
  alphaTraceAgentRunDecision: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/decision`,
  alphaTraceDemoAgentRun: "/alpha-trace/agent-runs/demo",
  alphaTraceSubmitAgentRun: "/alpha-trace/agent-runs/submit",
  alphaTraceEvidence: "/alpha-trace/evidence",
  alphaTraceEvidenceDetail: (evidenceId = ":evidenceId") => `/alpha-trace/evidence/${evidenceId}`,
  alphaTraceEvidenceSearch: "/alpha-trace/evidence/search",
  alphaTraceAssets: "/alpha-trace/assets",
  alphaTraceAssetDetail: (assetId = ":assetId") => `/alpha-trace/assets/${assetId}`,
  alphaTraceAssetEvidence: (assetId = ":assetId") => `/alpha-trace/assets/${assetId}/evidence`,
  alphaTraceStrategies: "/alpha-trace/strategies",
  alphaTraceStrategyDetail: (strategyId = ":strategyId") => `/alpha-trace/strategies/${strategyId}`,
  alphaTraceStrategyAssets: (strategyId = ":strategyId") => `/alpha-trace/strategies/${strategyId}/assets`,
  alphaTraceStrategyEvidence: (strategyId = ":strategyId") => `/alpha-trace/strategies/${strategyId}/evidence`,
  alphaTracePortfolios: "/alpha-trace/portfolios",
  alphaTracePortfolioDetail: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}`,
  alphaTracePortfolioHoldings: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/holdings`,
  alphaTracePortfolioRecommendations: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/recommendations`,
  alphaTracePortfolioAssets: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/assets`,
  alphaTracePortfolioStrategies: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/strategies`,
  alphaTracePortfolioDecisions: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/decisions`,
} as const;

export const ASSETS = ENDPOINTS.assets;
export const ASSET_DETAIL = ENDPOINTS.assetDetail;

export const EVIDENCE = ENDPOINTS.evidence;
export const EVIDENCE_DETAIL = ENDPOINTS.evidenceDetail;
export const EVIDENCE_USED_BY = ENDPOINTS.evidenceUsedBy;

export const AGENT_RUNS = ENDPOINTS.agentRuns;
export const AGENT_RUN_DETAIL = ENDPOINTS.agentRunDetail;
export const AGENT_RUN_EVENTS = ENDPOINTS.agentRunEvents;
export const AGENT_RUN_EVENT_STREAM = ENDPOINTS.agentRunEventStream;
export const AGENT_RUN_REPORTS = ENDPOINTS.agentRunReports;
export const AGENT_RUN_EVIDENCE = ENDPOINTS.agentRunEvidence;
export const AGENT_RUN_DECISION = ENDPOINTS.agentRunDecision;

export const DECISIONS = ENDPOINTS.decisions;
export const DECISION_DETAIL = ENDPOINTS.decisionDetail;

export const PORTFOLIOS = ENDPOINTS.portfolios;
export const PORTFOLIO_DETAIL = ENDPOINTS.portfolioDetail;

export const STRATEGIES = ENDPOINTS.strategies;
export const STRATEGY_DETAIL = ENDPOINTS.strategyDetail;
export const LEADERBOARD = ENDPOINTS.leaderboard;

export const DATA_SOURCES = ENDPOINTS.dataSources;
export const DATA_SOURCE_DETAIL = ENDPOINTS.dataSourceDetail;
export const DATA_SOURCE_TASKS = ENDPOINTS.dataSourceTasks;

export const SETTINGS = ENDPOINTS.settings;

export const ALPHA_TRACE_AGENT_RUNS = ENDPOINTS.alphaTraceAgentRuns;
export const ALPHA_TRACE_AGENT_RUN_DETAIL = ENDPOINTS.alphaTraceAgentRunDetail;
export const ALPHA_TRACE_AGENT_RUN_EVENTS = ENDPOINTS.alphaTraceAgentRunEvents;
export const ALPHA_TRACE_AGENT_RUN_EVENTS_STREAM = ENDPOINTS.alphaTraceAgentRunEventsStream;
export const ALPHA_TRACE_AGENT_RUN_REPORTS = ENDPOINTS.alphaTraceAgentRunReports;
export const ALPHA_TRACE_AGENT_RUN_EVIDENCE = ENDPOINTS.alphaTraceAgentRunEvidence;
export const ALPHA_TRACE_AGENT_RUN_DECISION = ENDPOINTS.alphaTraceAgentRunDecision;
export const ALPHA_TRACE_DEMO_AGENT_RUN = ENDPOINTS.alphaTraceDemoAgentRun;
export const ALPHA_TRACE_SUBMIT_AGENT_RUN = ENDPOINTS.alphaTraceSubmitAgentRun;
export const ALPHA_TRACE_EVIDENCE = ENDPOINTS.alphaTraceEvidence;
export const ALPHA_TRACE_EVIDENCE_DETAIL = ENDPOINTS.alphaTraceEvidenceDetail;
export const ALPHA_TRACE_EVIDENCE_SEARCH = ENDPOINTS.alphaTraceEvidenceSearch;
export const ALPHA_TRACE_ASSETS = ENDPOINTS.alphaTraceAssets;
export const ALPHA_TRACE_ASSET_DETAIL = ENDPOINTS.alphaTraceAssetDetail;
export const ALPHA_TRACE_ASSET_EVIDENCE = ENDPOINTS.alphaTraceAssetEvidence;
export const ALPHA_TRACE_STRATEGIES = ENDPOINTS.alphaTraceStrategies;
export const ALPHA_TRACE_STRATEGY_DETAIL = ENDPOINTS.alphaTraceStrategyDetail;
export const ALPHA_TRACE_STRATEGY_ASSETS = ENDPOINTS.alphaTraceStrategyAssets;
export const ALPHA_TRACE_STRATEGY_EVIDENCE = ENDPOINTS.alphaTraceStrategyEvidence;
export const ALPHA_TRACE_PORTFOLIOS = ENDPOINTS.alphaTracePortfolios;
export const ALPHA_TRACE_PORTFOLIO_DETAIL = ENDPOINTS.alphaTracePortfolioDetail;
export const ALPHA_TRACE_PORTFOLIO_HOLDINGS = ENDPOINTS.alphaTracePortfolioHoldings;
export const ALPHA_TRACE_PORTFOLIO_RECOMMENDATIONS = ENDPOINTS.alphaTracePortfolioRecommendations;
export const ALPHA_TRACE_PORTFOLIO_ASSETS = ENDPOINTS.alphaTracePortfolioAssets;
export const ALPHA_TRACE_PORTFOLIO_STRATEGIES = ENDPOINTS.alphaTracePortfolioStrategies;
export const ALPHA_TRACE_PORTFOLIO_DECISIONS = ENDPOINTS.alphaTracePortfolioDecisions;
