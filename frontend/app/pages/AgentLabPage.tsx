import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentRun, AgentRunStatus, AgentRunTaskType } from "@/entities/agent/model";
import { createDemoAgentRunAsync, listAgentRunsAsync, submitAgentRunAsync } from "@/entities/agent/api";
import { listAssets } from "@/entities/asset/api";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

interface AgentLabPageProps {
  onOpenRun?: (runId: string) => void;
}

type AssetFilter = "ALL" | "ETF" | "FUND" | "FUTURE" | "INDEX" | "MULTI_ASSET";
type TaskFilter = "ALL" | AgentRunTaskType;
type StatusFilter = "ALL" | AgentRunStatus;
type TimeFilter = "ALL" | "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS";
type SubmitRunnerKind = "stub" | "qwen";

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "全部",
  QUEUED: "等待中",
  RUNNING: "运行中",
  PARTIALLY_COMPLETED: "运行中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const STATUS_STYLE: Record<AgentRunStatus, "default" | "secondary" | "outline" | "destructive"> = {
  QUEUED: "outline",
  RUNNING: "secondary",
  PARTIALLY_COMPLETED: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const TASK_LABEL: Record<TaskFilter, string> = {
  ALL: "全部",
  SINGLE_ASSET_ANALYSIS: "单资产分析",
  MULTI_ASSET_COMPARISON: "多资产比较",
  PORTFOLIO_DIAGNOSTIC: "组合诊断",
  EVENT_IMPACT_ANALYSIS: "事件影响分析",
  REBALANCE_SUGGESTION: "调仓建议",
};

const ASSET_LABEL: Record<AssetFilter, string> = {
  ALL: "全部",
  ETF: "ETF",
  FUND: "FUND",
  FUTURE: "FUTURE",
  INDEX: "INDEX",
  MULTI_ASSET: "MULTI_ASSET",
};

const TIME_LABEL: Record<TimeFilter, string> = {
  ALL: "全部",
  TODAY: "今日",
  LAST_7_DAYS: "近 7 天",
  LAST_30_DAYS: "近 30 天",
};

const STATUS_FILTERS: StatusFilter[] = ["ALL", "RUNNING", "COMPLETED", "FAILED", "QUEUED"];
const ASSET_FILTERS: AssetFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "INDEX", "MULTI_ASSET"];
const TASK_FILTERS: TaskFilter[] = [
  "ALL",
  "SINGLE_ASSET_ANALYSIS",
  "MULTI_ASSET_COMPARISON",
  "PORTFOLIO_DIAGNOSTIC",
  "EVENT_IMPACT_ANALYSIS",
  "REBALANCE_SUGGESTION",
];
const TIME_FILTERS: TimeFilter[] = ["ALL", "TODAY", "LAST_7_DAYS", "LAST_30_DAYS"];

const countDaysDiff = (startedAt: string): number => {
  const now = new Date();
  const start = new Date(startedAt);
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const inferAssetCategory = (run: AgentRun, assetsById: Map<string, ReturnType<typeof listAssets>[number]>): AssetFilter => {
  const types = Array.from(
    new Set(
      run.assetIds
        .map((assetId) => assetsById.get(assetId)?.assetType)
        .filter((type): type is NonNullable<typeof type> => Boolean(type)),
    ),
  );

  if (types.length !== 1) {
    return "MULTI_ASSET";
  }
  return types[0];
};

const analysisTargetLabel = (run: AgentRun, assetsById: Map<string, ReturnType<typeof listAssets>[number]>): string =>
  run.assetIds
    .map((assetId) => {
      const asset = assetsById.get(assetId);
      return asset ? `${asset.symbol}` : assetId;
    })
    .join(" / ");

const riskBadgeVariant = (riskLevel: AgentRun["riskLevel"]): "default" | "secondary" | "destructive" => {
  if (riskLevel === "HIGH") return "destructive";
  if (riskLevel === "MEDIUM") return "secondary";
  return "default";
};

export default function AgentLabPage({ onOpenRun }: AgentLabPageProps) {
  const apiMode = useMemo(() => getApiMode(), []);
  const assets = useMemo(() => {
    try {
      return listAssets();
    } catch {
      return [];
    }
  }, []);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [agentRunError, setAgentRunError] = useState<string | null>(null);
  const [isCreatingDemoRun, setIsCreatingDemoRun] = useState(false);
  const [submittingRunner, setSubmittingRunner] = useState<SubmitRunnerKind | null>(null);
  const [demoRunMessage, setDemoRunMessage] = useState<string | null>(null);
  const [demoRunError, setDemoRunError] = useState<string | null>(null);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedAssetId = initialRouteParams.get("assetId") ?? undefined;
  const linkedPortfolioId = initialRouteParams.get("portfolioId") ?? undefined;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>(() => {
    if (!linkedAssetId) return "ALL";
    return assetsById.get(linkedAssetId)?.assetType ?? "ALL";
  });
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ALL");

  useEffect(() => {
    let cancelled = false;
    setIsLoadingRuns(true);
    setAgentRunError(null);

    listAgentRunsAsync()
      .then((runs) => {
        if (!cancelled) {
          setAgentRuns(runs);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAgentRuns([]);
          setAgentRunError(error instanceof Error ? error.message : "Agent Run 数据加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRuns(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenRun = (runId: string) => {
    if (onOpenRun) {
      onOpenRun(runId);
      return;
    }
    navigateTo(`/agent-lab/runs/${encodeURIComponent(runId)}`);
  };

  const handleCreateDemoRun = async () => {
    setIsCreatingDemoRun(true);
    setDemoRunError(null);
    setDemoRunMessage(apiMode === "real" ? "Creating demo run..." : "当前为 Mock Mode，Demo Run 将使用本地样例数据。");

    try {
      const demoRun = await createDemoAgentRunAsync({
        assetId: "asset_etf_510300",
        taskType: "single_asset_analysis",
        question: "请分析该 ETF 是否适合中期配置",
      });
      navigateTo(`/agent-lab/runs/${encodeURIComponent(demoRun.runId)}`);
    } catch (error) {
      setDemoRunError(error instanceof Error ? error.message : "Failed to create demo run");
      setDemoRunMessage(null);
    } finally {
      setIsCreatingDemoRun(false);
    }
  };

  const handleSubmitAgentTask = async (runner: SubmitRunnerKind) => {
    setSubmittingRunner(runner);
    setDemoRunError(null);
    setDemoRunMessage(
      apiMode === "real"
        ? runner === "qwen"
          ? "Submitting Qwen agent task... waiting for model response, usually 30-120 seconds."
          : "Submitting stub agent task..."
        : "当前为 Mock Mode，Submit Agent Task 将使用本地样例数据。",
    );

    try {
      const submittedRun = await submitAgentRunAsync({
        assetId: "asset_etf_510300",
        portfolioId: "portfolio_etf_core_001",
        strategyId: "strategy_etf_rotation_001",
        taskType: "single_asset_analysis",
        question: "请分析该 ETF 是否适合中期配置",
        horizon: "medium_term",
        riskPreference: "balanced",
        evidenceScope: {
          includeNews: true,
          includeReports: true,
          includeMacro: true,
          includeMarketSnapshot: true,
        },
        runnerConfig: {
          runnerType: runner,
          modelProvider: runner === "qwen" ? "qwen" : "none",
          modelName: runner === "qwen" ? "qwen-plus" : "none",
          enableStreaming: true,
        },
      });
      navigateTo(`/agent-lab/runs/${encodeURIComponent(submittedRun.runId)}`);
    } catch (error) {
      setDemoRunError(error instanceof Error ? error.message : "Failed to submit agent task");
      setDemoRunMessage(null);
    } finally {
      setSubmittingRunner(null);
    }
  };

  const runStats = useMemo(() => {
    const runTotal = agentRuns.length;
    const runningTotal = agentRuns.filter(
      (run) => run.status === "RUNNING" || run.status === "PARTIALLY_COMPLETED",
    ).length;
    const completedTotal = agentRuns.filter((run) => run.status === "COMPLETED").length;
    const reportsTotal = agentRuns.reduce((sum, run) => sum + run.reports.length, 0);
    const toolCallsTotal = agentRuns.reduce((sum, run) => sum + run.toolCalls.length, 0);
    const evidenceCount = new Set(agentRuns.flatMap((run) => run.evidenceIds)).size;
    return {
      runTotal,
      runningTotal,
      completedTotal,
      reportsTotal,
      toolCallsTotal,
      evidenceCount,
    };
  }, [agentRuns]);

  const filteredRuns = useMemo(() => {
    return agentRuns.filter((run) => {
      const runAssetCategory = inferAssetCategory(run, assetsById);
      const statusPass =
        statusFilter === "ALL" ||
        (statusFilter === "RUNNING"
          ? run.status === "RUNNING" || run.status === "PARTIALLY_COMPLETED"
          : run.status === statusFilter);
      const assetPass = assetFilter === "ALL" || runAssetCategory === assetFilter;
      const taskPass = taskFilter === "ALL" || run.taskType === taskFilter;
      const linkedAssetPass = !linkedAssetId || run.assetIds.includes(linkedAssetId);
      const linkedPortfolioPass = !linkedPortfolioId || run.portfolioId === linkedPortfolioId;

      const daysDiff = countDaysDiff(run.startedAt);
      const timePass =
        timeFilter === "ALL" ||
        (timeFilter === "TODAY" && daysDiff === 0) ||
        (timeFilter === "LAST_7_DAYS" && daysDiff <= 7) ||
        (timeFilter === "LAST_30_DAYS" && daysDiff <= 30);

      return statusPass && assetPass && taskPass && timePass && linkedAssetPass && linkedPortfolioPass;
    });
  }, [statusFilter, assetFilter, taskFilter, timeFilter, linkedAssetId, linkedPortfolioId, agentRuns, assetsById]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Agent Lab 多 Agent 投研</CardTitle>
          <CardDescription>
            展示 ETF / 基金 / 期货场景下，多 Agent 协同分析、工具调用、证据引用与决策生成过程。
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            不是黑箱结论，而是可追踪、可解释、可复盘的投研过程。
          </p>
          <div className="pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={apiMode === "real" ? "secondary" : "outline"}>
                Data Mode: {apiMode === "real" ? "Real API" : "Mock"}
              </Badge>
              <Button size="sm" variant="outline" onClick={handleCreateDemoRun} disabled={isCreatingDemoRun}>
                {isCreatingDemoRun ? "Creating demo run..." : "Create Demo Agent Run"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSubmitAgentTask("stub")} disabled={Boolean(submittingRunner)}>
                {submittingRunner === "stub" ? "Submitting stub task..." : "Submit Stub Agent Task"}
              </Button>
              <Button size="sm" onClick={() => handleSubmitAgentTask("qwen")} disabled={Boolean(submittingRunner)}>
                {submittingRunner === "qwen" ? "Submitting Qwen task..." : "Submit Qwen Agent Task"}
              </Button>
            </div>
          </div>
          {demoRunMessage ? <p className="text-xs text-muted-foreground">{demoRunMessage}</p> : null}
          {demoRunError ? <p className="text-xs text-destructive">Agent task failed: {demoRunError}</p> : null}
        </CardHeader>
      </Card>

      <Card className="border-slate-200 bg-slate-50/80">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">Agent Runner Test Panel</CardTitle>
                <Badge variant={apiMode === "real" ? "default" : "outline"}>
                  {apiMode === "real" ? "Real API Mode" : "Mock Mode"}
                </Badge>
              </div>
              <CardDescription>
                使用后端 `/api/alpha-trace/agent-runs/submit` 验证 runnerType。Qwen 模式会复用原 Hyper AI 的后端模型配置。
              </CardDescription>
              <p className="text-xs text-muted-foreground">
                真实 Qwen 调用需要前端以 Real API mode 启动，并且旧 Hyper AI 已保存 Provider=qwen / Model=qwen-plus / Base URL / API Key。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="outline" onClick={() => handleSubmitAgentTask("stub")} disabled={Boolean(submittingRunner)}>
                {submittingRunner === "stub" ? "Submitting Stub..." : "Submit Stub Agent Task"}
              </Button>
              <Button onClick={() => handleSubmitAgentTask("qwen")} disabled={Boolean(submittingRunner)}>
                {submittingRunner === "qwen" ? "Submitting Qwen..." : "Submit Qwen Agent Task"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoadingRuns ? (
        <Card>
          <CardContent className="py-4 text-xs text-muted-foreground">正在加载 Agent Run 数据...</CardContent>
        </Card>
      ) : null}

      {agentRunError ? (
        <Card>
          <CardContent className="py-4 text-xs text-destructive">
            Agent Run 数据加载失败：{agentRunError}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agent Run 总数</CardDescription>
            <CardTitle className="text-lg">{runStats.runTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>运行中任务</CardDescription>
            <CardTitle className="text-lg">{runStats.runningTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已完成任务</CardDescription>
            <CardTitle className="text-lg">{runStats.completedTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>生成报告数</CardDescription>
            <CardTitle className="text-lg">{runStats.reportsTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>工具调用数</CardDescription>
            <CardTitle className="text-lg">{runStats.toolCallsTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>关联证据数</CardDescription>
            <CardTitle className="text-lg">{runStats.evidenceCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">状态</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={statusFilter === filter ? "default" : "outline"}
                  onClick={() => setStatusFilter(filter)}
                >
                  {STATUS_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">资产类型</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={assetFilter === filter ? "default" : "outline"}
                  onClick={() => setAssetFilter(filter)}
                >
                  {ASSET_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">任务类型</p>
            <div className="flex flex-wrap gap-2">
              {TASK_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={taskFilter === filter ? "default" : "outline"}
                  onClick={() => setTaskFilter(filter)}
                >
                  {TASK_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">时间范围</p>
            <div className="flex flex-wrap gap-2">
              {TIME_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={timeFilter === filter ? "default" : "outline"}
                  onClick={() => setTimeFilter(filter)}
                >
                  {TIME_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLoadingRuns && !agentRunError && filteredRuns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配 Agent Run</p>
            <p className="text-xs text-muted-foreground">请调整状态、资产类型、任务类型或时间范围</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredRuns.map((run) => {
            const teams = Array.from(new Set(run.agents.map((agent) => agent.team)));
            const completedAgents = run.agents.filter((agent) => agent.status === "COMPLETED").length;
            const progressPct = run.agents.length === 0 ? 0 : Math.round((completedAgents / run.agents.length) * 100);
            const updatedTime = run.updatedAt ?? run.completedAt ?? run.startedAt;
            const runAssetCategory = inferAssetCategory(run, assetsById);
            const riskWarnings = run.events.filter((event) => event.type === "risk.warning").length;

            return (
              <Card key={run.runId}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{run.runId}</CardTitle>
                      <CardDescription>{run.name}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_STYLE[run.status]}>{STATUS_LABEL[run.status]}</Badge>
                      <Badge variant={riskBadgeVariant(run.riskLevel)}>风险 {run.riskLevel}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-muted-foreground">
                    <p>分析目标：{run.target}</p>
                    <p>资产类型：{ASSET_LABEL[runAssetCategory]}</p>
                    <p>任务类型：{TASK_LABEL[run.taskType]}</p>
                    <p>分析资产：{analysisTargetLabel(run, assetsById)}</p>
                    <p>开始时间：{run.startedAt}</p>
                    <p>更新时间：{updatedTime}</p>
                    <p>报告数：{run.reports.length}</p>
                    <p>工具调用：{run.toolCalls.length}</p>
                    <p>证据数量：{run.evidenceIds.length}</p>
                    <p>置信度：{(run.finalDecision.confidence * 100).toFixed(0)}%</p>
                    <p>风险提示：{riskWarnings}</p>
                    <p>团队数量：{teams.length}</p>
                    <p>关联组合：{run.portfolioId ?? "-"}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {run.assetIds.map((assetId) => {
                      const asset = assetsById.get(assetId);
                      return (
                        <Button
                          key={`${run.runId}-${assetId}`}
                          size="sm"
                          variant="outline"
                          onClick={() => navigateTo(`/assets/${encodeURIComponent(assetId)}`)}
                        >
                          资产: {asset ? `${asset.symbol}` : assetId}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <p>Agent Progress</p>
                      <p>{completedAgents}/{run.agents.length} · {progressPct}%</p>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded ${run.status === "FAILED" ? "bg-red-500" : run.status === "RUNNING" ? "bg-blue-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.max(progressPct, run.status === "QUEUED" ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {teams.map((team) => (
                      <Badge key={team} variant="outline">{team}</Badge>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground">最终建议摘要</p>
                    <p>{run.finalDecision.summary ?? run.finalDecision.thesis}</p>
                  </div>

                  <div className="pt-1 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleOpenRun(run.runId)}>
                      进入详情
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { runId: run.runId })}>
                      查看决策归因
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { runId: run.runId, portfolioId: run.portfolioId })}>
                      查看组合影响
                    </Button>
                    {run.evidenceIds[0] ? (
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: run.evidenceIds[0] })}>
                        查看证据引用
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
