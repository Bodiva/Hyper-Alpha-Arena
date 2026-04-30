export type PortfolioRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface PortfolioPosition {
  assetId: string;
  symbol: string;
  name: string;
  quantity: number;
  weight: number;
  avgCost: number;
  latestPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface PortfolioExposure {
  dimension: string;
  name: string;
  value: number;
}

export interface PortfolioRiskMetrics {
  volatility: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  beta: number;
  var95: number;
}

export interface RebalanceSuggestion {
  assetId: string;
  action: "INCREASE" | "DECREASE" | "REPLACE" | "HOLD";
  fromWeight: number;
  toWeight: number;
  reason: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  expectedImpact?: string;
  riskImpact?: string;
  evidenceIds?: string[];
  relatedDecisionIds?: string[];
  status?: "PENDING" | "IN_REVIEW" | "APPROVED" | "DONE";
}

export interface Portfolio {
  portfolioId: string;
  name: string;
  objective: string;
  riskLevel: PortfolioRiskLevel;
  updatedAt?: string;
  status?: "ACTIVE" | "WATCH" | "REBALANCING";
  positions: PortfolioPosition[];
  exposures: PortfolioExposure[];
  riskMetrics: PortfolioRiskMetrics;
  rebalanceSuggestions: RebalanceSuggestion[];
}
