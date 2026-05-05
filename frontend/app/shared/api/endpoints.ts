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
  alphaTraceAgentRunCancel: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/cancel`,
  alphaTraceAgentRunWorkerArtifacts: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/worker-artifacts`,
  alphaTraceAgentRunArtifacts: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/artifacts`,
  alphaTraceAgentRunMetrics: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/metrics`,
  alphaTraceAgentRunTimelineSummary: (runId = ":runId") => `/alpha-trace/agent-runs/${runId}/timeline-summary`,
  alphaTraceAgentRunnerStatus: "/alpha-trace/agent-runs/runners/status",
  alphaTraceAgentRunnerCapabilities: "/alpha-trace/agent-runs/runners/capabilities",
  alphaTraceAgentRuntimeArchitecture: "/alpha-trace/agent-runs/runtime/architecture",
  alphaTraceAgentRuntimeArchitectureReview: "/alpha-trace/agent-runs/runtime/architecture-review",
  alphaTraceAgentRuntimeModuleBoundaries: "/alpha-trace/agent-runs/runtime/module-boundaries",
  alphaTraceAgentRuntimeExternalComponents: "/alpha-trace/agent-runs/runtime/external-components",
  alphaTraceAgentRuntimeIntegrationDecisions: "/alpha-trace/agent-runs/runtime/integration-decisions",
  alphaTraceAgentRuntimeDataCenter: "/alpha-trace/agent-runs/runtime/data-center",
  alphaTraceAgentRuntimeClickHouseSchemaCatalog: "/alpha-trace/agent-runs/runtime/clickhouse-schema-catalog",
  alphaTraceAgentRuntimeSkills: "/alpha-trace/agent-runs/runtime/skills",
  alphaTraceAgentRuntimeAgentSkillBindings: "/alpha-trace/agent-runs/runtime/agent-skill-bindings",
  alphaTraceAgentRuntimeReadiness: "/alpha-trace/agent-runs/runtime/readiness",
  alphaTraceAgentRuntimeConfig: "/alpha-trace/agent-runs/runtime/config",
  alphaTraceAgentRuntimeModelProviders: "/alpha-trace/agent-runs/runtime/model-providers",
  alphaTraceAgentRuntimeOrchestrators: "/alpha-trace/agent-runs/runtime/orchestrators",
  alphaTraceAgentRuntimeTaskSpecs: "/alpha-trace/agent-runs/runtime/task-specs",
  alphaTraceAgentRuntimeArtifactCatalog: "/alpha-trace/agent-runs/runtime/artifacts/catalog",
  alphaTraceAgentRuntimeLogs: "/alpha-trace/agent-runs/runtime/logs",
  alphaTraceAgentRuntimeWorkers: "/alpha-trace/agent-runs/runtime/workers",
  alphaTraceDemoAgentRun: "/alpha-trace/agent-runs/demo",
  alphaTraceSubmitAgentRun: "/alpha-trace/agent-runs/submit",
  alphaTraceEvidence: "/alpha-trace/evidence",
  alphaTraceEvidenceDetail: (evidenceId = ":evidenceId") => `/alpha-trace/evidence/${evidenceId}`,
  alphaTraceEvidenceSearch: "/alpha-trace/evidence/search",
  alphaTraceAssets: "/alpha-trace/assets",
  alphaTraceAssetDetail: (assetId = ":assetId") => `/alpha-trace/assets/${assetId}`,
  alphaTraceAssetEvidence: (assetId = ":assetId") => `/alpha-trace/assets/${assetId}/evidence`,
  alphaTraceMarketQuote: (assetId = ":assetId") => `/alpha-trace/market-data/assets/${assetId}/quote`,
  alphaTraceMarketSnapshot: (assetId = ":assetId") => `/alpha-trace/market-data/assets/${assetId}/snapshot`,
  alphaTraceMarketKlines: (assetId = ":assetId") => `/alpha-trace/market-data/assets/${assetId}/klines`,
  alphaTraceMarketIndicators: (assetId = ":assetId") => `/alpha-trace/market-data/assets/${assetId}/indicators`,
  alphaTraceStrategies: "/alpha-trace/strategies",
  alphaTraceStrategyDetail: (strategyId = ":strategyId") => `/alpha-trace/strategies/${strategyId}`,
  alphaTraceStrategyAssets: (strategyId = ":strategyId") => `/alpha-trace/strategies/${strategyId}/assets`,
  alphaTraceStrategyEvidence: (strategyId = ":strategyId") => `/alpha-trace/strategies/${strategyId}/evidence`,
  alphaTraceLeaderboard: "/alpha-trace/leaderboard",
  alphaTracePortfolios: "/alpha-trace/portfolios",
  alphaTracePortfolioDetail: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}`,
  alphaTracePortfolioHoldings: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/holdings`,
  alphaTracePortfolioRecommendations: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/recommendations`,
  alphaTracePortfolioAssets: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/assets`,
  alphaTracePortfolioStrategies: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/strategies`,
  alphaTracePortfolioDecisions: (portfolioId = ":portfolioId") => `/alpha-trace/portfolios/${portfolioId}/decisions`,
  alphaTraceDecisions: "/alpha-trace/decisions",
  alphaTraceDecisionDetail: (decisionId = ":decisionId") => `/alpha-trace/decisions/${decisionId}`,
  alphaTraceDecisionEvidence: (decisionId = ":decisionId") => `/alpha-trace/decisions/${decisionId}/evidence`,
  alphaTraceDecisionAgentRun: (decisionId = ":decisionId") => `/alpha-trace/decisions/${decisionId}/agent-run`,
  alphaTraceDataSources: "/alpha-trace/data-sources",
  alphaTraceDataApiCatalog: "/alpha-trace/data-sources/api-catalog",
  alphaTraceDataSourceFileImports: "/alpha-trace/data-sources/file-imports",
  alphaTraceDataSourceImportBatches: "/alpha-trace/data-sources/file-imports/imports",
  alphaTraceDataSourceImportRows: (importId = ":importId") => `/alpha-trace/data-sources/file-imports/imports/${importId}/rows`,
  alphaTraceDataSourceLocalImportFiles: "/alpha-trace/data-sources/file-imports/local-files",
  alphaTraceDataSourceLocalImport: "/alpha-trace/data-sources/file-imports/local-files/import",
  alphaTraceDataSourceDetail: (sourceId = ":sourceId") => `/alpha-trace/data-sources/${sourceId}`,
  alphaTraceDataSourceTasks: (sourceId = ":sourceId") => `/alpha-trace/data-sources/${sourceId}/tasks`,
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
export const ALPHA_TRACE_AGENT_RUN_CANCEL = ENDPOINTS.alphaTraceAgentRunCancel;
export const ALPHA_TRACE_AGENT_RUN_WORKER_ARTIFACTS = ENDPOINTS.alphaTraceAgentRunWorkerArtifacts;
export const ALPHA_TRACE_AGENT_RUN_ARTIFACTS = ENDPOINTS.alphaTraceAgentRunArtifacts;
export const ALPHA_TRACE_AGENT_RUN_METRICS = ENDPOINTS.alphaTraceAgentRunMetrics;
export const ALPHA_TRACE_AGENT_RUN_TIMELINE_SUMMARY = ENDPOINTS.alphaTraceAgentRunTimelineSummary;
export const ALPHA_TRACE_AGENT_RUNNER_STATUS = ENDPOINTS.alphaTraceAgentRunnerStatus;
export const ALPHA_TRACE_AGENT_RUNNER_CAPABILITIES = ENDPOINTS.alphaTraceAgentRunnerCapabilities;
export const ALPHA_TRACE_AGENT_RUNTIME_ARCHITECTURE = ENDPOINTS.alphaTraceAgentRuntimeArchitecture;
export const ALPHA_TRACE_AGENT_RUNTIME_ARCHITECTURE_REVIEW = ENDPOINTS.alphaTraceAgentRuntimeArchitectureReview;
export const ALPHA_TRACE_AGENT_RUNTIME_MODULE_BOUNDARIES = ENDPOINTS.alphaTraceAgentRuntimeModuleBoundaries;
export const ALPHA_TRACE_AGENT_RUNTIME_EXTERNAL_COMPONENTS = ENDPOINTS.alphaTraceAgentRuntimeExternalComponents;
export const ALPHA_TRACE_AGENT_RUNTIME_INTEGRATION_DECISIONS = ENDPOINTS.alphaTraceAgentRuntimeIntegrationDecisions;
export const ALPHA_TRACE_AGENT_RUNTIME_DATA_CENTER = ENDPOINTS.alphaTraceAgentRuntimeDataCenter;
export const ALPHA_TRACE_AGENT_RUNTIME_CLICKHOUSE_SCHEMA_CATALOG = ENDPOINTS.alphaTraceAgentRuntimeClickHouseSchemaCatalog;
export const ALPHA_TRACE_AGENT_RUNTIME_SKILLS = ENDPOINTS.alphaTraceAgentRuntimeSkills;
export const ALPHA_TRACE_AGENT_RUNTIME_AGENT_SKILL_BINDINGS = ENDPOINTS.alphaTraceAgentRuntimeAgentSkillBindings;
export const ALPHA_TRACE_AGENT_RUNTIME_READINESS = ENDPOINTS.alphaTraceAgentRuntimeReadiness;
export const ALPHA_TRACE_AGENT_RUNTIME_CONFIG = ENDPOINTS.alphaTraceAgentRuntimeConfig;
export const ALPHA_TRACE_AGENT_RUNTIME_MODEL_PROVIDERS = ENDPOINTS.alphaTraceAgentRuntimeModelProviders;
export const ALPHA_TRACE_AGENT_RUNTIME_ORCHESTRATORS = ENDPOINTS.alphaTraceAgentRuntimeOrchestrators;
export const ALPHA_TRACE_AGENT_RUNTIME_TASK_SPECS = ENDPOINTS.alphaTraceAgentRuntimeTaskSpecs;
export const ALPHA_TRACE_AGENT_RUNTIME_ARTIFACT_CATALOG = ENDPOINTS.alphaTraceAgentRuntimeArtifactCatalog;
export const ALPHA_TRACE_AGENT_RUNTIME_LOGS = ENDPOINTS.alphaTraceAgentRuntimeLogs;
export const ALPHA_TRACE_AGENT_RUNTIME_WORKERS = ENDPOINTS.alphaTraceAgentRuntimeWorkers;
export const ALPHA_TRACE_DEMO_AGENT_RUN = ENDPOINTS.alphaTraceDemoAgentRun;
export const ALPHA_TRACE_SUBMIT_AGENT_RUN = ENDPOINTS.alphaTraceSubmitAgentRun;
export const ALPHA_TRACE_EVIDENCE = ENDPOINTS.alphaTraceEvidence;
export const ALPHA_TRACE_EVIDENCE_DETAIL = ENDPOINTS.alphaTraceEvidenceDetail;
export const ALPHA_TRACE_EVIDENCE_SEARCH = ENDPOINTS.alphaTraceEvidenceSearch;
export const ALPHA_TRACE_ASSETS = ENDPOINTS.alphaTraceAssets;
export const ALPHA_TRACE_ASSET_DETAIL = ENDPOINTS.alphaTraceAssetDetail;
export const ALPHA_TRACE_ASSET_EVIDENCE = ENDPOINTS.alphaTraceAssetEvidence;
export const ALPHA_TRACE_MARKET_QUOTE = ENDPOINTS.alphaTraceMarketQuote;
export const ALPHA_TRACE_MARKET_SNAPSHOT = ENDPOINTS.alphaTraceMarketSnapshot;
export const ALPHA_TRACE_MARKET_KLINES = ENDPOINTS.alphaTraceMarketKlines;
export const ALPHA_TRACE_MARKET_INDICATORS = ENDPOINTS.alphaTraceMarketIndicators;
export const ALPHA_TRACE_STRATEGIES = ENDPOINTS.alphaTraceStrategies;
export const ALPHA_TRACE_STRATEGY_DETAIL = ENDPOINTS.alphaTraceStrategyDetail;
export const ALPHA_TRACE_STRATEGY_ASSETS = ENDPOINTS.alphaTraceStrategyAssets;
export const ALPHA_TRACE_STRATEGY_EVIDENCE = ENDPOINTS.alphaTraceStrategyEvidence;
export const ALPHA_TRACE_LEADERBOARD = ENDPOINTS.alphaTraceLeaderboard;
export const ALPHA_TRACE_PORTFOLIOS = ENDPOINTS.alphaTracePortfolios;
export const ALPHA_TRACE_PORTFOLIO_DETAIL = ENDPOINTS.alphaTracePortfolioDetail;
export const ALPHA_TRACE_PORTFOLIO_HOLDINGS = ENDPOINTS.alphaTracePortfolioHoldings;
export const ALPHA_TRACE_PORTFOLIO_RECOMMENDATIONS = ENDPOINTS.alphaTracePortfolioRecommendations;
export const ALPHA_TRACE_PORTFOLIO_ASSETS = ENDPOINTS.alphaTracePortfolioAssets;
export const ALPHA_TRACE_PORTFOLIO_STRATEGIES = ENDPOINTS.alphaTracePortfolioStrategies;
export const ALPHA_TRACE_PORTFOLIO_DECISIONS = ENDPOINTS.alphaTracePortfolioDecisions;
export const ALPHA_TRACE_DECISIONS = ENDPOINTS.alphaTraceDecisions;
export const ALPHA_TRACE_DECISION_DETAIL = ENDPOINTS.alphaTraceDecisionDetail;
export const ALPHA_TRACE_DECISION_EVIDENCE = ENDPOINTS.alphaTraceDecisionEvidence;
export const ALPHA_TRACE_DECISION_AGENT_RUN = ENDPOINTS.alphaTraceDecisionAgentRun;
export const ALPHA_TRACE_DATA_SOURCES = ENDPOINTS.alphaTraceDataSources;
export const ALPHA_TRACE_DATA_API_CATALOG = ENDPOINTS.alphaTraceDataApiCatalog;
export const ALPHA_TRACE_DATA_SOURCE_FILE_IMPORTS = ENDPOINTS.alphaTraceDataSourceFileImports;
export const ALPHA_TRACE_DATA_SOURCE_IMPORT_BATCHES = ENDPOINTS.alphaTraceDataSourceImportBatches;
export const ALPHA_TRACE_DATA_SOURCE_IMPORT_ROWS = ENDPOINTS.alphaTraceDataSourceImportRows;
export const ALPHA_TRACE_DATA_SOURCE_LOCAL_IMPORT_FILES = ENDPOINTS.alphaTraceDataSourceLocalImportFiles;
export const ALPHA_TRACE_DATA_SOURCE_LOCAL_IMPORT = ENDPOINTS.alphaTraceDataSourceLocalImport;
export const ALPHA_TRACE_DATA_SOURCE_DETAIL = ENDPOINTS.alphaTraceDataSourceDetail;
export const ALPHA_TRACE_DATA_SOURCE_TASKS = ENDPOINTS.alphaTraceDataSourceTasks;
