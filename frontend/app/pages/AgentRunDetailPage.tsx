import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AgentDecision,
  AgentDecisionAction,
  AgentDecisionHorizon,
  AgentEvent,
  AgentReport,
  AgentRun,
  AgentRunStatus,
  AgentTeam,
  ToolCall,
  ToolCallStatus,
} from "@/entities/agent/model";
import type { Evidence, EvidenceType } from "@/entities/evidence/model";
import { listAssets } from "@/entities/asset/api";
import {
  createAgentRuntimeEventStream,
  getAgentRunByIdAsync,
  getAgentRunDecisionAsync,
  getAgentRunEvidenceAsync,
  getAgentRunReportsAsync,
  getAgentRunRuntimeEventsAsync,
  listAgentRunsAsync,
} from "@/entities/agent/api";
import { applyRuntimeEvents, createInitialRuntimeSnapshot } from "@/entities/agent/runtime-adapter";
import type { AgentRuntimeEvent } from "@/entities/agent/runtime-events";
import { listEvidence } from "@/entities/evidence/api";
import { getApiMode } from "@/shared/api/api-mode";
import { buildAgentExecutionProgress } from "@/shared/lib/agent-progress";
import { buildAgentRunProgress } from "@/shared/lib/runtime-step-mapper";
import { navigateTo } from "@/shared/lib/navigation";
import { useTypewriterStream } from "@/shared/lib/use-typewriter-stream";
import AgentProgressCard from "@/shared/ui/AgentProgressCard";
import AgentRunProgressCard from "@/shared/ui/AgentRunProgressCard";
import FinalDecisionView from "@/shared/ui/FinalDecisionView";
import StructuredReportView from "@/shared/ui/StructuredReportView";

interface AgentRunDetailPageProps {
  runId?: string;
}

type RealDataStatus = "idle" | "loading" | "loaded" | "error";

type ReportSectionId = "market_view" | "bull_view" | "bear_view" | "risk_review" | "final_decision";

const REPORT_SECTIONS: Array<{ id: ReportSectionId; label: string }> = [
  { id: "market_view", label: "Market View" },
  { id: "bull_view", label: "Bull View" },
  { id: "bear_view", label: "Bear View" },
  { id: "risk_review", label: "Risk Review" },
  { id: "final_decision", label: "Final Decision" },
];

interface RealDataLoadState {
  reports: RealDataStatus;
  evidence: RealDataStatus;
  decision: RealDataStatus;
}

const TEAM_ORDER: AgentTeam[] = [
  "ANALYST_TEAM",
  "RESEARCH_TEAM",
  "STRATEGY_TEAM",
  "RISK_TEAM",
  "PORTFOLIO_TEAM",
];

const TEAM_LABEL: Record<AgentTeam, string> = {
  ANALYST_TEAM: "Analyst Team",
  RESEARCH_TEAM: "Research Team",
  STRATEGY_TEAM: "Strategy Team",
  RISK_TEAM: "Risk Team",
  PORTFOLIO_TEAM: "Portfolio Team",
};

const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  QUEUED: "等待中",
  RUNNING: "运行中",
  COMPLETED: "已完成",
  PARTIALLY_COMPLETED: "部分完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const RUN_STATUS_BADGE: Record<AgentRunStatus, "default" | "secondary" | "outline" | "destructive"> = {
  QUEUED: "outline",
  RUNNING: "secondary",
  COMPLETED: "default",
  PARTIALLY_COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const TOOL_STATUS_BADGE: Record<ToolCallStatus, "default" | "secondary" | "outline" | "destructive"> = {
  RUNNING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
};

const DECISION_ACTION_LABEL: Record<AgentDecisionAction, string> = {
  OVERWEIGHT: "增配",
  UNDERWEIGHT: "减配",
  HOLD: "持有",
  WATCH: "观察",
  NO_ACTION: "暂不配置",
};

const HORIZON_LABEL: Record<AgentDecisionHorizon, string> = {
  SHORT_TERM: "短期",
  MEDIUM_TERM: "中期",
  LONG_TERM: "长期",
};

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  news: "新闻",
  announcement: "公告",
  research_report: "研报",
  fund_quarterly_report: "基金季报",
  macro_data: "宏观数据",
  market_snapshot: "行情快照",
  industry_data: "产业数据",
  user_upload: "用户上传",
};

const EVENT_LABEL: Record<AgentEvent["type"], string> = {
  "agent.started": "agent.started",
  "agent.completed": "agent.completed",
  "agent.failed": "agent.failed",
  "tool.called": "tool.called",
  "tool.result": "tool.result",
  "reasoning.chunk": "reasoning.chunk",
  "report.generated": "report.generated",
  "debate.message": "debate.message",
  "risk.warning": "risk.warning",
  "decision.updated": "decision.updated",
};

const RISK_LEVEL_BADGE: Record<AgentRun["riskLevel"], "default" | "secondary" | "destructive"> = {
  LOW: "default",
  MEDIUM: "secondary",
  HIGH: "destructive",
};

const formatDateTime = (timestamp?: string): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;

const formatLoadStatus = (status: RealDataStatus): string => {
  if (status === "loading") return "loading";
  if (status === "loaded") return "loaded";
  if (status === "error") return "error";
  return "idle";
};

const getStreamingChunkContent = (event: AgentRuntimeEvent): string => {
  if (event.type !== "reasoning.chunk") return "";
  const payload = event.payload as Record<string, unknown>;
  if (payload.streaming !== true || typeof payload.content !== "string") return "";
  return payload.content;
};

const getStreamingChunkForStep = (event: AgentRuntimeEvent, stepId: ReportSectionId): string => {
  if (event.type !== "reasoning.chunk") return "";
  const payload = event.payload as Record<string, unknown>;
  if (payload.streaming !== true || payload.stepId !== stepId || typeof payload.content !== "string") return "";
  return payload.content;
};

const formatDuration = (run: AgentRun): string => {
  if (run.metrics.durationSeconds > 0) {
    const sec = run.metrics.durationSeconds;
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    if (minutes < 60) {
      return `${minutes}分 ${seconds}秒`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}时 ${minutes % 60}分`;
  }

  const start = new Date(run.startedAt).getTime();
  const end = new Date(run.completedAt ?? run.updatedAt ?? Date.now()).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "-";
  const sec = Math.floor((end - start) / 1000);
  const minutes = Math.floor(sec / 60);
  return `${minutes}分 ${sec % 60}秒`;
};

const formatArgsSummary = (args: Record<string, unknown>): string => {
  const entries = Object.entries(args);
  if (entries.length === 0) return "无参数";
  return entries
    .slice(0, 3)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.slice(0, 3).join(", ")}`;
      if (typeof value === "object" && value !== null) return `${key}: {...}`;
      return `${key}: ${String(value)}`;
    })
    .join(" | ");
};

interface RuntimeToolActivity {
  activityId: string;
  toolName: string;
  agentName: string;
  status: ToolCallStatus;
  args: Record<string, unknown>;
  summary?: string;
  evidenceIds: string[];
  startedAt: string;
  completedAt?: string;
}

const runtimePayload = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) {
    return event.payload as Record<string, unknown>;
  }
  return {};
};

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const runtimeToolStatusBadge = (status: ToolCallStatus): "default" | "secondary" | "outline" | "destructive" => {
  if (status === "FAILED") return "destructive";
  if (status === "RUNNING") return "secondary";
  return "default";
};

const getRuntimeToolActivities = (events: AgentRuntimeEvent[]): RuntimeToolActivity[] => {
  const activities: RuntimeToolActivity[] = [];
  const openByKey = new Map<string, RuntimeToolActivity>();

  [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((event) => {
      if (event.type !== "tool.called" && event.type !== "tool.result") return;

      const payload = runtimePayload(event);
      const toolName = typeof payload.toolName === "string" ? payload.toolName : "runtime.tool";
      const stepId = typeof payload.stepId === "string" ? payload.stepId : "general";
      const agentName = event.agentName ?? "System";
      const key = `${agentName}:${stepId}:${toolName}`;

      if (event.type === "tool.called") {
        const args = typeof payload.args === "object" && payload.args !== null ? (payload.args as Record<string, unknown>) : {};
        const activity: RuntimeToolActivity = {
          activityId: event.eventId,
          toolName,
          agentName,
          status: "RUNNING",
          args,
          evidenceIds: toStringList(payload.evidenceIds),
          startedAt: event.timestamp,
        };
        activities.push(activity);
        openByKey.set(key, activity);
        return;
      }

      const activity =
        openByKey.get(key) ??
        ({
          activityId: event.eventId,
          toolName,
          agentName,
          status: "RUNNING",
          args: {},
          evidenceIds: [],
          startedAt: event.timestamp,
        } satisfies RuntimeToolActivity);

      const failed = payload.status === "failed" || typeof payload.error === "string";
      activity.status = failed ? "FAILED" : "COMPLETED";
      activity.completedAt = event.timestamp;
      activity.summary =
        typeof payload.summary === "string"
          ? payload.summary
          : typeof payload.content === "string"
            ? payload.content
            : typeof payload.error === "string"
              ? payload.error
              : "Runtime tool result received.";
      activity.evidenceIds = Array.from(new Set([...activity.evidenceIds, ...toStringList(payload.evidenceIds)]));

      if (!openByKey.has(key)) activities.push(activity);
      openByKey.delete(key);
    });

  return activities;
};

const summarizeEvent = (event: AgentEvent, agentName: string): string => {
  switch (event.type) {
    case "agent.started":
      return `${agentName} started`;
    case "agent.completed":
      return `${agentName} completed`;
    case "agent.failed":
      return `${agentName} failed: ${event.error}`;
    case "tool.called":
      return `${agentName} called ${event.toolName}`;
    case "tool.result":
      return `${agentName} received ${event.toolName} result`;
    case "reasoning.chunk":
      return event.content;
    case "report.generated":
      return `${agentName} generated report "${event.title}"`;
    case "debate.message":
      return `${agentName} (${event.stance}) ${event.content}`;
    case "risk.warning":
      return `${agentName} ${event.level} risk: ${event.content}`;
    case "decision.updated":
      return `Decision updated to ${DECISION_ACTION_LABEL[event.action]} (${formatPercent(event.confidence, 0)})`;
    default:
      return "Event";
  }
};

const goBackToAgentLab = () => {
  navigateTo("/agent-lab");
};

const reportSectionFromReport = (report: AgentReport): ReportSectionId | undefined => {
  const text = `${report.title} ${report.summary}`.toLowerCase();
  if (text.includes("market view")) return "market_view";
  if (text.includes("bull view")) return "bull_view";
  if (text.includes("bear view")) return "bear_view";
  if (text.includes("risk review")) return "risk_review";
  return undefined;
};


export default function AgentRunDetailPage({ runId }: AgentRunDetailPageProps) {
  const apiMode = useMemo(() => getApiMode(), []);
  const assets = useMemo(() => {
    try {
      return listAssets();
    } catch {
      return [];
    }
  }, []);
  const evidenceItems = useMemo(() => {
    try {
      return listEvidence();
    } catch {
      return [];
    }
  }, []);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const [run, setRun] = useState<AgentRun | undefined>();
  const [isLoadingRun, setIsLoadingRun] = useState(true);
  const [runLoadError, setRunLoadError] = useState<string | null>(null);
  const runtimeClientRef = useRef<ReturnType<typeof createAgentRuntimeEventStream> | null>(null);
  const [runtimeEvents, setRuntimeEvents] = useState<AgentRuntimeEvent[]>([]);
  const [runtimeReplayStatus, setRuntimeReplayStatus] = useState<"IDLE" | "RUNNING" | "COMPLETED" | "STOPPED" | "ERROR">("IDLE");
  const [runtimeReplayError, setRuntimeReplayError] = useState<string | null>(null);
  const [realRunEvidence, setRealRunEvidence] = useState<Evidence[] | null>(null);
  const [realDataLoadState, setRealDataLoadState] = useState<RealDataLoadState>({
    reports: "idle",
    evidence: "idle",
    decision: "idle",
  });
  const [realDataLoadErrors, setRealDataLoadErrors] = useState<Partial<Record<keyof RealDataLoadState, string>>>({});
  const [activeReportSection, setActiveReportSection] = useState<ReportSectionId>("market_view");
  const runNotFound = Boolean(!isLoadingRun && runId && !run);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingRun(true);
    setRunLoadError(null);
    setRuntimeEvents([]);
    setRuntimeReplayStatus("IDLE");
    setRuntimeReplayError(null);
    setRealRunEvidence(null);
    setRealDataLoadState({ reports: "idle", evidence: "idle", decision: "idle" });
    setRealDataLoadErrors({});

    const loadRun = runId
      ? getAgentRunByIdAsync(runId)
      : listAgentRunsAsync().then((runs) => runs[0]);

    loadRun
      .then((nextRun) => {
        if (!cancelled) {
          setRun(nextRun);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRun(undefined);
          setRunLoadError(error instanceof Error ? error.message : "Agent Run 数据加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRun(false);
        }
      });

    return () => {
      cancelled = true;
      runtimeClientRef.current?.close();
      runtimeClientRef.current = null;
    };
  }, [runId]);

  useEffect(() => {
    if (!run?.runId || apiMode !== "real") return;
    let cancelled = false;
    getAgentRunRuntimeEventsAsync(run.runId)
      .then((events) => {
        if (!cancelled) {
          setRuntimeEvents(events);
          setRuntimeReplayStatus(run.status === "RUNNING" ? "IDLE" : "COMPLETED");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeReplayError(error instanceof Error ? error.message : "Runtime Events 加载失败");
          setRuntimeReplayStatus("ERROR");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, run?.runId, run?.status]);

  useEffect(() => {
    if (!run?.runId || apiMode !== "real") return;
    let cancelled = false;
    const activeRunId = run.runId;

    setRealDataLoadState({ reports: "loading", evidence: "loading", decision: "loading" });
    setRealDataLoadErrors({});

    getAgentRunReportsAsync(activeRunId)
      .then((reports: AgentReport[]) => {
        if (cancelled) return;
        setRun((current) =>
          current?.runId === activeRunId
            ? { ...current, reports, metrics: { ...current.metrics, generatedReports: reports.length } }
            : current,
        );
        setRealDataLoadState((current) => ({ ...current, reports: "loaded" }));
      })
      .catch((error) => {
        if (cancelled) return;
        setRealDataLoadState((current) => ({ ...current, reports: "error" }));
        setRealDataLoadErrors((current) => ({
          ...current,
          reports: error instanceof Error ? error.message : "Reports 加载失败",
        }));
      });

    getAgentRunEvidenceAsync(activeRunId)
      .then((evidence: Evidence[]) => {
        if (cancelled) return;
        setRealRunEvidence(evidence);
        const evidenceIds = evidence.map((item) => item.id);
        setRun((current) =>
          current?.runId === activeRunId
            ? { ...current, evidenceIds: Array.from(new Set([...current.evidenceIds, ...evidenceIds])) }
            : current,
        );
        setRealDataLoadState((current) => ({ ...current, evidence: "loaded" }));
      })
      .catch((error) => {
        if (cancelled) return;
        setRealDataLoadState((current) => ({ ...current, evidence: "error" }));
        setRealDataLoadErrors((current) => ({
          ...current,
          evidence: error instanceof Error ? error.message : "Evidence 加载失败",
        }));
      });

    getAgentRunDecisionAsync(activeRunId)
      .then((decision: AgentDecision | undefined) => {
        if (cancelled) return;
        if (decision) {
          setRun((current) => (current?.runId === activeRunId ? { ...current, finalDecision: decision } : current));
        }
        setRealDataLoadState((current) => ({ ...current, decision: "loaded" }));
      })
      .catch((error) => {
        if (cancelled) return;
        setRealDataLoadState((current) => ({ ...current, decision: "error" }));
        setRealDataLoadErrors((current) => ({
          ...current,
          decision: error instanceof Error ? error.message : "Decision 加载失败",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [apiMode, run?.runId]);

  const runtimeSnapshot = useMemo(() => {
    if (!run) return null;
    return applyRuntimeEvents(createInitialRuntimeSnapshot(run.runId), runtimeEvents);
  }, [run, runtimeEvents]);

  const runProgress = useMemo(() => {
    if (!run) return null;
    return buildAgentRunProgress({
      events: runtimeEvents,
      timeline: runtimeSnapshot?.timeline,
      reports: run.reports,
      decision: run.finalDecision,
      runStatus: run.status,
    });
  }, [run, runtimeEvents, runtimeSnapshot?.timeline]);

  const liveReportText = useMemo(
    () =>
      [...runtimeEvents]
        .sort((a, b) => a.sequence - b.sequence)
        .map(getStreamingChunkContent)
        .join(""),
    [runtimeEvents],
  );
  const smoothLiveReportText = useTypewriterStream(liveReportText, {
    enabled: run?.status === "RUNNING",
    charsPerTick: 5,
    intervalMs: 18,
  });

  const debateLiveOutputs = useMemo(
    () => ({
      bull: [...runtimeEvents]
        .sort((a, b) => a.sequence - b.sequence)
        .map((event) => getStreamingChunkForStep(event, "bull_view"))
        .join(""),
      bear: [...runtimeEvents]
        .sort((a, b) => a.sequence - b.sequence)
        .map((event) => getStreamingChunkForStep(event, "bear_view"))
        .join(""),
    }),
    [runtimeEvents],
  );
  const smoothBullOutput = useTypewriterStream(debateLiveOutputs.bull, {
    enabled: run?.status === "RUNNING",
    charsPerTick: 5,
    intervalMs: 18,
  });
  const smoothBearOutput = useTypewriterStream(debateLiveOutputs.bear, {
    enabled: run?.status === "RUNNING",
    charsPerTick: 5,
    intervalMs: 18,
  });

  const reportSections = useMemo(() => {
    const sections = new Map<ReportSectionId, AgentReport>();
    run?.reports.forEach((report) => {
      const section = reportSectionFromReport(report);
      if (section && !sections.has(section)) sections.set(section, report);
    });
    return sections;
  }, [run?.reports]);

  const activeReport = reportSections.get(activeReportSection);

  const agentProgressItems = useMemo(() => (run ? buildAgentExecutionProgress({ run, runtimeEvents }) : []), [run, runtimeEvents]);

  const agentProgressById = useMemo(
    () => new Map(agentProgressItems.map((item) => [item.agent.agentId, item])),
    [agentProgressItems],
  );

  const refreshRealRunDetail = async (activeRunId: string) => {
    const [nextRun, reports, evidence, decision] = await Promise.all([
      getAgentRunByIdAsync(activeRunId),
      getAgentRunReportsAsync(activeRunId).catch(() => undefined),
      getAgentRunEvidenceAsync(activeRunId).catch(() => undefined),
      getAgentRunDecisionAsync(activeRunId).catch(() => undefined),
    ]);

    if (nextRun) {
      setRun(nextRun);
    }
    if (reports) {
      setRun((current) =>
        current?.runId === activeRunId
          ? { ...current, reports, metrics: { ...current.metrics, generatedReports: reports.length } }
          : current,
      );
      setRealDataLoadState((current) => ({ ...current, reports: "loaded" }));
    }
    if (evidence) {
      setRealRunEvidence(evidence);
      setRealDataLoadState((current) => ({ ...current, evidence: "loaded" }));
    }
    if (decision) {
      setRun((current) => (current?.runId === activeRunId ? { ...current, finalDecision: decision } : current));
      setRealDataLoadState((current) => ({ ...current, decision: "loaded" }));
    }
  };

  const startRuntimeReplay = () => {
    if (!run) return;
    const activeRunId = run.runId;
    runtimeClientRef.current?.close();
    setRuntimeEvents([]);
    setRuntimeReplayError(null);
    setRuntimeReplayStatus("RUNNING");

    runtimeClientRef.current = createAgentRuntimeEventStream(activeRunId, {
      transport: apiMode === "real" ? "sse" : "mock",
      intervalMs: 360,
      onEvent: (event) => {
        setRuntimeEvents((current) => {
          if (current.some((item) => item.eventId === event.eventId)) return current;
          return [...current, event].sort((a, b) => a.sequence - b.sequence);
        });
      },
      onComplete: () => {
        setRuntimeReplayStatus("COMPLETED");
        if (apiMode === "real") {
          void refreshRealRunDetail(activeRunId);
        }
      },
      onError: (error) => {
        setRuntimeReplayError(error.message);
        setRuntimeReplayStatus("ERROR");
        if (apiMode === "real") {
          void refreshRealRunDetail(activeRunId);
        }
      },
    });
    runtimeClientRef.current.start();
  };

  const stopRuntimeReplay = () => {
    runtimeClientRef.current?.close();
    runtimeClientRef.current = null;
    setRuntimeReplayStatus("STOPPED");
  };

  useEffect(() => {
    if (apiMode !== "real" || !run || run.status !== "RUNNING" || runtimeReplayStatus !== "IDLE") return;
    startRuntimeReplay();
    // startRuntimeReplay intentionally reads the latest component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, run?.runId, run?.status, runtimeReplayStatus]);

  const derived = useMemo(() => {
    if (!run) return null;

    const agentById = new Map(run.agents.map((agent) => [agent.agentId, agent]));
    const sortedReports = [...run.reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latestReport = sortedReports[sortedReports.length - 1];

    const debateMessages = run.events
      .filter((event): event is Extract<AgentEvent, { type: "debate.message" }> => event.type === "debate.message")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const riskWarnings = run.events
      .filter((event): event is Extract<AgentEvent, { type: "risk.warning" }> => event.type === "risk.warning")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const evidenceIdSet = new Set<string>([
      ...run.evidenceIds,
      ...run.finalDecision.evidenceIds,
      ...run.toolCalls.flatMap((call) => call.evidenceIds ?? []),
      ...run.events.flatMap((event) => ("evidenceIds" in event && event.evidenceIds ? event.evidenceIds : [])),
      ...runtimeEvents.flatMap((event) => toStringList(runtimePayload(event).evidenceIds)),
    ]);
    const evidencePool = realRunEvidence ?? evidenceItems;
    const usedEvidence = realRunEvidence ?? evidencePool.filter((item) => evidenceIdSet.has(item.id));

    const sortedToolCalls = [...run.toolCalls].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const runtimeToolActivities = getRuntimeToolActivities(runtimeEvents);
    const timelineEvents = [...run.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const teamGroups = TEAM_ORDER.map((team) => ({
      team,
      agents: run.agents.filter((agent) => agent.team === team),
    }));

    const completedAgents = run.agents.filter((agent) => agent.status === "COMPLETED").length;
    const riskWarningCount = riskWarnings.length;
    const progressPercent = run.agents.length > 0 ? Math.round((completedAgents / run.agents.length) * 100) : 0;
    const runDuration = formatDuration(run);

    const evidenceTypes = new Set(usedEvidence.map((item) => item.evidenceType));
    const hasFuturesStructure =
      sortedToolCalls.some((call) => /futures|curve|basis|term/i.test(call.toolName)) ||
      runtimeToolActivities.some((call) => /futures|curve|basis|term/i.test(call.toolName)) ||
      usedEvidence.some((item) => item.evidenceType === "industry_data");
    const dataContext = [
      { label: "行情", active: evidenceTypes.has("market_snapshot") },
      { label: "新闻", active: evidenceTypes.has("news") },
      { label: "公告", active: evidenceTypes.has("announcement") },
      { label: "研报", active: evidenceTypes.has("research_report") },
      { label: "宏观", active: evidenceTypes.has("macro_data") },
      { label: "基金季报", active: evidenceTypes.has("fund_quarterly_report") },
      { label: "期货结构", active: hasFuturesStructure },
    ];

    return {
      agentById,
      latestReport,
      sortedReports,
      debateMessages,
      riskWarnings,
      usedEvidence,
      sortedToolCalls,
      runtimeToolActivities,
      timelineEvents,
      teamGroups,
      completedAgents,
      riskWarningCount,
      progressPercent,
      runDuration,
      dataContext,
    };
  }, [run, evidenceItems, realRunEvidence, runtimeEvents]);

  if (isLoadingRun) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">正在加载 Agent Run 数据</p>
            <p className="text-xs text-muted-foreground">Data Mode: {apiMode === "real" ? "Real API" : "Mock"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (runLoadError) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Agent Run 数据加载失败</CardTitle>
            <CardDescription>Data Mode: {apiMode === "real" ? "Real API" : "Mock"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-destructive">{runLoadError}</p>
            <Button variant="outline" onClick={goBackToAgentLab}>
              返回 Agent Lab
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (runNotFound) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">未找到对应 Agent Run</CardTitle>
            <CardDescription>runId: {runId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">请返回 Agent Lab 选择有效任务。</p>
            <Button variant="outline" onClick={goBackToAgentLab}>
              返回 Agent Lab
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无 Agent Run 数据</p>
            <p className="text-xs text-muted-foreground">请先在 Agent Runtime API 或 mock service 中配置 Agent Run。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const assetLabel = run.assetIds
    .map((assetId) => {
      const asset = assetsById.get(assetId);
      return asset ? `${asset.symbol} ${asset.name}` : assetId;
    })
    .join(" / ");

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-xl">Agent Run Detail · {run.runId}</CardTitle>
              <CardDescription>{run.name}</CardDescription>
              <div className="flex flex-wrap gap-2">
                <Badge variant={apiMode === "real" ? "secondary" : "outline"}>
                  Data Mode: {apiMode === "real" ? "Real API" : "Mock"}
                </Badge>
                {apiMode === "real" ? (
                  <>
                    <Badge variant={RUN_STATUS_BADGE[run.status]}>Run Status: {run.status}</Badge>
                    <Badge variant={runtimeReplayStatus === "ERROR" ? "destructive" : runtimeReplayStatus === "RUNNING" ? "secondary" : "outline"}>
                      Stream: {runtimeReplayStatus === "RUNNING" ? "Connected" : runtimeReplayStatus === "ERROR" ? "Error" : runtimeReplayStatus === "COMPLETED" ? "Closed" : "Ready"}
                    </Badge>
                    <Badge variant={runtimeReplayStatus === "ERROR" ? "destructive" : "outline"}>
                      Events: {runtimeReplayStatus === "ERROR" ? "error" : runtimeEvents.length > 0 ? "loaded" : "loading"}
                    </Badge>
                    <Badge variant={realDataLoadState.reports === "error" ? "destructive" : "outline"}>
                      Reports: {formatLoadStatus(realDataLoadState.reports)}
                    </Badge>
                    <Badge variant={realDataLoadState.evidence === "error" ? "destructive" : "outline"}>
                      Evidence: {formatLoadStatus(realDataLoadState.evidence)}
                    </Badge>
                    <Badge variant={realDataLoadState.decision === "error" ? "destructive" : "outline"}>
                      Decision: {formatLoadStatus(realDataLoadState.decision)}
                    </Badge>
                  </>
                ) : null}
              </div>
              {apiMode === "real" && Object.keys(realDataLoadErrors).length > 0 ? (
                <div className="space-y-1 text-xs text-destructive">
                  {realDataLoadErrors.reports ? <p>Reports: {realDataLoadErrors.reports}</p> : null}
                  {realDataLoadErrors.evidence ? <p>Evidence: {realDataLoadErrors.evidence}</p> : null}
                  {realDataLoadErrors.decision ? <p>Decision: {realDataLoadErrors.decision}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
              <Badge variant={RISK_LEVEL_BADGE[run.riskLevel]}>风险 {run.riskLevel}</Badge>
              <Badge variant="outline">{run.taskType}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs text-muted-foreground">
          <p>分析目标：{run.target}</p>
          <p>分析资产：{assetLabel}</p>
          <p>任务类型：{run.taskType}</p>
          <p>模型配置：{run.modelName ?? "mock-model-config"}</p>
          <p>开始时间：{formatDateTime(run.startedAt)}</p>
          <p>结束时间：{formatDateTime(run.completedAt)}</p>
          <p>持续时间：{derived?.runDuration}</p>
          <p>最终建议：{run.finalDecision.summary ?? run.finalDecision.thesis}</p>
        </CardContent>
        <CardContent className="pt-0 flex flex-wrap gap-2">
          {run.assetIds.map((assetId) => (
            <Button
              key={`jump-asset-${assetId}`}
              size="sm"
              variant="outline"
              onClick={() => navigateTo(`/assets/${encodeURIComponent(assetId)}`)}
            >
              查看资产 {assetsById.get(assetId)?.symbol ?? assetId}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { runId: run.runId })}>
            查看决策归因
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { runId: run.runId, portfolioId: run.portfolioId })}>
            查看组合影响
          </Button>
        </CardContent>
      </Card>

      {runProgress ? (
        <AgentRunProgressCard progress={runProgress} runStatus={run.status} runtimeStatus={runtimeReplayStatus} />
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <Card className="xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent Progress Board</CardTitle>
            <CardDescription>
              TradingAgents-style Progress · Logical DAG · {derived?.completedAgents}/{run.agents.length} completed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded border bg-muted/20 p-2 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground">Logical Agent Flow</p>
              <p>Evidence Retrieval → Market View → Bull View / Bear View 并行 → Risk Review → Final Decision</p>
              <p>当前为 Qwen 单次调用拆分的模拟研究工作流，不代表真实并行计算。</p>
            </div>
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div className="h-full rounded bg-blue-500" style={{ width: `${Math.max(derived?.progressPercent ?? 0, 4)}%` }} />
            </div>
            {derived?.teamGroups.map((group) => (
              <div key={group.team} className="border rounded-md p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{TEAM_LABEL[group.team]}</p>
                  {group.team === "RESEARCH_TEAM" ? <Badge variant="secondary">Parallel Review Track</Badge> : null}
                </div>
                {group.agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无该团队 Agent</p>
                ) : (
                  group.agents.map((agent) => {
                    const progressItem = agentProgressById.get(agent.agentId);
                    return progressItem ? <AgentProgressCard key={agent.agentId} item={progressItem} /> : null;
                  })
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="xl:col-span-6 flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Current Report / Research Report</CardTitle>
              <CardDescription>按 Market / Bull / Bear / Risk / Decision 分区查看输出</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {smoothLiveReportText.trim() && (run.status === "RUNNING" || run.status === "FAILED") ? (
                <div className="rounded border border-blue-500/40 bg-blue-500/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">General Live Output</p>
                    <Badge variant="secondary">{smoothLiveReportText.length}/{liveReportText.length} chars</Badge>
                  </div>
                  <div className="mt-2 max-h-64 overflow-auto">
                    <StructuredReportView text={smoothLiveReportText} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {REPORT_SECTIONS.map((section) => {
                  const hasReport = section.id === "final_decision" ? Boolean(run.finalDecision?.thesis) : reportSections.has(section.id);
                  return (
                    <Button
                      key={section.id}
                      size="sm"
                      variant={activeReportSection === section.id ? "default" : "outline"}
                      onClick={() => setActiveReportSection(section.id)}
                    >
                      {section.label}
                      {hasReport ? "" : " · pending"}
                    </Button>
                  );
                })}
              </div>

              {activeReportSection === "final_decision" ? (
                <div className="rounded border p-2 bg-muted/20">
                  <p className="mb-2 font-medium">Final Decision</p>
                  <StructuredReportView text={run.finalDecision.thesis} compact />
                </div>
              ) : activeReport ? (
                <div className="rounded border p-2 bg-muted/20">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{activeReport.title}</p>
                    <span className="text-muted-foreground">{formatDateTime(activeReport.createdAt)}</span>
                  </div>
                  <div className="max-h-[34rem] overflow-auto pr-1">
                    <StructuredReportView text={activeReport.summary} />
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed p-4 text-center text-muted-foreground">
                  当前分区暂无最终报告。运行中请查看 Agent DAG 中对应节点的 Live Output。
                </div>
              )}

              {derived?.sortedReports.length ? (
                <details className="rounded border bg-background p-2">
                  <summary className="cursor-pointer font-medium">All Reports ({derived.sortedReports.length})</summary>
                  <div className="mt-2 space-y-2">
                    {derived.sortedReports.map((report) => (
                      <div key={report.reportId} className="rounded border p-2">
                        <p className="font-medium">{report.title}</p>
                        <StructuredReportView text={report.summary} className="mt-1" compact />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent Debate Panel</CardTitle>
              <CardDescription>Bull / Bear 的实时输出和最终观点集中展示在这里</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex flex-col gap-3">
                {[
                  {
                    id: "bull_view" as const,
                    label: "Bull Researcher",
                    stance: "BULL",
                    liveText: smoothBullOutput,
                    rawLiveText: debateLiveOutputs.bull,
                    reportText: reportSections.get("bull_view")?.summary ?? "",
                    placeholder: "等待 Bull View 输出。Market View 完成后，该区域会展示 Bull Researcher 的实时观点。",
                    badge: "default" as const,
                  },
                  {
                    id: "bear_view" as const,
                    label: "Bear Researcher",
                    stance: "BEAR",
                    liveText: smoothBearOutput,
                    rawLiveText: debateLiveOutputs.bear,
                    reportText: reportSections.get("bear_view")?.summary ?? "",
                    placeholder: "等待 Bear View 输出。Market View 完成后，该区域会展示 Bear Researcher 的实时风险与反方观点。",
                    badge: "destructive" as const,
                  },
                ].map((track) => {
                  const isLive = Boolean(track.rawLiveText.trim()) && run.status === "RUNNING";
                  const text = track.liveText.trim() || track.reportText.trim() || track.placeholder;
                  return (
                    <div key={track.id} className="rounded border p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{track.label}</p>
                        <div className="flex items-center gap-1">
                          {isLive ? <Badge variant="secondary">Live</Badge> : null}
                          <Badge variant={track.badge}>{track.stance}</Badge>
                        </div>
                      </div>
                      <div className="max-h-[26rem] overflow-auto rounded bg-muted/20 p-2">
                        <StructuredReportView text={text} compact />
                      </div>
                    </div>
                  );
                })}
              </div>

              {derived?.debateMessages.length ? (
                <details className="rounded border bg-background p-2">
                  <summary className="cursor-pointer font-medium">Raw Debate Messages ({derived.debateMessages.length})</summary>
                  <div className="mt-2 space-y-2">
                    {derived.debateMessages.map((message, index) => {
                      const agent = derived.agentById.get(message.agentId);
                      const stanceVariant =
                        message.stance === "BULL"
                          ? "default"
                          : message.stance === "BEAR"
                            ? "destructive"
                            : "secondary";
                      return (
                        <div key={`${message.timestamp}-${index}`} className="rounded border p-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{agent?.name ?? message.agentId}</p>
                            <Badge variant={stanceVariant}>{message.stance}</Badge>
                          </div>
                          <StructuredReportView text={message.content} compact />
                          <p className="text-muted-foreground">{formatDateTime(message.timestamp)}</p>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Final Decision Card</CardTitle>
              <CardDescription>结构化展示最终建议、核心逻辑、风险、观察指标与证据</CardDescription>
            </CardHeader>
            <CardContent>
              <FinalDecisionView
                decision={run.finalDecision}
                actionLabel={DECISION_ACTION_LABEL[run.finalDecision.action]}
                horizonLabel={HORIZON_LABEL[run.finalDecision.horizon]}
                confidenceLabel={formatPercent(run.finalDecision.confidence, 0)}
                onEvidenceSelect={(id) => navigateTo("/evidence", { evidenceId: id })}
              />
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-3 flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tool Calls Timeline</CardTitle>
              <CardDescription>工具调用、参数、结果和状态</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[34rem] overflow-auto space-y-2 pr-1 text-[11px]">
              {derived?.sortedToolCalls.length ? (
                derived.sortedToolCalls.map((call: ToolCall) => {
                  const agent = derived.agentById.get(call.agentId);
                  return (
                    <div key={call.callId} className="rounded border p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">{call.toolName}</p>
                        <Badge variant={TOOL_STATUS_BADGE[call.status]}>{call.status}</Badge>
                      </div>
                      <p className="truncate text-muted-foreground">Agent: {agent?.name ?? call.agentId}</p>
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">details</summary>
                        <div className="mt-1 space-y-1">
                          <p className="text-muted-foreground">Args: {formatArgsSummary(call.args)}</p>
                          <p className="text-muted-foreground">Result: {call.summary ?? "执行中或无结果摘要"}</p>
                          <p className="text-muted-foreground">
                            {formatDateTime(call.startedAt)} {call.completedAt ? `→ ${formatDateTime(call.completedAt)}` : ""}
                          </p>
                        </div>
                      </details>
                      {call.evidenceIds?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {call.evidenceIds.map((id) => (
                            <Button
                              key={`${call.callId}-${id}`}
                              size="sm"
                              variant="outline"
                              onClick={() => navigateTo("/evidence", { evidenceId: id })}
                            >
                              {id}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : derived?.runtimeToolActivities.length ? (
                derived.runtimeToolActivities.map((activity) => (
                  <div key={activity.activityId} className="rounded border p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{activity.toolName}</p>
                      <Badge variant={runtimeToolStatusBadge(activity.status)}>{activity.status}</Badge>
                    </div>
                    <p className="truncate text-muted-foreground">Agent: {activity.agentName}</p>
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">details</summary>
                      <div className="mt-1 space-y-1">
                        <p className="text-muted-foreground">Args: {formatArgsSummary(activity.args)}</p>
                        <p className="text-muted-foreground">Result: {activity.summary ?? "执行中，等待 runtime tool result。"}</p>
                        <p className="text-muted-foreground">
                          {formatDateTime(activity.startedAt)} {activity.completedAt ? `→ ${formatDateTime(activity.completedAt)}` : ""}
                        </p>
                      </div>
                    </details>
                    {activity.evidenceIds.length ? (
                      <div className="flex flex-wrap gap-1">
                        {activity.evidenceIds.map((id) => (
                          <Button
                            key={`${activity.activityId}-${id}`}
                            size="sm"
                            variant="outline"
                            onClick={() => navigateTo("/evidence", { evidenceId: id })}
                          >
                            {id}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">暂无独立工具调用记录。Qwen 分析过程会优先展示在 Agent DAG 和 Runtime Event Stream 中。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evidence Used</CardTitle>
              <CardDescription>证据引用链路（可追溯、可引用）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {derived?.usedEvidence.length ? (
                derived.usedEvidence.map((item: Evidence) => (
                  <div key={item.id} className="rounded border p-2 space-y-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground">
                      {EVIDENCE_TYPE_LABEL[item.evidenceType]} · {item.sourceName}
                    </p>
                    <p className="text-muted-foreground">
                      质量 {item.qualityScore} · 发布时间 {formatDateTime(item.publishedAt)}
                    </p>
                    <p className="text-muted-foreground">{item.summary}</p>
                    <div className="pt-1">
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: item.id })}>
                        查看证据详情
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">暂无关联证据。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Data Context</CardTitle>
              <CardDescription>本次运行使用的数据类别</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {derived?.dataContext.map((item) => (
                <Badge key={item.label} variant={item.active ? "default" : "outline"}>
                  {item.label}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runtime Metrics</CardTitle>
          <CardDescription>运行指标与风险提示</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Tool Calls</p>
            <p className="font-medium">{run.metrics.toolCalls}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">LLM Calls</p>
            <p className="font-medium">{run.metrics.llmCalls}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Generated Reports</p>
            <p className="font-medium">{run.metrics.generatedReports}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Evidence Items</p>
            <p className="font-medium">{derived?.usedEvidence.length ?? 0}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{derived?.runDuration}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Agent Count</p>
            <p className="font-medium">{run.agents.length}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Completed Agents</p>
            <p className="font-medium">{derived?.completedAgents}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Risk Warnings</p>
            <p className="font-medium">{derived?.riskWarningCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Runtime Event Stream</CardTitle>
              <CardDescription>
                {apiMode === "real"
                  ? "Real mode：可通过 EventSource 连接后端 stub SSE，不连接真实 TradingAgents。"
                  : "Streaming mode 占位：当前使用前端 mock replay，不连接真实 SSE / WebSocket。"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Runtime Mode: {apiMode === "real" ? "Real API Events" : "Mock Replay"}</Badge>
              <Badge variant="outline">Transport: {apiMode === "real" ? "sse" : "mock"}</Badge>
              <Badge variant={runtimeReplayStatus === "ERROR" ? "destructive" : runtimeReplayStatus === "RUNNING" ? "secondary" : "default"}>
                {runtimeReplayStatus === "IDLE" ? "Event Stream Ready" : runtimeReplayStatus}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={startRuntimeReplay} disabled={runtimeReplayStatus === "RUNNING"}>
              {apiMode === "real" ? "Start SSE Stream" : "Replay Runtime Events"}
            </Button>
            <Button size="sm" variant="outline" onClick={stopRuntimeReplay} disabled={runtimeReplayStatus !== "RUNNING"}>
              {apiMode === "real" ? "Stop SSE Stream" : "Stop Replay"}
            </Button>
            <span className="text-muted-foreground">
              Events: {runtimeEvents.length} · Sequence: {runtimeSnapshot?.sequence ?? 0} · Snapshot: {runtimeSnapshot?.status ?? "QUEUED"}
            </span>
          </div>
          {runtimeReplayError ? <p className="text-destructive">{runtimeReplayError}</p> : null}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded border p-2">
              <p className="text-muted-foreground">Replay Tool Calls</p>
              <p className="font-medium">{runtimeSnapshot?.toolCalls.length ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-muted-foreground">Replay Reports</p>
              <p className="font-medium">{runtimeSnapshot?.reports.length ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-muted-foreground">Replay Evidence</p>
              <p className="font-medium">{runtimeSnapshot?.evidenceIds.length ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-muted-foreground">Replay Checkpoints</p>
              <p className="font-medium">{runtimeSnapshot?.checkpoints.length ?? 0}</p>
            </div>
          </div>
          <div className="max-h-72 overflow-auto space-y-2">
            {runtimeSnapshot?.timeline.length ? (
              runtimeSnapshot.timeline.map((item) => (
                <div key={item.eventId} className="rounded border-l-4 border-emerald-500 bg-muted/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{item.type}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(item.timestamp)}</span>
                  </div>
                  <p className="mt-1 font-medium">{item.agentName ?? "System"}</p>
                  <p className="text-muted-foreground mt-1">{item.summary}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">
                {apiMode === "real"
                  ? "点击 Start SSE Stream 后，将逐条展示后端 stub SSE runtime events。"
                  : "点击 Replay Runtime Events 后，将按顺序展示 mock runtime event stream。"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agent Timeline</CardTitle>
          <CardDescription>可追踪决策链事件流</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {derived?.timelineEvents.length ? (
            derived.timelineEvents.map((event, index) => {
              const agentName = "agentId" in event ? (derived.agentById.get(event.agentId)?.name ?? event.agentId) : "System";
              const summary = summarizeEvent(event, agentName);
              return (
                <div key={`${event.timestamp}-${index}`} className="rounded border-l-4 border-blue-500 bg-muted/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{EVENT_LABEL[event.type]}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                  </div>
                  <p className="mt-1 font-medium">{agentName}</p>
                  <p className="text-muted-foreground mt-1">{summary}</p>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground">暂无事件流。</p>
          )}
        </CardContent>
      </Card>

      {derived?.riskWarnings.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Risk Warnings</CardTitle>
            <CardDescription>风险团队提示与监控要点</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.riskWarnings.map((warning, index) => {
              const agent = derived.agentById.get(warning.agentId);
              return (
                <div key={`${warning.timestamp}-${index}`} className="rounded border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{agent?.name ?? warning.agentId}</p>
                    <Badge variant={warning.level === "HIGH" ? "destructive" : warning.level === "MEDIUM" ? "secondary" : "outline"}>
                      {warning.level}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1">{warning.content}</p>
                  <p className="text-muted-foreground mt-1">{formatDateTime(warning.timestamp)}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}



