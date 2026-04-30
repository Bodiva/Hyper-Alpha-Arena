import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAssets } from "@/entities/asset/api";
import { listAgentRuns } from "@/entities/agent/api";
import { listLeaderboard, listStrategies } from "@/entities/strategy/api";
import { listEvidence } from "@/entities/evidence/api";
import { listDecisions } from "@/entities/decision/api";
import { listPortfolios } from "@/entities/portfolio/api";
import { listDataSources } from "@/entities/data-source/api";
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

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const assets = useMemo(() => listAssets(), []);
  const evidenceItems = useMemo(() => listEvidence(), []);
  const agentRuns = useMemo(() => listAgentRuns(), []);
  const strategies = useMemo(() => listStrategies(), []);
  const portfolios = useMemo(() => listPortfolios(), []);
  const decisions = useMemo(() => listDecisions(), []);
  const dataSources = useMemo(() => listDataSources(), []);
  const leaderboardItems = useMemo(() => listLeaderboard(), []);

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    navigateTo(path);
  };

  const stats = useMemo(
    () => [
      { label: "资产数量", value: assets.length },
      { label: "证据数量", value: evidenceItems.length },
      { label: "Agent Run 数量", value: agentRuns.length },
      { label: "策略数量", value: strategies.length },
      { label: "组合数量", value: portfolios.length },
      { label: "决策数量", value: decisions.length },
      { label: "数据源数量", value: dataSources.length },
      { label: "Leaderboard 策略数量", value: leaderboardItems.length },
    ],
    [agentRuns.length, assets.length, dataSources.length, decisions.length, evidenceItems.length, leaderboardItems.length, portfolios.length, strategies.length],
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
              <CardTitle className="text-2xl">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

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
