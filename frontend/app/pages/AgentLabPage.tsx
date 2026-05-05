import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentRun, AgentRunStatus, AgentRunTaskType } from "@/entities/agent/model";
import {
  createDemoAgentRunAsync,
  getAgentRunnerCapabilitiesAsync,
  getAgentRunnerStatusAsync,
  getAgentRuntimeWorkersAsync,
  listAgentRunsAsync,
  submitAgentRunAsync,
  type AgentRuntimeWorkersResponse,
  type AgentRunnerCapabilitiesResponse,
  type AgentRunnerStatusItem,
} from "@/entities/agent/api";
import { listAssets } from "@/entities/asset/api";
import { getRuntimeCredentialStatus, type RuntimeCredentialStatus } from "@/entities/settings/api";
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
type SubmitRunnerKind = "stub" | "qwen" | "alphatrace_native" | "tradingagents";

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

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

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
  const [runnerStatuses, setRunnerStatuses] = useState<AgentRunnerStatusItem[]>([]);
  const [isLoadingRunnerStatus, setIsLoadingRunnerStatus] = useState(true);
  const [runnerStatusError, setRunnerStatusError] = useState<string | null>(null);
  const [runnerCapabilities, setRunnerCapabilities] = useState<AgentRunnerCapabilitiesResponse | null>(null);
  const [runnerCapabilitiesError, setRunnerCapabilitiesError] = useState<string | null>(null);
  const [runtimeWorkers, setRuntimeWorkers] = useState<AgentRuntimeWorkersResponse | null>(null);
  const [runtimeWorkersError, setRuntimeWorkersError] = useState<string | null>(null);
  const [runtimeCredentials, setRuntimeCredentials] = useState<RuntimeCredentialStatus | null>(null);
  const [runtimeCredentialsError, setRuntimeCredentialsError] = useState<string | null>(null);
  const [draftRunner, setDraftRunner] = useState<SubmitRunnerKind>("qwen");
  const [draftTaskType, setDraftTaskType] = useState<AgentRunTaskType>("SINGLE_ASSET_ANALYSIS");
  const [draftAssetId, setDraftAssetId] = useState("asset_etf_510300");
  const [draftQuestion, setDraftQuestion] = useState("请分析该 ETF 是否适合中期配置");
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const runnerStatusByType = useMemo(
    () => new Map(runnerStatuses.map((runner) => [runner.runnerType, runner])),
    [runnerStatuses],
  );
  const qwenStatus = runnerStatusByType.get("qwen");
  const nativeStatus = runnerStatusByType.get("alphatrace_native");
  const tradingAgentsStatus = runnerStatusByType.get("tradingagents");
  const bochaToolStatus = runtimeCredentials?.tools.find((tool) => tool.name === "bocha");
  const qwenCredentialSource = runtimeCredentials?.profile.llm_config_source ?? qwenStatus?.qwenConfigSource ?? "unknown";
  const qwenCredentialAvailable = runtimeCredentials?.profile.llm_api_key_available ?? qwenStatus?.qwenKeyConfigured ?? false;
  const bochaCredentialSource = bochaToolStatus?.config_source ?? "unknown";
  const bochaCredentialAvailable = Boolean(bochaToolStatus?.api_key_available ?? bochaToolStatus?.configured);
  const getSupportedTaskTypes = (runner: AgentRunnerStatusItem): string[] =>
    runner.capabilities?.supportedTaskTypes ?? runner.capabilities?.supported_task_types ?? [];
  const getCapabilityBoolean = (
    runner: AgentRunnerStatusItem,
    camelKey: "supportsStreaming" | "supportsEvidence" | "supportsPortfolioContext" | "supportsExternalTools" | "productionReady",
    snakeKey: "supports_streaming" | "supports_evidence" | "supports_portfolio_context" | "supports_external_tools" | "production_ready",
  ): boolean | undefined => {
    const camelValue = runner.capabilities?.[camelKey];
    if (typeof camelValue === "boolean") return camelValue;
    const snakeValue = runner.capabilities?.[snakeKey];
    return typeof snakeValue === "boolean" ? snakeValue : undefined;
  };
  const tradingAgentsSubmitBlockedReason = useMemo(() => {
    if (apiMode !== "real") return null;
    if (!tradingAgentsStatus) {
      if (isLoadingRunnerStatus && !runnerStatusError) return "TradingAgents runtime status is checking backend status.";
      return runnerStatusError
        ? `TradingAgents runtime status unavailable: ${runnerStatusError}`
        : "TradingAgents runtime status unavailable. Use Runtime Diagnostics > Refresh.";
    }
    if (!tradingAgentsStatus.enabled || !tradingAgentsStatus.available || tradingAgentsStatus.status !== "ready") {
      return tradingAgentsStatus.message || "TradingAgents runner is not ready.";
    }
    if (tradingAgentsStatus.qwenKeyConfigured === false) {
      return "TradingAgents requires a backend Qwen API key. Save Qwen API Key again in Settings or set DASHSCOPE_API_KEY before starting backend.";
    }
    return null;
  }, [apiMode, isLoadingRunnerStatus, runnerStatusError, tradingAgentsStatus]);
  const qwenSubmitBlockedReason = useMemo(() => {
    if (apiMode !== "real") return null;
    if (!qwenStatus) {
      if (isLoadingRunnerStatus && !runnerStatusError) return "Qwen runtime status is checking backend status.";
      return runnerStatusError
        ? `Qwen runtime status unavailable: ${runnerStatusError}`
        : "Qwen runtime status unavailable. Use Runtime Diagnostics > Refresh.";
    }
    if (!qwenStatus.available || qwenStatus.status !== "ready") {
      return qwenStatus.message || "Qwen runner requires a backend Qwen API key.";
    }
    if (qwenStatus.qwenKeyConfigured === false) {
      return "Qwen runner requires a backend Qwen API key. Save Qwen API Key again in Settings or set DASHSCOPE_API_KEY on the backend.";
    }
    return null;
  }, [apiMode, isLoadingRunnerStatus, qwenStatus, runnerStatusError]);
  const nativeSubmitBlockedReason = useMemo(() => {
    if (apiMode !== "real") return null;
    if (!nativeStatus) {
      if (isLoadingRunnerStatus && !runnerStatusError) return "AlphaTrace Native runtime status is checking backend status.";
      return runnerStatusError
        ? `AlphaTrace Native runtime status unavailable: ${runnerStatusError}`
        : "AlphaTrace Native runtime status unavailable. Use Runtime Diagnostics > Refresh.";
    }
    if (!nativeStatus.available || nativeStatus.status !== "ready") {
      return nativeStatus.message || "AlphaTrace Native runner requires the backend Qwen API key.";
    }
    if (nativeStatus.qwenKeyConfigured === false) {
      return "AlphaTrace Native runner requires a backend Qwen API key. Save Qwen API Key again in Settings or set DASHSCOPE_API_KEY on the backend.";
    }
    return null;
  }, [apiMode, isLoadingRunnerStatus, nativeStatus, runnerStatusError]);

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

  const refreshRunnerStatuses = async () => {
    setIsLoadingRunnerStatus(true);
    try {
      const items = await getAgentRunnerStatusAsync();
      setRunnerStatuses(items);
      setRunnerStatusError(null);
    } catch (error) {
      setRunnerStatuses([]);
      setRunnerStatusError(getErrorMessage(error, "Runner status unavailable"));
    } finally {
      setIsLoadingRunnerStatus(false);
    }

    try {
      setRunnerCapabilities(
        await getAgentRunnerCapabilitiesAsync({
          taskType: draftTaskType,
          requestedRunnerType: draftRunner,
        }),
      );
      setRunnerCapabilitiesError(null);
    } catch (error) {
      setRunnerCapabilities(null);
      setRunnerCapabilitiesError(getErrorMessage(error, "Runner capabilities unavailable"));
    }

    try {
      setRuntimeWorkers(await getAgentRuntimeWorkersAsync());
      setRuntimeWorkersError(null);
    } catch (error) {
      setRuntimeWorkers(null);
      setRuntimeWorkersError(getErrorMessage(error, "Runtime workers unavailable"));
    }

    try {
      setRuntimeCredentials(await getRuntimeCredentialStatus());
      setRuntimeCredentialsError(null);
    } catch (error) {
      setRuntimeCredentials(null);
      setRuntimeCredentialsError(getErrorMessage(error, "Runtime credentials unavailable"));
    }
  };

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
          setAgentRunError(getErrorMessage(error, "Agent Run 数据加载失败"));
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
  }, [draftRunner, draftTaskType]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingRunnerStatus(true);
    getAgentRunnerStatusAsync()
      .then((items) => {
        if (!cancelled) {
          setRunnerStatuses(items);
          setRunnerStatusError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRunnerStatuses([]);
          setRunnerStatusError(getErrorMessage(error, "Runner status unavailable"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRunnerStatus(false);
        }
      });

    getAgentRuntimeWorkersAsync()
      .then((workers) => {
        if (!cancelled) {
          setRuntimeWorkers(workers);
          setRuntimeWorkersError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeWorkers(null);
          setRuntimeWorkersError(getErrorMessage(error, "Runtime workers unavailable"));
        }
      });

    getAgentRunnerCapabilitiesAsync({ taskType: draftTaskType, requestedRunnerType: draftRunner })
      .then((capabilities) => {
        if (!cancelled) {
          setRunnerCapabilities(capabilities);
          setRunnerCapabilitiesError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRunnerCapabilities(null);
          setRunnerCapabilitiesError(getErrorMessage(error, "Runner capabilities unavailable"));
        }
      });

    getRuntimeCredentialStatus()
      .then((status) => {
        if (!cancelled) {
          setRuntimeCredentials(status);
          setRuntimeCredentialsError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeCredentials(null);
          setRuntimeCredentialsError(getErrorMessage(error, "Runtime credentials unavailable"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draftRunner, draftTaskType]);

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
      setDemoRunError(getErrorMessage(error, "Failed to create demo run"));
      setDemoRunMessage(null);
    } finally {
      setIsCreatingDemoRun(false);
    }
  };

  const handleSubmitAgentTask = async (runner: SubmitRunnerKind) => {
    const runnerBlockedReason =
      runner === "qwen"
        ? qwenSubmitBlockedReason
        : runner === "alphatrace_native"
          ? nativeSubmitBlockedReason
          : runner === "tradingagents"
            ? tradingAgentsSubmitBlockedReason
            : null;

    if (runnerBlockedReason) {
      setDemoRunError(runnerBlockedReason);
      setDemoRunMessage(null);
      return;
    }

    setSubmittingRunner(runner);
    setDemoRunError(null);
    setDemoRunMessage(
      apiMode === "real"
        ? runner === "qwen"
          ? "Submitting Qwen agent task... waiting for model response, usually 30-120 seconds."
          : runner === "alphatrace_native"
            ? "Submitting AlphaTrace Native multi-agent task... using Qwen, Bocha/static evidence, Bull/Bear parallel review, and SSE."
          : runner === "tradingagents"
            ? "Submitting TradingAgents PoC task... requires local backend with ALPHATRACE_TRADINGAGENTS_ENABLED=true."
            : "Submitting stub agent task..."
        : "当前为 Mock Mode，Submit Agent Task 将使用本地样例数据。",
    );

    const isTradingAgents = runner === "tradingagents";
    const isQwenBacked = runner === "qwen" || runner === "alphatrace_native" || isTradingAgents;

    try {
      const submittedRun = await submitAgentRunAsync({
        assetId: "asset_etf_510300",
        portfolioId: "portfolio_etf_core_001",
        strategyId: "strategy_etf_rotation_001",
        taskType: "single_asset_analysis",
        question: isTradingAgents ? "Use TradingAgents PoC to analyze SPY." : "请分析该 ETF 是否适合中期配置",
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
          modelProvider: isQwenBacked ? "qwen" : "none",
          modelName: isQwenBacked ? "qwen-plus" : "none",
          enableStreaming: true,
          extraParams: isTradingAgents
            ? {
                ticker: "SPY",
                tradeDate: "2025-06-05",
                offlineData: true,
                selectedAnalysts: ["market"],
                maxDebateRounds: 1,
                maxRiskDiscussRounds: 1,
              }
            : {},
        },
      });
      setSubmittingRunner(null);
      setDemoRunMessage(null);
      navigateTo(`/agent-lab/runs/${encodeURIComponent(submittedRun.runId)}`);
    } catch (error) {
      setDemoRunError(getErrorMessage(error, "Failed to submit agent task"));
      setDemoRunMessage(null);
    } finally {
      setSubmittingRunner(null);
    }
  };

  const handleSubmitDraftAgentTask = async () => {
    const draftBlockedReason =
      draftRunner === "qwen"
        ? qwenSubmitBlockedReason
        : draftRunner === "alphatrace_native"
          ? nativeSubmitBlockedReason
          : draftRunner === "tradingagents"
            ? tradingAgentsSubmitBlockedReason
            : null;

    if (draftBlockedReason) {
      setDemoRunError(draftBlockedReason);
      setDemoRunMessage(null);
      return;
    }

    setSubmittingRunner(draftRunner);
    setDemoRunError(null);
    setDemoRunMessage(
      apiMode === "real"
        ? `Submitting draft ${draftRunner} task...`
        : "当前为 Mock Mode，Draft Agent Task 将使用本地样例数据。",
    );

    const isTradingAgents = draftRunner === "tradingagents";
    const isQwenBacked = draftRunner === "qwen" || draftRunner === "alphatrace_native" || isTradingAgents;
    const isPortfolioTask = draftTaskType === "PORTFOLIO_DIAGNOSTIC";

    try {
      const submittedRun = await submitAgentRunAsync({
        assetId: draftAssetId,
        portfolioId: isPortfolioTask ? "portfolio_etf_core_001" : undefined,
        strategyId: "strategy_etf_rotation_001",
        taskType: isPortfolioTask ? "portfolio_diagnosis" : "single_asset_analysis",
        question: draftQuestion,
        horizon: "medium_term",
        riskPreference: "balanced",
        evidenceScope: {
          includeNews: true,
          includeReports: true,
          includeMacro: true,
          includeMarketSnapshot: true,
        },
        runnerConfig: {
          runnerType: draftRunner,
          modelProvider: isQwenBacked ? "qwen" : "none",
          modelName: isQwenBacked ? "qwen-plus" : "none",
          enableStreaming: true,
          extraParams: isTradingAgents
            ? {
                ticker: "SPY",
                tradeDate: "2025-06-05",
                offlineData: true,
                selectedAnalysts: ["market"],
                maxDebateRounds: 1,
                maxRiskDiscussRounds: 1,
              }
            : {},
        },
      });
      setSubmittingRunner(null);
      setDemoRunMessage(null);
      navigateTo(`/agent-lab/runs/${encodeURIComponent(submittedRun.runId)}`);
    } catch (error) {
      setDemoRunError(getErrorMessage(error, "Failed to submit draft agent task"));
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
          <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleCreateDemoRun} disabled={isCreatingDemoRun}>
                {isCreatingDemoRun ? "Creating demo run..." : "Create Demo Agent Run"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSubmitAgentTask("stub")} disabled={Boolean(submittingRunner)}>
                {submittingRunner === "stub" ? "Submitting stub task..." : "Submit Stub Agent Task"}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmitAgentTask("qwen")}
                disabled={Boolean(submittingRunner) || Boolean(qwenSubmitBlockedReason)}
                title={qwenSubmitBlockedReason ?? undefined}
              >
                {submittingRunner === "qwen" ? "Submitting Qwen task..." : "Submit Qwen Agent Task"}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmitAgentTask("alphatrace_native")}
                disabled={Boolean(submittingRunner) || Boolean(nativeSubmitBlockedReason)}
                title={nativeSubmitBlockedReason ?? undefined}
              >
                {submittingRunner === "alphatrace_native" ? "Submitting Native..." : "Submit Native Multi-Agent Task"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleSubmitAgentTask("tradingagents")}
                disabled={Boolean(submittingRunner) || Boolean(tradingAgentsSubmitBlockedReason)}
                title={tradingAgentsSubmitBlockedReason ?? undefined}
              >
                {submittingRunner === "tradingagents" ? "Submitting TradingAgents..." : "Submit TradingAgents PoC Task"}
              </Button>
          </div>
          {demoRunMessage ? <p className="text-xs text-muted-foreground">{demoRunMessage}</p> : null}
          {demoRunError ? <p className="text-xs text-destructive">Agent task failed: {demoRunError}</p> : null}
          {qwenSubmitBlockedReason ? (
            <p className="text-xs text-amber-700">Qwen unavailable: {qwenSubmitBlockedReason}</p>
          ) : null}
          {nativeSubmitBlockedReason ? (
            <p className="text-xs text-amber-700">AlphaTrace Native unavailable: {nativeSubmitBlockedReason}</p>
          ) : null}
          {tradingAgentsSubmitBlockedReason ? (
            <p className="text-xs text-amber-700">
              TradingAgents PoC unavailable: {tradingAgentsSubmitBlockedReason}
            </p>
          ) : null}
          <div className="grid gap-2 text-xs md:grid-cols-4">
            <div className="rounded-md border bg-muted/20 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">Qwen Runtime</span>
                <Badge variant={qwenCredentialAvailable && qwenStatus?.available ? "default" : "outline"}>
                  {qwenStatus?.status ?? (isLoadingRunnerStatus ? "checking" : "unknown")}
                </Badge>
              </div>
              <p className="text-muted-foreground">Source: {qwenCredentialSource}</p>
              <p className="text-muted-foreground">Backend key: {qwenCredentialAvailable ? "available" : "missing"}</p>
              {qwenSubmitBlockedReason ? <p className="mt-1 text-amber-700">{qwenSubmitBlockedReason}</p> : null}
            </div>
            <div className="rounded-md border bg-muted/20 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">AlphaTrace Native</span>
                <Badge variant={nativeStatus?.available ? "default" : "outline"}>
                  {nativeStatus?.status ?? (isLoadingRunnerStatus ? "checking" : "unknown")}
                </Badge>
              </div>
              <p className="text-muted-foreground">Source: {nativeStatus?.qwenConfigSource ?? qwenCredentialSource}</p>
              <p className="text-muted-foreground">Owns product DAG: yes</p>
              {nativeSubmitBlockedReason ? <p className="mt-1 text-amber-700">{nativeSubmitBlockedReason}</p> : null}
            </div>
            <div className="rounded-md border bg-muted/20 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">Bocha Evidence</span>
                <Badge variant={bochaCredentialAvailable ? "default" : "outline"}>
                  {bochaCredentialAvailable ? "configured" : "missing"}
                </Badge>
              </div>
              <p className="text-muted-foreground">Source: {bochaCredentialSource}</p>
              <p className="text-muted-foreground">Fallback: static evidence seed remains available</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">TradingAgents PoC</span>
                <Badge variant={tradingAgentsStatus?.available ? "default" : tradingAgentsStatus?.enabled ? "secondary" : "outline"}>
                  {tradingAgentsStatus?.status ?? (isLoadingRunnerStatus ? "checking" : "unknown")}
                </Badge>
              </div>
              <p className="text-muted-foreground">Enabled: {tradingAgentsStatus?.enabled ? "yes" : "no"}</p>
              <p className="text-muted-foreground">Qwen source: {tradingAgentsStatus?.qwenConfigSource ?? qwenCredentialSource}</p>
              {tradingAgentsSubmitBlockedReason ? <p className="mt-1 text-amber-700">{tradingAgentsSubmitBlockedReason}</p> : null}
            </div>
          </div>
          {runtimeCredentialsError ? <p className="text-xs text-amber-700">Runtime credential status unavailable: {runtimeCredentialsError}</p> : null}
          <details className="rounded-md border bg-muted/20 p-2 text-xs">
            <summary className="cursor-pointer select-none font-medium">
              Runtime Diagnostics · runners / capabilities / workers
            </summary>
            <div className="mt-2 mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Runner Runtime Status</p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  API: {apiMode === "real" ? "Real API" : "Mock Mode"}
                </span>
                <Button size="sm" variant="outline" onClick={() => void refreshRunnerStatuses()}>
                  Refresh
                </Button>
              </div>
            </div>
            {runnerStatusError ? (
              <p className="text-destructive">Runner status unavailable: {runnerStatusError}</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {runnerStatuses.map((runner) => (
                  <div key={runner.runnerType} className="rounded border bg-background p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium">{runner.runnerType}</span>
                      <Badge variant={runner.available ? "default" : runner.enabled ? "secondary" : "outline"}>
                        {runner.status}
                      </Badge>
                    </div>
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      <Badge variant="outline">{runner.executionMode ?? "unknown_mode"}</Badge>
                    </div>
                    <p className="text-muted-foreground">{runner.message}</p>
                    {runner.executionPolicyReason ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Policy: {runner.executionPolicyReason}
                      </p>
                    ) : null}
                    {runner.capabilities ? (
                      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                        <p>
                          Tasks: {getSupportedTaskTypes(runner).length ? getSupportedTaskTypes(runner).join(", ") : "none"}
                        </p>
                        <p>
                          Streaming: {getCapabilityBoolean(runner, "supportsStreaming", "supports_streaming") ? "yes" : "no"} · Evidence:{" "}
                          {getCapabilityBoolean(runner, "supportsEvidence", "supports_evidence") ? "yes" : "no"} · Portfolio:{" "}
                          {getCapabilityBoolean(runner, "supportsPortfolioContext", "supports_portfolio_context") ? "yes" : "no"}
                        </p>
                        {runner.capabilities.notes ? <p>{runner.capabilities.notes}</p> : null}
                      </div>
                    ) : null}
                    {runner.runnerType === "tradingagents" ? (
                      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                        <p>Repo: {runner.repoPathConfigured ? (runner.repoPathExists === false ? "configured but missing" : "configured") : "not configured"}</p>
                        <p>Import: {runner.importable ? "ok" : runner.importError ? "failed" : "not checked"}</p>
                        <p>Qwen key: {runner.qwenKeyConfigured ? `configured (${runner.qwenConfigSource ?? "unknown"})` : "missing"}</p>
                        {runner.importError ? <p className="line-clamp-2 text-destructive">Import error: {runner.importError}</p> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!runnerStatuses.length ? (
                  <p className="text-muted-foreground">
                    {isLoadingRunnerStatus ? "Loading runner status..." : "Runner status is empty. Use Refresh or check backend /runners/status."}
                  </p>
                ) : null}
              </div>
            )}
            <div className="mt-3 rounded border bg-background p-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Orchestrator Intent Preview</p>
                <Badge variant="outline">advisory</Badge>
              </div>
              {runnerCapabilitiesError ? (
                <p className="text-muted-foreground">
                  Capability preview unavailable: {runnerCapabilitiesError}. Submit buttons still use explicit runnerConfig.runnerType.
                </p>
              ) : runnerCapabilities ? (
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>
                    Task: {runnerCapabilities.recommendation.taskType} · Recommended runner:{" "}
                    <span className="font-medium text-foreground">{runnerCapabilities.recommendation.recommendedRunnerType}</span> · Supported:{" "}
                    {runnerCapabilities.recommendation.supported ? "yes" : "no"}
                  </p>
                  <p>{runnerCapabilities.recommendation.reason}</p>
                  <p>{runnerCapabilities.message}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">Loading capability preview...</p>
              )}
            </div>
            <div className="mt-3 rounded border bg-background p-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Orchestrator Worker Registry</p>
                <Badge variant={runtimeWorkers?.activeCount ? "secondary" : "outline"}>
                  active {runtimeWorkers?.activeCount ?? 0}
                </Badge>
              </div>
              {runtimeWorkersError ? (
                <p className="text-muted-foreground">
                  Worker registry unavailable: {runtimeWorkersError}. This is expected when the active backend has not been rebuilt with M20.
                </p>
              ) : runtimeWorkers ? (
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>
                    Type: {runtimeWorkers.workerType} · Registered: {runtimeWorkers.registeredCount} · Active: {runtimeWorkers.activeCount}
                  </p>
                  {runtimeWorkers.workers.length ? (
                    <div className="flex flex-wrap gap-1">
                      {runtimeWorkers.workers.map((worker) => (
                        <Button
                          key={`${worker.runId}-${worker.pid}`}
                          size="sm"
                          variant="outline"
                          onClick={() => navigateTo(`/agent-lab/runs/${encodeURIComponent(worker.runId)}`)}
                        >
                          {worker.runId} · pid {worker.pid} · {worker.running ? "running" : `exit ${worker.returnCode ?? "-"}`}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p>No subprocess workers are currently registered in this backend process.</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Loading worker registry...</p>
              )}
            </div>
          </details>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Draft Agent Task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="font-medium">Runner</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2"
                value={draftRunner}
                onChange={(event) => setDraftRunner(event.target.value as SubmitRunnerKind)}
              >
                <option value="qwen">qwen</option>
                <option value="alphatrace_native">alphatrace_native</option>
                <option value="tradingagents">tradingagents</option>
                <option value="stub">stub</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Task</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2"
                value={draftTaskType}
                onChange={(event) => {
                  const nextTask = event.target.value as AgentRunTaskType;
                  setDraftTaskType(nextTask);
                  setDraftQuestion(
                    nextTask === "PORTFOLIO_DIAGNOSTIC"
                      ? "请诊断当前组合的资产配置、风险暴露、调仓建议和后续观察指标"
                      : "请分析该 ETF 是否适合中期配置",
                  );
                }}
              >
                <option value="SINGLE_ASSET_ANALYSIS">single_asset_analysis</option>
                <option value="PORTFOLIO_DIAGNOSTIC">portfolio_diagnosis</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Asset</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2"
                value={draftAssetId}
                onChange={(event) => setDraftAssetId(event.target.value)}
              >
                <option value="asset_etf_510300">asset_etf_510300 · 510300.SH</option>
                <option value="asset_etf_159915">asset_etf_159915 · 159915.SZ</option>
                <option value="asset_index_000300">asset_index_000300 · 000300.SH</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => void handleSubmitDraftAgentTask()}
                disabled={
                  Boolean(submittingRunner) ||
                  (draftRunner === "qwen" && Boolean(qwenSubmitBlockedReason)) ||
                  (draftRunner === "alphatrace_native" && Boolean(nativeSubmitBlockedReason)) ||
                  (draftRunner === "tradingagents" && Boolean(tradingAgentsSubmitBlockedReason))
                }
                title={
                  draftRunner === "qwen"
                    ? qwenSubmitBlockedReason ?? undefined
                    : draftRunner === "alphatrace_native"
                      ? nativeSubmitBlockedReason ?? undefined
                    : draftRunner === "tradingagents"
                      ? tradingAgentsSubmitBlockedReason ?? undefined
                      : undefined
                }
              >
                {submittingRunner === draftRunner ? "Submitting..." : "Submit Draft Task"}
              </Button>
            </div>
          </div>
          <label className="space-y-1 block">
            <span className="font-medium">Question</span>
            <textarea
              className="min-h-[72px] w-full rounded-md border bg-background px-2 py-2"
              value={draftQuestion}
              onChange={(event) => setDraftQuestion(event.target.value)}
            />
          </label>
          {runnerCapabilities ? (
            <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">
              <p>
                Preview: task={runnerCapabilities.recommendation.taskType}, runner=
                {runnerCapabilities.recommendation.recommendedRunnerType}, supported=
                {runnerCapabilities.recommendation.supported ? "yes" : "no"}
              </p>
              <p>{runnerCapabilities.recommendation.reason}</p>
            </div>
          ) : null}
        </CardContent>
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
