import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getDashboardFundTrendsAsync,
  getDashboardSummaryAsync,
  type DashboardCounts,
  type FundTrendSeries,
} from "@/entities/dashboard/api";
import { navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

interface DashboardPageProps {
  onNavigate?: (path: string) => void;
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

function trendAssetPath(series: FundTrendSeries) {
  if (series.assetId) {
    return `/assets/${encodeURIComponent(series.assetId)}`;
  }
  const code = series.code.replace(/^(SH|SZ)/i, "").replace(/\.(SH|SZ)$/i, "");
  const prefix = series.assetType?.toLowerCase() === "index" ? "ck_index_" : "ck_fund_";
  return `/assets/${encodeURIComponent(`${prefix}${code}`)}`;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [fundTrends, setFundTrends] = useState<FundTrendSeries[]>([]);
  const [isLoadingFundTrends, setIsLoadingFundTrends] = useState(true);
  const [fundTrendsError, setFundTrendsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCounts(true);
    setCountsError(null);

    const loadCounts = async () => {
      const summary = await getDashboardSummaryAsync();
      if (cancelled) return;
      setCounts(summary.counts);
      setIsLoadingCounts(false);
    };

    loadCounts().catch((error) => {
      if (cancelled) return;
      console.warn("[AlphaTrace] Dashboard summary unavailable", error);
      setCountsError(isZh ? "统计暂不可用" : "Statistics unavailable");
      setIsLoadingCounts(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isZh]);

  const loadFundTrends = async () => {
    setIsLoadingFundTrends(true);
    setFundTrendsError(null);
    try {
      const response = await getDashboardFundTrendsAsync();
      setFundTrends(response.series);
      if (response.status !== "completed" && response.message) {
        setFundTrendsError(response.message);
      }
    } catch (error) {
      console.error("Failed to load ClickHouse fund trends.", error);
      setFundTrendsError(isZh ? "ClickHouse ETF 走势暂不可用，请稍后重试。" : "ClickHouse ETF trends are temporarily unavailable.");
      setFundTrends([]);
    } finally {
      setIsLoadingFundTrends(false);
    }
  };

  useEffect(() => {
    void loadFundTrends();
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
      {countsError ? <p className="text-xs text-muted-foreground">{countsError}</p> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{isZh ? "ClickHouse ETF 随机走势" : "ClickHouse ETF Trends"}</CardTitle>
              <CardDescription>
                {isZh
                  ? "从理杏仁同步到 CK 的业务表随机抽样，展示近 180 个交易日收盘价。"
                  : "Random samples from Lixinger business tables in ClickHouse, last 180 trading closes."}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadFundTrends()} disabled={isLoadingFundTrends}>
              {isLoadingFundTrends ? (isZh ? "加载中" : "Loading") : (isZh ? "换一组" : "Shuffle")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fundTrendsError ? <p className="mb-3 text-xs text-destructive">{fundTrendsError}</p> : null}
          {isLoadingFundTrends ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-[180px] rounded-md border bg-muted/40" />
              ))}
            </div>
          ) : fundTrends.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {isZh ? "暂无可展示的 ETF 走势。" : "No ETF trend data available."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {fundTrends.map((series) => {
                const first = series.points[0]?.value ?? 0;
                const latest = series.points[series.points.length - 1]?.value ?? 0;
                const changePercent = first ? ((latest - first) / first) * 100 : 0;
                const isPositive = changePercent >= 0;
                return (
                  <button
                    key={series.assetId || series.code}
                    type="button"
                    className="rounded-md border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => handleNavigate(trendAssetPath(series))}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" title={series.name}>{series.name}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{series.code}</p>
                      </div>
                      <span className={isPositive ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-red-600"}>
                        {changePercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-3 h-[110px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={series.points}>
                          <YAxis domain={["dataMin", "dataMax"]} hide />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
                            formatter={(value) => [Number(value).toFixed(4), isZh ? "收盘价" : "Close"]}
                            labelFormatter={(label) => String(label)}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            dot={false}
                            strokeWidth={2}
                            stroke={isPositive ? "#059669" : "#dc2626"}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
