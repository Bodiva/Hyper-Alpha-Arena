import type { AssetType } from "../asset/model";

export type StrategyType =
  | "ETF_ROTATION"
  | "FUND_SELECTION"
  | "FUTURES_TIMING"
  | "MULTI_ASSET_ALLOCATION"
  | "RULE_BASED"
  | "AGENT_GENERATED";

export type StrategyStyleCode =
  | "DIVIDEND_DEFENSIVE"
  | "GROWTH_AGGRESSIVE"
  | "MACRO_ALLOCATION"
  | "COMMODITY_CYCLE"
  | "LOW_VOL_STEADY"
  | "TREND_TIMING"
  | "MEAN_REVERSION"
  | "RISK_PARITY";

export type StrategyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export type StrategyLifecycleStatus =
  | "DRAFT"
  | "VERIFIED"
  | "RUNNING"
  | "PAUSED"
  | "ARCHIVED";

export interface StrategyRule {
  ruleId: string;
  name: string;
  expression: string;
  note?: string;
}

export interface BacktestSummary {
  startDate: string;
  endDate: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  winRate: number;
  turnover?: number;
  benchmark?: string;
  excessReturn?: number;
}

export interface Strategy {
  strategyId: string;
  name: string;
  strategyType: StrategyType;
  style: StrategyStyleCode;
  styleLabel: string;
  assetTypes: AssetType[];
  description: string;
  status: StrategyStatus;
  lifecycleStatus?: StrategyLifecycleStatus;
  ownerAgentId: string;
  backtestSummary: BacktestSummary;
  rules: StrategyRule[];
  triggerConditions?: string[];
  rebalanceFrequency?: string;
  riskConstraints?: string[];
  observationIndicators?: string[];
  applicableScenarios?: string[];
  invalidationConditions?: string[];
  majorRisks?: string[];
  relatedAssetIds?: string[];
  relatedEvidenceIds?: string[];
  relatedDecisionIds?: string[];
  relatedPortfolioIds?: string[];
}

export interface LeaderboardItem {
  rank: number;
  traderId: string;
  traderName: string;
  strategyId: string;
  strategyName: string;
  style: StrategyStyleCode;
  styleLabel: string;
  assetTypes: AssetType[];
  runMode: "BACKTEST" | "PAPER" | "LIVE";
  timeRange: "1M" | "3M" | "6M" | "1Y" | "ALL";
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  winRate: number;
  turnover: number;
  evidenceScore: number;
  riskScore: number;
  summary: string;
  strengths: string[];
  risks: string[];
}
