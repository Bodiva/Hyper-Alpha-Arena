export type DecisionAction =
  | "OVERWEIGHT"
  | "UNDERWEIGHT"
  | "HOLD"
  | "WATCH"
  | "NO_ACTION";

export type DecisionHorizon = "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

export interface DecisionExpectedOutcome {
  targetReturn: number;
  expectedMaxDrawdown: number;
  reviewDate: string;
  note: string;
}

export interface DecisionActualOutcome {
  realizedReturn: number;
  realizedMaxDrawdown: number;
  status: "PENDING" | "ACHIEVED" | "PARTIAL" | "MISSED";
  asOf: string;
  note: string;
}

export interface DecisionAttributionFactor {
  factor: string;
  contribution: number;
  explanation: string;
}

export interface DecisionMistakeReview {
  errorSource: string;
  misleadingEvidenceIds: string[];
  invalidatedAssumptions: string[];
  improvementActions: string[];
}

export interface DecisionAgentContribution {
  team: string;
  score: number;
  adoptedInsight: string;
  needsOptimization?: string;
}

export interface DecisionAttribution {
  summary: string;
  factors: DecisionAttributionFactor[];
  riskReview?: {
    correctlyIdentified: string[];
    underestimated: string[];
  };
  mistakeReview?: DecisionMistakeReview;
  agentContributions?: DecisionAgentContribution[];
  learningPoints?: string[];
}

export interface Decision {
  decisionId: string;
  runId: string;
  assetIds: string[];
  portfolioId?: string;
  action: DecisionAction;
  horizon: DecisionHorizon;
  confidence: number;
  thesis: string;
  risks: string[];
  evidenceIds: string[];
  expectedOutcome: DecisionExpectedOutcome;
  actualOutcome?: DecisionActualOutcome;
  attribution: DecisionAttribution;
  createdAt: string;
}
