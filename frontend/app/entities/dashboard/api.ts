import { agentRunsMock } from "@/mocks/agent-runs.mock";
import { assetsMock } from "@/mocks/assets.mock";
import { dataSourcesMock } from "@/mocks/data-sources.mock";
import { decisionsMock } from "@/mocks/decisions.mock";
import { evidenceMock } from "@/mocks/evidence.mock";
import { leaderboardMock } from "@/mocks/leaderboard.mock";
import { portfolioMock } from "@/mocks/portfolio.mock";
import { strategiesMock } from "@/mocks/strategies.mock";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";
import { mockDelay } from "@/shared/api/mock-delay";

export interface DashboardCounts {
  assets: number;
  evidence: number;
  agentRuns: number;
  strategies: number;
  portfolios: number;
  decisions: number;
  dataSources: number;
  leaderboard: number;
}

export interface DashboardSummary {
  counts: DashboardCounts;
  source?: string;
}

export interface FundTrendPoint {
  date: string;
  value: number;
}

export interface FundTrendSeries {
  code: string;
  name: string;
  assetId?: string | null;
  assetType: string;
  valueField: string;
  points: FundTrendPoint[];
}

export interface FundTrendsResponse {
  status: string;
  source: string;
  tableName: string;
  message?: string | null;
  series: FundTrendSeries[];
}

const mockDashboardSummary = (): DashboardSummary => ({
  counts: {
    assets: assetsMock.length,
    evidence: evidenceMock.length,
    agentRuns: agentRunsMock.length,
    strategies: strategiesMock.length,
    portfolios: portfolioMock.length,
    decisions: decisionsMock.length,
    dataSources: dataSourcesMock.length,
    leaderboard: leaderboardMock.length,
  },
  source: "mock",
});

export const getDashboardSummaryAsync = async (delayMs?: number): Promise<DashboardSummary> => {
  if (shouldUseMockData()) {
    return mockDelay(mockDashboardSummary(), delayMs);
  }

  return httpClient.get<DashboardSummary>(ENDPOINTS.alphaTraceDashboardSummary, { timeoutMs: 8000 });
};

export const getDashboardFundTrendsAsync = (): Promise<FundTrendsResponse> =>
  httpClient.get<FundTrendsResponse>(ENDPOINTS.alphaTraceDashboardFundTrends, {
    params: { limit: 4, points: 180, etfOnly: true },
    timeoutMs: 15000,
  });
