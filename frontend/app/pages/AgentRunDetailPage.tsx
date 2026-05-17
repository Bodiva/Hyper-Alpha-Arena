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
  AgentRunTaskType,
} from "@/entities/agent/model";
import type { Evidence, EvidenceType } from "@/entities/evidence/model";
import type { ResearchArtifactType, ResearchRunType } from "@/entities/research-workspace/taxonomy";
import { listAssets } from "@/entities/asset/api";
import {
  cancelAgentRunAsync,
  createAgentRuntimeEventStream,
  getAgentRunByIdAsync,
  getAgentRunDecisionAsync,
  getAgentRunEvidenceAsync,
  getAgentRunReportsAsync,
  getAgentRunRuntimeEventsAsync,
  getAgentRuntimeLogsAsync,
  getAgentWorkerArtifactsAsync,
  listAgentRunsAsync,
  type AgentRuntimeLogResponse,
  type AgentWorkerArtifactsResponse,
} from "@/entities/agent/api";
import { applyRuntimeEvents, createInitialRuntimeSnapshot } from "@/entities/agent/runtime-adapter";
import type { AgentRuntimeEvent } from "@/entities/agent/runtime-events";
import { listEvidence } from "@/entities/evidence/api";
import { getApiMode } from "@/shared/api/api-mode";
import { buildAgentExecutionProgress } from "@/shared/lib/agent-progress";
import { filterRetiredEvidenceIds } from "@/shared/lib/evidence-filter";
import { buildAgentRunProgress } from "@/shared/lib/runtime-step-mapper";
import { navigateTo } from "@/shared/lib/navigation";
import { useTypewriterStream } from "@/shared/lib/use-typewriter-stream";
import AgentProgressCard from "@/shared/ui/AgentProgressCard";
import AgentRunProgressCard from "@/shared/ui/AgentRunProgressCard";
import FinalDecisionView from "@/shared/ui/FinalDecisionView";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";
import StructuredReportView from "@/shared/ui/StructuredReportView";

interface AgentRunDetailPageProps {
  runId?: string;
}

type RealDataStatus = "idle" | "loading" | "loaded" | "error";

type ReportSectionId = "market_view" | "bull_view" | "bear_view" | "research_manager" | "risk_review" | "final_decision";
type BackendLogFilter = "alphatrace" | "current_run" | "all";

const REPORT_SECTIONS: Array<{ id: ReportSectionId; label: string }> = [
  { id: "market_view", label: "市场观点" },
  { id: "bull_view", label: "正方观点" },
  { id: "bear_view", label: "反方观点" },
  { id: "research_manager", label: "研究汇总" },
  { id: "risk_review", label: "风险复核" },
  { id: "final_decision", label: "最终决策" },
];

const TRADINGAGENTS_FLOW_STEPS = [
  { stepId: "market_analyst", label: "市场分析员", dependsOn: "开始" },
  { stepId: "research_manager", label: "研究经理", dependsOn: "市场分析员" },
  { stepId: "trader", label: "交易观点", dependsOn: "研究经理" },
  { stepId: "risk_manager", label: "风险经理", dependsOn: "交易观点" },
  { stepId: "portfolio_manager", label: "组合经理", dependsOn: "风险经理" },
] as const;

type TradingAgentsFlowStatus = "pending" | "running" | "completed" | "failed";

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
  ANALYST_TEAM: "分析团队",
  RESEARCH_TEAM: "研究团队",
  STRATEGY_TEAM: "策略团队",
  RISK_TEAM: "风控团队",
  PORTFOLIO_TEAM: "组合团队",
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

const TASK_TYPE_LABEL: Record<AgentRunTaskType, string> = {
  SINGLE_ASSET_ANALYSIS: "单资产分析",
  MULTI_ASSET_COMPARISON: "多资产比较",
  PORTFOLIO_DIAGNOSTIC: "组合诊断",
  EVENT_IMPACT_ANALYSIS: "事件影响分析",
  REBALANCE_SUGGESTION: "调仓建议",
};

const RESEARCH_RUN_TYPE_LABEL: Record<ResearchRunType, string> = {
  market_scan: "市场扫描",
  asset_research: "资产研究",
  etf_screening: "ETF 筛选",
  fund_screening: "基金筛选",
  strategy_generation: "策略生成",
  portfolio_analysis: "组合分析",
  risk_review: "风险复核",
  trade_plan_generation: "交易计划生成",
  post_trade_review: "交易后复盘",
};

const RESEARCH_ARTIFACT_TYPE_LABEL: Record<ResearchArtifactType, string> = {
  market_brief: "市场简报",
  asset_research_report: "资产研究报告",
  etf_comparison_table: "ETF 对比表",
  fund_comparison_table: "基金对比表",
  strategy_card: "策略卡",
  portfolio_exposure_report: "组合暴露报告",
  risk_review_report: "风险复核报告",
  trade_plan: "交易计划",
  post_trade_review: "交易后复盘",
  evidence_bundle: "证据包",
};

const REVIEW_STATUS_LABEL: Record<NonNullable<AgentRun["decisionTrace"]>["reviewStatus"], string> = {
  pending: "待复核",
  approved: "已通过",
  rejected: "已驳回",
  needs_revision: "需修订",
};

const TRACE_STEP_STATUS_LABEL: Record<NonNullable<AgentRun["decisionTrace"]>["steps"][number]["status"], string> = {
  pending: "待处理",
  completed: "已完成",
  needs_review: "需复核",
};

const TOOL_STATUS_LABEL: Record<ToolCallStatus, string> = {
  RUNNING: "运行中",
  COMPLETED: "已完成",
  FAILED: "失败",
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
  external_search: "外部搜索",
  runtime_context: "运行上下文",
};

const EVENT_LABEL: Record<AgentEvent["type"], string> = {
  "agent.started": "Agent 开始",
  "agent.completed": "Agent 完成",
  "agent.failed": "Agent 失败",
  "tool.called": "工具调用",
  "tool.result": "工具结果",
  "reasoning.chunk": "推理输出",
  "report.generated": "报告生成",
  "debate.message": "观点讨论",
  "risk.warning": "风险提示",
  "decision.updated": "决策更新",
};

const RISK_LEVEL_BADGE: Record<AgentRun["riskLevel"], "default" | "secondary" | "destructive"> = {
  LOW: "default",
  MEDIUM: "secondary",
  HIGH: "destructive",
};

const RISK_LEVEL_LABEL: Record<AgentRun["riskLevel"], string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

const RUNTIME_STATUS_LABEL: Record<string, string> = {
  IDLE: "就绪",
  QUEUED: "等待中",
  RUNNING: "运行中",
  COMPLETED: "已完成",
  STOPPED: "已停止",
  ERROR: "错误",
  FAILED: "失败",
};

const RUNTIME_EVENT_TYPE_LABEL: Record<string, string> = {
  "agent.run.started": "任务开始",
  "agent.run.completed": "任务完成",
  "agent.run.failed": "任务失败",
  "agent.started": "Agent 开始",
  "agent.completed": "Agent 完成",
  "agent.failed": "Agent 失败",
  "tool.called": "工具调用",
  "tool.result": "工具结果",
  "reasoning.chunk": "推理输出",
  "report.generated": "报告生成",
  "debate.message": "观点讨论",
  "risk.warning": "风险提示",
  "decision.updated": "决策更新",
  "evidence.linked": "证据关联",
  "metric.updated": "指标更新",
  "live.output.summary": "实时输出汇总",
  "metric.updated.summary": "指标汇总",
};

const AGENT_NAME_LABEL: Record<string, string> = {
  System: "系统",
  "Market Analyst": "市场分析员",
  "Bull Researcher": "正方研究员",
  "Bear Researcher": "反方研究员",
  "Research Manager": "研究经理",
  "Risk Manager": "风险经理",
  "Portfolio Manager": "组合经理",
  Trader: "交易观点",
};

const MAX_RUNTIME_EVENTS_IN_MEMORY = 800;
const MAX_LIVE_OUTPUT_CHARS = 12_000;
const MAX_RENDERED_TOOL_ACTIVITIES = 120;
const MAX_RENDERED_DEBATE_MESSAGES = 80;

const formatDateTime = (timestamp?: string): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;

const formatInteger = (value?: number): string =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "-";

const tokenTotal = (metrics?: Partial<AgentRun["metrics"]> | null): number | undefined => {
  if (!metrics) return undefined;
  if (typeof metrics.totalTokens === "number" && Number.isFinite(metrics.totalTokens) && metrics.totalTokens > 0) {
    return metrics.totalTokens;
  }
  const hasPrompt = typeof metrics.promptTokens === "number" && Number.isFinite(metrics.promptTokens);
  const hasCompletion = typeof metrics.completionTokens === "number" && Number.isFinite(metrics.completionTokens);
  return hasPrompt || hasCompletion ? (metrics.promptTokens ?? 0) + (metrics.completionTokens ?? 0) : undefined;
};

const hasSourceUrl = (url?: string): url is string => Boolean(url && /^https?:\/\//i.test(url));

const limitRuntimeEvents = (events: AgentRuntimeEvent[]): AgentRuntimeEvent[] =>
  [...events].sort((a, b) => a.sequence - b.sequence).slice(-MAX_RUNTIME_EVENTS_IN_MEMORY);

const mergeRuntimeEvent = (current: AgentRuntimeEvent[], event: AgentRuntimeEvent): AgentRuntimeEvent[] => {
  const byId = new Map(current.map((item) => [item.eventId, item]));
  if (byId.has(event.eventId)) return current;
  byId.set(event.eventId, event);
  return limitRuntimeEvents(Array.from(byId.values()));
};

const trimLiveOutput = (text: string): string =>
  text.length > MAX_LIVE_OUTPUT_CHARS ? text.slice(-MAX_LIVE_OUTPUT_CHARS) : text;

const LEGACY_BACKEND_LOG_PATTERNS = [
  /Fetching price for BTC/i,
  /Got price for BTC/i,
  /\[HyperliquidStrategy DEBUG\]/i,
  /market data stream/i,
  /Hyperliquid snapshot service/i,
  /Binance .*collector/i,
];

const ALPHATRACE_BACKEND_LOG_PATTERNS = [
  /alpha-trace/i,
  /TradingAgents/i,
  /LangGraph/i,
  /LangAlpha/i,
  /agent-runs/i,
  /Qwen/i,
  /Bocha/i,
];

const shouldHideLegacyBackendLogLine = (line: string): boolean =>
  LEGACY_BACKEND_LOG_PATTERNS.some((pattern) => pattern.test(line));

const isAlphaTraceBackendLogLine = (line: string): boolean =>
  ALPHATRACE_BACKEND_LOG_PATTERNS.some((pattern) => pattern.test(line));

const formatLoadStatus = (status: RealDataStatus): string => {
  if (status === "loading") return "加载中";
  if (status === "loaded") return "已加载";
  if (status === "error") return "失败";
  return "待加载";
};

const formatRuntimeStatus = (status?: string): string => (status ? RUNTIME_STATUS_LABEL[status] ?? status : "-");

const formatRuntimeEventType = (type?: string): string => (type ? RUNTIME_EVENT_TYPE_LABEL[type] ?? type : "-");

const formatAgentName = (name?: string): string => (name ? AGENT_NAME_LABEL[name] ?? name : "系统");

const formatTaskType = (taskType: AgentRunTaskType | string): string => TASK_TYPE_LABEL[taskType as AgentRunTaskType] ?? taskType;

const formatResearchRunType = (type?: ResearchRunType | string): string =>
  type ? RESEARCH_RUN_TYPE_LABEL[type as ResearchRunType] ?? type : "-";

const formatArtifactType = (type?: ResearchArtifactType | string): string =>
  type ? RESEARCH_ARTIFACT_TYPE_LABEL[type as ResearchArtifactType] ?? type : "-";

const getStreamingChunkContent = (event: AgentRuntimeEvent): string => {
  if (event.type !== "reasoning.chunk" && event.type !== "debate.message") return "";
  const payload = event.payload as Record<string, unknown>;
  if (payload.streaming !== true || typeof payload.content !== "string") return "";
  return payload.content;
};

const getStreamingChunkForStep = (event: AgentRuntimeEvent, stepId: ReportSectionId): string => {
  if (event.type !== "reasoning.chunk" && event.type !== "debate.message") return "";
  const payload = event.payload as Record<string, unknown>;
  if (payload.streaming !== true || typeof payload.content !== "string") return "";
  const payloadStepId = typeof payload.stepId === "string" ? payload.stepId : "";
  const sectionHint = typeof payload.sectionHint === "string" ? payload.sectionHint : "";
  const stance = typeof payload.stance === "string" ? payload.stance.toUpperCase() : "";
  const matches =
    payloadStepId === stepId ||
    sectionHint === stepId ||
    (stepId === "bull_view" && (payloadStepId === "bull_researcher" || stance === "BULL")) ||
    (stepId === "bear_view" && (payloadStepId === "bear_researcher" || stance === "BEAR")) ||
    (stepId === "research_manager" && payloadStepId === "research_manager") ||
    (stepId === "risk_review" && payloadStepId === "risk_manager") ||
    (stepId === "final_decision" && (payloadStepId === "portfolio_manager" || payloadStepId === "trader"));
  if (!matches) return "";
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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

const SENSITIVE_PAYLOAD_KEY = /(api[_-]?key|authorization|bearer|token|secret|password|credential)/i;

const redactPayloadForDisplay = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactPayloadForDisplay);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_PAYLOAD_KEY.test(key) ? "<redacted>" : redactPayloadForDisplay(entry),
      ]),
    );
  }
  if (typeof value === "string" && /sk-[A-Za-z0-9_\-]{12,}/.test(value)) return "sk-<redacted>";
  return value;
};

const formatJsonPreview = (value: unknown): string => JSON.stringify(redactPayloadForDisplay(value), null, 2);

const getToolContractDescription = (toolName: string): string => {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("ck.monitor.context.load")) {
    return "从 ClickHouse monitor 数据库加载资产画像、行情、指标和基金经理上下文。";
  }
  if (normalized.includes("bocha.search")) {
    return "通过后端 Bocha 适配器执行外部搜索。API Key 仅保存在后端，来源 URL 作为引用依据。";
  }
  if (normalized.includes("evidence.retrieve")) {
    return "AlphaTrace 证据检索，会合并静态证据、本次运行证据和可用外部证据。";
  }
  if (normalized.includes("market.context") || normalized.includes("market_data") || normalized.includes("indicator")) {
    return "AlphaTrace 行情上下文加载器。未配置真实数据适配器时，会使用本地或演示数据。";
  }
  if (normalized.startsWith("qwen.") || normalized.includes("llm")) {
    return "大模型调用，用于推理和生成，不是外部行情数据工具。";
  }
  if (normalized.includes("tradingagents")) {
    return "TradingAgents PoC 适配器调用，内部图状态会映射回 AlphaTrace 结构。";
  }
  return "后端运行时工具事件。可查看参数和结果了解本次实际调用内容。";
};

interface RuntimeToolActivity {
  activityId: string;
  toolName: string;
  agentName: string;
  stepId: string;
  source?: string;
  query?: string;
  status: ToolCallStatus;
  args: Record<string, unknown>;
  summary?: string;
  evidenceIds: string[];
  startedAt: string;
  completedAt?: string;
  callPayload?: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
}

interface DecisionTimelineItem {
  itemId: string;
  type: string;
  agentName: string;
  timestamp: string;
  summary: string;
  stepId?: string;
  stepLabel?: string;
  count?: number;
  metricCount?: number;
  aggregated?: boolean;
}

const runtimePayload = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) {
    return event.payload as Record<string, unknown>;
  }
  return {};
};

const STEP_LABEL: Record<string, string> = {
  evidence_retrieval: "证据检索",
  market_view: "市场观点",
  bull_view: "正方观点",
  bear_view: "反方观点",
  research_manager: "研究汇总",
  risk_review: "风险复核",
  final_decision: "最终决策",
};

const TIMELINE_KEY_EVENT_TYPES = new Set([
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.cancelled",
  "agent.started",
  "agent.completed",
  "agent.failed",
  "tool.called",
  "tool.result",
  "evidence.linked",
  "report.generated",
  "decision.updated",
  "risk.warning",
]);

const formatTimelineType = (item: DecisionTimelineItem): string => {
  if (item.type === "live.output.summary") return "实时输出汇总";
  if (item.type === "metric.updated.summary") return "运行指标汇总";
  return item.type in EVENT_LABEL ? EVENT_LABEL[item.type as AgentEvent["type"]] : item.type;
};

const summarizeMetricPayload = (payload: Record<string, unknown>, count: number): string => {
  const metrics = typeof payload.metrics === "object" && payload.metrics !== null ? (payload.metrics as Record<string, unknown>) : payload;
  const promptTokens = typeof metrics.promptTokens === "number" ? metrics.promptTokens : typeof metrics.prompt_tokens === "number" ? metrics.prompt_tokens : undefined;
  const completionTokens =
    typeof metrics.completionTokens === "number"
      ? metrics.completionTokens
      : typeof metrics.completion_tokens === "number"
        ? metrics.completion_tokens
        : undefined;
  const totalTokens = typeof metrics.totalTokens === "number" ? metrics.totalTokens : typeof metrics.total_tokens === "number" ? metrics.total_tokens : undefined;

  const tokenParts = [
    promptTokens !== undefined ? `prompt ${promptTokens}` : "",
    completionTokens !== undefined ? `completion ${completionTokens}` : "",
    totalTokens !== undefined ? `total ${totalTokens}` : "",
  ].filter(Boolean);

  return tokenParts.length
    ? `已汇总 ${count} 次运行指标更新。最新 token 估算：${tokenParts.join(", ")}。`
    : `已汇总 ${count} 次运行指标更新，并已保存到本次任务。`;
};

const summarizeRuntimeEvent = (event: AgentRuntimeEvent): string => {
  const payload = runtimePayload(event);
  const agentName = event.agentName ?? "系统";
  const toolName = typeof payload.toolName === "string" ? payload.toolName : "runtime.tool";
  const content =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.content === "string"
        ? payload.content
        : typeof payload.error === "string"
          ? payload.error
          : "";

  switch (event.type) {
    case "agent.run.started":
      return "Agent Run 已开始。";
    case "agent.run.completed":
      return "Agent Run 已完成。";
    case "agent.run.failed":
      return content || "Agent Run 失败。";
    case "agent.started":
      return `${agentName} 已开始。`;
    case "agent.completed":
      return `${agentName} 已完成。`;
    case "agent.failed":
      return `${agentName} 失败：${content || "运行步骤失败。"}`;
    case "tool.called":
      return `${agentName} 调用了 ${toolName}。`;
    case "tool.result":
      return content || `${agentName} 已收到 ${toolName} 的结果。`;
    case "reasoning.chunk":
      return content || `${agentName} 输出了推理内容。`;
    case "debate.message":
      return content || `${agentName} 输出了讨论观点。`;
    case "risk.warning":
      return content || `${agentName} 输出了风险提示。`;
    case "report.generated":
      return typeof payload.title === "string" ? `${agentName} 已生成报告「${payload.title}」。` : `${agentName} 已生成报告。`;
    case "decision.updated":
      return typeof payload.action === "string" ? `决策已更新为 ${payload.action}。` : "决策已更新。";
    case "evidence.linked":
      return content || "证据已关联到本次任务。";
    default:
      return content || event.type;
  }
};

const buildDecisionTimelineItems = (events: AgentRuntimeEvent[], legacyEvents: AgentEvent[]): DecisionTimelineItem[] => {
  if (!events.length) {
    return legacyEvents
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((event, index) => ({
        itemId: `${event.timestamp}-${index}`,
        type: event.type,
        agentName: "agentId" in event ? event.agentId : "System",
        timestamp: event.timestamp,
        summary: summarizeEvent(event, "agentId" in event ? event.agentId : "System"),
      }));
  }

  const items: DecisionTimelineItem[] = [];
  const streamingGroups = new Map<
    string,
    {
      event: AgentRuntimeEvent;
      content: string;
      count: number;
    }
  >();
  const metricGroups = new Map<
    string,
    {
      event: AgentRuntimeEvent;
      count: number;
    }
  >();

  events
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((event) => {
      const payload = runtimePayload(event);
      const stepId = typeof payload.stepId === "string" ? payload.stepId : "";
      const isStreamingChunk =
        (event.type === "reasoning.chunk" || event.type === "debate.message") &&
        typeof payload.content === "string" &&
        payload.content.trim().length > 0;

      if (isStreamingChunk) {
        const key = `${stepId || "general"}:${event.agentName ?? "System"}:${event.type}`;
        const current = streamingGroups.get(key);
        if (current) {
          current.event = event;
          current.content += payload.content as string;
          current.count += 1;
        } else {
          streamingGroups.set(key, { event, content: payload.content as string, count: 1 });
        }
        return;
      }

      if (event.type === "metric.updated") {
        const key = `${stepId || "general"}:${event.agentName ?? "System"}`;
        const current = metricGroups.get(key);
        if (current) {
          current.event = event;
          current.count += 1;
        } else {
          metricGroups.set(key, { event, count: 1 });
        }
        return;
      }

      if (!TIMELINE_KEY_EVENT_TYPES.has(event.type)) {
        return;
      }

      items.push({
        itemId: event.eventId,
        type: event.type,
        agentName: event.agentName ?? "System",
        timestamp: event.timestamp,
        summary: summarizeRuntimeEvent(event),
        stepId,
        stepLabel: STEP_LABEL[stepId],
      });
    });

  streamingGroups.forEach((group, key) => {
    const payload = runtimePayload(group.event);
    const stepId = typeof payload.stepId === "string" ? payload.stepId : "";
    const compactText = group.content.replace(/\s+/g, " ").trim();
    items.push({
      itemId: `stream-${key}`,
      type: "live.output.summary",
      agentName: group.event.agentName ?? "System",
      timestamp: group.event.timestamp,
      summary: `已汇总 ${group.count} 段实时输出，共 ${group.content.length} 字符。${compactText.slice(0, 260)}${compactText.length > 260 ? "..." : ""}`,
      stepId,
      stepLabel: STEP_LABEL[stepId],
      count: group.count,
      aggregated: true,
    });
  });

  metricGroups.forEach((group, key) => {
    const payload = runtimePayload(group.event);
    const stepId = typeof payload.stepId === "string" ? payload.stepId : "";
    items.push({
      itemId: `metrics-${key}`,
      type: "metric.updated.summary",
      agentName: group.event.agentName ?? "System",
      timestamp: group.event.timestamp,
      summary: summarizeMetricPayload(payload, group.count),
      stepId,
      stepLabel: STEP_LABEL[stepId],
      count: group.count,
      metricCount: group.count,
      aggregated: true,
    });
  });

  return items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-120);
};

const getTradingAgentsFlow = (events: AgentRuntimeEvent[]) => {
  const byStep = new Map<string, { status: TradingAgentsFlowStatus; progress: number; latest?: string; timestamp?: string }>();
  TRADINGAGENTS_FLOW_STEPS.forEach((step) => byStep.set(step.stepId, { status: "pending", progress: 0 }));

  events
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((event) => {
      const payload = runtimePayload(event);
      const stepId = typeof payload.stepId === "string" ? payload.stepId : "";
      if (!byStep.has(stepId)) return;
      const current = byStep.get(stepId)!;
      const progress = typeof payload.progress === "number" ? payload.progress : current.progress;
      const content =
        typeof payload.content === "string"
          ? payload.content
          : typeof payload.summary === "string"
            ? payload.summary
            : event.type;
      const status: TradingAgentsFlowStatus =
        event.type === "agent.failed" || event.type === "agent.run.failed"
          ? "failed"
          : event.type === "agent.completed" || progress >= 100
            ? "completed"
            : "running";
      byStep.set(stepId, {
        status,
        progress: Math.max(current.progress, status === "completed" ? 100 : progress || 35),
        latest: content,
        timestamp: event.timestamp,
      });
    });

  return TRADINGAGENTS_FLOW_STEPS.map((step) => ({ ...step, ...(byStep.get(step.stepId) ?? { status: "pending", progress: 0 }) }));
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
          stepId,
          source: typeof payload.source === "string" ? payload.source : typeof args.source === "string" ? args.source : undefined,
          query: typeof payload.query === "string" ? payload.query : typeof args.query === "string" ? args.query : undefined,
          status: "RUNNING",
          args,
          evidenceIds: toStringList(payload.evidenceIds),
          startedAt: event.timestamp,
          callPayload: payload,
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
          stepId,
          status: "RUNNING",
          args: {},
          evidenceIds: [],
          startedAt: event.timestamp,
        } satisfies RuntimeToolActivity);

      const failed = payload.status === "failed" || typeof payload.error === "string";
      activity.status = failed ? "FAILED" : "COMPLETED";
      activity.completedAt = event.timestamp;
      activity.source = typeof payload.source === "string" ? payload.source : activity.source;
      activity.query = typeof payload.query === "string" ? payload.query : activity.query;
      activity.summary =
        typeof payload.summary === "string"
          ? payload.summary
          : typeof payload.content === "string"
            ? payload.content
            : typeof payload.error === "string"
              ? payload.error
              : "已收到工具结果。";
      activity.evidenceIds = Array.from(new Set([...activity.evidenceIds, ...toStringList(payload.evidenceIds)]));
      activity.resultPayload = payload;

      if (!openByKey.has(key)) activities.push(activity);
      openByKey.delete(key);
    });

  return activities;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordField = (record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined => {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
};

const arrayField = (record: Record<string, unknown> | undefined, key: string): unknown[] => {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
};

const numberField = (record: Record<string, unknown> | undefined, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const stringField = (record: Record<string, unknown> | undefined, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
};

const formatMetricValue = (value: unknown, options?: { percent?: boolean }): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (options?.percent) return formatPercent(value, 2);
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
  }
  if (typeof value === "string" && value.trim()) return value;
  return "-";
};

const collectClickHouseTables = (
  sourceRefs: Record<string, unknown> | undefined,
  tableData: Record<string, unknown> | undefined,
): string[] => {
  const tables = new Set<string>();
  Object.keys(tableData ?? {}).forEach((table) => tables.add(table));
  ["assetTable", "priceTable", "fallbackPriceTable", "managerTable"].forEach((key) => {
    const value = sourceRefs?.[key];
    if (typeof value === "string" && value.trim()) tables.add(value);
  });
  const views = sourceRefs?.views;
  if (Array.isArray(views)) {
    views.forEach((view) => {
      if (typeof view === "string" && view.trim()) tables.add(view);
    });
  }
  return Array.from(tables);
};

const renderClickHouseMetric = (label: string, value: string) => (
  <div key={label} className="rounded border bg-background p-2">
    <p className="text-muted-foreground">{label}</p>
    <p className="mt-1 break-words font-medium text-foreground">{value}</p>
  </div>
);

const renderClickHouseToolData = (activity: RuntimeToolActivity) => {
  if (!activity.toolName.toLowerCase().includes("ck.monitor.context.load")) return null;

  const result = activity.resultPayload ?? {};
  const sourceRefs = recordField(result, "sourceRefs");
  const tableData = recordField(result, "tableData");
  const dataPreview = recordField(result, "dataPreview");
  const asset = recordField(dataPreview, "asset") ?? result;
  const klineSummary = recordField(dataPreview, "klineSummary");
  const returnWindows = recordField(dataPreview, "returnWindows");
  const quote = recordField(dataPreview, "quote");
  const fundManagers = arrayField(dataPreview, "fundManagers").filter(isRecord).slice(0, 5);
  const tables = collectClickHouseTables(sourceRefs, tableData);
  const symbol = stringField(asset, ["symbol"]) ?? stringField(result, ["symbol"]);
  const assetName = stringField(asset, ["name"]);
  const klinePoints = numberField(result, ["klinePoints"]) ?? numberField(klineSummary, ["points"]);
  const managerCount = numberField(result, ["managerCount"]) ?? fundManagers.length;
  const startDate = stringField(klineSummary, ["startDate"]);
  const endDate = stringField(klineSummary, ["endDate"]);
  const latestClose = numberField(returnWindows, ["latestClose"]) ?? numberField(klineSummary, ["latestClose"]) ?? numberField(quote, ["close", "price"]);
  const periodReturn = numberField(klineSummary, ["periodReturn"]);
  const maxDrawdown = numberField(klineSummary, ["maxDrawdown"]);
  const oneMonthReturn = numberField(returnWindows, ["1m"]);
  const oneYearReturn = numberField(returnWindows, ["1y"]);

  return (
    <div className="rounded border bg-muted/20 p-2 space-y-2">
      <div className="space-y-1">
        <p className="font-medium text-foreground">使用数据表</p>
        {tables.length ? (
          <div className="flex flex-wrap gap-1">
            {tables.map((table) => (
              <Badge key={table} variant="outline" className="max-w-full break-all font-mono text-[10px]">
                {table}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">本次事件未返回表引用。</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {renderClickHouseMetric("标的", [symbol, assetName].filter(Boolean).join(" / ") || "-")}
        {renderClickHouseMetric("K线数量", klinePoints !== undefined ? formatInteger(klinePoints) : "-")}
        {renderClickHouseMetric("日期范围", startDate || endDate ? `${startDate ?? "-"} 至 ${endDate ?? "-"}` : "-")}
        {renderClickHouseMetric("最新价格", formatMetricValue(latestClose))}
        {renderClickHouseMetric("区间收益", formatMetricValue(periodReturn, { percent: true }))}
        {renderClickHouseMetric("最大回撤", formatMetricValue(maxDrawdown, { percent: true }))}
        {renderClickHouseMetric("近1月", formatMetricValue(oneMonthReturn, { percent: true }))}
        {renderClickHouseMetric("近1年", formatMetricValue(oneYearReturn, { percent: true }))}
        {renderClickHouseMetric("基金经理", managerCount !== undefined ? formatInteger(managerCount) : "-")}
      </div>

      {fundManagers.length ? (
        <div className="space-y-1">
          <p className="font-medium text-foreground">基金经理数据</p>
          <div className="space-y-1">
            {fundManagers.map((manager, index) => {
              const performance = recordField(manager, "performance");
              const career = recordField(manager, "career");
              const currentFund = recordField(manager, "currentFund");
              return (
                <div key={`${stringField(manager, ["managerCode", "managerName"]) ?? index}`} className="rounded border bg-background p-2">
                  <p className="font-medium">{stringField(manager, ["managerName"]) ?? "未命名基金经理"}</p>
                  <p className="text-muted-foreground">
                    {[
                      stringField(currentFund, ["fundName", "name"]),
                      stringField(career, ["startDate", "tenureStartDate"]),
                      numberField(performance, ["annualizedRoi"]) !== undefined
                        ? `年化 ${formatMetricValue(numberField(performance, ["annualizedRoi"]), { percent: true })}`
                        : "",
                      numberField(performance, ["maxDrawdown"]) !== undefined
                        ? `回撤 ${formatMetricValue(numberField(performance, ["maxDrawdown"]), { percent: true })}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "已返回基金经理画像。"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {tableData && Object.keys(tableData).length ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">表数据快照</summary>
          <div className="mt-1 space-y-2">
            {Object.entries(tableData).map(([table, payload]) => (
              <div key={table} className="rounded border bg-background p-2">
                <p className="mb-1 break-all font-mono text-[10px] font-medium">{table}</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
                  {formatJsonPreview(payload)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
};

const summarizeEvent = (event: AgentEvent, agentName: string): string => {
  switch (event.type) {
    case "agent.started":
      return `${agentName} 已开始`;
    case "agent.completed":
      return `${agentName} 已完成`;
    case "agent.failed":
      return `${agentName} 失败：${event.error || "运行步骤失败"}`;
    case "tool.called":
      return `${agentName} 调用了 ${event.toolName}`;
    case "tool.result":
      return `${agentName} 已收到 ${event.toolName} 结果`;
    case "reasoning.chunk":
      return event.content;
    case "report.generated":
      return `${agentName} 已生成报告「${event.title}」`;
    case "debate.message":
      return `${agentName} (${event.stance}) ${event.content}`;
    case "risk.warning":
      return `${agentName} ${event.level} 风险：${event.content}`;
    case "decision.updated":
      return `决策已更新为 ${DECISION_ACTION_LABEL[event.action]}（${formatPercent(event.confidence, 0)}）`;
    default:
      return "事件";
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
  if (text.includes("research manager") || text.includes("research synthesis")) return "research_manager";
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
  const [runtimeEventsLoadedCount, setRuntimeEventsLoadedCount] = useState(0);
  const [runtimeReplayStatus, setRuntimeReplayStatus] = useState<"IDLE" | "RUNNING" | "COMPLETED" | "STOPPED" | "ERROR">("IDLE");
  const [runtimeReplayError, setRuntimeReplayError] = useState<string | null>(null);
  const [backendLogs, setBackendLogs] = useState<AgentRuntimeLogResponse | null>(null);
  const [isLoadingBackendLogs, setIsLoadingBackendLogs] = useState(false);
  const [backendLogError, setBackendLogError] = useState<string | null>(null);
  const [backendLogFilter, setBackendLogFilter] = useState<BackendLogFilter>("alphatrace");
  const [workerArtifacts, setWorkerArtifacts] = useState<AgentWorkerArtifactsResponse | null>(null);
  const [isLoadingWorkerArtifacts, setIsLoadingWorkerArtifacts] = useState(false);
  const [workerArtifactError, setWorkerArtifactError] = useState<string | null>(null);
  const [isCancellingRun, setIsCancellingRun] = useState(false);
  const [cancelRunError, setCancelRunError] = useState<string | null>(null);
  const liveOutputRef = useRef<HTMLDivElement | null>(null);
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
    setRuntimeEventsLoadedCount(0);
    setRuntimeReplayStatus("IDLE");
    setRuntimeReplayError(null);
    setWorkerArtifacts(null);
    setWorkerArtifactError(null);
    setCancelRunError(null);
    setRealRunEvidence(null);
    setRealDataLoadState({ reports: "idle", evidence: "idle", decision: "idle" });
    setRealDataLoadErrors({});

    const loadRun = runId
      ? getAgentRunByIdAsync(runId)
      : listAgentRunsAsync({ limit: 1 }).then((runs) => runs[0]);

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
          setRuntimeEventsLoadedCount(events.length);
          setRuntimeEvents(limitRuntimeEvents(events));
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

  const liveMetrics = useMemo(() => {
    if (!run) return null;
    return { ...run.metrics, ...(runtimeSnapshot?.metrics ?? {}) };
  }, [run, runtimeSnapshot?.metrics]);

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

  const isTradingAgentsRun = useMemo(
    () =>
      Boolean(
        run &&
          (run.triggeredBy?.toLowerCase().includes("tradingagents") ||
            runtimeEvents.some((event) => String(runtimePayload(event).source ?? "").includes("tradingagents"))),
      ),
    [run, runtimeEvents],
  );

  const tradingAgentsFlow = useMemo(() => getTradingAgentsFlow(runtimeEvents), [runtimeEvents]);

  const liveReportText = useMemo(
    () => trimLiveOutput(runtimeEvents.map(getStreamingChunkContent).join("")),
    [runtimeEvents],
  );
  const smoothLiveReportText = useTypewriterStream(liveReportText, {
    enabled: run?.status === "RUNNING",
    charsPerTick: 18,
    maxCharsPerTick: 96,
    intervalMs: 16,
  });

  useEffect(() => {
    if (!liveOutputRef.current || run?.status !== "RUNNING") return;
    liveOutputRef.current.scrollTop = liveOutputRef.current.scrollHeight;
  }, [run?.status, smoothLiveReportText]);

  const debateLiveOutputs = useMemo(
    () => ({
      bull: trimLiveOutput(runtimeEvents.map((event) => getStreamingChunkForStep(event, "bull_view")).join("")),
      bear: trimLiveOutput(runtimeEvents.map((event) => getStreamingChunkForStep(event, "bear_view")).join("")),
    }),
    [runtimeEvents],
  );
  const smoothBullOutput = useTypewriterStream(debateLiveOutputs.bull, {
    enabled: run?.status === "RUNNING",
    charsPerTick: 18,
    maxCharsPerTick: 96,
    intervalMs: 16,
  });
  const smoothBearOutput = useTypewriterStream(debateLiveOutputs.bear, {
    enabled: run?.status === "RUNNING",
    charsPerTick: 18,
    maxCharsPerTick: 96,
    intervalMs: 16,
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

  const failureMessage = useMemo(() => {
    if (!run || run.status !== "FAILED") return null;
    const failedEvent = [...run.events, ...runtimeEvents]
      .filter((event) => event.type === "agent.run.failed" || event.type === "agent.failed")
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (!failedEvent) return "任务执行失败，后端未返回结构化失败原因。";
    const payload = runtimePayload(failedEvent);
    return (
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.summary === "string" && payload.summary) ||
      "任务执行失败，请查看运行事件流获取详情。"
    );
  }, [run, runtimeEvents]);

  const filteredBackendLogLines = useMemo(() => {
    const lines = backendLogs?.lines ?? [];
    if (backendLogFilter === "all") return lines;
    if (backendLogFilter === "current_run") {
      if (!run?.runId) return [];
      return lines.filter((line) => line.includes(run.runId));
    }
    return lines.filter((line) => !shouldHideLegacyBackendLogLine(line) && isAlphaTraceBackendLogLine(line));
  }, [backendLogFilter, backendLogs?.lines, run?.runId]);

  const hiddenBackendLogLineCount = Math.max((backendLogs?.lines.length ?? 0) - filteredBackendLogLines.length, 0);

  const refreshBackendLogs = async () => {
    if (apiMode !== "real") {
      setBackendLogs({
        path: "offline",
        exists: false,
        limit: 400,
        truncated: false,
        lines: [],
        message: "模拟模式不读取后端日志。",
      });
      return;
    }
    setIsLoadingBackendLogs(true);
    setBackendLogError(null);
    try {
      setBackendLogs(await getAgentRuntimeLogsAsync(400));
    } catch (error) {
      setBackendLogError(error instanceof Error ? error.message : "后端日志加载失败");
    } finally {
      setIsLoadingBackendLogs(false);
    }
  };

  const refreshWorkerArtifacts = async () => {
    if (!run?.runId) return;
    if (apiMode !== "real") {
      setWorkerArtifacts({
        runId: run.runId,
        workerRoot: "offline",
        workDir: "offline",
        exists: false,
        files: {},
        stdoutLines: [],
        stderrLines: [],
        events: [],
        result: null,
        message: "模拟模式不提供 Worker 产物。",
      });
      return;
    }
    setIsLoadingWorkerArtifacts(true);
    setWorkerArtifactError(null);
    try {
      setWorkerArtifacts(await getAgentWorkerArtifactsAsync(run.runId, 200, 200));
    } catch (error) {
      setWorkerArtifactError(error instanceof Error ? error.message : "Worker artifacts 加载失败");
    } finally {
      setIsLoadingWorkerArtifacts(false);
    }
  };

  const handleCancelRun = async () => {
    if (!run?.runId) return;
    setIsCancellingRun(true);
    setCancelRunError(null);
    try {
      const cancelledRun = await cancelAgentRunAsync(run.runId);
      setRun(cancelledRun);
      const events = await getAgentRunRuntimeEventsAsync(run.runId);
      setRuntimeEventsLoadedCount(events.length);
      setRuntimeEvents(limitRuntimeEvents(events));
      await refreshWorkerArtifacts();
    } catch (error) {
      setCancelRunError(error instanceof Error ? error.message : "Agent Run 取消失败");
    } finally {
      setIsCancellingRun(false);
    }
  };

  useEffect(() => {
    if (apiMode !== "real" || !run?.runId) return;
    refreshBackendLogs();
    refreshWorkerArtifacts();
    // Load log tail once per run. Manual refresh is available for live inspection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, run?.runId]);

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
    setRuntimeEventsLoadedCount(0);
    setRuntimeReplayError(null);
    setRuntimeReplayStatus("RUNNING");

    runtimeClientRef.current = createAgentRuntimeEventStream(activeRunId, {
      transport: apiMode === "real" ? "sse" : "mock",
      intervalMs: 360,
      onEvent: (event) => {
        setRuntimeEvents((current) => mergeRuntimeEvent(current, event));
        setRuntimeEventsLoadedCount((count) => Math.max(count, event.sequence || count + 1));
      },
      onComplete: () => {
        setRuntimeReplayStatus("COMPLETED");
        if (apiMode === "real") {
          void getAgentRunRuntimeEventsAsync(activeRunId)
            .then((events) => {
              setRuntimeEventsLoadedCount(events.length);
              setRuntimeEvents(limitRuntimeEvents(events));
            })
            .catch(() => undefined);
          void refreshRealRunDetail(activeRunId);
        }
      },
      onError: (error) => {
        setRuntimeReplayError(`${error.message}。如果可用，将自动使用 HTTP 事件回退。`);
        setRuntimeReplayStatus("ERROR");
        if (apiMode === "real") {
          void getAgentRunRuntimeEventsAsync(activeRunId)
            .then((events) => {
              setRuntimeEventsLoadedCount(events.length);
              setRuntimeEvents(limitRuntimeEvents(events));
            })
            .catch(() => undefined);
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

    const evidenceIdSet = new Set<string>(filterRetiredEvidenceIds([
      ...run.evidenceIds,
      ...run.finalDecision.evidenceIds,
      ...run.toolCalls.flatMap((call) => call.evidenceIds ?? []),
      ...run.events.flatMap((event) => ("evidenceIds" in event && event.evidenceIds ? event.evidenceIds : [])),
      ...runtimeEvents.flatMap((event) => toStringList(runtimePayload(event).evidenceIds)),
    ]));
    const evidencePool = realRunEvidence ?? evidenceItems;
    const usedEvidence = realRunEvidence ?? evidencePool.filter((item) => evidenceIdSet.has(item.id));

    const sortedToolCalls = [...run.toolCalls].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const runtimeToolActivities = getRuntimeToolActivities(runtimeEvents);
    const timelineItems = buildDecisionTimelineItems(runtimeEvents, run.events);

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
      timelineItems,
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
        <ResearchWorkspaceNav />
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">正在加载 Agent Run 数据</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (runLoadError) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <ResearchWorkspaceNav />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Agent Run 数据加载失败</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-destructive">{runLoadError}</p>
            <Button variant="outline" onClick={goBackToAgentLab}>
              打开 Agent 实验室
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (runNotFound) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <ResearchWorkspaceNav />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">未找到对应 Agent Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">请在 Agent 实验室选择有效任务。</p>
            <Button variant="outline" onClick={goBackToAgentLab}>
              打开 Agent 实验室
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <ResearchWorkspaceNav />
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无 Agent Run 数据</p>
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
      <ResearchWorkspaceNav />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-xl">任务详情 · {run.runId}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {apiMode === "real" ? (
                  <>
                    <Badge variant={RUN_STATUS_BADGE[run.status]}>运行状态：{RUN_STATUS_LABEL[run.status]}</Badge>
                    <Badge variant={runtimeReplayStatus === "ERROR" ? "destructive" : runtimeReplayStatus === "RUNNING" ? "secondary" : "outline"}>
                      事件流：{runtimeReplayStatus === "RUNNING" ? "已连接" : runtimeReplayStatus === "ERROR" ? "错误" : runtimeReplayStatus === "COMPLETED" ? "已关闭" : "就绪"}
                    </Badge>
                    <Badge variant={runtimeReplayStatus === "ERROR" ? "destructive" : "outline"}>
                      事件：{" "}
                      {runtimeReplayStatus === "ERROR"
                        ? "错误"
                        : runtimeEvents.length > 0
                          ? `保留 ${runtimeEvents.length}/${runtimeEventsLoadedCount || runtimeEvents.length}`
                          : "加载中"}
                    </Badge>
                    <Badge variant={realDataLoadState.reports === "error" ? "destructive" : "outline"}>
                      报告：{formatLoadStatus(realDataLoadState.reports)}
                    </Badge>
                    <Badge variant={realDataLoadState.evidence === "error" ? "destructive" : "outline"}>
                      证据：{formatLoadStatus(realDataLoadState.evidence)}
                    </Badge>
                    <Badge variant={realDataLoadState.decision === "error" ? "destructive" : "outline"}>
                      决策：{formatLoadStatus(realDataLoadState.decision)}
                    </Badge>
                  </>
                ) : null}
              </div>
              {apiMode === "real" && Object.keys(realDataLoadErrors).length > 0 ? (
                <div className="space-y-1 text-xs text-destructive">
                  {realDataLoadErrors.reports ? <p>报告：{realDataLoadErrors.reports}</p> : null}
                  {realDataLoadErrors.evidence ? <p>证据：{realDataLoadErrors.evidence}</p> : null}
                  {realDataLoadErrors.decision ? <p>决策：{realDataLoadErrors.decision}</p> : null}
                </div>
              ) : null}
              {failureMessage ? (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="font-medium">任务执行失败</p>
                  <p className="mt-1 whitespace-pre-wrap">{failureMessage}</p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
              <Badge variant={RISK_LEVEL_BADGE[run.riskLevel]}>风险 {RISK_LEVEL_LABEL[run.riskLevel]}</Badge>
              <Badge variant="outline">{formatTaskType(run.taskType)}</Badge>
              {run.researchRunType ? <Badge variant="secondary">标准类型：{formatResearchRunType(run.researchRunType)}</Badge> : null}
              {run.decisionTrace ? <Badge variant="outline">复核：{REVIEW_STATUS_LABEL[run.decisionTrace.reviewStatus]}</Badge> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs text-muted-foreground">
          <p>分析目标：{run.target}</p>
          <p>分析资产：{assetLabel}</p>
          <p>任务类型：{formatTaskType(run.taskType)}</p>
          <p>标准类型：{formatResearchRunType(run.researchRunType)}</p>
          <p>模型配置：{run.modelName ?? "-"}</p>
          <p>开始时间：{formatDateTime(run.startedAt)}</p>
          <p>结束时间：{formatDateTime(run.completedAt)}</p>
          <p>持续时间：{derived?.runDuration}</p>
          <p>Token 消耗：{formatInteger(tokenTotal(liveMetrics))}</p>
          <p>复核状态：{run.decisionTrace ? REVIEW_STATUS_LABEL[run.decisionTrace.reviewStatus] : "-"}</p>
          <p>Trace ID：{run.decisionTrace?.traceId ?? "-"}</p>
          <p>最终建议：{run.finalDecision.summary ?? run.finalDecision.thesis}</p>
        </CardContent>
        <CardContent className="pt-0 flex flex-wrap gap-2">
          {["RUNNING", "QUEUED", "PARTIALLY_COMPLETED"].includes(run.status) ? (
            <Button size="sm" variant="destructive" onClick={handleCancelRun} disabled={isCancellingRun}>
              {isCancellingRun ? "正在取消..." : "取消任务"}
            </Button>
          ) : null}
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
          {cancelRunError ? <p className="basis-full text-xs text-destructive">取消失败：{cancelRunError}</p> : null}
        </CardContent>
      </Card>

      {runProgress ? (
        <AgentRunProgressCard progress={runProgress} runStatus={run.status} runtimeStatus={runtimeReplayStatus} />
      ) : null}

      {run.decisionTrace ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Decision Trace / 决策链路</CardTitle>
                <CardDescription>
                  标准类型 {formatResearchRunType(run.decisionTrace.researchRunType ?? run.researchRunType)} · Trace {run.decisionTrace.traceId}
                </CardDescription>
              </div>
              <Badge variant="outline">{REVIEW_STATUS_LABEL[run.decisionTrace.reviewStatus]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded border bg-muted/20 p-3">
                <p className="font-medium">核心结论</p>
                <p className="mt-1 text-muted-foreground">{run.decisionTrace.conclusion || "暂无结构化结论。"}</p>
              </div>
              <div className="rounded border bg-muted/20 p-3">
                <p className="font-medium">支持依据</p>
                <p className="mt-1 text-muted-foreground">{run.decisionTrace.supportSummary || "暂无结构化支持依据。"}</p>
              </div>
              <div className="rounded border bg-muted/20 p-3">
                <p className="font-medium">风险与待确认</p>
                <p className="mt-1 text-muted-foreground">{run.decisionTrace.riskSummary || "暂无结构化风险摘要。"}</p>
              </div>
            </div>
            {run.decisionTrace.openQuestions.length ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <p className="font-medium">待追问问题</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {run.decisionTrace.openQuestions.map((question, index) => (
                    <li key={`${run.decisionTrace?.traceId}-question-${index}`}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {run.decisionTrace.steps.map((step, index) => (
                <div key={step.stepId} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {index + 1}
                      </span>
                      <p className="truncate font-medium">{step.title}</p>
                    </div>
                    <Badge variant={step.status === "completed" ? "default" : "secondary"}>{TRACE_STEP_STATUS_LABEL[step.status]}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">Agent：{step.agentName ? formatAgentName(step.agentName) : "-"}</p>
                  <p className="mt-2 line-clamp-4 text-muted-foreground">{step.summary || "暂无步骤摘要。"}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {step.evidenceIds.length ? <Badge variant="outline">证据 {step.evidenceIds.length}</Badge> : null}
                    {step.artifactIds.length ? <Badge variant="outline">产物 {step.artifactIds.length}</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isTradingAgentsRun ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">TradingAgents 执行链路</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto text-xs">
            <div className="flex min-w-max items-stretch gap-2 pr-1">
            {tradingAgentsFlow.map((step, index) => {
              const variant =
                step.status === "failed"
                  ? "destructive"
                  : step.status === "completed"
                    ? "default"
                    : step.status === "running"
                      ? "secondary"
                      : "outline";
              return (
                <div key={step.stepId} className="flex items-center gap-2">
                  <div className="w-56 rounded border p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {index + 1}
                        </span>
                        <p className="font-medium">{step.label}</p>
                      </div>
                      <Badge variant={variant}>{step.status}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">依赖：{step.dependsOn}</p>
                    <div className="h-1.5 overflow-hidden rounded bg-muted">
                      <div
                        className={step.status === "failed" ? "h-full rounded bg-red-500" : "h-full rounded bg-blue-500"}
                        style={{ width: `${Math.max(step.progress, step.status === "pending" ? 0 : 8)}%` }}
                      />
                    </div>
                    <p className="line-clamp-3 text-[11px] text-muted-foreground">
                      {step.latest ?? (step.status === "pending" ? "等待前置节点完成。" : "节点运行中。")}
                    </p>
                  </div>
                  {index < tradingAgentsFlow.length - 1 ? <span className="text-muted-foreground">→</span> : null}
                </div>
              );
            })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <Card className="xl:col-span-12">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent 进度看板</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div className="h-full rounded bg-blue-500" style={{ width: `${Math.max(derived?.progressPercent ?? 0, 4)}%` }} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              {derived?.teamGroups.map((group) => (
                <div key={group.team} className="border rounded-md p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">{TEAM_LABEL[group.team]}</p>
                    {group.team === "RESEARCH_TEAM" ? <Badge variant="secondary">并行评审</Badge> : null}
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
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-9 flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">当前报告 / 投研报告</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {smoothLiveReportText.trim() && (run.status === "RUNNING" || run.status === "FAILED") ? (
                <div className="rounded border border-blue-500/40 bg-blue-500/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">实时输出</p>
                    <Badge variant="secondary">{smoothLiveReportText.length}/{liveReportText.length} 字符</Badge>
                  </div>
                  <div ref={liveOutputRef} className="mt-2 max-h-64 overflow-auto scroll-smooth">
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
                      {hasReport ? "" : " · 等待中"}
                    </Button>
                  );
                })}
              </div>

              {activeReportSection === "final_decision" ? (
                <div className="rounded border p-2 bg-muted/20">
                  <p className="mb-2 font-medium">最终决策</p>
                  <StructuredReportView text={run.finalDecision.thesis} compact />
                </div>
              ) : activeReport ? (
                <div className="rounded border p-2 bg-muted/20">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="font-medium">{activeReport.title}</p>
                      {activeReport.artifactType ? <Badge variant="outline">{formatArtifactType(activeReport.artifactType)}</Badge> : null}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(activeReport.createdAt)}</span>
                  </div>
                  <div className="max-h-[34rem] overflow-auto pr-1">
                    <StructuredReportView text={activeReport.summary} />
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed p-4 text-center text-muted-foreground">
                  当前分区暂无最终报告。运行中请查看 Agent 执行链中对应节点的实时输出。
                </div>
              )}

              {derived?.sortedReports.length ? (
                <details className="rounded border bg-background p-2">
                  <summary className="cursor-pointer font-medium">全部报告（{derived.sortedReports.length}）</summary>
                  <div className="mt-2 space-y-2">
                    {derived.sortedReports.map((report) => (
                      <div key={report.reportId} className="rounded border p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{report.title}</p>
                          <div className="flex flex-wrap items-center gap-1">
                            {report.artifactType ? <Badge variant="outline">{formatArtifactType(report.artifactType)}</Badge> : null}
                            <span className="text-[11px] text-muted-foreground">{report.reportId}</span>
                          </div>
                        </div>
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
              <CardTitle className="text-base">观点讨论面板</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex flex-col gap-3">
                {[
                  {
                    id: "bull_view" as const,
                    label: "正方研究员",
                    stance: "正方",
                    liveText: smoothBullOutput,
                    rawLiveText: debateLiveOutputs.bull,
                    reportText: reportSections.get("bull_view")?.summary ?? "",
                    placeholder: "等待 Bull View 输出。Market View 完成后，该区域会展示 Bull Researcher 的实时观点。",
                    badge: "default" as const,
                  },
                  {
                    id: "bear_view" as const,
                    label: "反方研究员",
                    stance: "反方",
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
                          {isLive ? <Badge variant="secondary">实时</Badge> : null}
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
                  <summary className="cursor-pointer font-medium">
                    原始讨论消息（{Math.min(derived.debateMessages.length, MAX_RENDERED_DEBATE_MESSAGES)}/{derived.debateMessages.length}）
                  </summary>
                  <div className="mt-2 space-y-2">
                    {derived.debateMessages.slice(-MAX_RENDERED_DEBATE_MESSAGES).map((message, index) => {
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
              <CardTitle className="text-base">最终决策卡片</CardTitle>
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
          <Card className="order-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">工具调用时间线</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[24rem] overflow-auto space-y-2 pr-1 text-[11px]">
              {derived?.sortedToolCalls.length || derived?.runtimeToolActivities.length ? (
                <>
                  {(derived.sortedToolCalls.length + derived.runtimeToolActivities.length > MAX_RENDERED_TOOL_ACTIVITIES) ? (
                    <p className="rounded border bg-muted/30 p-2 text-muted-foreground">
                      当前仅展示最近 {MAX_RENDERED_TOOL_ACTIVITIES} 条工具活动，历史事件仍可通过 API 查看。
                    </p>
                  ) : null}
                  {derived.sortedToolCalls.slice(-MAX_RENDERED_TOOL_ACTIVITIES).map((call: ToolCall) => {
                    const agent = derived.agentById.get(call.agentId);
                    return (
                      <div key={call.callId} className="rounded border p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{call.toolName}</p>
                          <Badge variant={TOOL_STATUS_BADGE[call.status]}>{TOOL_STATUS_LABEL[call.status]}</Badge>
                        </div>
                        <p className="truncate text-muted-foreground">Agent：{agent?.name ?? call.agentId}</p>
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">详情</summary>
                          <div className="mt-1 space-y-2">
                            <p className="text-muted-foreground">调用说明：{getToolContractDescription(call.toolName)}</p>
                            {typeof call.args.source === "string" ? <p className="text-muted-foreground">来源：{call.args.source}</p> : null}
                            {typeof call.args.query === "string" ? <p className="break-words text-muted-foreground">查询：{call.args.query}</p> : null}
                            <p className="text-muted-foreground">参数：{formatArgsSummary(call.args)}</p>
                            <p className="text-muted-foreground">结果：{call.summary ?? "执行中或无结果摘要"}</p>
                            <p className="text-muted-foreground">
                              {formatDateTime(call.startedAt)} {call.completedAt ? `→ ${formatDateTime(call.completedAt)}` : ""}
                            </p>
                            <details>
                              <summary className="cursor-pointer text-muted-foreground">脱敏参数</summary>
                              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
                                {formatJsonPreview(call.args)}
                              </pre>
                            </details>
                          </div>
                        </details>
                        {filterRetiredEvidenceIds(call.evidenceIds).length ? (
                          <div className="flex flex-wrap gap-1">
                            {filterRetiredEvidenceIds(call.evidenceIds).map((id) => (
                              <Button
                                key={`${call.callId}-${id}`}
                                size="sm"
                                variant="outline"
                                onClick={() => navigateTo("/evidence", { evidenceId: id, runId: run.runId })}
                              >
                                {id}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {derived.runtimeToolActivities.slice(-MAX_RENDERED_TOOL_ACTIVITIES).map((activity) => (
                    <div key={activity.activityId} className="rounded border p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">{activity.toolName}</p>
                        <Badge variant={runtimeToolStatusBadge(activity.status)}>{activity.status}</Badge>
                      </div>
                      <p className="truncate text-muted-foreground">Agent：{activity.agentName}</p>
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">详情</summary>
                        <div className="mt-1 space-y-2">
                          <p className="text-muted-foreground">调用说明：{getToolContractDescription(activity.toolName)}</p>
                          <p className="text-muted-foreground">步骤：{STEP_LABEL[activity.stepId] ?? activity.stepId}</p>
                          {activity.source ? <p className="text-muted-foreground">来源：{activity.source}</p> : null}
                          {activity.query ? <p className="break-words text-muted-foreground">查询：{activity.query}</p> : null}
                          <p className="text-muted-foreground">参数：{formatArgsSummary(activity.args)}</p>
                          <p className="text-muted-foreground">结果：{activity.summary ?? "执行中，等待工具返回结果。"}</p>
                          <p className="text-muted-foreground">
                            {formatDateTime(activity.startedAt)} {activity.completedAt ? `→ ${formatDateTime(activity.completedAt)}` : ""}
                          </p>
                          {renderClickHouseToolData(activity)}
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">脱敏事件内容</summary>
                            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
                              {formatJsonPreview({
                                called: activity.callPayload,
                                result: activity.resultPayload,
                              })}
                            </pre>
                          </details>
                        </div>
                      </details>
                      {filterRetiredEvidenceIds(activity.evidenceIds).length ? (
                        <div className="flex flex-wrap gap-1">
                          {filterRetiredEvidenceIds(activity.evidenceIds).map((id) => (
                            <Button
                              key={`${activity.activityId}-${id}`}
                              size="sm"
                              variant="outline"
                              onClick={() => navigateTo("/evidence", { evidenceId: id, runId: run.runId })}
                            >
                              {id}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-muted-foreground">暂无独立工具调用记录。</p>
              )}
            </CardContent>
          </Card>

          <Card className="order-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">使用证据</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {derived?.usedEvidence.length ? (
                derived.usedEvidence.map((item: Evidence) => (
                  <div key={item.id} className="rounded border p-2 space-y-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground">
                      {EVIDENCE_TYPE_LABEL[item.evidenceType]} · {item.sourceName}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {item.sourceApiName ? <Badge variant="outline">API：{item.sourceApiName}</Badge> : null}
                      {item.snapshotId ? <Badge variant="outline">Snapshot：{item.snapshotId}</Badge> : null}
                    </div>
                    <p className="text-muted-foreground">
                      质量 {item.qualityScore} · 发布时间 {formatDateTime(item.publishedAt)}
                    </p>
                    {item.snapshotCapturedAt ? (
                      <p className="text-muted-foreground">快照时间：{formatDateTime(item.snapshotCapturedAt)}</p>
                    ) : null}
                    <p className="text-muted-foreground">{item.summary}</p>
                    {hasSourceUrl(item.url) ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-blue-600 hover:underline"
                        title={item.url}
                      >
                        来源 URL: {item.url}
                      </a>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: item.id, runId: run.runId })}>
                        查看证据详情
                      </Button>
                      {hasSourceUrl(item.url) ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            打开来源网页
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">暂无关联证据。</p>
              )}
            </CardContent>
          </Card>

          <Card className="order-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">数据上下文</CardTitle>
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
          <CardTitle className="text-base">运行指标</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-10 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground">工具调用</p>
            <p className="font-medium">{liveMetrics?.toolCalls ?? run.metrics.toolCalls}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">模型调用</p>
            <p className="font-medium">{liveMetrics?.llmCalls ?? run.metrics.llmCalls}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">生成报告</p>
            <p className="font-medium">{liveMetrics?.generatedReports ?? run.metrics.generatedReports}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">提示词 Token</p>
            <p className="font-medium">{formatInteger(liveMetrics?.promptTokens)}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">生成 Token</p>
            <p className="font-medium">{formatInteger(liveMetrics?.completionTokens)}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">总 Token</p>
            <p className="font-medium">{formatInteger(tokenTotal(liveMetrics))}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">证据数量</p>
            <p className="font-medium">{derived?.usedEvidence.length ?? 0}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">耗时</p>
            <p className="font-medium">{derived?.runDuration}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Agent 数量</p>
            <p className="font-medium">{run.agents.length}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">完成 Agent</p>
            <p className="font-medium">{derived?.completedAgents}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">风险提示</p>
            <p className="font-medium">{derived?.riskWarningCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">运行事件流</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">运行模式：{apiMode === "real" ? "真实 API 事件" : "模拟回放"}</Badge>
              <Badge variant="outline">传输：{apiMode === "real" ? "SSE" : "本地模拟"}</Badge>
              <Badge variant={runtimeReplayStatus === "ERROR" ? "destructive" : runtimeReplayStatus === "RUNNING" ? "secondary" : "default"}>
                {runtimeReplayStatus === "IDLE" ? "事件流就绪" : formatRuntimeStatus(runtimeReplayStatus)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={startRuntimeReplay} disabled={runtimeReplayStatus === "RUNNING"}>
              {apiMode === "real" ? "启动 SSE 事件流" : "回放运行事件"}
            </Button>
            <Button size="sm" variant="outline" onClick={stopRuntimeReplay} disabled={runtimeReplayStatus !== "RUNNING"}>
              {apiMode === "real" ? "停止 SSE 事件流" : "停止回放"}
            </Button>
            <span className="text-muted-foreground">
              已保留事件：{runtimeEvents.length}/{runtimeEventsLoadedCount || runtimeEvents.length} · 序号：{runtimeSnapshot?.sequence ?? 0} · 快照：{formatRuntimeStatus(runtimeSnapshot?.status ?? "QUEUED")}
            </span>
          </div>
          {runtimeReplayError ? <p className="text-destructive">{runtimeReplayError}</p> : null}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded border p-2">
              <p className="text-muted-foreground">回放工具调用</p>
              <p className="font-medium">{runtimeSnapshot?.toolCalls.length ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-muted-foreground">回放报告</p>
              <p className="font-medium">{runtimeSnapshot?.reports.length ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-muted-foreground">回放证据</p>
              <p className="font-medium">{runtimeSnapshot?.evidenceIds.length ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-muted-foreground">回放检查点</p>
              <p className="font-medium">{runtimeSnapshot?.checkpoints.length ?? 0}</p>
            </div>
          </div>
          <div className="max-h-72 overflow-auto space-y-2">
            {runtimeSnapshot?.timeline.length ? (
              runtimeSnapshot.timeline.map((item) => (
                <div key={item.eventId} className="rounded border-l-4 border-emerald-500 bg-muted/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{formatRuntimeEventType(item.type)}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(item.timestamp)}</span>
                  </div>
                  <p className="mt-1 font-medium">{formatAgentName(item.agentName)}</p>
                  <p className="text-muted-foreground mt-1">{item.summary}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">
                {apiMode === "real"
                  ? "点击启动 SSE 事件流后，将逐条展示后端运行事件。"
                  : "点击回放运行事件后，将按顺序展示模拟运行事件。"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Worker 运行产物</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={refreshWorkerArtifacts} disabled={isLoadingWorkerArtifacts}>
              {isLoadingWorkerArtifacts ? "读取中..." : "刷新 Worker"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {workerArtifactError ? <p className="text-destructive">{workerArtifactError}</p> : null}
          {workerArtifacts ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={workerArtifacts.exists ? "default" : "outline"}>
                  {workerArtifacts.exists ? "已找到 Worker 产物" : "暂无 Worker 产物"}
                </Badge>
                <span className="truncate text-muted-foreground">工作目录：{workerArtifacts.workDir}</span>
              </div>
              {workerArtifacts.message ? <p className="text-muted-foreground">{workerArtifacts.message}</p> : null}
              {Object.keys(workerArtifacts.files).length ? (
                <div className="grid gap-2 md:grid-cols-5">
                  {Object.entries(workerArtifacts.files).map(([name, file]) => (
                    <div key={name} className="rounded border p-2">
                      <p className="font-medium">{name}</p>
                      <p className="text-muted-foreground">{file.exists ? "可用" : "缺失"}</p>
                      <p className="text-muted-foreground">{formatFileSize(file.sizeBytes)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 xl:grid-cols-2">
                <details className="rounded border p-2" open={Boolean(workerArtifacts.stdoutLines.length)}>
                  <summary className="cursor-pointer font-medium">标准输出尾部 ({workerArtifacts.stdoutLines.length})</summary>
                  {workerArtifacts.stdoutLines.length ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
                      {workerArtifacts.stdoutLines.join("\n")}
                    </pre>
                  ) : (
                    <p className="mt-2 text-muted-foreground">暂无 stdout 内容。</p>
                  )}
                </details>
                <details className="rounded border p-2" open={Boolean(workerArtifacts.stderrLines.length)}>
                  <summary className="cursor-pointer font-medium">错误输出尾部 ({workerArtifacts.stderrLines.length})</summary>
                  {workerArtifacts.stderrLines.length ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-rose-100">
                      {workerArtifacts.stderrLines.join("\n")}
                    </pre>
                  ) : (
                    <p className="mt-2 text-muted-foreground">暂无 stderr 内容。</p>
                  )}
                </details>
              </div>
              <details className="rounded border p-2">
                <summary className="cursor-pointer font-medium">
                  Worker JSONL 事件 ({workerArtifacts.events.length}) / result.json
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(
                    {
                      events: workerArtifacts.events.slice(-20),
                      resultStatus:
                        workerArtifacts.result && typeof workerArtifacts.result.status === "string"
                          ? workerArtifacts.result.status
                          : undefined,
                      resultError:
                        workerArtifacts.result && typeof workerArtifacts.result.error === "string"
                          ? workerArtifacts.result.error
                          : undefined,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-muted-foreground">点击刷新 Worker 读取当前任务的 Worker 产物。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">后端运行日志</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={refreshBackendLogs} disabled={isLoadingBackendLogs}>
              {isLoadingBackendLogs ? "读取中..." : "刷新日志"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {backendLogError ? <p className="text-destructive">{backendLogError}</p> : null}
          {backendLogs ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={backendLogs.exists ? "default" : "outline"}>{backendLogs.exists ? "可用" : "缺失"}</Badge>
                {backendLogs.source ? <Badge variant="outline">来源：{backendLogs.source}</Badge> : null}
                <span className="truncate text-muted-foreground">路径：{backendLogs.path}</span>
                <span className="text-muted-foreground">原始行数：{backendLogs.lines.length}</span>
                <span className="text-muted-foreground">可见行数：{filteredBackendLogLines.length}</span>
                {hiddenBackendLogLineCount > 0 ? (
                  <span className="text-muted-foreground">已隐藏旧日志/全局日志：{hiddenBackendLogLineCount}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "alphatrace" as const, label: "AlphaTrace" },
                  { id: "current_run" as const, label: "当前任务" },
                  { id: "all" as const, label: "全部全局日志" },
                ].map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={backendLogFilter === item.id ? "default" : "outline"}
                    onClick={() => setBackendLogFilter(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              {backendLogs.message ? <p className="text-muted-foreground">{backendLogs.message}</p> : null}
              {!backendLogs.exists && backendLogs.candidates?.length ? (
                <details className="rounded border bg-muted/20 p-2 text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">已检查的日志文件候选</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {backendLogs.candidates.map((candidate) => (
                      <li key={candidate} className="break-all font-mono text-[11px]">
                        {candidate}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {filteredBackendLogLines.length ? (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
                  {filteredBackendLogLines.join("\n")}
                </pre>
              ) : (
                <p className="text-muted-foreground">
                  当前过滤条件下暂无日志内容。可以切换全部全局日志，或在运行事件流中查看当前任务的结构化过程。
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">点击刷新日志读取后端日志。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agent 时间线</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {derived?.timelineItems.length ? (
            derived.timelineItems.map((item) => {
              return (
                <div key={item.itemId} className="rounded border-l-4 border-blue-500 bg-muted/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.aggregated ? "secondary" : "outline"}>
                        {formatTimelineType(item)}
                      </Badge>
                      {item.stepLabel ? <Badge variant="outline">{item.stepLabel}</Badge> : null}
                      {item.count ? <Badge variant="outline">{item.metricCount ? `${item.count} 次更新` : `${item.count} 段输出`}</Badge> : null}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(item.timestamp)}</span>
                  </div>
                  <p className="mt-1 font-medium">{formatAgentName(item.agentName)}</p>
                  <p className="text-muted-foreground mt-1 line-clamp-3">{item.summary}</p>
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
            <CardTitle className="text-base">风险提示</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.riskWarnings.map((warning, index) => {
              const agent = derived.agentById.get(warning.agentId);
              return (
                <div key={`${warning.timestamp}-${index}`} className="rounded border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{formatAgentName(agent?.name ?? warning.agentId)}</p>
                    <Badge variant={warning.level === "HIGH" ? "destructive" : warning.level === "MEDIUM" ? "secondary" : "outline"}>
                      {RISK_LEVEL_LABEL[warning.level]}
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



