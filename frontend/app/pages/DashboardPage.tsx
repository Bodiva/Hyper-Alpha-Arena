import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAssetsAsync } from "@/entities/asset/api";
import { listAgentRunsAsync } from "@/entities/agent/api";
import { listLeaderboardAsync, listStrategiesAsync } from "@/entities/strategy/api";
import { listEvidenceAsync } from "@/entities/evidence/api";
import { listDecisionsAsync } from "@/entities/decision/api";
import { listPortfoliosAsync } from "@/entities/portfolio/api";
import { listDataSourcesAsync } from "@/entities/data-source/api";
import {
  BRAND_BADGE,
  PRODUCT_CN_FULL_NAME,
  PRODUCT_CN_SUBTITLE,
  PRODUCT_DESCRIPTION,
} from "@/shared/lib/product-branding";
import { navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

interface DashboardPageProps {
  onNavigate?: (path: string) => void;
}

interface CapabilityCard {
  title: string;
  description: string;
  path: string;
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

const WORKFLOW = [
  { title: "Data Sources", desc: "外部数据接入与同步监控", path: "/data-sources" },
  { title: "Evidence Center", desc: "证据抽取、质量评分与追溯", path: "/evidence" },
  { title: "Asset Research", desc: "资产画像、研究入口与标签筛选", path: "/assets" },
  { title: "Agent Lab", desc: "多 Agent 投研过程与工具调用", path: "/agent-lab" },
  { title: "Strategy Lab", desc: "规则策略与 Agent 生成策略实验", path: "/strategy-lab" },
  { title: "Decision Attribution", desc: "建议验证、归因与复盘学习", path: "/decision-attribution" },
  { title: "Portfolio Workspace", desc: "组合配置、暴露与调仓建议", path: "/portfolio" },
  { title: "Leaderboard", desc: "多策略量化结果对比中心", path: "/leaderboard" },
];

const CAPABILITIES: CapabilityCard[] = [
  { title: "外部数据接入", description: "管理 API、爬虫、文件导入和同步状态", path: "/data-sources" },
  { title: "证据链追踪", description: "从来源到证据再到决策的可追溯链路", path: "/evidence" },
  { title: "多 Agent 投研", description: "分析、辩论、风险提示和决策生成", path: "/agent-lab" },
  { title: "策略实验室", description: "ETF 轮动、基金筛选、期货择时、多资产配置", path: "/strategy-lab" },
  { title: "组合工作台", description: "持仓、暴露、风险预算和调仓建议", path: "/portfolio" },
  { title: "决策归因", description: "建议、证据、结果与错误复盘闭环", path: "/decision-attribution" },
  { title: "多策略排行榜", description: "多 AI 交易员 / 多策略量化对比", path: "/leaderboard" },
];

const MOBILE_MARKET_VIEWS = [
  {
    title: "ETF / 指数观察",
    description: "宽基、行业和主题 ETF 的研究入口",
    metric: "510300.SH",
    path: "/assets/asset_etf_510300",
  },
  {
    title: "基金净值跟踪",
    description: "基金风格、回撤和组合适配观察",
    metric: "000001.OF",
    path: "/assets/asset_fund_000001",
  },
  {
    title: "期货结构观察",
    description: "趋势、持仓量、期限结构和风险提示",
    metric: "IF 主连",
    path: "/assets/asset_future_if_main",
  },
  {
    title: "Agent 观点",
    description: "进入 Agent Lab 查看投研过程",
    metric: "Qwen Runtime",
    path: "/agent-lab",
  },
];

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
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
      { label: "资产数量", value: counts.assets },
      { label: "证据数量", value: counts.evidence },
      { label: "Agent Run 数量", value: counts.agentRuns },
      { label: "策略数量", value: counts.strategies },
      { label: "组合数量", value: counts.portfolios },
      { label: "决策数量", value: counts.decisions },
      { label: "数据源数量", value: counts.dataSources },
      { label: "Leaderboard 策略数量", value: counts.leaderboard },
    ],
    [counts],
  );

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{PRODUCT_CN_FULL_NAME}</CardTitle>
          <CardDescription>{PRODUCT_CN_SUBTITLE}</CardDescription>
          <p className="text-xs text-muted-foreground">{PRODUCT_DESCRIPTION}</p>
          <p className="text-xs text-muted-foreground">{BRAND_BADGE}</p>
        </CardHeader>
      </Card>

      <Card className="md:hidden overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mobile Market View</CardTitle>
          <CardDescription>ETF / 基金 / 期货研究入口，不接实时行情</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white">
            <p className="text-xs text-slate-300">AlphaTrace Market Snapshot</p>
            <p className="mt-2 text-2xl font-semibold">资产研究视图</p>
            <p className="mt-1 text-xs text-slate-300">静态资产画像 + Evidence + Agent 观点入口</p>
            <div className="mt-4 h-16 rounded-lg bg-white/10 p-2">
              <div className="flex h-full items-end gap-1">
                {[32, 48, 40, 58, 54, 68, 62, 76, 72, 84].map((height, index) => (
                  <span
                    key={index}
                    className="flex-1 rounded-sm bg-emerald-300/80"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {MOBILE_MARKET_VIEWS.map((item) => (
              <button
                key={item.title}
                className="rounded-lg border p-3 text-left transition hover:bg-muted/60"
                onClick={() => handleNavigate(item.path)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{item.metric}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">核心工作流</CardTitle>
          <CardDescription>
            Data Sources → Evidence Center → Asset Research → Agent Lab → Strategy Lab → Decision Attribution → Portfolio Workspace → Leaderboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {WORKFLOW.map((step, index) => (
              <div key={step.title} className="rounded border p-2 text-xs space-y-2">
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground">{step.desc}</p>
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleNavigate(step.path)}>
                    进入
                  </Button>
                  {index < WORKFLOW.length - 1 ? (
                    <span className="text-muted-foreground">→ {WORKFLOW[index + 1].title}</span>
                  ) : (
                    <span className="text-muted-foreground">闭环完成</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <CardTitle className="text-base">关键能力卡片</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {CAPABILITIES.map((item) => (
              <Card key={item.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => handleNavigate(item.path)}>
                    打开
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">推荐下一步操作</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => handleNavigate("/assets")}>查看资产研究</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/agent-lab")}>查看 Agent Lab</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/evidence")}>查看证据中心</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/strategy-lab")}>查看策略中心</Button>
          <Button size="sm" variant="outline" onClick={() => handleNavigate("/portfolio")}>查看组合工作台</Button>
        </CardContent>
      </Card>
    </div>
  );
}
