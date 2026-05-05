export type EvidenceType =
  | "news"
  | "announcement"
  | "research_report"
  | "fund_quarterly_report"
  | "macro_data"
  | "market_snapshot"
  | "industry_data"
  | "user_upload"
  | "external_search"
  | "runtime_context";

export interface ExtractedField {
  field: string;
  value: string;
  confidence: number;
}

export interface Evidence {
  id: string;
  title: string;
  evidenceType: EvidenceType;
  sourceName: string;
  sourceType?: string;
  url: string;
  publishedAt: string;
  collectedAt: string;
  relatedAssetIds: string[];
  summary: string;
  qualityScore: number;
  reliabilityScore: number;
  extractedFields: ExtractedField[];
  usedByAgentRunIds: string[];
  usedByDecisionIds?: string[];
  metadata?: Record<string, unknown>;
}
