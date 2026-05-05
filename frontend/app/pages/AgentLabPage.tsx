import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowRight, Bot, CheckCircle2, Loader2, RefreshCw, Route } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentRun, AgentRunStatus, AgentRunTaskType } from "@/entities/agent/model";
import {
  createDemoAgentRunAsync,
  getAgentRunnerCapabilitiesAsync,
  getAgentRunnerStatusAsync,
  getAgentRuntimeWorkersAsync,
  listAgentRunsAsync,
  submitAgentRunAsync,
  type AgentRunnerCapability,
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
type AgentRunnerCapabilityLike = AgentRunnerStatusItem | AgentRunnerCapability;

const SUBMIT_ENDPOINT = "/api/alpha-trace/agent-runs/submit";

const RUNNER_LABEL: Record<SubmitRunnerKind | string, string> = {
  stub: "本地样例",
  qwen: "通义千问",
  alphatrace_native: "AlphaTrace 原生",
  tradingagents: "TradingAgents",
};

const RUNNER_META: Record<
  SubmitRunnerKind,
  {
    title: string;
    brief: string;
    backend: string;
    model: string;
    flow: string[];
  }
> = {
  qwen: {
    title: "通义千问",
    brief: "AlphaTrace 后端内置 Qwen Runner，适合常规投研问答。",
    backend: "AlphaTrace Backend / Qwen Runner",
    model: "qwen-plus",
    flow: ["AlphaTrace API", "Qwen Runner", "证据检索", "报告与决策"],
  },
  alphatrace_native: {
    title: "AlphaTrace 原生",
    brief: "我们自己的多 Agent 编排，保留 AlphaTrace 的证据、报告和决策结构。",
    backend: "AlphaTrace Backend / Native Multi-Agent",
    model: "qwen-plus",
    flow: ["AlphaTrace API", "Native Orchestrator", "多 Agent", "报告与决策"],
  },
  tradingagents: {
    title: "TradingAgents",
    brief: "可选外部适配器，用于 TradingAgents PoC，不是主后端。",
    backend: "AlphaTrace Backend / TradingAgents Adapter",
    model: "qwen-plus",
    flow: ["AlphaTrace API", "Adapter", "TradingAgents", "结果映射"],
  },
  stub: {
    title: "本地样例",
    brief: "不调用真实模型，用本地样例数据演示页面流程。",
    backend: "Frontend Mock / Local Sample",
    model: "none",
    flow: ["本地样例", "模拟任务", "模拟报告"],
  },
};

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
  FUND: "基金",
  FUTURE: "期货",
  INDEX: "指数",
  MULTI_ASSET: "多资产",
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

const formatTime = (value?: string | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

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
  const bochaCredentialSource = bochaToolStatus?.config_source ?? "unknown";
  const qwenCredentialAvailable = runtimeCredentials?.profile.llm_api_key_available ?? qwenStatus?.qwenKeyConfigured ?? false;
  const bochaCredentialAvailable = Boolean(bochaToolStatus?.api_key_available ?? bochaToolStatus?.configured);
  const getSupportedTaskTypes = (runner: AgentRunnerStatusItem | AgentRunnerCapabilityLike): string[] =>
    runner.capabilities?.supportedTaskTypes ??
    runner.capabilities?.supported_task_types ??
    ("supportedTaskTypes" in runner ? runner.supportedTaskTypes : undefined) ??
    ("supported_task_types" in runner ? runner.supported_task_types : undefined) ??
    [];
  const getCapabilityBoolean = (
    runner: AgentRunnerStatusItem | AgentRunnerCapabilityLike,
    camelKey: "supportsStreaming" | "supportsEvidence" | "supportsPortfolioContext" | "supportsExternalTools" | "productionReady",
    snakeKey: "supports_streaming" | "supports_evidence" | "supports_portfolio_context" | "supports_external_tools" | "production_ready",
  ): boolean | undefined => {
    const capabilities = "capabilities" in runner ? runner.capabilities : runner;
    const camelValue = capabilities?.[camelKey];
    if (typeof camelValue === "boolean") return camelValue;
    const snakeValue = capabilities?.[snakeKey];
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

  const selectedRunnerStatus = runnerStatusByType.get(draftRunner);
  const selectedRunnerMeta = RUNNER_META[draftRunner];
  const selectedAsset = assetsById.get(draftAssetId);
  const selectedSubmitBlockedReason =
    draftRunner === "qwen"
      ? qwenSubmitBlockedReason
      : draftRunner === "alphatrace_native"
        ? nativeSubmitBlockedReason
        : draftRunner === "tradingagents"
          ? tradingAgentsSubmitBlockedReason
          : null;
  const selectedRunnerReady =
    draftRunner === "stub" ||
    Boolean(selectedRunnerStatus?.available && selectedRunnerStatus?.status === "ready" && !selectedSubmitBlockedReason);
  const submitRouteLabel =
    apiMode === "real"
      ? `${SUBMIT_ENDPOINT} -> runnerType=${draftRunner}`
      : `Mock 数据模式 -> runnerType=${draftRunner}`;

  const refreshRunnerStatuses = async () => {
    setIsLoadingRunnerStatus(true);
    try {
      const items = await getAgentRunnerStatusAsync();
      setRunnerStatuses(items);
      setRunnerStatusError(null);
    } catch (error) {
      setRunnerStatuses([]);
      setRunnerStatusError(getErrorMessage(error, "运行状态不可用"));
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
      setRunnerCapabilitiesError(getErrorMessage(error, "执行能力不可用"));
    }

    try {
      setRuntimeWorkers(await getAgentRuntimeWorkersAsync());
      setRuntimeWorkersError(null);
    } catch (error) {
      setRuntimeWorkers(null);
      setRuntimeWorkersError(getErrorMessage(error, "工作进程不可用"));
    }

    try {
      setRuntimeCredentials(await getRuntimeCredentialStatus());
      setRuntimeCredentialsError(null);
    } catch (error) {
      setRuntimeCredentials(null);
      setRuntimeCredentialsError(getErrorMessage(error, "运行凭证不可用"));
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
          setAgentRunError(getErrorMessage(error, "任务数据加载失败"));
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
          setRunnerStatusError(getErrorMessage(error, "运行状态不可用"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRunnerStatus(false);
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
          setRunnerCapabilitiesError(getErrorMessage(error, "执行能力不可用"));
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
          setRuntimeWorkersError(getErrorMessage(error, "工作进程不可用"));
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
          setRuntimeCredentialsError(getErrorMessage(error, "运行凭证不可用"));
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
    setDemoRunMessage(apiMode === "real" ? "正在创建样例任务..." : "当前使用本地样例数据。");

    try {
      const demoRun = await createDemoAgentRunAsync({
        assetId: "asset_etf_510300",
        taskType: "single_asset_analysis",
        question: "请分析该 ETF 是否适合中期配置",
      });
      navigateTo(`/agent-lab/runs/${encodeURIComponent(demoRun.runId)}`);
    } catch (error) {
      setDemoRunError(getErrorMessage(error, "创建样例任务失败"));
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
      setDemoRunError(`${RUNNER_LABEL[runner] ?? runner}暂不可用：${runnerBlockedReason}`);
      setDemoRunMessage(null);
      return;
    }

    setDraftRunner(runner);
    setSubmittingRunner(runner);
    setDemoRunError(null);
    setDemoRunMessage(
      apiMode === "real"
        ? `正在提交到 ${SUBMIT_ENDPOINT}，执行器 ${RUNNER_LABEL[runner] ?? runner}。`
        : "当前使用本地样例数据。",
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
      setDemoRunMessage(null);
      navigateTo(`/agent-lab/runs/${encodeURIComponent(submittedRun.runId)}`);
    } catch (error) {
      setDemoRunError(getErrorMessage(error, "提交任务失败"));
      setDemoRunMessage(null);
    } finally {
      setSubmittingRunner(null);
    }
  };

  const handleSubmitDraftAgentTask = async () => {
    if (selectedSubmitBlockedReason) {
      setDemoRunError(`${RUNNER_LABEL[draftRunner] ?? draftRunner}暂不可用，请检查运行状态。`);
      setDemoRunMessage(null);
      return;
    }

    setSubmittingRunner(draftRunner);
    setDemoRunError(null);
    setDemoRunMessage(
      apiMode === "real"
        ? `正在提交到 ${SUBMIT_ENDPOINT}，执行器 ${RUNNER_LABEL[draftRunner] ?? draftRunner}。`
        : "当前使用本地样例数据。",
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
      setDemoRunError(getErrorMessage(error, "提交任务失败"));
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
    const evidenceCount = new Set(agentRuns.flatMap((run) => run.evidenceIds)).size;
    return {
      runTotal,
      runningTotal,
      completedTotal,
      reportsTotal,
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
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <ResearchWorkspaceNav />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_420px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">发起投研任务</CardTitle>
                <CardDescription className="mt-1">选择执行器、目标和问题后提交。</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={selectedRunnerReady ? "default" : "outline"} className="gap-1">
                  {selectedRunnerReady ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {selectedRunnerReady ? "可提交" : "待配置"}
                </Badge>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => void refreshRunnerStatuses()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
              <span className="mr-1 text-xs font-medium text-muted-foreground">快捷入口</span>
              <Button size="sm" variant="outline" onClick={handleCreateDemoRun} disabled={isCreatingDemoRun}>
                {isCreatingDemoRun ? "创建中..." : "创建样例任务"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleSubmitAgentTask("stub")} disabled={Boolean(submittingRunner)}>
                {submittingRunner === "stub" ? "提交中..." : "本地样例"}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSubmitAgentTask("qwen")}
                disabled={Boolean(submittingRunner) || Boolean(qwenSubmitBlockedReason)}
              >
                {submittingRunner === "qwen" ? "提交中..." : "通义千问"}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSubmitAgentTask("alphatrace_native")}
                disabled={Boolean(submittingRunner) || Boolean(nativeSubmitBlockedReason)}
              >
                {submittingRunner === "alphatrace_native" ? "提交中..." : "原生多 Agent"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleSubmitAgentTask("tradingagents")}
                disabled={Boolean(submittingRunner) || Boolean(tradingAgentsSubmitBlockedReason)}
              >
                {submittingRunner === "tradingagents" ? "提交中..." : "TradingAgents"}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(["qwen", "alphatrace_native", "tradingagents", "stub"] as SubmitRunnerKind[]).map((runner) => {
                const status = runnerStatusByType.get(runner);
                const ready =
                  runner === "stub" || Boolean(status?.available && status?.status === "ready");
                const active = draftRunner === runner;
                return (
                  <button
                    key={runner}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                    onClick={() => setDraftRunner(runner)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{RUNNER_META[runner].title}</span>
                      <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{RUNNER_META[runner].brief}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>任务类型</Label>
                  <Select
                    value={draftTaskType}
                    onValueChange={(value) => {
                      const nextTask = value as AgentRunTaskType;
                      setDraftTaskType(nextTask);
                      setDraftQuestion(
                        nextTask === "PORTFOLIO_DIAGNOSTIC"
                          ? "请诊断当前组合的资产配置、风险暴露、调仓建议和后续观察指标"
                          : "请分析该 ETF 是否适合中期配置",
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINGLE_ASSET_ANALYSIS">单资产分析</SelectItem>
                      <SelectItem value="PORTFOLIO_DIAGNOSTIC">组合诊断</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>分析资产</Label>
                  <Select value={draftAssetId} onValueChange={setDraftAssetId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset_etf_510300">510300.SH 沪深300ETF</SelectItem>
                      <SelectItem value="asset_etf_159915">159915.SZ 创业板ETF</SelectItem>
                      <SelectItem value="asset_index_000300">000300.SH 沪深300</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">模型</span>
                    <span className="font-medium">{selectedRunnerMeta.model}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">证据</span>
                    <span className="font-medium">{bochaCredentialAvailable ? "在线检索" : "本地库"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">资产</span>
                    <span className="font-medium">{selectedAsset?.symbol ?? draftAssetId}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>问题</Label>
                  <Textarea
                    className="min-h-[138px] resize-none text-sm"
                    value={draftQuestion}
                    onChange={(event) => setDraftQuestion(event.target.value)}
                  />
                </div>
                {demoRunMessage ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    {demoRunMessage}
                  </div>
                ) : null}
                {demoRunError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    任务失败：{demoRunError}
                  </div>
                ) : null}
                {selectedSubmitBlockedReason ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {selectedSubmitBlockedReason}
                  </div>
                ) : null}
                <Button
                  className="h-10 w-full gap-2"
                  onClick={() => void handleSubmitDraftAgentTask()}
                  disabled={Boolean(submittingRunner) || Boolean(selectedSubmitBlockedReason)}
                >
                  {submittingRunner === draftRunner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  {submittingRunner === draftRunner ? "提交中" : "提交任务"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">提交去向</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">后端入口</p>
              <p className="mt-1 break-all font-medium">{submitRouteLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">实际执行</p>
              <p className="mt-1 font-medium">{selectedRunnerMeta.backend}</p>
              <p className="mt-1 text-xs text-muted-foreground">{selectedRunnerMeta.brief}</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                执行链路
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRunnerMeta.flow.map((step, index) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className="rounded-md border bg-background px-2 py-1 text-xs">{step}</span>
                    {index < selectedRunnerMeta.flow.length - 1 ? (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border p-2">
                <p className="text-muted-foreground">Qwen</p>
                <p className="mt-1 font-medium">{qwenCredentialAvailable && qwenStatus?.available ? "可用" : "未就绪"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-muted-foreground">原生</p>
                <p className="mt-1 font-medium">{nativeStatus?.available ? "可用" : "未就绪"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-muted-foreground">证据</p>
                <p className="mt-1 font-medium">{bochaCredentialAvailable ? "在线" : "本地"}</p>
              </div>
            </div>
            {runnerStatusError || runtimeCredentialsError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                部分运行状态暂不可用，提交前建议刷新。
              </div>
            ) : null}

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  高级诊断：能力矩阵 / Worker / 配置来源
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid gap-2 text-xs md:grid-cols-2">
                  <div className="rounded-md border p-2">
                    <p className="font-medium">Qwen 配置</p>
                    <p className="mt-1 text-muted-foreground">source: {qwenCredentialSource}</p>
                    <p className="text-muted-foreground">key: {qwenCredentialAvailable ? "available" : "missing"}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="font-medium">Bocha 工具</p>
                    <p className="mt-1 text-muted-foreground">source: {bochaCredentialSource}</p>
                    <p className="text-muted-foreground">key: {bochaCredentialAvailable ? "available" : "missing"}</p>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Runner Capabilities</p>
                    <Badge variant="outline">
                      {runnerCapabilities?.recommendation?.recommendedRunnerType ?? "unknown"}
                    </Badge>
                  </div>
                  {runnerCapabilitiesError ? (
                    <p className="text-xs text-destructive">{runnerCapabilitiesError}</p>
                  ) : runnerCapabilities?.capabilities?.length ? (
                    <div className="space-y-2">
                      {runnerCapabilities.capabilities.map((capability) => {
                        const runnerType = capability.runnerType ?? capability.runner_type ?? "unknown";
                        const taskTypes = getSupportedTaskTypes(capability);
                        return (
                          <div key={runnerType} className="rounded-md bg-muted/25 p-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{runnerType}</span>
                              <span className="text-muted-foreground">{capability.executionMode ?? capability.execution_mode ?? "unknown"}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {taskTypes.map((taskType) => (
                                <Badge key={taskType} variant="outline" className="text-[10px]">
                                  {taskType}
                                </Badge>
                              ))}
                              {getCapabilityBoolean(capability, "supportsStreaming", "supports_streaming") ? <Badge variant="secondary" className="text-[10px]">stream</Badge> : null}
                              {getCapabilityBoolean(capability, "supportsEvidence", "supports_evidence") ? <Badge variant="secondary" className="text-[10px]">evidence</Badge> : null}
                              {getCapabilityBoolean(capability, "supportsExternalTools", "supports_external_tools") ? <Badge variant="secondary" className="text-[10px]">tools</Badge> : null}
                            </div>
                            {capability.notes ? <p className="mt-1 text-muted-foreground">{capability.notes}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无能力矩阵。</p>
                  )}
                </div>

                <div className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Runtime Workers</p>
                    <Badge variant="outline">
                      {runtimeWorkers ? `${runtimeWorkers.activeCount}/${runtimeWorkers.registeredCount}` : "unknown"}
                    </Badge>
                  </div>
                  {runtimeWorkersError ? (
                    <p className="text-xs text-destructive">{runtimeWorkersError}</p>
                  ) : runtimeWorkers?.workers?.length ? (
                    <div className="space-y-1 text-xs">
                      {runtimeWorkers.workers.slice(0, 5).map((worker) => (
                        <div key={`${worker.runId}-${worker.pid}`} className="flex items-center justify-between rounded-md bg-muted/25 p-2">
                          <span className="truncate">{worker.runId}</span>
                          <span className="text-muted-foreground">pid {worker.pid} · {worker.running ? "running" : worker.returnCode ?? "stopped"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">当前没有活跃 worker。</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      {isLoadingRuns ? (
        <Card>
          <CardContent className="py-4 text-xs text-muted-foreground">正在加载任务数据...</CardContent>
        </Card>
      ) : null}

      {agentRunError ? (
        <Card>
          <CardContent className="py-4 text-xs text-destructive">
            任务数据加载失败：{agentRunError}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="mr-2 text-base">任务列表</CardTitle>
              <Badge variant="outline">总数 {runStats.runTotal}</Badge>
              <Badge variant="outline">运行 {runStats.runningTotal}</Badge>
              <Badge variant="outline">完成 {runStats.completedTotal}</Badge>
              <Badge variant="outline">报告 {runStats.reportsTotal}</Badge>
              <Badge variant="outline">证据 {runStats.evidenceCount}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[720px] xl:grid-cols-4">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>状态：{STATUS_LABEL[filter]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assetFilter} onValueChange={(value) => setAssetFilter(value as AssetFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>资产：{ASSET_LABEL[filter]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={taskFilter} onValueChange={(value) => setTaskFilter(value as TaskFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>任务：{TASK_LABEL[filter]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as TimeFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>时间：{TIME_LABEL[filter]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLoadingRuns && !agentRunError && filteredRuns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配任务</p>
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
              <Card key={run.runId} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <button
                      type="button"
                      className="min-w-0 p-4 text-left transition hover:bg-muted/25"
                      onClick={() => handleOpenRun(run.runId)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{run.name || run.runId}</CardTitle>
                            <Badge variant={STATUS_STYLE[run.status]}>{STATUS_LABEL[run.status]}</Badge>
                            <Badge variant={riskBadgeVariant(run.riskLevel)}>风险 {run.riskLevel}</Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {analysisTargetLabel(run, assetsById)} · {TASK_LABEL[run.taskType]} · {RUNNER_LABEL[run.triggeredBy] ?? run.triggeredBy}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">更新 {formatTime(updatedTime)}</p>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>进度</span>
                            <span>{progressPct}%</span>
                          </div>
                          <Progress value={Math.max(progressPct, run.status === "QUEUED" ? 4 : 0)} />
                          <p className="text-xs text-muted-foreground">{completedAgents}/{run.agents.length} Agent 完成</p>
                        </div>
                        <p className="line-clamp-2 text-sm leading-6">
                          {run.finalDecision.summary ?? run.finalDecision.thesis}
                        </p>
                      </div>
                    </button>

                    <div className="border-t p-4 xl:border-l xl:border-t-0">
                      <div className="grid grid-cols-4 gap-2 text-center text-xs xl:grid-cols-2">
                        <div className="rounded-md bg-muted/30 p-2">
                          <p className="font-semibold">{run.reports.length}</p>
                          <p className="text-muted-foreground">报告</p>
                        </div>
                        <div className="rounded-md bg-muted/30 p-2">
                          <p className="font-semibold">{run.evidenceIds.length}</p>
                          <p className="text-muted-foreground">证据</p>
                        </div>
                        <div className="rounded-md bg-muted/30 p-2">
                          <p className="font-semibold">{run.toolCalls.length}</p>
                          <p className="text-muted-foreground">工具</p>
                        </div>
                        <div className="rounded-md bg-muted/30 p-2">
                          <p className="font-semibold">{(run.finalDecision.confidence * 100).toFixed(0)}%</p>
                          <p className="text-muted-foreground">置信</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">{ASSET_LABEL[runAssetCategory]}</Badge>
                        <Badge variant="outline">{teams.length} 个团队</Badge>
                        {riskWarnings > 0 ? <Badge variant="outline">风险提示 {riskWarnings}</Badge> : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => handleOpenRun(run.runId)}>
                          详情
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { runId: run.runId })}>
                          归因
                        </Button>
                        {run.evidenceIds[0] ? (
                          <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: run.evidenceIds[0] })}>
                            证据
                          </Button>
                        ) : null}
                      </div>
                    </div>
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
