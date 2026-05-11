export type LeaderboardSortMetric =
  | "COMPOSITE_SCORE"
  | "TOTAL_RETURN"
  | "MAX_DRAWDOWN"
  | "SHARPE"
  | "EVIDENCE_SCORE"
  | "RISK_SCORE";

export type EvidenceQualityThreshold = "GE_70" | "GE_80" | "GE_90";

export type DecisionDefaultStatus = "ALL" | "VERIFIED" | "POSITIVE" | "NEGATIVE" | "PENDING";

export type DataSourceDefaultStatus = "ALL" | "NORMAL" | "WARNING" | "FAILED";

export interface RiskThresholdConfig {
  maxSingleAssetWeightPct: number;
  maxSectorExposurePct: number;
  maxDrawdownAlertPct: number;
  volatilityAlertPct: number;
  liquidityRiskThreshold: number;
  correlationRiskThreshold: number;
  portfolioRiskScoreAlert: number;
}

export interface AgentTemplate {
  id: string;
  role: string;
  team: string;
  purpose: string;
  defaultEnabled: boolean;
  outputType: string;
  relatedTools: string[];
}

export interface ModelConfig {
  quickThinkingModel: string;
  deepThinkingModel: string;
  reportGenerationModel: string;
  riskReviewModel: string;
  fallbackModel: string;
  temperature: number;
  reasoningEffort: "low" | "medium" | "high";
  monthlyBudgetCny: number;
}

export interface DataSourcePolicyConfig {
  priority: string[];
  minQualityScore: number;
  retryStrategy: string;
  staleDataReminderHours: number;
  evidenceIngestionPolicy: string;
  lowReliabilityTagPolicy: string;
}

export interface PagePreferenceConfig {
  defaultHomePage: "Dashboard";
  theme: "SYSTEM" | "LIGHT" | "DARK";
  language: "ZH" | "EN";
  openRecentAgentRunByDefault: boolean;
  showResearchWorkspaceNav: boolean;
  showRiskWarnings: boolean;
  showEvidenceTrace: boolean;
  hideAutomationTradingOps: boolean;
}

export interface SettingsMock {
  defaultAssetTypes: string[];
  defaultMarkets: string[];
  defaultTags: string[];
  leaderboardSortMetric: LeaderboardSortMetric;
  evidenceQualityThreshold: EvidenceQualityThreshold;
  decisionDefaultStatus: DecisionDefaultStatus;
  dataSourceDefaultStatus: DataSourceDefaultStatus;
  riskThresholds: RiskThresholdConfig;
  agentTemplates: AgentTemplate[];
  modelConfig: ModelConfig;
  dataSourcePolicy: DataSourcePolicyConfig;
  pagePreferences: PagePreferenceConfig;
}

export const ASSET_TYPE_OPTIONS = ["ETF", "基金", "期货", "指数", "组合"] as const;
export const MARKET_OPTIONS = ["A股", "港股", "美股", "商品期货", "股指期货", "债券", "其他"] as const;
export const TAG_OPTIONS = ["红利", "成长", "宽基", "行业", "商品", "债券", "跨境", "低波", "宏观"] as const;

export const LEADERBOARD_SORT_OPTIONS: { label: string; value: LeaderboardSortMetric }[] = [
  { label: "综合评分", value: "COMPOSITE_SCORE" },
  { label: "累计收益", value: "TOTAL_RETURN" },
  { label: "最大回撤", value: "MAX_DRAWDOWN" },
  { label: "Sharpe", value: "SHARPE" },
  { label: "证据评分", value: "EVIDENCE_SCORE" },
  { label: "风控评分", value: "RISK_SCORE" },
];

export const EVIDENCE_QUALITY_OPTIONS: { label: string; value: EvidenceQualityThreshold }[] = [
  { label: ">= 70", value: "GE_70" },
  { label: ">= 80", value: "GE_80" },
  { label: ">= 90", value: "GE_90" },
];

export const DECISION_STATUS_OPTIONS: { label: string; value: DecisionDefaultStatus }[] = [
  { label: "全部", value: "ALL" },
  { label: "已验证", value: "VERIFIED" },
  { label: "正向", value: "POSITIVE" },
  { label: "负向", value: "NEGATIVE" },
  { label: "待验证", value: "PENDING" },
];

export const DATA_SOURCE_STATUS_OPTIONS: { label: string; value: DataSourceDefaultStatus }[] = [
  { label: "全部", value: "ALL" },
  { label: "正常", value: "NORMAL" },
  { label: "警告", value: "WARNING" },
  { label: "失败", value: "FAILED" },
];

export const settingsMock: SettingsMock = {
  defaultAssetTypes: ["ETF", "基金", "期货", "指数", "组合"],
  defaultMarkets: ["A股", "美股", "商品期货"],
  defaultTags: ["红利", "成长", "宽基", "低波", "宏观"],
  leaderboardSortMetric: "COMPOSITE_SCORE",
  evidenceQualityThreshold: "GE_80",
  decisionDefaultStatus: "VERIFIED",
  dataSourceDefaultStatus: "NORMAL",
  riskThresholds: {
    maxSingleAssetWeightPct: 30,
    maxSectorExposurePct: 45,
    maxDrawdownAlertPct: 12,
    volatilityAlertPct: 18,
    liquidityRiskThreshold: 70,
    correlationRiskThreshold: 75,
    portfolioRiskScoreAlert: 80,
  },
  agentTemplates: [
    {
      id: "template_market_analyst",
      role: "Market Analyst",
      team: "Analyst Team",
      purpose: "跟踪资产价格、成交结构和市场风格切换信号。",
      defaultEnabled: true,
      outputType: "Market Snapshot Report",
      relatedTools: ["market_data.fetch", "flow_monitor.scan"],
    },
    {
      id: "template_macro_analyst",
      role: "Macro Analyst",
      team: "Analyst Team",
      purpose: "解读宏观因子与政策变化对资产配置的影响。",
      defaultEnabled: true,
      outputType: "Macro Impact Note",
      relatedTools: ["macro_calendar.read", "policy_watch.track"],
    },
    {
      id: "template_etf_fund_analyst",
      role: "ETF / Fund Analyst",
      team: "Analyst Team",
      purpose: "评估 ETF 跟踪质量、基金风格漂移和持仓结构。",
      defaultEnabled: true,
      outputType: "Fund Profile Summary",
      relatedTools: ["fund_holding.parse", "style_exposure.analyze"],
    },
    {
      id: "template_futures_analyst",
      role: "Futures Analyst",
      team: "Analyst Team",
      purpose: "跟踪基差、期限结构、库存和主力合约变化。",
      defaultEnabled: true,
      outputType: "Futures Structure Note",
      relatedTools: ["basis_monitor.calc", "term_structure.scan"],
    },
    {
      id: "template_news_analyst",
      role: "News Analyst",
      team: "Analyst Team",
      purpose: "筛选市场新闻、公告和事件冲击证据。",
      defaultEnabled: true,
      outputType: "Event Digest",
      relatedTools: ["news_ingest.search", "announcement_extract.parse"],
    },
    {
      id: "template_bull_researcher",
      role: "Bull Researcher",
      team: "Research Team",
      purpose: "输出支持增配或进攻配置的正向论据。",
      defaultEnabled: true,
      outputType: "Bull Thesis",
      relatedTools: ["evidence_rank.score", "scenario_simulation.run"],
    },
    {
      id: "template_bear_researcher",
      role: "Bear Researcher",
      team: "Research Team",
      purpose: "识别潜在下行风险与失效假设。",
      defaultEnabled: true,
      outputType: "Bear Thesis",
      relatedTools: ["risk_event.scan", "drawdown_stress.test"],
    },
    {
      id: "template_risk_analyst",
      role: "Risk Analyst",
      team: "Risk Team",
      purpose: "评估组合风险预算、集中度和流动性风险。",
      defaultEnabled: true,
      outputType: "Risk Warning",
      relatedTools: ["risk_budget.calc", "liquidity_stress.check"],
    },
    {
      id: "template_portfolio_manager",
      role: "Portfolio Manager",
      team: "Portfolio Team",
      purpose: "整合研究结论并生成组合调仓建议。",
      defaultEnabled: true,
      outputType: "Rebalance Proposal",
      relatedTools: ["portfolio_optimizer.solve", "allocation_review.compare"],
    },
  ],
  modelConfig: {
    quickThinkingModel: "gpt-5.4-mini",
    deepThinkingModel: "gpt-5.4",
    reportGenerationModel: "gpt-5.4",
    riskReviewModel: "gpt-5.3-codex",
    fallbackModel: "gpt-5.2",
    temperature: 0.2,
    reasoningEffort: "medium",
    monthlyBudgetCny: 20000,
  },
  dataSourcePolicy: {
    priority: ["API", "THIRD_PARTY", "CRAWLER", "FILE_IMPORT", "MANUAL_UPLOAD"],
    minQualityScore: 75,
    retryStrategy: "指数退避，最多重试 3 次",
    staleDataReminderHours: 12,
    evidenceIngestionPolicy: "满足质量阈值后自动入库并打标来源",
    lowReliabilityTagPolicy: "低于阈值自动标记“低可信度”，默认不进入核心决策链",
  },
  pagePreferences: {
    defaultHomePage: "Dashboard",
    theme: "SYSTEM",
    language: "ZH",
    openRecentAgentRunByDefault: true,
    showResearchWorkspaceNav: true,
    showRiskWarnings: true,
    showEvidenceTrace: true,
    hideAutomationTradingOps: false,
  },
};
