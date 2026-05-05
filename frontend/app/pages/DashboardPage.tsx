import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAssetsAsync } from "@/entities/asset/api";
import { listAgentRunsAsync } from "@/entities/agent/api";
import { listLeaderboardAsync, listStrategiesAsync } from "@/entities/strategy/api";
import { listEvidenceAsync } from "@/entities/evidence/api";
import { listDecisionsAsync } from "@/entities/decision/api";
import { listPortfoliosAsync } from "@/entities/portfolio/api";
import { listDataSourcesAsync } from "@/entities/data-source/api";
import { navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

interface DashboardPageProps {
  onNavigate?: (path: string) => void;
}

interface DashboardCounts {
  assets: number;
  evidence: number;
  agentRuns: number;
  strategies: number;
  portfolios: number;
  decisions: number;
  dataSources: number;
  leaderboard: number;
}

const EMPTY_COUNTS: DashboardCounts = {
  assets: 0,
  evidence: 0,
  agentRuns: 0,
  strategies: 0,
  portfolios: 0,
  decisions: 0,
  dataSources: 0,
  leaderboard: 0,
};

const FLOW = [
  { en: "Sources", zh: "数据源", path: "/data-sources" },
  { en: "Evidence", zh: "证据", path: "/evidence" },
  { en: "Assets", zh: "资产", path: "/assets" },
  { en: "Agents", zh: "Agent", path: "/agent-lab" },
  { en: "Strategies", zh: "策略", path: "/strategy-lab" },
  { en: "Attribution", zh: "归因", path: "/decision-attribution" },
  { en: "Portfolio", zh: "组合", path: "/portfolio" },
  { en: "Rank", zh: "排行", path: "/leaderboard" },
];

const MOBILE_SHORTCUTS = [
  { en: "ETF / Index", zh: "ETF / 指数", metric: "510300.SH", path: "/assets/asset_etf_510300" },
  { en: "Funds", zh: "基金", metric: "000001.OF", path: "/assets/asset_fund_000001" },
  { en: "Futures", zh: "期货", metric: "IF MAIN", path: "/assets/asset_future_if_main" },
  { en: "Agents", zh: "Agent", metric: "Qwen", path: "/agent-lab" },
];

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [countsError, setCountsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCounts(true);
    setCountsError(null);

    const safeCount = async (loader: () => Promise<unknown[]>): Promise<number> => {
      try {
        return (await loader()).length;
      } catch (error) {
        console.warn("[Dashboard] Failed to load dashboard count:", error);
        return 0;
      }
    };

    const loadCounts = async () => {
      const [assets, evidence, agentRuns, strategies, portfolios, decisions, dataSources, leaderboard] = await Promise.all([
        safeCount(() => listAssetsAsync({ limit: 100 })),
        safeCount(() => listEvidenceAsync({ limit: 100 })),
        safeCount(() => listAgentRunsAsync({ limit: 100 })),
        safeCount(() => listStrategiesAsync({ limit: 100 })),
        safeCount(() => listPortfoliosAsync({ limit: 100 })),
        safeCount(() => listDecisionsAsync({ limit: 100 })),
        safeCount(() => listDataSourcesAsync({ limit: 100 })),
        safeCount(() => listLeaderboardAsync({ limit: 100 })),
      ]);

      if (cancelled) return;
      setCounts({ assets, evidence, agentRuns, strategies, portfolios, decisions, dataSources, leaderboard });
      setIsLoadingCounts(false);
    };

    loadCounts().catch((error) => {
      if (cancelled) return;
      setCountsError(error instanceof Error ? error.message : "Failed to load dashboard statistics.");
      setIsLoadingCounts(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    navigateTo(path);
  };

  const stats = useMemo(
    () => [
      { label: isZh ? "资产" : "Assets", value: counts.assets },
      { label: isZh ? "证据" : "Evidence", value: counts.evidence },
      { label: "Agent Runs", value: counts.agentRuns },
      { label: isZh ? "策略" : "Strategies", value: counts.strategies },
      { label: isZh ? "组合" : "Portfolios", value: counts.portfolios },
      { label: isZh ? "决策" : "Decisions", value: counts.decisions },
      { label: isZh ? "数据源" : "Sources", value: counts.dataSources },
      { label: isZh ? "排行" : "Rank", value: counts.leaderboard },
    ],
    [counts, isZh],
  );

  const label = (item: { en: string; zh: string }) => (isZh ? item.zh : item.en);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <ResearchWorkspaceNav />

      <Card className="md:hidden overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isZh ? "市场" : "Market"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-slate-950 p-4 text-white">
            <p className="text-2xl font-semibold">AlphaTrace</p>
            <div className="mt-4 h-16 rounded-md bg-white/10 p-2">
              <div className="flex h-full items-end gap-1">
                {[32, 48, 40, 58, 54, 68, 62, 76, 72, 84].map((height, index) => (
                  <span key={index} className="flex-1 rounded-sm bg-emerald-300/80" style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {MOBILE_SHORTCUTS.map((item) => (
              <button
                key={item.path}
                className="rounded-md border p-3 text-left transition hover:bg-muted/60"
                onClick={() => handleNavigate(item.path)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{label(item)}</p>
                  <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{item.metric}</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-2xl">{isLoadingCounts ? "..." : item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {countsError ? <p className="text-xs text-destructive">Dashboard statistics unavailable: {countsError}</p> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isZh ? "流程" : "Flow"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {FLOW.map((step, index) => (
              <div key={step.path} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" className="font-medium hover:text-primary" onClick={() => handleNavigate(step.path)}>
                    {label(step)}
                  </button>
                  <span className="text-muted-foreground">{index + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isZh ? "快捷入口" : "Shortcuts"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => handleNavigate("/assets")}>{isZh ? "资产" : "Assets"}</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/agent-lab")}>Agent</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/evidence")}>{isZh ? "证据" : "Evidence"}</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/strategy-lab")}>{isZh ? "策略" : "Strategies"}</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/portfolio")}>{isZh ? "组合" : "Portfolio"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
