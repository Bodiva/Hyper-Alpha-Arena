import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Globe2,
  Loader2,
  MessageSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Asset } from "@/entities/asset/model";
import type { AgentDecision, AgentReport, AgentRun, AgentRunStatus, AgentRuntimeEvent } from "@/entities/agent/model";
import {
  getAgentRunByIdAsync,
  getAgentRunEvidenceAsync,
  getAgentRunReportsAsync,
  getAgentRunRuntimeEventsAsync,
  listAgentRunsAsync,
  submitResearchAssistantAgentRunAsync,
} from "@/entities/agent/api";
import {
  createResearchWorkspaceThreadAsync,
  ensureResearchWorkspaceAsync,
  getResearchWorkspaceSnapshotAsync,
  updateResearchWorkspaceReviewAsync,
  type ResearchReviewStatus,
  type ResearchWorkspaceSnapshot,
} from "@/entities/research-workspace/api";
import type { Evidence } from "@/entities/evidence/model";
import { assetsMock } from "@/mocks/assets.mock";
import { buildAgentExecutionProgress, type AgentExecutionProgress } from "@/shared/lib/agent-progress";
import { createHashUrl } from "@/shared/lib/navigation";

type InspectorTab = "run" | "evidence" | "graph";

interface ChatItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  runId?: string;
}

interface GraphNode {
  id: string;
  label: string;
  headline?: string;
  meta?: string;
  badge?: string;
  type: "query" | "source" | "agent" | "report" | "decision" | "summary";
  x: number;
  y: number;
  detail: {
    title: string;
    subtitle?: string;
    body?: string;
    rows?: Array<{ label: string; value: string }>;
    bullets?: string[];
  };
}

interface GraphEdge {
  from: string;
  to: string;
}

interface ConversationSummary {
  id: number;
  title: string;
  message_count: number;
  is_bot_conversation?: boolean;
  updated_at?: string;
  created_at?: string;
}

interface ConversationMessage {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
}

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

const AGENT_STATUS_LABEL: Record<string, string> = {
  IDLE: "等待中",
  RUNNING: "运行中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const agentStatusLabel = (status?: string): string => status ? AGENT_STATUS_LABEL[status] ?? status : "-";

const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"]);

const isStubLikeRun = (run?: AgentRun): boolean => {
  if (!run) return false;
  const searchable = [
    run.runId,
    run.name,
    run.target,
    run.triggeredBy,
    run.modelName,
    run.finalDecision?.summary,
    run.finalDecision?.thesis,
    ...(run.finalDecision?.risks ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    run.runId.toLowerCase().startsWith("demo") ||
    run.runId.toLowerCase().includes("_stub_") ||
    searchable.includes("stub") ||
    searchable.includes("static alphatrace contract data") ||
    searchable.includes("demo analysis")
  );
};

const pickDisplayRun = (runs: AgentRun[]): AgentRun | undefined => {
  const realRuns = runs.filter((run) => !isStubLikeRun(run));
  const candidates = realRuns.length ? realRuns : runs;
  return (
    candidates.find((run) => run.status === "RUNNING" || run.status === "QUEUED") ??
    candidates.find((run) => run.status === "COMPLETED" || run.status === "PARTIALLY_COMPLETED") ??
    candidates[0]
  );
};

const mergeRunsById = (...groups: AgentRun[][]): AgentRun[] => {
  const merged = new Map<string, AgentRun>();
  groups.flat().forEach((run) => {
    if (!merged.has(run.runId)) {
      merged.set(run.runId, run);
    }
  });
  return Array.from(merged.values());
};

const SAMPLE_MESSAGES: ChatItem[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "这里是投研助手工作区。可以直接输入 ETF、基金或指数代码与研究问题，例如“分析 510300.SH 沪深300ETF 是否适合中期配置”。我会按投研流程创建独立任务，并在右侧展示证据、图谱、报告和运行状态。",
  },
];

const NEW_CONVERSATION_RUN_ID = "__new_conversation__";
const RESEARCH_ASSISTANT_STRATEGY_ID = "research_assistant_lab";

type ResearchTargetSource = "empty" | "known_asset" | "question_text" | "current_run" | "portfolio";

interface ResolvedResearchTarget {
  assetId?: string;
  portfolioId?: string;
  assetLabel: string;
  assetSymbol?: string;
  assetName?: string;
  workspaceName: string;
  taskType: string;
  researchRunType: "asset_research" | "portfolio_review";
  question: string;
  targetSource: ResearchTargetSource;
  matchedAsset?: Asset;
}

const RESEARCH_TARGET_EXAMPLES = [
  { label: "510300.SH 沪深300ETF", value: "分析 510300.SH 沪深300ETF 是否适合中期配置，并给出正方、反方、研究经理和风险复核结论。" },
  { label: "513100.SH 纳指ETF", value: "分析 513100.SH 纳指ETF 是否适合中期配置，并比较汇率、估值和科技股集中度风险。" },
  { label: "006011.OF 创新成长基金", value: "分析 006011.OF 创新成长基金 是否适合中期配置，并给出主要证据和反方风险。" },
];

const RESEARCH_TARGET_ALIASES: Record<string, string[]> = {
  asset_etf_510300: ["510300", "510300.sh", "沪深300", "沪深300etf", "300etf", "csi300", "csi 300"],
  asset_etf_513100: ["513100", "513100.sh", "纳指", "纳指etf", "纳斯达克", "纳斯达克100", "nasdaq", "nasdaq100"],
  asset_fund_000001: ["000001", "000001.of", "平衡价值", "balanced value"],
  asset_fund_006011: ["006011", "006011.of", "创新成长", "innovation growth"],
};

const normalizeResearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[._\-：:，,。；;、/\\()[\]{}"'“”‘’]/g, "");

const assetDisplayLabel = (asset: Asset): string => `${asset.symbol} ${asset.name}`;

const findKnownAssetById = (assetId?: string): Asset | undefined => {
  if (!assetId) return undefined;
  return assetsMock.find((asset) => asset.id === assetId);
};

const extractResearchTargetLabel = (text: string): string | undefined => {
  const symbol = text.match(/\b\d{6}\.(?:SH|SZ|OF)\b/i)?.[0];
  if (symbol) return symbol.toUpperCase();
  const code = text.match(/\b\d{6}\b/)?.[0];
  if (code) return code;
  const namedTarget = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,32}(?:ETF|基金|指数|QDII)/i)?.[0];
  if (namedTarget) return namedTarget.trim();
  return undefined;
};

const resolveKnownResearchAsset = (text: string): Asset | undefined => {
  const normalized = normalizeResearchText(text);
  if (!normalized) return undefined;

  for (const [assetId, aliases] of Object.entries(RESEARCH_TARGET_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normalizeResearchText(alias)))) {
      const asset = findKnownAssetById(assetId);
      if (asset) return asset;
    }
  }

  return assetsMock.find((asset) => {
    const searchable = [asset.id, asset.symbol, asset.name, asset.assetType, asset.market, ...asset.tags]
      .filter(Boolean)
      .map((item) => normalizeResearchText(String(item)));
    return searchable.some((item) => item && normalized.includes(item));
  });
};

const withResearchTargetHeader = (question: string, targetLabel: string): string => {
  if (!targetLabel || question.includes("【研究标的：")) return question;
  return `【研究标的：${targetLabel}】\n${question}`;
};

const resolveResearchTargetFromText = (
  text: string,
  fallbackRun?: AgentRun,
  fallbackTaskType = "single_asset_analysis",
): ResolvedResearchTarget => {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      assetLabel: "等待输入标的",
      workspaceName: "投研助手动态工作区",
      taskType: "single_asset_analysis",
      researchRunType: "asset_research",
      question: "",
      targetSource: "empty",
    };
  }

  const matchedAsset = resolveKnownResearchAsset(trimmed);
  if (matchedAsset) {
    const assetLabel = assetDisplayLabel(matchedAsset);
    return {
      assetId: matchedAsset.id,
      assetLabel,
      assetSymbol: matchedAsset.symbol,
      assetName: matchedAsset.name,
      workspaceName: `${assetLabel} 投研工作区`,
      taskType: "single_asset_analysis",
      researchRunType: "asset_research",
      question: withResearchTargetHeader(trimmed, assetLabel),
      targetSource: "known_asset",
      matchedAsset,
    };
  }

  const explicitLabel = extractResearchTargetLabel(trimmed);
  if (explicitLabel) {
    return {
      assetLabel: explicitLabel,
      workspaceName: `${explicitLabel} 投研工作区`,
      taskType: "single_asset_analysis",
      researchRunType: "asset_research",
      question: withResearchTargetHeader(trimmed, explicitLabel),
      targetSource: "question_text",
    };
  }

  if (fallbackTaskType === "portfolio_diagnostic" && fallbackRun?.portfolioId) {
    const portfolioLabel = fallbackRun.portfolioId;
    return {
      portfolioId: fallbackRun.portfolioId,
      assetLabel: portfolioLabel,
      workspaceName: `${portfolioLabel} 组合工作区`,
      taskType: fallbackTaskType,
      researchRunType: "portfolio_review",
      question: trimmed,
      targetSource: "portfolio",
    };
  }

  const fallbackAsset = findKnownAssetById(fallbackRun?.assetIds?.[0]);
  if (fallbackAsset) {
    const assetLabel = assetDisplayLabel(fallbackAsset);
    return {
      assetId: fallbackAsset.id,
      assetLabel,
      assetSymbol: fallbackAsset.symbol,
      assetName: fallbackAsset.name,
      workspaceName: `${assetLabel} 投研工作区`,
      taskType: "single_asset_analysis",
      researchRunType: "asset_research",
      question: withResearchTargetHeader(trimmed, assetLabel),
      targetSource: "current_run",
      matchedAsset: fallbackAsset,
    };
  }

  return {
    assetLabel: "自定义研究标的",
    workspaceName: "投研助手动态工作区",
    taskType: "single_asset_analysis",
    researchRunType: "asset_research",
    question: trimmed,
    targetSource: "question_text",
  };
};

const createNewConversationMessages = (): ChatItem[] => [
  {
    id: `new-conversation-${Date.now()}`,
    role: "assistant",
    content: "已开启新对话。请输入标的代码/名称和投研问题，我会基于当前真实数据源重新创建独立投研任务。",
  },
];

const formatDateTime = (timestamp?: string): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatPercent = (value?: number, digits = 0): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
};

const formatScore = (value?: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value <= 1 ? `${Math.round(value * 100)}` : `${Math.round(value)}`;
};

const formatInteger = (value?: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("zh-CN");
};

const formatTokenUsage = (metrics?: AgentRun["metrics"]): string => {
  if (!metrics) return "-";
  const hasPrompt = typeof metrics.promptTokens === "number" && Number.isFinite(metrics.promptTokens);
  const hasCompletion = typeof metrics.completionTokens === "number" && Number.isFinite(metrics.completionTokens);
  const total = metrics.totalTokens ?? (hasPrompt || hasCompletion ? (metrics.promptTokens ?? 0) + (metrics.completionTokens ?? 0) : undefined);
  if (!total) return "-";
  if (hasPrompt || hasCompletion) {
    return `${formatInteger(total)}（输入 ${hasPrompt ? formatInteger(metrics.promptTokens) : "-"} / 输出 ${hasCompletion ? formatInteger(metrics.completionTokens) : "-"}）`;
  }
  return formatInteger(total);
};

const ARTIFACT_TYPE_LABEL: Record<string, string> = {
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

const formatArtifactTypeLabel = (type?: string): string => (type ? ARTIFACT_TYPE_LABEL[type] ?? type : "研究产物");

const shortId = (value?: string): string => {
  if (!value) return "-";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
};

const compactText = (value?: string, maxLength = 24): string => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const TECHNICAL_RESULT_PATTERNS = [
  /Final Decision was not provided/i,
  /Risk Review was not provided/i,
  /was not explicitly separated/i,
  /structured Qwen output/i,
  /Qwen output/i,
  /parser fallback/i,
  /fallback/i,
  /TradingAgents/i,
  /Research model API/i,
  /model provider/i,
  /structured output/i,
  /internal API/i,
  /Rule-based evidence support/i,
  /Evidence semantic support/i,
  /Invalid evidence references/i,
  /Raw .* fallback/i,
];

const isTechnicalResultText = (value?: string): boolean => {
  const text = value ?? "";
  if (!text.trim()) return true;
  if (TECHNICAL_RESULT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (/"(?:marketView|bullView|bearView|riskReview|finalDecision|evidenceIds)"\s*:/.test(text)) return true;
  return false;
};

const sanitizeResearchText = (value?: string, maxLength = 520): string => {
  if (!value) return "";
  const withoutFences = value.replace(/```[\s\S]*?```/g, " ");
  if (isTechnicalResultText(withoutFences)) return "";
  const cleaned = withoutFences
    .replace(/(?:\*\*)?Evidence(?: Ids?| used)(?:\*\*)?[:：][\s\S]*$/i, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(Evidence Ids?|evidenceIds|Action|Confidence|Risks?|Horizon|Thesis|Key Points?)\*\*[:：]?/gi, "")
    .replace(/\b(Key Points|Arguments|Risks|Consensus|Disagreements|Open Questions|Evidence Ids?)\b[:：]?/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`(ev_|ck_|marketContext\.|toolContext\.)[^`]+`/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\b(ev|ck)_[a-z0-9_]{16,}\b/gi, "")
    .replace(/Final Decision[:：]?\s*/gi, "")
    .replace(/\b(OVERWEIGHT|UNDERWEIGHT|HOLD|WATCH|NO_ACTION|overweight|underweight|hold|watch|no_action)\s+\d(?:\.\d+)?\s+(?:SHORT_TERM|MEDIUM_TERM|LONG_TERM|short_term|medium_term|long_term)\s*/g, "")
    .replace(/[✅☑]\s*Thesis\s*/gi, "")
    .replace(/\bAction[:：]\s*/gi, "建议：")
    .replace(/\bConfidence[:：]\s*/gi, "置信度：")
    .replace(/\bHorizon[:：]\s*/gi, "周期：")
    .replace(/(?:\s+-\s*){2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || isTechnicalResultText(cleaned)) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
};

const splitCleanBullets = (items?: string[], maxItems = 3): string[] => {
  return Array.from(
    new Set(
      (items ?? [])
        .flatMap((item) => item.split(/\r?\n|[；;]/))
        .map((item) => sanitizeResearchText(item.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""), 180))
        .filter((item) => item.length > 6),
    ),
  ).slice(0, maxItems);
};

const DECISION_ACTION_LABEL: Record<string, string> = {
  OVERWEIGHT: "可考虑增配",
  UNDERWEIGHT: "建议降配/暂缓",
  HOLD: "维持观察",
  WATCH: "暂列观察",
  NO_ACTION: "暂不行动",
};

const buildDisplayDecision = (decision?: AgentDecision) => {
  const body = sanitizeResearchText(decision?.thesis, 620) || sanitizeResearchText(decision?.summary, 620);
  const risks = splitCleanBullets(decision?.risks, 3);
  const title = decision?.action ? DECISION_ACTION_LABEL[decision.action] ?? decision.action : "临时结论";
  return {
    title,
    body: body || "本次任务缺少可直接展示的结构化最终结论，建议先按观察状态处理，并结合证据、风险复核和图谱节点继续确认。",
    risks,
  };
};

const HORIZON_LABEL: Record<string, string> = {
  SHORT_TERM: "短期",
  MEDIUM_TERM: "中期",
  LONG_TERM: "长期",
};

const REVIEW_STATUS_LABEL: Record<ResearchReviewStatus, string> = {
  pending: "待复核",
  approved: "已通过",
  rejected: "已驳回",
  needs_revision: "需修订",
};

const REVIEW_STATUS_NOTE: Record<ResearchReviewStatus, string> = {
  pending: "人工复核状态重置为待复核。",
  approved: "人工复核通过，可进入后续跟踪或报告沉淀。",
  rejected: "人工复核驳回，当前结论不应作为配置依据。",
  needs_revision: "人工复核要求修订，需要补充证据或重跑部分链路。",
};

const splitReadableSentences = (value?: string, maxItems = 3, maxLength = 120): string[] => {
  const text = sanitizeResearchText(value, 1200);
  if (!text) return [];
  return text
    .split(/(?<=[。！？.!?])\s+|[；;]|\s+-\s+/)
    .map((item) => sanitizeResearchText(item, maxLength))
    .filter((item) => item.length > 8)
    .slice(0, maxItems);
};

const splitReportSummary = (value?: string, maxItems = 5): string[] => {
  const text = sanitizeResearchText(value, 1600);
  if (!text) return [];
  const rawItems = text.includes(" - ")
    ? text.split(/\s+-\s+/)
    : text.split(/(?<=[。！？.!?])\s+|[；;]/);
  return rawItems
    .map((item) => sanitizeResearchText(item, 150))
    .filter((item) => item.length > 8)
    .slice(0, maxItems);
};

const evidenceShortName = (item: Evidence): string => {
  const title = sanitizeResearchText(item.title, 34) || compactText(item.title, 34);
  return title || shortId(item.id);
};

const evidenceMetaLine = (item: Evidence): string => {
  return [
    item.sourceName,
    item.sourceApiName,
    formatEvidenceTypeLabel(item.evidenceType),
    formatDateTime(item.snapshotCapturedAt ?? item.publishedAt),
  ]
    .filter(Boolean)
    .join(" · ");
};

const evidenceByIds = (items: Evidence[], ids?: string[]): Evidence[] => {
  const idSet = new Set(ids ?? []);
  if (!idSet.size) return [];
  return items.filter((item) => idSet.has(item.id));
};

const reviewStatusFromPayload = (payload: Record<string, unknown> | undefined): ResearchReviewStatus | undefined => {
  const status = payload?.status ?? payload?.reviewStatus;
  return status === "pending" || status === "approved" || status === "rejected" || status === "needs_revision" ? status : undefined;
};

const workspaceReviewStatus = (snapshot: ResearchWorkspaceSnapshot | undefined, runId: string | undefined): ResearchReviewStatus => {
  if (!snapshot || !runId) return "pending";
  const reviewEvent = snapshot.timeline.find((event) => event.runId === runId && event.type === "review.updated");
  const eventStatus = reviewStatusFromPayload(reviewEvent?.payload);
  if (eventStatus) return eventStatus;
  const traceArtifact = snapshot.artifacts.find((artifact) => artifact.runId === runId && artifact.artifactType === "decision_trace");
  const artifactStatus = reviewStatusFromPayload(traceArtifact?.payload);
  return artifactStatus ?? "pending";
};

const topEvidence = (items: Evidence[], limit = 5): Evidence[] => {
  return [...items]
    .sort((a, b) => (b.reliabilityScore + b.qualityScore) - (a.reliabilityScore + a.qualityScore))
    .slice(0, limit);
};

const averageScore = (items: Evidence[], field: "qualityScore" | "reliabilityScore"): string => {
  const values = items.map((item) => item[field]).filter((value) => Number.isFinite(value));
  if (!values.length) return "-";
  return formatScore(values.reduce((sum, value) => sum + value, 0) / values.length);
};

type EvidenceTheme = {
  id: string;
  title: string;
  description: string;
  icon: typeof TrendingUp;
  keywords: RegExp[];
};

const EVIDENCE_THEMES: EvidenceTheme[] = [
  {
    id: "valuation",
    title: "估值与盈利",
    description: "判断是否有安全边际，是否需要盈利修复验证。",
    icon: TrendingUp,
    keywords: [/估值|pe|pb|roe|盈利|股息|dividend|valuation/i],
  },
  {
    id: "trend",
    title: "趋势与交易状态",
    description: "判断价格、波动、成交和折溢价是否支持进场节奏。",
    icon: CheckCircle2,
    keywords: [/趋势|均线|ma20|ma60|波动|成交|流动性|折溢价|liquidity|volatility|turnover/i],
  },
  {
    id: "macro",
    title: "宏观与政策",
    description: "判断政策、PMI、资金风格是否提供中期顺风。",
    icon: Database,
    keywords: [/宏观|政策|pmi|制造业|利率|资金|cashflow|policy|macro/i],
  },
  {
    id: "external",
    title: "外部校验",
    description: "检查外部信息是否强化或反驳内部数据结论。",
    icon: Globe2,
    keywords: [/外部|搜索|雪球|东方财富|叩富|bocha|external|search/i],
  },
  {
    id: "risk",
    title: "风险约束",
    description: "定位结论失效条件，不把弱证据当强结论。",
    icon: ShieldAlert,
    keywords: [/风险|回撤|失效|约束|不确定|risk|bear|下行/i],
  },
];

const evidenceThemeItems = (items: Evidence[], theme: EvidenceTheme): Evidence[] => {
  return items.filter((item) => {
    const text = `${item.title} ${item.summary} ${item.sourceName} ${item.evidenceType} ${item.sourceType ?? ""}`;
    return theme.keywords.some((pattern) => pattern.test(text));
  });
};

const compactAssetLabel = (value?: string): string => {
  const normalized = (value ?? "").trim();
  if (!normalized) return "用户问题";
  const assetMatch = normalized.match(/(沪深300ETF|中证500ETF|创业板ETF|纳指ETF|标普500ETF|[A-Z]{2,8}\d{0,6}|asset_[a-z0-9_]+)/i);
  return assetMatch?.[1] ?? compactText(normalized, 18);
};

const formatRoleLabel = (role?: string): string => {
  if (!role) return "分析角色";
  const normalized = role.trim().replace(/[-\s]+/g, "_").toUpperCase();
  return AGENT_ROLE_DISPLAY[normalized] ?? role.replace(/_/g, " ");
};

const formatStepLabel = (step?: string): string => {
  const text = step ?? "";
  const labels: Array<[RegExp, string]> = [
    [/market view/i, "市场环境分析"],
    [/bull view/i, "正方论证"],
    [/bear view/i, "反方风险识别"],
    [/research manager/i, "研究经理汇总"],
    [/risk review/i, "风险复核"],
    [/final decision|final diagnosis/i, "配置观察生成"],
    [/evidence retrieval/i, "证据检索"],
  ];
  return labels.find(([pattern]) => pattern.test(text))?.[1] ?? text.replace(/[_-]+/g, " ");
};

const displayRunName = (run: AgentRun): string => {
  const text = `${run.name} ${run.taskType} ${run.researchRunType ?? ""}`.toLowerCase();
  if (text.includes("portfolio")) return "组合投研复核任务";
  if (text.includes("asset_research") || text.includes("single_asset") || text.includes("research agent task")) return "资产投研任务";
  return run.name;
};

const formatEvidenceTypeLabel = (type?: string): string => {
  const labels: Record<string, string> = {
    news: "新闻",
    announcement: "公告",
    research_report: "研报",
    fund_quarterly_report: "季报",
    macro_data: "宏观",
    market_snapshot: "行情",
    industry_data: "产业",
    user_upload: "上传",
    external_search: "外搜",
    runtime_context: "上下文",
  };
  return type ? labels[type] ?? type : "证据";
};

const nodeColor = (type: GraphNode["type"]): string => {
  switch (type) {
    case "query":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "source":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "agent":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "report":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "decision":
      return "border-slate-300 bg-slate-900 text-white";
    case "summary":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-border bg-background text-foreground";
  }
};

const graphTypeLabel = (type: GraphNode["type"]): string => {
  switch (type) {
    case "query":
      return "用户问题";
    case "source":
      return "数据源 / 证据";
    case "agent":
      return "分析角色";
    case "report":
      return "研究报告";
    case "decision":
      return "最终结论";
    case "summary":
      return "逻辑节点";
    default:
      return "节点";
  }
};

const formatSourceTypeLabel = (type?: string): string => {
  const normalized = (type ?? "").toLowerCase();
  if (!normalized) return "数据源";
  if (normalized.includes("lixinger") && normalized.includes("sync")) return "理杏仁同步数据";
  if (normalized.includes("local_sync")) return "本地同步数据";
  if (normalized.includes("api")) return "网络 API";
  if (normalized.includes("search") || normalized.includes("external")) return "网络搜索";
  if (normalized.includes("database") || normalized.includes("mysql") || normalized.includes("clickhouse")) return "内部数据库";
  if (normalized.includes("upload")) return "用户上传";
  return type ?? "数据源";
};

const isExternalEvidence = (item: Evidence): boolean => {
  const sourceType = (item.sourceType ?? "").toLowerCase();
  return item.evidenceType === "external_search" || sourceType.includes("api") || sourceType.includes("search") || sourceType.includes("external");
};

const buildSourceBreakdown = (items: Evidence[]): string[] => {
  const groups = new Map<string, { count: number; types: Set<string>; sourceType?: string }>();
  items.forEach((item) => {
    const key = item.sourceName || "未命名数据源";
    const current = groups.get(key) ?? { count: 0, types: new Set<string>(), sourceType: item.sourceType };
    current.count += 1;
    current.types.add(formatEvidenceTypeLabel(item.evidenceType));
    current.sourceType = current.sourceType || item.sourceType;
    groups.set(key, current);
  });
  return Array.from(groups.entries())
    .map(([sourceName, info]) => `${sourceName} · ${formatSourceTypeLabel(info.sourceType)} · ${info.count} 条 · ${Array.from(info.types).slice(0, 3).join("/")}`)
    .slice(0, 5);
};

const evidenceScoreRange = (items: Evidence[], field: "qualityScore" | "reliabilityScore"): string => {
  const scores = items.map((item) => item[field]).filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!scores.length) return "-";
  return `${formatScore(Math.min(...scores))}-${formatScore(Math.max(...scores))}`;
};

const averageEvidenceScoreNumber = (items: Evidence[], field: "qualityScore" | "reliabilityScore"): number => {
  const scores = items.map((item) => item[field]).filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, value) => sum + (value <= 1 ? value * 100 : value), 0) / scores.length);
};

const evidenceHealthLabel = (items: Evidence[]): string => {
  if (!items.length) return "证据不足";
  const reliability = averageEvidenceScoreNumber(items, "reliabilityScore");
  if (items.length >= 8 && reliability >= 75) return "证据较充分";
  if (items.length >= 4 && reliability >= 65) return "证据可用";
  return "需补充验证";
};

const findAgentByRole = (run: AgentRun | undefined, patterns: RegExp[]): AgentRun["agents"][number] | undefined => {
  return run?.agents.find((agent) => patterns.some((pattern) => pattern.test(`${agent.name} ${agent.role}`)));
};

const findReportByKeywords = (reports: AgentReport[], patterns: RegExp[]): AgentReport | undefined => {
  return reports.find((report) => patterns.some((pattern) => pattern.test(`${report.title} ${report.summary} ${report.agentId}`)));
};

const AGENT_ROLE_DISPLAY: Record<string, string> = {
  MARKET_ANALYST: "市场环境分析师",
  BULL_RESEARCHER: "正方研究员",
  BEAR_RESEARCHER: "反方研究员",
  RESEARCH_MANAGER: "研究经理",
  RISK_ANALYST: "风险复核员",
  PORTFOLIO_MANAGER: "配置观察员",
  PORTFOLIO_ANALYST: "组合分析师",
  LIQUIDITY_ANALYST: "流动性分析师",
  QUANT_ANALYST: "量化分析师",
};

const displayAgentName = (agent: AgentRun["agents"][number] | undefined, fallback: string): string => {
  if (!agent) return fallback;
  return AGENT_ROLE_DISPLAY[agent.role] ?? agent.name ?? fallback;
};

const displayAgentSubtitle = (agent: AgentRun["agents"][number] | undefined, fallback: string): string => {
  if (!agent) return fallback;
  const roleLabel = AGENT_ROLE_DISPLAY[agent.role] ?? agent.role;
  return `${roleLabel} · ${agentStatusLabel(agent.status)}`;
};

const reportPoints = (report?: AgentReport, maxItems = 2): string[] => splitReadableSentences(report?.summary, maxItems, 170);

const evidenceBusinessRows = (items: Evidence[], limit = 3): Array<{ label: string; value: string }> => {
  return topEvidence(items, limit).map((item) => ({
    label: evidenceShortName(item),
    value: `${formatEvidenceTypeLabel(item.evidenceType)} · ${item.sourceName || "未知来源"}${item.sourceApiName ? ` · API ${item.sourceApiName}` : ""} · 可靠度 ${formatScore(item.reliabilityScore)}`,
  }));
};

const traceStepType = (stepId: string): GraphNode["type"] => {
  const normalized = stepId.toLowerCase();
  if (normalized.includes("decision")) return "decision";
  if (normalized.includes("manager") || normalized.includes("report")) return "report";
  if (normalized.includes("evidence") || normalized.includes("context")) return "source";
  if (normalized.includes("summary")) return "summary";
  return "agent";
};

const traceStepBusinessFocus = (stepId: string, title: string): string => {
  const normalized = `${stepId} ${title}`.toLowerCase();
  if (normalized.includes("market") || normalized.includes("市场")) return "回答估值、趋势、流动性和宏观环境是否支持进入配置候选。";
  if (normalized.includes("bull") || normalized.includes("正方")) return "提炼支持配置的核心理由，并要求每个理由能回到证据。";
  if (normalized.includes("bear") || normalized.includes("反方")) return "暴露反对配置或暂缓配置的约束，避免单边乐观。";
  if (normalized.includes("risk") || normalized.includes("风险")) return "把不确定性转成失效条件、观察指标和仓位约束。";
  if (normalized.includes("manager") || normalized.includes("经理")) return "收敛正反观点，形成可复核的研究摘要。";
  if (normalized.includes("decision") || normalized.includes("配置")) return "把研究摘要、证据质量和风险约束收敛为待人工确认的配置观察。";
  return "将上一步输出转成下一步可使用的研究上下文。";
};

const traceStatusLabel = (status?: string): string => {
  switch (status) {
    case "completed":
      return "已完成";
    case "needs_review":
      return "待复核";
    case "pending":
      return "等待中";
    default:
      return status ?? "-";
  }
};

const buildDecisionTraceGraph = (
  run: AgentRun,
  reports: AgentReport[] = [],
  evidence: Evidence[] = [],
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const trace = run.decisionTrace;
  const steps = trace?.steps ?? [];
  const displayDecision = buildDisplayDecision(run.finalDecision);
  const evidenceHealth = evidenceHealthLabel(evidence);
  const evidenceReliability = averageEvidenceScoreNumber(evidence, "reliabilityScore");
  const sourceApiNames = Array.from(new Set(evidence.map((item) => item.sourceApiName).filter(Boolean) as string[]));
  const sourceNames = Array.from(new Set(evidence.map((item) => item.sourceName).filter(Boolean) as string[]));
  const reportByArtifactId = new Map<string, AgentReport>();
  reports.forEach((report) => {
    reportByArtifactId.set(`artifact_${report.reportId}`, report);
    reportByArtifactId.set(report.reportId, report);
  });

  const nodes: GraphNode[] = [
    {
      id: "query",
      label: "投研问题",
      headline: compactAssetLabel(run.target),
      meta: run.researchRunType ? `类型：${run.researchRunType}` : "中期配置判断",
      type: "query",
      x: 3,
      y: 44,
      detail: {
        title: "投研问题",
        subtitle: run.runId,
        body: run.target
          ? `本次链路从用户问题“${run.target}”出发，目标是形成可追溯、可解释、可复核的配置观察。`
          : "本次链路从用户输入的投研问题出发，向后串联证据、研究员报告、风险复核和配置观察。",
        rows: [
          { label: "Run ID", value: run.runId },
          { label: "任务类型", value: run.researchRunType ?? run.taskType },
          { label: "痛点", value: "让用户看到结论从哪些证据和哪些研究步骤收敛而来，而不是只看到最终答案。" },
        ],
      },
    },
    {
      id: "evidence-foundation",
      label: "证据底座",
      headline: `${evidence.length} 条证据 · ${evidenceHealth}`,
      meta: sourceApiNames.length ? `API：${sourceApiNames.slice(0, 3).join(" / ")}` : "内部数据源 / 本地证据",
      badge: evidenceReliability || "-",
      type: "source",
      x: 18,
      y: 44,
      detail: {
        title: "证据底座",
        subtitle: "内部数据、外部 API、快照和研报证据",
        body: "这一层统一展示投研任务真正使用过的证据来源。后续每个 Runtime Agent Step 都会引用这里的 evidenceId，便于追责和复盘。",
        rows: [
          { label: "证据健康", value: `${evidenceHealth}，共 ${evidence.length} 条，平均可靠度 ${evidenceReliability || "-"}` },
          { label: "来源 API", value: sourceApiNames.length ? sourceApiNames.join(" / ") : "未返回 sourceApiName" },
          { label: "数据来源", value: sourceNames.length ? sourceNames.slice(0, 6).join(" / ") : "未返回 sourceName" },
        ],
        bullets: buildSourceBreakdown(evidence).length ? buildSourceBreakdown(evidence) : ["暂无证据来源明细"],
      },
    },
  ];

  const stepCount = Math.max(steps.length, 1);
  const stepStartX = 33;
  const stepEndX = 73;
  const laneY = [16, 32, 48, 64, 78];

  steps.forEach((step, index) => {
    const stepEvidence = evidenceByIds(evidence, step.evidenceIds);
    const stepReports = step.artifactIds.map((id) => reportByArtifactId.get(id)).filter(Boolean) as AgentReport[];
    const x = stepCount === 1 ? 52 : stepStartX + ((stepEndX - stepStartX) * index) / (stepCount - 1);
    const y = laneY[index % laneY.length];
    const reportLabel = stepReports.map((report) => formatArtifactTypeLabel(report.artifactType)).filter(Boolean).join(" / ");
    nodes.push({
      id: `trace-${step.stepId}`,
      label: step.title,
      headline: step.title,
      meta: step.agentName ? `${step.agentName} · ${traceStatusLabel(step.status)}` : traceStatusLabel(step.status),
      badge: step.evidenceIds.length ? `${step.evidenceIds.length}` : undefined,
      type: traceStepType(step.stepId),
      x,
      y,
      detail: {
        title: step.title,
        subtitle: step.agentName,
        body: sanitizeResearchText(step.summary, 700) || traceStepBusinessFocus(step.stepId, step.title),
        rows: [
          { label: "链路职责", value: traceStepBusinessFocus(step.stepId, step.title) },
          { label: "状态", value: traceStatusLabel(step.status) },
          { label: "关联证据", value: step.evidenceIds.length ? `${step.evidenceIds.length} 条：${step.evidenceIds.slice(0, 4).map(shortId).join(" / ")}` : "未显式引用证据" },
          { label: "关联产物", value: step.artifactIds.length ? `${step.artifactIds.length} 个${reportLabel ? `：${reportLabel}` : ""}` : "未显式关联产物" },
        ],
        bullets: stepEvidence.length
          ? stepEvidence.slice(0, 5).map((item) => `${evidenceShortName(item)} · ${item.sourceApiName || item.sourceName || "未知来源"} · 可靠度 ${formatScore(item.reliabilityScore)}`)
          : step.artifactIds.length
            ? step.artifactIds.map((id) => `产物：${shortId(id)}`)
            : ["该步骤暂未返回可展示的证据或产物引用"],
      },
    });
  });

  nodes.push({
    id: "decision",
    label: "最终观察",
    headline: displayDecision.title,
    meta: run.finalDecision?.horizon ? HORIZON_LABEL[run.finalDecision.horizon] ?? run.finalDecision.horizon : "待确认",
    badge: formatPercent(run.finalDecision?.confidence),
    type: "decision",
    x: 88,
    y: 44,
    detail: {
      title: "最终观察",
      subtitle: trace ? `Trace: ${shortId(trace.traceId)}` : undefined,
      body: trace?.conclusion || displayDecision.body,
      rows: [
        { label: "建议", value: displayDecision.title },
        { label: "置信度", value: formatPercent(run.finalDecision?.confidence) },
        { label: "支持摘要", value: sanitizeResearchText(trace?.supportSummary, 360) || "暂无结构化支持摘要" },
        { label: "风险摘要", value: sanitizeResearchText(trace?.riskSummary, 360) || "暂无结构化风险摘要" },
        { label: "复核状态", value: trace?.reviewStatus ?? "pending" },
      ],
      bullets: trace?.openQuestions?.length ? trace.openQuestions : displayDecision.risks,
    },
  });

  const edges: GraphEdge[] = [{ from: "query", to: "evidence-foundation" }];
  if (steps.length) {
    edges.push({ from: "evidence-foundation", to: `trace-${steps[0].stepId}` });
    steps.forEach((step, index) => {
      const next = steps[index + 1];
      edges.push({
        from: `trace-${step.stepId}`,
        to: next ? `trace-${next.stepId}` : "decision",
      });
    });
  } else {
    edges.push({ from: "evidence-foundation", to: "decision" });
  }

  return { nodes, edges };
};

const buildGraph = (run?: AgentRun, reports: AgentReport[] = [], evidence: Evidence[] = []): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  if (run?.decisionTrace?.steps?.length) {
    return buildDecisionTraceGraph(run, reports, evidence);
  }

  const displayDecision = buildDisplayDecision(run?.finalDecision);
  const internalEvidence = evidence.filter((item) => !isExternalEvidence(item));
  const externalEvidence = evidence.filter(isExternalEvidence);
  const marketAgent = findAgentByRole(run, [/market/i, /市场/]);
  const bullAgent = findAgentByRole(run, [/bull/i, /正方/]);
  const bearAgent = findAgentByRole(run, [/bear/i, /反方/]);
  const riskAgent = findAgentByRole(run, [/risk/i, /风险/]);
  const managerAgent = findAgentByRole(run, [/manager/i, /research manager/i, /研究经理/]);
  const latestReport = reports[0];
  const marketReport = findReportByKeywords(reports, [/market/i, /市场/i, /环境/i, /画像/i]);
  const bullReport = findReportByKeywords(reports, [/bull/i, /正方/i, /支持/i, /增配/i]);
  const bearReport = findReportByKeywords(reports, [/bear/i, /反方/i, /约束/i, /风险/i]);
  const riskReport = findReportByKeywords(reports, [/risk/i, /风险复核/i, /失效/i]);
  const managerReport = findReportByKeywords(reports, [/manager/i, /summary/i, /归纳/i, /研究经理/i, /汇总/i]) ?? latestReport;
  const marketPoints = reportPoints(marketReport, 2);
  const bullPoints = reportPoints(bullReport, 1);
  const bearPoints = reportPoints(bearReport, 1);
  const riskPoints = reportPoints(riskReport, 2);
  const reportSummaryPoints = reportPoints(managerReport, 2);
  const sourceBullets = buildSourceBreakdown(evidence);
  const externalBullets = buildSourceBreakdown(externalEvidence);
  const internalBullets = buildSourceBreakdown(internalEvidence);
  const firstRisk = splitCleanBullets(run?.finalDecision?.risks, 1)[0];
  const evidenceHealth = evidenceHealthLabel(evidence);
  const evidenceReliability = averageEvidenceScoreNumber(evidence, "reliabilityScore");
  const internalReliability = averageEvidenceScoreNumber(internalEvidence, "reliabilityScore");
  const externalReliability = averageEvidenceScoreNumber(externalEvidence, "reliabilityScore");
  const decisionTrace = run?.decisionTrace;
  const traceStepSummary = decisionTrace?.steps?.length
    ? decisionTrace.steps.map((step) => `${step.title}(${step.evidenceIds.length}证据)`).join(" -> ")
    : "";

  const nodes: GraphNode[] = [
    {
      id: "query",
      label: "配置问题",
      headline: compactAssetLabel(run?.target),
      meta: "目标：中期是否可配置",
      type: "query",
      x: 4,
      y: 44,
      detail: {
        title: "配置问题",
        subtitle: run?.runId ? `Run: ${run.runId}` : undefined,
        body: run?.target
          ? `本次要回答的是：${run.target}。系统会把这个问题拆成“证据是否够硬、支持点是否成立、风险边界在哪里、最后是否值得配置”。`
          : "当前没有选择投研任务。图谱会把用户问题拆成数据、观点、风险和配置建议四层。",
        rows: [
          { label: "业务目标", value: "判断中期配置价值，而不是生成泛泛市场点评" },
          { label: "输出形态", value: "配置建议 + 置信度 + 风险约束 + 可追溯证据" },
        ],
      },
    },
    {
      id: "internal-evidence",
      label: "内部量化事实",
      headline: internalEvidence.length ? "先用内部数据定基准" : "等待内部数据",
      meta: `${internalEvidence.length} 条 · 可靠度 ${internalReliability || "-"}`,
      badge: `${internalEvidence.length}`,
      type: "source",
      x: 22,
      y: 24,
      detail: {
        title: "内部量化事实",
        subtitle: "估值、行情、宏观、导入研报等结构化证据",
        body: internalEvidence.length
          ? "用内部结构化数据先确定估值、趋势、流动性和宏观位置，避免结论只被新闻或单点观点牵引。"
          : "当前任务未拿到内部结构化证据，结论置信度需要下调。",
        rows: [
          { label: "业务含义", value: internalEvidence.length ? `内部数据可作为主判断底座，平均可靠度 ${internalReliability || "-"}` : "内部数据缺失，结论不能作为强配置依据" },
          { label: "覆盖范围", value: "估值、行情、宏观、政策、基金费率等结构化信息" },
          ...evidenceBusinessRows(internalEvidence, 2),
        ],
        bullets: internalBullets.length ? internalBullets : ["暂无内部数据源明细"],
      },
    },
    {
      id: "external-evidence",
      label: "外部交叉验证",
      headline: externalEvidence.length ? "检查外部信息是否一致" : "无外部补充",
      meta: `${externalEvidence.length} 条 · 可靠度 ${externalReliability || "-"}`,
      badge: `${externalEvidence.length}`,
      type: "source",
      x: 22,
      y: 64,
      detail: {
        title: "外部交叉验证",
        subtitle: "标明外部搜索或网络 API 来源",
        body: externalEvidence.length
          ? "外部信息用于校验内部数据结论是否有盲点，重点看发布时间、来源可靠度和是否能强化或反驳主线。"
          : "本次任务没有使用网络/API 外部信息，结论主要依赖内部数据和报告。",
        rows: [
          { label: "业务含义", value: externalEvidence.length ? `外部证据用于补盲和反证，平均可靠度 ${externalReliability || "-"}` : "缺少外部校验，需降低对单一内部数据结论的依赖" },
          { label: "使用原则", value: "外部信息只做校验，不直接替代内部量化事实" },
          ...evidenceBusinessRows(externalEvidence, 2),
        ],
        bullets: externalBullets.length ? externalBullets : ["未检测到外部 API / 搜索证据"],
      },
    },
    {
      id: "evidence-quality",
      label: "证据可用性",
      headline: evidenceHealth,
      meta: `${evidence.length} 条证据 · 平均可靠度 ${evidenceReliability || "-"}`,
      badge: `${evidenceReliability || "-"}`,
      type: "summary",
      x: 39,
      y: 44,
      detail: {
        title: "证据可用性",
        subtitle: "痛点：结论是否被可靠证据支撑",
        body: "这一层把证据数量、来源分布、质量分和可靠度汇总成业务可读的证据健康状态。外部信息若过期或低可靠，只能作为弱证据。",
        rows: [
          { label: "证据结论", value: `${evidenceHealth}，共 ${evidence.length} 条证据，平均可靠度 ${evidenceReliability || "-"}` },
          { label: "内部/外部结构", value: `内部 ${internalEvidence.length} 条，外部 ${externalEvidence.length} 条` },
          { label: "业务解释", value: evidenceReliability >= 75 ? "证据底座可支撑阶段性配置判断，但仍需看盈利和风险边界。" : "证据质量不足，建议只作为观察或初筛依据。" },
        ],
        bullets: sourceBullets.length ? sourceBullets : ["当前没有证据明细"],
      },
    },
    {
      id: "market-view",
      label: "市场画像",
      headline: "估值/趋势/资金先打底",
      meta: marketAgent ? displayAgentSubtitle(marketAgent, "市场环境分析师") : "市场环境分析师",
      badge: marketAgent?.status === "COMPLETED" ? "完成" : undefined,
      type: "agent",
      x: 53,
      y: 18,
      detail: {
        title: "市场画像",
        subtitle: displayAgentSubtitle(marketAgent, "市场环境分析师"),
        body: marketPoints[0] || "回答趋势、估值、流动性、波动和宏观环境是否支持当前研究对象进入配置候选。",
        rows: [
          { label: "业务判断", value: marketPoints[0] ?? "等待市场画像报告生成" },
          { label: "重点观察", value: marketPoints[1] ?? "先看估值是否有安全边际，再看价格趋势、资金流入和政策信号是否同向。" },
          { label: "执行状态", value: marketAgent ? agentStatusLabel(marketAgent.status) : "-" },
        ],
      },
    },
    {
      id: "debate-view",
      label: "正反观点",
      headline: "支持点 vs 约束点",
      meta: [bullAgent, bearAgent].filter(Boolean).map((agent) => displayAgentName(agent, "观点研究员")).join(" / ") || "正反论证",
      type: "agent",
      x: 53,
      y: 44,
      detail: {
        title: "正反观点",
        subtitle: "正方研究员 / 反方研究员",
        body: "这个节点的价值是把“为什么可以买”和“为什么不能急着买”放在同一屏比较，避免只看单边证据。",
        rows: [
          { label: "支持配置的理由", value: bullPoints[0] ?? "等待正方报告；当前应重点确认估值、资金流、政策和趋势是否形成同向支持。" },
          { label: "反对/约束理由", value: bearPoints[0] ?? "等待反方报告；当前应重点确认盈利修复、拥挤交易、外部证据时效和宏观扰动。" },
          { label: "业务解读", value: bullPoints[0] && bearPoints[0] ? "存在配置理由，但需要用风险条件控制仓位和节奏。" : "正反论证不完整，暂不适合作为强结论。" },
        ],
      },
    },
    {
      id: "risk-view",
      label: "风险边界",
      headline: firstRisk ? compactText(firstRisk, 28) : "找失效条件",
      meta: riskAgent ? displayAgentSubtitle(riskAgent, "风险复核员") : "风险复核员",
      badge: riskAgent?.status === "COMPLETED" ? "完成" : undefined,
      type: "agent",
      x: 53,
      y: 70,
      detail: {
        title: "风险边界",
        subtitle: displayAgentSubtitle(riskAgent, "风险复核员"),
        body: riskPoints[0] || firstRisk || "重点检查最大回撤、波动、流动性、估值过热、宏观扰动和外部证据不可用风险。",
        rows: [
          { label: "核心风险", value: riskPoints[0] ?? firstRisk ?? "等待风险复核输出" },
          { label: "失效观察", value: riskPoints[1] ?? "盈利修复、PMI/政策信号、资金流和波动率若恶化，应降低配置权重或继续观察。" },
          { label: "业务动作", value: "把该节点作为仓位上限、观察条件和止损条件的来源。" },
        ],
      },
    },
    {
      id: "research-summary",
      label: "报告结论",
      headline: latestReport ? compactText(latestReport.title, 26) : "把分歧收敛成判断",
      meta: `${reports.length} 份报告 · ${managerAgent ? displayAgentName(managerAgent, "研究经理") : "研究归纳"}`,
      badge: `${reports.length}`,
      type: "report",
      x: 68,
      y: 44,
      detail: {
        title: "报告结论",
        subtitle: latestReport ? `${formatArtifactTypeLabel(latestReport.artifactType)}：${latestReport.reportId}` : undefined,
        body: reportSummaryPoints[0] || sanitizeResearchText(latestReport?.summary, 620) || "把市场观点、正反方论证和风险复核归纳为可追问的研究摘要。",
        rows: [
          { label: "归纳结论", value: reportSummaryPoints[0] ?? "等待报告归纳" },
          { label: "主要分歧", value: reportSummaryPoints[1] ?? "等待报告沉淀正反分歧；完成前不应把阶段观点当作最终配置结论。" },
          { label: "报告资产", value: `${reports.length} 份报告，最新类型 ${formatArtifactTypeLabel(latestReport?.artifactType)}，时间 ${formatDateTime(latestReport?.createdAt)}` },
        ],
      },
    },
    {
      id: "decision",
      label: "配置建议",
      headline: displayDecision.title,
      meta: run?.finalDecision?.horizon ?? "待确认",
      badge: formatPercent(run?.finalDecision?.confidence),
      type: "decision",
      x: 81,
      y: 44,
      detail: {
        title: "配置建议",
        subtitle: run?.finalDecision?.action ? `${run.finalDecision.action} · ${formatPercent(run.finalDecision.confidence)}` : undefined,
        body: displayDecision.body,
        rows: [
          { label: "建议", value: displayDecision.title },
          { label: "置信度/周期", value: `${formatPercent(run?.finalDecision?.confidence)} · ${run?.finalDecision?.horizon ? HORIZON_LABEL[run.finalDecision.horizon] ?? run.finalDecision.horizon : "-"}` },
          { label: "配置含义", value: run?.finalDecision?.action === "OVERWEIGHT" ? "可提高配置权重，但仍需跟踪风险触发条件。" : run?.finalDecision?.action === "UNDERWEIGHT" ? "不建议增加暴露，优先等待风险缓释。" : "保持观察或中性仓位，等待盈利/政策/资金进一步验证。" },
          { label: "决策链路", value: traceStepSummary || "等待决策链路生成" },
        ],
        bullets: displayDecision.risks,
      },
    },
  ];
  const edges: GraphEdge[] = [
    { from: "query", to: "internal-evidence" },
    { from: "query", to: "external-evidence" },
    { from: "internal-evidence", to: "evidence-quality" },
    { from: "external-evidence", to: "evidence-quality" },
    { from: "evidence-quality", to: "market-view" },
    { from: "evidence-quality", to: "debate-view" },
    { from: "evidence-quality", to: "risk-view" },
    { from: "market-view", to: "research-summary" },
    { from: "debate-view", to: "research-summary" },
    { from: "risk-view", to: "research-summary" },
    { from: "research-summary", to: "decision" },
  ];

  return { nodes, edges };
};

const RunMiniCard = ({
  run,
  selected,
  reportCount,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  reportCount?: number;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full rounded-md border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/50 ${
      selected ? "border-blue-300 bg-blue-50" : "border-border bg-background"
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-semibold text-foreground">{displayRunName(run)}</p>
        <p className="truncate text-xs text-muted-foreground">{run.target}</p>
      </div>
      <Badge variant={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
      <span>{run.agents.length} 角色</span>
      <span>{run.evidenceIds.length} 证据</span>
      <span>{reportCount ?? run.reports.length} 报告</span>
    </div>
  </button>
);

const EvidenceGraph = ({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
}) => {
  const graphRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    setNodePositions(Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }])));
  }, [nodes]);

  const positionedNodes = nodes.map((node) => ({
    ...node,
    ...(nodePositions[node.id] ?? { x: node.x, y: node.y }),
  }));
  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  const startNodeDrag = (event: React.PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    if (event.button !== 0) return;
    const current = nodeById.get(node.id) ?? node;
    dragRef.current = {
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: current.x,
      startY: current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveNodeDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const graph = graphRef.current;
    if (!drag || !graph) return;
    const rect = graph.getBoundingClientRect();
    const dx = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startClientY) / rect.height) * 100;
    if (Math.abs(event.clientX - drag.startClientX) + Math.abs(event.clientY - drag.startClientY) > 4) {
      drag.moved = true;
    }
    setNodePositions((current) => ({
      ...current,
      [drag.id]: {
        x: Math.max(1, Math.min(88, drag.startX + dx)),
        y: Math.max(4, Math.min(88, drag.startY + dy)),
      },
    }));
  };

  const endNodeDrag = (event: React.PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!drag.moved) {
      onNodeClick(node);
    }
  };
  const evidenceNode = nodeById.get("evidence-quality");
  const reportNode = nodeById.get("research-summary");
  const decisionNode = nodeById.get("decision");
  const stages = [
    { label: "1. 问题定义", x: 3, width: 14 },
    { label: "2. 数据校验", x: 18, width: 29 },
    { label: "3. 观点生成", x: 49, width: 17 },
    { label: "4. 报告沉淀", x: 67, width: 13 },
    { label: "5. 配置建议", x: 81, width: 16 },
  ];

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">证据：{evidenceNode?.headline ?? "-"}</span>
        <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">报告：{reportNode?.badge ?? "0"} 份</span>
        <span className="rounded-full bg-slate-900 px-2 py-1 font-medium text-white">建议：{decisionNode?.headline ?? "待确认"} · {decisionNode?.badge ?? "-"}</span>
      </div>
      <div className="h-[28rem] overflow-auto bg-slate-50/40">
    <div ref={graphRef} className="relative h-full min-w-[72rem] bg-[radial-gradient(circle_at_1px_1px,rgb(203_213_225)_1px,transparent_0)] [background-size:20px_20px]">
      {stages.map((stage) => (
        <div
          key={stage.label}
          className="absolute top-3 h-[calc(100%-1.5rem)] rounded-md border border-slate-200/70 bg-white/45"
          style={{ left: `${stage.x}%`, width: `${stage.width}%` }}
        >
          <div className="border-b border-slate-200/70 px-2 py-1 text-[10px] font-semibold text-slate-500">{stage.label}</div>
        </div>
      ))}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker id="graph-arrow-soft" viewBox="0 0 10 10" refX="8.8" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(100 116 139)" />
          </marker>
          <marker id="graph-arrow-strong" viewBox="0 0 10 10" refX="8.8" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(15 23 42)" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          const isDecisionPath = edge.to === "decision" || edge.from === "research-summary";
          const startX = from.x + 12.6;
          const startY = from.y + 6.3;
          const endX = to.x - 1.8;
          const endY = to.y + 6.3;
          const curveOffset = Math.max(5, Math.min(14, Math.abs(endX - startX) * 0.55));
          const arrowColor = isDecisionPath ? "rgb(15 23 42)" : "rgb(100 116 139)";
          return (
            <g key={`${edge.from}-${edge.to}`} opacity={isDecisionPath ? "0.92" : "0.68"}>
              <path
                d={`M ${startX} ${startY} C ${startX + curveOffset} ${startY}, ${endX - curveOffset} ${endY}, ${endX} ${endY}`}
                stroke={arrowColor}
                strokeWidth={isDecisionPath ? "1.35" : "1.1"}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
              <polygon
                points={`${endX - 1.1},${endY - 0.95} ${endX + 0.75},${endY} ${endX - 1.1},${endY + 0.95}`}
                fill={arrowColor}
              />
            </g>
          );
        })}
      </svg>
      {positionedNodes.map((node) => (
        <button
          type="button"
          key={node.id}
          onPointerDown={(event) => startNodeDrag(event, node)}
          onPointerMove={moveNodeDrag}
          onPointerUp={(event) => endNodeDrag(event, node)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onNodeClick(node);
            }
          }}
          className={`absolute w-[8.5rem] cursor-grab touch-none rounded-md border px-2.5 py-2 text-left text-xs shadow-sm transition hover:scale-[1.02] hover:border-blue-400 hover:shadow-md active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-blue-500 ${nodeColor(node.type)}`}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          title={node.detail.title}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] opacity-70">{graphTypeLabel(node.type)}</span>
            {node.badge ? (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${node.type === "decision" ? "bg-white/15 text-white" : "bg-white/80"}`}>
                {node.badge}
              </span>
            ) : null}
          </div>
          <p className="line-clamp-2 font-semibold leading-snug">{node.headline ?? node.label}</p>
          {node.meta ? <p className="mt-1 line-clamp-2 text-[10px] leading-4 opacity-75">{node.meta}</p> : null}
        </button>
      ))}
    </div>
      </div>
    </div>
  );
};

const GraphNodeDetailDialog = ({
  node,
  open,
  onOpenChange,
}: {
  node?: GraphNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{node ? graphTypeLabel(node.type) : "节点"}</Badge>
          {node?.detail.subtitle ? <span className="text-xs text-muted-foreground">{node.detail.subtitle}</span> : null}
        </div>
        <DialogTitle className="leading-6">{node?.detail.title ?? "节点详情"}</DialogTitle>
        <DialogDescription>展示该节点对配置判断的业务含义、核心证据和需要关注的约束。</DialogDescription>
      </DialogHeader>

      {node ? (
        <div className="space-y-4">
          {node.detail.body ? (
            <div className="rounded-md border bg-slate-50 p-4 text-sm leading-6 text-foreground">
              <p className="mb-2 text-xs font-semibold text-slate-500">本节点结论</p>
              {node.detail.body}
            </div>
          ) : null}

          {node.detail.rows?.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {node.detail.rows.map((row) => (
                <div key={`${row.label}-${row.value}`} className="rounded-md border bg-white p-3">
                  <p className="text-xs font-semibold text-slate-500">{row.label}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-foreground">{row.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {node.detail.bullets?.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">
                {node.type === "decision" ? "需要关注的风险" : "关联证据/来源"}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-950">
                {node.detail.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </DialogContent>
  </Dialog>
);

const buildRunDetailUrl = (runId: string): string =>
  createHashUrl(`/agent-lab/runs/${encodeURIComponent(runId)}`);

const runProgressLabel = (run?: AgentRun): string => {
  if (!run) return "-";
  const completed = run.agents.filter((agent) => agent.status === "COMPLETED").length;
  return `${completed}/${run.agents.length}`;
};

const runProgressPercent = (run?: AgentRun): number => {
  if (!run?.agents.length) return 0;
  const completed = run.agents.filter((agent) => agent.status === "COMPLETED").length;
  const running = run.agents.filter((agent) => agent.status === "RUNNING").length;
  return Math.round(((completed + running * 0.5) / run.agents.length) * 100);
};

const agentProgressPalette = (item: AgentExecutionProgress) => {
  if (item.hasFailure || item.status === "FAILED") {
    return {
      start: "#fb7185",
      end: "#ef4444",
      glow: "rgba(239, 68, 68, 0.26)",
      track: "rgb(254 226 226)",
    };
  }
  if (item.progress >= 100 || item.status === "COMPLETED") {
    return {
      start: "#2dd4bf",
      end: "#10b981",
      glow: "rgba(16, 185, 129, 0.24)",
      track: "rgb(204 251 241)",
    };
  }
  if (item.status === "RUNNING" || item.progress > 0) {
    return {
      start: "#22d3ee",
      end: "#6366f1",
      glow: "rgba(34, 211, 238, 0.34)",
      track: "rgb(219 234 254)",
    };
  }
  return {
    start: "#94a3b8",
    end: "#64748b",
    glow: "rgba(100, 116, 139, 0.16)",
    track: "rgb(226 232 240)",
  };
};

const AgentProgressDonut = ({ item }: { item: AgentExecutionProgress }) => {
  const progress = Math.max(0, Math.min(100, Math.round(item.progress)));
  const palette = agentProgressPalette(item);
  const shouldSpin = item.status === "RUNNING" && progress < 100 && !item.hasFailure;
  const progressDegrees = progress * 3.6;

  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center" title={`${progress}%`}>
      <div
        className="absolute inset-0 rounded-full blur-[6px]"
        style={{ background: palette.glow }}
      />
      <div
        className={`absolute inset-0 rounded-full shadow-sm ${shouldSpin ? "animate-spin" : ""}`}
        style={{
          background: `conic-gradient(from 180deg, ${palette.start} 0deg, ${palette.end} ${progressDegrees}deg, ${palette.track} ${progressDegrees}deg 360deg)`,
        }}
      />
      <div className="absolute inset-[5px] rounded-full border border-white/80 bg-background shadow-inner" />
      <span className="relative text-[10px] font-semibold tabular-nums text-slate-900">{progress}%</span>
    </div>
  );
};

const reportForProgressAgent = (item: AgentExecutionProgress, reports: AgentReport[]): AgentReport | undefined => {
  const agentText = `${item.agent.name} ${item.agent.role}`.toLowerCase().replace(/[_-]+/g, " ");
  const candidates = reports.filter((report) => {
    const reportText = `${report.agentId} ${report.agentName} ${report.title} ${report.reportId}`.toLowerCase().replace(/[_-]+/g, " ");
    if (item.agent.agentId && report.agentId === item.agent.agentId) return true;
    if (reportText.includes(item.agent.name.toLowerCase())) return true;
    if (agentText.includes("market")) return reportText.includes("market");
    if (agentText.includes("bull")) return reportText.includes("bull");
    if (agentText.includes("bear")) return reportText.includes("bear");
    if (agentText.includes("research manager")) return reportText.includes("research manager") || reportText.includes("manager summary");
    if (agentText.includes("risk")) return reportText.includes("risk");
    return false;
  });
  return candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
};

const fallbackAgentProgressSummary = (item: AgentExecutionProgress, decision?: AgentDecision): string => {
  const agentText = `${item.agent.name} ${item.agent.role}`.toLowerCase().replace(/[_-]+/g, " ");
  const decisionLabel = decision?.action ? DECISION_ACTION_LABEL[decision.action] ?? decision.action : "暂列观察";
  if (agentText.includes("market")) return "已完成市场环境判断，重点覆盖估值位置、趋势修复、流动性和宏观背景。";
  if (agentText.includes("bull")) return "已完成正方论证，重点寻找支持中期配置的估值、政策、资金和交易条件。";
  if (agentText.includes("bear")) return "已完成反方论证，重点识别盈利验证不足、政策传导滞后和交易拥挤等约束。";
  if (agentText.includes("research manager")) return `已汇总正反观点并收敛分歧，当前组合判断倾向于“${decisionLabel}”。`;
  if (agentText.includes("risk")) {
    const risks = splitCleanBullets(decision?.risks, 1);
    return risks[0] ? `已完成风险复核，核心约束是：${risks[0]}` : "已完成风险复核，重点关注失效条件、下行约束和证据强度。";
  }
  if (agentText.includes("portfolio")) return `已形成最终组合建议，当前判断为“${decisionLabel}”，置信度 ${formatPercent(decision?.confidence)}。`;
  return `${item.currentStep}。`;
};

const agentProgressSummary = (item: AgentExecutionProgress, reports: AgentReport[], decision?: AgentDecision): string => {
  const isActiveOrDone = item.status === "RUNNING" || item.status === "COMPLETED" || item.hasFailure || item.progress >= 100;
  if (!isActiveOrDone) return "";
  const fallbackReport = reportForProgressAgent(item, reports);
  const isPortfolio = `${item.agent.name} ${item.agent.role}`.toLowerCase().includes("portfolio");
  const source = sanitizeResearchText(
    item.latestSummaryMarkdown || fallbackReport?.summary || (isPortfolio ? decision?.thesis : undefined),
    item.status === "RUNNING" ? 260 : 220,
  );
  if (!source || source === item.currentStep) return fallbackAgentProgressSummary(item, decision);
  const firstPoints = splitReadableSentences(source, item.status === "RUNNING" ? 2 : 2, 104);
  return firstPoints.length ? firstPoints.join(" ") : source || fallbackAgentProgressSummary(item, decision);
};

interface AgentConfidenceBreakdown {
  score: number;
  label: string;
  reasons: string[];
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeEvidenceScore = (value?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return clamp01(value <= 1 ? value : value / 100);
};

const runtimePayload = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) return event.payload as Record<string, unknown>;
  return {};
};

const stringArrayField = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const agentEvidenceIds = (item: AgentExecutionProgress, run: AgentRun | undefined, runtimeEvents: AgentRuntimeEvent[], decision?: AgentDecision): string[] => {
  const ids = new Set<string>();
  const agentText = `${item.agent.agentId} ${item.agent.name}`.toLowerCase();
  run?.toolCalls
    .filter((call) => call.agentId === item.agent.agentId)
    .forEach((call) => call.evidenceIds?.forEach((id) => ids.add(id)));
  run?.events.forEach((event) => {
    if ("agentId" in event && event.agentId === item.agent.agentId && "evidenceIds" in event) {
      event.evidenceIds?.forEach((id) => ids.add(id));
    }
  });
  runtimeEvents.forEach((event) => {
    const payload = runtimePayload(event);
    const eventText = `${event.agentId ?? ""} ${event.agentName ?? ""} ${payload.stepId ?? ""} ${payload.sectionHint ?? ""}`.toLowerCase();
    if (event.agentId === item.agent.agentId || eventText.includes(item.agent.name.toLowerCase()) || agentText.includes(String(payload.stepId ?? "").toLowerCase())) {
      stringArrayField(payload.evidenceIds).forEach((id) => ids.add(id));
    }
  });
  const agentRole = `${item.agent.name} ${item.agent.role}`.toLowerCase();
  if ((agentRole.includes("portfolio") || agentRole.includes("research manager") || agentRole.includes("risk")) && !ids.size) {
    decision?.evidenceIds?.forEach((id) => ids.add(id));
  }
  return Array.from(ids);
};

const evidenceForAgent = (
  item: AgentExecutionProgress,
  run: AgentRun | undefined,
  evidence: Evidence[],
  runtimeEvents: AgentRuntimeEvent[],
  decision?: AgentDecision,
): Evidence[] => {
  const ids = agentEvidenceIds(item, run, runtimeEvents, decision);
  if (ids.length) return evidenceByIds(evidence, ids);
  const agentRole = `${item.agent.name} ${item.agent.role}`.toLowerCase();
  if (agentRole.includes("market")) return evidenceThemeItems(evidence, EVIDENCE_THEMES[0]).concat(evidenceThemeItems(evidence, EVIDENCE_THEMES[1])).slice(0, 5);
  if (agentRole.includes("bull") || agentRole.includes("bear")) return topEvidence(evidence, 5);
  if (agentRole.includes("risk")) return evidenceThemeItems(evidence, EVIDENCE_THEMES[4]).concat(topEvidence(evidence, 3)).slice(0, 5);
  return topEvidence(evidence, 5);
};

const calculateAgentConfidence = ({
  item,
  run,
  reports,
  evidence,
  runtimeEvents,
  decision,
}: {
  item: AgentExecutionProgress;
  run?: AgentRun;
  reports: AgentReport[];
  evidence: Evidence[];
  runtimeEvents: AgentRuntimeEvent[];
  decision?: AgentDecision;
}): AgentConfidenceBreakdown => {
  if (item.hasFailure || item.status === "FAILED") return { score: 0, label: "低", reasons: ["执行失败"] };

  const matchedEvidence = evidenceForAgent(item, run, evidence, runtimeEvents, decision);
  const evidenceCountScore = clamp01(matchedEvidence.length / 4);
  const avgReliability = matchedEvidence.length
    ? matchedEvidence.reduce((sum, row) => sum + normalizeEvidenceScore(row.reliabilityScore), 0) / matchedEvidence.length
    : 0;
  const avgQuality = matchedEvidence.length
    ? matchedEvidence.reduce((sum, row) => sum + normalizeEvidenceScore(row.qualityScore), 0) / matchedEvidence.length
    : 0;
  const sourceDiversity = matchedEvidence.length
    ? clamp01((new Set(matchedEvidence.map((row) => `${row.sourceName}:${row.evidenceType}`)).size + (matchedEvidence.some(isExternalEvidence) ? 1 : 0)) / 5)
    : 0;
  const fallbackReport = reportForProgressAgent(item, reports);
  const summary = sanitizeResearchText(item.latestSummaryMarkdown || fallbackReport?.summary, 360);
  const outputMaturity = clamp01((item.reportCount > 0 || fallbackReport ? 0.65 : 0) + (summary.length >= 80 ? 0.25 : summary.length >= 30 ? 0.12 : 0) + (item.progress >= 100 ? 0.1 : 0));
  const execution = clamp01(item.progress / 100);
  const evidenceScore = avgReliability * 0.6 + avgQuality * 0.4;
  const decisionScore =
    typeof decision?.confidence === "number" && Number.isFinite(decision.confidence)
      ? normalizeEvidenceScore(decision.confidence)
      : undefined;
  const agentRole = `${item.agent.name} ${item.agent.role}`.toLowerCase();
  const decisionWeight = agentRole.includes("portfolio") || agentRole.includes("research manager") || agentRole.includes("risk") ? 0.12 : 0.04;
  const rawScore =
    execution * 0.22 +
    evidenceCountScore * 0.18 +
    evidenceScore * 0.26 +
    sourceDiversity * 0.14 +
    outputMaturity * 0.20 +
    (decisionScore ?? 0) * decisionWeight;
  const normalizedScore = rawScore / (1 + decisionWeight);
  const cappedScore = item.status === "RUNNING" && item.progress < 100 ? Math.min(normalizedScore, 0.68) : normalizedScore;
  const score = Math.round(clamp01(cappedScore) * 100);
  const label = score >= 75 ? "高" : score >= 55 ? "中" : score >= 35 ? "偏低" : "低";
  const reasons = [
    `执行${Math.round(execution * 100)}`,
    `证据${matchedEvidence.length}条`,
    `质/信${Math.round(evidenceScore * 100)}`,
    `来源${Math.round(sourceDiversity * 100)}`,
    `产出${Math.round(outputMaturity * 100)}`,
  ];
  return { score, label, reasons };
};

const agentOpinionMeta = (item: AgentExecutionProgress, decision?: AgentDecision) => {
  const agentText = `${item.agent.name} ${item.agent.role}`.toLowerCase().replace(/[_-]+/g, " ");
  if (item.hasFailure) {
    return { label: "异常", classes: "border-red-200 bg-red-50 text-red-700" };
  }
  if (agentText.includes("bull")) {
    return { label: "偏支持", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (agentText.includes("bear") || agentText.includes("risk")) {
    return { label: "偏谨慎", classes: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (agentText.includes("research manager")) {
    return { label: "综合", classes: "border-violet-200 bg-violet-50 text-violet-700" };
  }
  if (agentText.includes("portfolio")) {
    const action = decision?.action;
    if (action === "OVERWEIGHT") return { label: "配置倾向", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    if (action === "UNDERWEIGHT") return { label: "降低暴露", classes: "border-red-200 bg-red-50 text-red-700" };
    if (action === "HOLD" || action === "WATCH") return { label: "维持观察", classes: "border-blue-200 bg-blue-50 text-blue-700" };
    return { label: "最终判断", classes: "border-slate-200 bg-slate-50 text-slate-700" };
  }
  return { label: "中性观察", classes: "border-sky-200 bg-sky-50 text-sky-700" };
};

const AgentProgressSummary = ({
  item,
  run,
  reports,
  evidence,
  runtimeEvents,
  decision,
}: {
  item: AgentExecutionProgress;
  run?: AgentRun;
  reports: AgentReport[];
  evidence: Evidence[];
  runtimeEvents: AgentRuntimeEvent[];
  decision?: AgentDecision;
}) => {
  const summary = agentProgressSummary(item, reports, decision);
  if (!summary) return null;
  const label = item.status === "RUNNING" ? "实时要点" : item.hasFailure ? "异常摘要" : "阶段结论";
  const opinion = agentOpinionMeta(item, decision);
  const confidence = calculateAgentConfidence({ item, run, reports, evidence, runtimeEvents, decision });
  return (
    <div className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium ${opinion.classes}`}>{opinion.label}</span>
        <span
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-slate-600"
          title={`量化框架：${confidence.reasons.join(" / ")}`}
        >
          信任度 {confidence.score}% · {confidence.label}
        </span>
        <span className="text-slate-400">{label}</span>
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-slate-700">{summary}</p>
    </div>
  );
};

const EvidenceChip = ({ item }: { item: Evidence }) => (
  <a
    href={item.url || undefined}
    target={item.url ? "_blank" : undefined}
    rel="noreferrer"
    className="inline-flex max-w-full items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-slate-700 hover:border-blue-300 hover:text-blue-700"
    title={item.title}
  >
    <span className="truncate">{evidenceShortName(item)}</span>
    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 tabular-nums">{formatScore(item.reliabilityScore)}</span>
    {item.url ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
  </a>
);

const DecisionBrief = ({
  decision,
  evidence,
  trace,
}: {
  decision?: AgentDecision;
  evidence: Evidence[];
  trace?: AgentRun["decisionTrace"];
}) => {
  const display = buildDisplayDecision(decision);
  const citedEvidence = evidenceByIds(evidence, decision?.evidenceIds);
  const evidenceToShow = citedEvidence.length ? topEvidence(citedEvidence, 4) : topEvidence(evidence, 4);
  const thesisPoints = splitReadableSentences(decision?.thesis || decision?.summary, 3, 150);
  const risks = splitCleanBullets(decision?.risks, 3);
  const actionLabel = decision?.action ? DECISION_ACTION_LABEL[decision.action] ?? decision.action : display.title;
  const horizonLabel = decision?.horizon ? HORIZON_LABEL[decision.horizon] ?? decision.horizon : "-";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-amber-700">建议</p>
          <p className="mt-1 font-semibold text-amber-950">{actionLabel}</p>
        </div>
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-amber-700">周期</p>
          <p className="mt-1 font-semibold text-amber-950">{horizonLabel}</p>
        </div>
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-amber-700">置信度</p>
          <p className="mt-1 font-semibold text-amber-950">{formatPercent(decision?.confidence)}</p>
        </div>
      </div>

      <div className="rounded-md bg-white/70 px-3 py-2">
        <p className="text-xs font-semibold text-amber-900">结论摘要</p>
        <p className="mt-1 text-sm leading-6 text-amber-950">{thesisPoints[0] ?? display.body}</p>
      </div>

      {thesisPoints.length > 1 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-amber-950">
          {thesisPoints.slice(1).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}

      {risks.length ? (
        <div className="rounded-md border border-amber-200 bg-white/60 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">主要约束</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-950">
            {risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {evidenceToShow.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-amber-900">关键引用证据</p>
          <div className="flex flex-wrap gap-2">
            {evidenceToShow.map((item) => (
              <EvidenceChip key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}

      {trace?.steps?.length ? (
        <div className="rounded-md border border-amber-200 bg-white/60 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">决策链路</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {trace.steps.slice(0, 6).map((step, index) => (
              <div key={`${step.stepId}-${index}`} className="rounded border border-amber-100 bg-white/70 px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-amber-950">{step.title}</span>
                  <span className="text-amber-700">{step.evidenceIds.length} 证据</span>
                </div>
                <p className="mt-1 line-clamp-2 leading-5 text-amber-900">{sanitizeResearchText(step.summary, 120)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const LatestReportPreview = ({
  report,
  decision,
  evidence,
}: {
  report?: AgentReport;
  decision?: AgentDecision;
  evidence: Evidence[];
}) => {
  if (!report) return null;
  const points = splitReportSummary(report.summary, 5);
  const citedEvidence = evidenceByIds(evidence, decision?.evidenceIds);
  const evidenceToShow = citedEvidence.length ? topEvidence(citedEvidence, 5) : topEvidence(evidence, 5);

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4 text-blue-600" />
        最新报告
        <Badge variant="outline" className="bg-white text-[11px]">
          {formatArtifactTypeLabel(report.artifactType)}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-medium">{report.title}</p>
      <div className="mt-3 space-y-2">
        {(points.length ? points : [sanitizeResearchText(report.summary, 220) || "报告摘要暂不可读，请打开任务详情查看原文。"]).map((point, index) => (
          <div key={`${point}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
            {point}
          </div>
        ))}
      </div>
      {evidenceToShow.length ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">报告引用的主要证据</p>
          <div className="flex flex-wrap gap-2">
            {evidenceToShow.map((item) => (
              <EvidenceChip key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const EvidenceBusinessPanel = ({
  evidence,
  decision,
}: {
  evidence: Evidence[];
  decision?: AgentDecision;
}) => {
  const citedEvidence = evidenceByIds(evidence, decision?.evidenceIds);
  const internalEvidence = evidence.filter((item) => !isExternalEvidence(item));
  const externalEvidence = evidence.filter(isExternalEvidence);
  const selectedForThemes = citedEvidence.length ? citedEvidence : evidence;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-md border bg-slate-50 px-3 py-2">
          <p className="text-xs text-muted-foreground">证据总数</p>
          <p className="mt-1 text-lg font-semibold">{evidence.length}</p>
        </div>
        <div className="rounded-md border bg-emerald-50 px-3 py-2 text-emerald-950">
          <p className="text-xs text-emerald-700">内部数据</p>
          <p className="mt-1 text-lg font-semibold">{internalEvidence.length}</p>
        </div>
        <div className="rounded-md border bg-blue-50 px-3 py-2 text-blue-950">
          <p className="text-xs text-blue-700">外部校验</p>
          <p className="mt-1 text-lg font-semibold">{externalEvidence.length}</p>
        </div>
        <div className="rounded-md border bg-amber-50 px-3 py-2 text-amber-950">
          <p className="text-xs text-amber-700">平均可靠度</p>
          <p className="mt-1 text-lg font-semibold">{averageScore(evidence, "reliabilityScore")}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {EVIDENCE_THEMES.map((theme) => {
          const items = topEvidence(evidenceThemeItems(selectedForThemes, theme), 3);
          const Icon = theme.icon;
          return (
            <div key={theme.id} className="rounded-md border bg-white p-3">
              <div className="flex items-start gap-2">
                <div className="rounded-md bg-slate-100 p-2">
                  <Icon className="h-4 w-4 text-slate-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{theme.title}</p>
                    <Badge variant="outline">{items.length}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{theme.description}</p>
                </div>
              </div>
              {items.length ? (
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-md bg-slate-50 px-3 py-2">
                      <p className="line-clamp-1 text-sm font-medium">{evidenceShortName(item)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{evidenceMetaLine(item)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">暂无直接匹配证据。</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ChatRunAttachment = ({
  run,
  runId,
  reports,
  evidence,
  onOpenRun,
  onOpenGraph,
}: {
  run?: AgentRun;
  runId: string;
  reports: AgentReport[];
  evidence: Evidence[];
  onOpenRun: () => void;
  onOpenGraph: () => void;
}) => {
  const runUrl = buildRunDetailUrl(runId);
  const displayReports = run ? reports.length || run.reports.length : reports.length;
  const displayEvidence = run ? evidence.length || run.evidenceIds.length : evidence.length;
  const latest = reports[0] ?? run?.reports?.[0];

  return (
    <div className="mt-3 space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">投研任务 · {shortId(runId)}</p>
          <p className="truncate text-blue-800">{run?.target ?? "任务详情正在同步"}</p>
        </div>
        {run ? <Badge variant={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <span className="rounded bg-white px-2 py-1">角色 {runProgressLabel(run)}</span>
        <span className="rounded bg-white px-2 py-1">证据 {displayEvidence}</span>
        <span className="rounded bg-white px-2 py-1">报告 {displayReports}</span>
        <span className="col-span-2 rounded bg-white px-2 py-1 leading-5 sm:col-span-3">Token {run ? formatTokenUsage(run.metrics) : "-"}</span>
      </div>

      {latest ? (
        <p className="line-clamp-2 text-blue-900">
          最新报告：{latest.title}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 bg-white" onClick={onOpenRun}>
          查看运行流程
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 bg-white" onClick={onOpenGraph}>
          查看证据图谱
        </Button>
        <a href={runUrl} className="truncate text-blue-700 underline underline-offset-2">
          打开任务详情：{runUrl}
        </a>
      </div>
    </div>
  );
};

const WorkspaceHeaderMeta = ({
  snapshot,
  loading,
  error,
}: {
  snapshot?: ResearchWorkspaceSnapshot;
  loading: boolean;
  error?: string | null;
}) => {
  const workspace = snapshot?.workspace;
  const memory = workspace?.memory;
  const lastDecision = memory?.lastDecision;

  return (
    <div className="mt-1.5 flex min-w-0 max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Database className="h-3.5 w-3.5 text-blue-600" />
      <span className="max-w-[12rem] truncate font-medium text-slate-700 sm:max-w-[16rem]">{workspace?.name ?? "投研工作区"}</span>
      <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
        {loading ? "同步中" : workspace ? "已绑定" : "未绑定"}
      </Badge>
      <span className="text-slate-300">/</span>
      <span>结论 {lastDecision?.action ?? "待形成"}</span>
      <span>信任度 {formatPercent(lastDecision?.confidence)}</span>
      <span>待验证 {memory?.openQuestions?.length ?? 0} 项</span>
      {error ? <span className="text-amber-700">{error}</span> : null}
    </div>
  );
};

const ResearchAssistantLabPage = () => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const activePollRef = useRef<string>();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [runtimeEvents, setRuntimeEvents] = useState<AgentRuntimeEvent[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>(SAMPLE_MESSAGES);
  const [draft, setDraft] = useState("");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("evidence");
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphNode>();
  const [taskListOpen, setTaskListOpen] = useState(false);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | "new" | undefined>("new");
  const [inspectorWidth, setInspectorWidth] = useState<number>();
  const [inspectorWidthTouched, setInspectorWidthTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState<ResearchReviewStatus | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<ResearchWorkspaceSnapshot>();
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const openInspectorTab = (tab: InspectorTab) => {
    setHistorySidebarCollapsed(true);
    setInspectorTab(tab);
  };

  const openRunInspector = (runId: string, tab: InspectorTab) => {
    setHistorySidebarCollapsed(true);
    setActiveConversationId(undefined);
    setSelectedRunId(runId);
    setInspectorTab(tab);
  };

  const refreshWorkspaceSnapshot = async (workspaceId?: string) => {
    const id = workspaceId ?? workspaceSnapshot?.workspace.workspaceId;
    if (!id) return undefined;
    const snapshot = await getResearchWorkspaceSnapshotAsync(id);
    setWorkspaceSnapshot(snapshot);
    return snapshot;
  };

  useEffect(() => {
    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    (async () => {
      try {
        const workspace = await ensureResearchWorkspaceAsync({
          strategyId: RESEARCH_ASSISTANT_STRATEGY_ID,
          name: "投研助手动态工作区",
          description: "按用户输入的 ETF、基金、指数或组合问题沉淀 thesis、证据、未解问题和风险约束。",
        });
        let snapshot = await getResearchWorkspaceSnapshotAsync(workspace.workspaceId);
        if (!snapshot.threads.length) {
          await createResearchWorkspaceThreadAsync(workspace.workspaceId, { title: "投研助手会话" });
          snapshot = await getResearchWorkspaceSnapshotAsync(workspace.workspaceId);
        }
        if (!cancelled) setWorkspaceSnapshot(snapshot);
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "投研工作区加载失败");
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewConversation = () => {
    setActiveConversationId("new");
    setMessages(createNewConversationMessages());
    setDraft("");
    setSelectedRunId(NEW_CONVERSATION_RUN_ID);
    setReports([]);
    setEvidence([]);
    setRuntimeEvents([]);
    setSelectedGraphNode(undefined);
    setTaskListOpen(false);
    setInspectorTab("run");
    setHistorySidebarCollapsed(true);
  };

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || inspectorWidthTouched) return;

    const updateDefaultInspectorWidth = () => {
      const rect = workspace.getBoundingClientRect();
      const historyWidth = historySidebarCollapsed ? 0 : 288;
      const gridGaps = historySidebarCollapsed ? 16 : 32;
      const available = rect.width - historyWidth - gridGaps;
      const minPaneWidth = 420;
      const nextWidth = Math.floor(available / 2);
      setInspectorWidth(Math.max(minPaneWidth, Math.min(nextWidth, available - minPaneWidth)));
    };

    updateDefaultInspectorWidth();
    const observer = new ResizeObserver(updateDefaultInspectorWidth);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [historySidebarCollapsed, inspectorWidthTouched]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRuns(true);
    setLoadError(null);
    listAgentRunsAsync({ limit: 20 })
      .then((items) => {
        if (cancelled) return;
        setRuns(items);
        setSelectedRunId((current) => {
          if (current && items.some((item) => item.runId === current)) return current;
          return pickDisplayRun(items)?.runId;
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "加载投研任务失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingRuns(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRun = useMemo(
    () => {
      if (selectedRunId === NEW_CONVERSATION_RUN_ID) return undefined;
      const matched = runs.find((run) => run.runId === selectedRunId);
      if (matched && (!isStubLikeRun(matched) || !runs.some((run) => !isStubLikeRun(run)))) return matched;
      return pickDisplayRun(runs);
    },
    [runs, selectedRunId],
  );
  const selectedReviewStatus = useMemo(
    () => workspaceReviewStatus(workspaceSnapshot, selectedRun?.runId),
    [workspaceSnapshot, selectedRun?.runId],
  );
  const resolveSubmitTaskType = (run?: AgentRun) => {
    if (run?.taskType === "PORTFOLIO_DIAGNOSTIC") return "portfolio_diagnostic";
    if (run?.taskType === "MULTI_ASSET_COMPARISON") return "multi_asset_comparison";
    if (run?.taskType === "EVENT_IMPACT_ANALYSIS") return "event_impact_analysis";
    if (run?.taskType === "REBALANCE_SUGGESTION") return "rebalance_suggestion";
    return "single_asset_analysis";
  };
  const draftTarget = useMemo(
    () =>
      resolveResearchTargetFromText(
        draft,
        selectedRun && !isStubLikeRun(selectedRun) ? selectedRun : undefined,
        resolveSubmitTaskType(selectedRun),
      ),
    [draft, selectedRun],
  );

  const updateSelectedRunReview = async (status: ResearchReviewStatus) => {
    if (!workspaceSnapshot?.workspace.workspaceId || !selectedRun?.runId) return;
    setReviewSubmitting(status);
    try {
      await updateResearchWorkspaceReviewAsync(workspaceSnapshot.workspace.workspaceId, {
        runId: selectedRun.runId,
        status,
        note: REVIEW_STATUS_NOTE[status],
        reviewer: "manual_reviewer",
        threadId: workspaceSnapshot.threads[0]?.threadId,
      });
      await refreshWorkspaceSnapshot(workspaceSnapshot.workspace.workspaceId);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "复核状态更新失败");
    } finally {
      setReviewSubmitting(null);
    }
  };

  useEffect(() => {
    if (!selectedRun?.runId) {
      setReports([]);
      setEvidence([]);
      setRuntimeEvents([]);
      return;
    }

    let cancelled = false;
    setLoadingDetails(true);
    Promise.all([
      getAgentRunReportsAsync(selectedRun.runId).catch(() => selectedRun.reports ?? []),
      getAgentRunEvidenceAsync(selectedRun.runId).catch(() => []),
      getAgentRunRuntimeEventsAsync(selectedRun.runId).catch(() => []),
    ])
      .then(([nextReports, nextEvidence, nextRuntimeEvents]) => {
        if (cancelled) return;
        setReports(nextReports.length ? nextReports : selectedRun.reports ?? []);
        setEvidence(nextEvidence);
        setRuntimeEvents(nextRuntimeEvents);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRun?.runId]);

  const graph = useMemo(() => buildGraph(selectedRun, reports, evidence), [selectedRun, reports, evidence]);
  const agentProgressItems = useMemo(() => {
    if (!selectedRun) return [];
    const runWithCurrentReports = {
      ...selectedRun,
      reports: reports.length ? reports : selectedRun.reports,
    };
    return buildAgentExecutionProgress({ run: runWithCurrentReports, runtimeEvents });
  }, [selectedRun, reports, runtimeEvents]);
  const agentFlowPercent = agentProgressItems.length
    ? Math.round(agentProgressItems.reduce((sum, item) => sum + item.progress, 0) / agentProgressItems.length)
    : runProgressPercent(selectedRun);
  const agentFlowCompletedLabel = agentProgressItems.length
    ? `${agentProgressItems.filter((item) => item.progress >= 100).length}/${agentProgressItems.length}`
    : runProgressLabel(selectedRun);

  const latestReport = reports[0] ?? selectedRun?.reports?.[0];
  const decision = selectedRun?.finalDecision;
  const displayDecision = useMemo(() => buildDisplayDecision(decision), [decision]);

  const startInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const move = (moveEvent: PointerEvent) => {
      const rect = workspace.getBoundingClientRect();
      const historyWidth = historySidebarCollapsed ? 0 : 288;
      const gridGaps = historySidebarCollapsed ? 16 : 32;
      const available = rect.width - historyWidth - gridGaps;
      const minPaneWidth = 420;
      const maxInspectorWidth = Math.max(minPaneWidth, available - minPaneWidth);
      const nextWidth = rect.right - moveEvent.clientX - 16;
      setInspectorWidth(Math.min(Math.max(nextWidth, minPaneWidth), maxInspectorWidth));
    };

    const stop = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setInspectorWidthTouched(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const fetchConversations = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/research-ai/conversations?limit=30");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setConversations(data.conversations ?? []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "加载历史对话失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openConversation = async (conversation: ConversationSummary) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/research-ai/conversations/${conversation.id}/messages?limit=80`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const nextMessages = (data.messages ?? [])
        .filter((item: ConversationMessage) => item.role === "user" || item.role === "assistant")
        .map((item: ConversationMessage, index: number) => ({
          id: `history-${conversation.id}-${item.id ?? index}`,
          role: item.role,
          content: item.content,
        }));

      setMessages(nextMessages.length ? nextMessages : SAMPLE_MESSAGES);
      setActiveConversationId(conversation.id);
      setHistorySidebarCollapsed(true);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "加载对话消息失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  const refreshSubmittedRun = async (runId: string, fallbackRun?: AgentRun) => {
    const [latestRun, nextReports, nextEvidence, nextRuntimeEvents, nextRuns] = await Promise.all([
      getAgentRunByIdAsync(runId).catch(() => fallbackRun),
      getAgentRunReportsAsync(runId).catch(() => fallbackRun?.reports ?? []),
      getAgentRunEvidenceAsync(runId).catch(() => []),
      getAgentRunRuntimeEventsAsync(runId).catch(() => []),
      listAgentRunsAsync({ limit: 8 }).catch(() => []),
    ]);

    const run = latestRun ?? fallbackRun;
    setRuns((current) => mergeRunsById(run ? [run] : [], nextRuns, current).slice(0, 8));
    if (run) setSelectedRunId(run.runId);
    setReports(nextReports.length ? nextReports : run?.reports ?? []);
    setEvidence(nextEvidence);
    setRuntimeEvents(nextRuntimeEvents);
    return run;
  };

  const pollSubmittedRun = (runId: string, assistantMessageId: string) => {
    activePollRef.current = runId;
    void (async () => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 1200 : 2000));
        if (activePollRef.current !== runId) return;

        const latestRun = await refreshSubmittedRun(runId);
        if (!latestRun) continue;

        if (TERMINAL_RUN_STATUSES.has(latestRun.status)) {
          const statusLabel = RUN_STATUS_LABEL[latestRun.status];
          openInspectorTab("graph");
          void refreshWorkspaceSnapshot();
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: `真实投研任务已${statusLabel}。已切换到右侧证据图谱；聊天区只保留任务入口和关键快照，其余细节进任务详情查看。`,
                    runId: latestRun.runId,
                  }
                : message,
            ),
          );
          return;
        }

        if (attempt % 3 === 0) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: `真实投研任务运行中。右侧显示投研流程进度；下方任务卡会同步有限关键指标。`,
                    runId: latestRun.runId,
                  }
                : message,
            ),
          );
        }
      }
    })();
  };

  const submitDraft = async () => {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setActiveConversationId(undefined);
    setHistorySidebarCollapsed(true);
    openInspectorTab("run");
    const run = selectedRun && !isStubLikeRun(selectedRun) ? selectedRun : undefined;
    const resolvedTarget = resolveResearchTargetFromText(trimmed, run, resolveSubmitTaskType(run));
    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-submit-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", content: trimmed },
      {
        id: assistantMessageId,
        role: "assistant",
        content: `已按 ${resolvedTarget.assetLabel} 提交到独立投研任务，正在创建可追踪投研流程。`,
        runId: run?.runId,
      },
    ]);
    setDraft("");
    setSubmitting(true);

    try {
      let submitWorkspace = workspaceSnapshot?.workspace;
      let submitThread = workspaceSnapshot?.threads[0];
      const shouldEnsureTargetWorkspace =
        !submitWorkspace ||
        Boolean(resolvedTarget.assetId && submitWorkspace.primaryAssetId !== resolvedTarget.assetId) ||
        Boolean(resolvedTarget.portfolioId && submitWorkspace.portfolioId !== resolvedTarget.portfolioId);
      if (shouldEnsureTargetWorkspace) {
        const workspace = await ensureResearchWorkspaceAsync({
          assetId: resolvedTarget.assetId,
          portfolioId: resolvedTarget.portfolioId,
          strategyId: RESEARCH_ASSISTANT_STRATEGY_ID,
          name: resolvedTarget.workspaceName,
          description: "投研助手按用户输入标的创建的动态研究工作区。",
        });
        let snapshot = await getResearchWorkspaceSnapshotAsync(workspace.workspaceId);
        if (!snapshot.threads.length) {
          await createResearchWorkspaceThreadAsync(workspace.workspaceId, { title: "投研助手会话" });
          snapshot = await getResearchWorkspaceSnapshotAsync(workspace.workspaceId);
        }
        submitWorkspace = workspace;
        submitThread = snapshot.threads[0];
        setWorkspaceSnapshot(snapshot);
      }

      const submittedRun = await submitResearchAssistantAgentRunAsync({
        assetId: resolvedTarget.assetId,
        portfolioId: resolvedTarget.portfolioId,
        strategyId: RESEARCH_ASSISTANT_STRATEGY_ID,
        taskType: resolvedTarget.taskType,
        researchRunType: resolvedTarget.researchRunType,
        question: resolvedTarget.question,
        horizon: "medium_term",
        riskPreference: "balanced",
        evidenceScope: {
          includeNews: true,
          includeReports: true,
          includeMacro: true,
          includeMarketSnapshot: true,
        },
        runnerConfig: {
          runnerType: "alphatrace_native",
          modelProvider: "qwen",
          modelName: run?.modelName && !run.modelName.toLowerCase().includes("stub") ? run.modelName : "qwen-plus",
          enableStreaming: true,
          extraParams: {
            source: "research_assistant_lab",
            researchTarget: {
              assetId: resolvedTarget.assetId,
              portfolioId: resolvedTarget.portfolioId,
              label: resolvedTarget.assetLabel,
              symbol: resolvedTarget.assetSymbol,
              name: resolvedTarget.assetName,
              source: resolvedTarget.targetSource,
            },
            submitEndpoint: "/api/research-ai/agent-runs/submit",
            workspaceId: submitWorkspace?.workspaceId ?? "auto",
            workspaceThreadId: submitThread?.threadId,
            workspaceThreadTitle: submitThread?.title ?? "投研助手会话",
            workspaceName: submitWorkspace?.name,
          },
        },
      });

      setSelectedRunId(submittedRun.runId);
      setRuns((current) => [submittedRun, ...current.filter((item) => item.runId !== submittedRun.runId)].slice(0, 8));
      openInspectorTab("run");
      setLoadingDetails(true);

      await refreshSubmittedRun(submittedRun.runId, submittedRun);
      void refreshWorkspaceSnapshot(submitWorkspace?.workspaceId);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: `已为 ${resolvedTarget.assetLabel} 创建真实投研任务。右侧正在展示证据准备、正反方、研究经理、风险复核和最终决策进度。`,
                runId: submittedRun.runId,
              }
            : message,
        ),
      );
      pollSubmittedRun(submittedRun.runId, assistantMessageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "独立投研任务提交失败";
      setDraft(trimmed);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: `独立投研任务提交失败：${message}`,
              }
            : item,
        ),
      );
    } finally {
      setSubmitting(false);
      setLoadingDetails(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        ref={workspaceRef}
        className="grid min-h-0 flex-1 gap-4 p-4"
        style={{
          gridTemplateColumns: historySidebarCollapsed
            ? `minmax(0, 1fr) ${inspectorWidth ?? 520}px`
            : `288px minmax(0, 1fr) ${inspectorWidth ?? 520}px`,
        }}
      >
        {!historySidebarCollapsed ? (
          <aside className="flex min-h-0 w-72 flex-col overflow-hidden rounded-lg border bg-slate-50/80 transition-all">
            <div className="flex items-center justify-between border-b bg-white px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5">历史对话</p>
                <p className="text-xs text-muted-foreground">{conversations.length ? `${conversations.length} 个投研会话` : "投研助手会话"}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setHistorySidebarCollapsed(true);
                }}
                title="收起历史对话"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b bg-white p-3">
                <Button
                  variant={activeConversationId === "new" ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 w-full justify-start rounded-md border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100"
                  onClick={startNewConversation}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span className="flex-1 text-left">新对话</span>
                  {activeConversationId === "new" ? <span className="text-[11px] text-blue-600">当前</span> : null}
                </Button>
              </div>

              {historyLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : historyError ? (
                <div className="m-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {historyError}
                </div>
              ) : conversations.length ? (
                <ScrollArea className="min-h-0 flex-1 p-2">
                  <div className="space-y-1.5">
                    {conversations.map((conversation) => {
                      const isActive = activeConversationId === conversation.id;
                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => void openConversation(conversation)}
                          className={`w-full rounded-md border px-3 py-2.5 text-left text-sm transition ${
                            isActive
                              ? "border-blue-200 bg-white shadow-sm ring-1 ring-blue-100"
                              : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-blue-600" : "text-muted-foreground"}`} />
                            <span className="truncate font-medium text-foreground">{conversation.title || "未命名对话"}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                            <span>{conversation.message_count} 条消息</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="truncate">{formatDateTime(conversation.updated_at ?? conversation.created_at)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="m-3 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  暂无历史对话。
                </div>
              )}
            </div>
          </aside>
        ) : null}

        <main className="flex min-h-0 flex-col rounded-lg border bg-background">
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {historySidebarCollapsed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-1 h-8 w-8 p-0"
                    onClick={() => {
                      setHistorySidebarCollapsed(false);
                      if (conversations.length === 0) void fetchConversations();
                    }}
                    title="展开历史对话"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                ) : null}
                <Bot className="h-4 w-4 text-blue-600" />
                <h1 className="text-base font-semibold">投研助手</h1>
                <Badge variant="secondary">Workspace</Badge>
              </div>
              <WorkspaceHeaderMeta snapshot={workspaceSnapshot} loading={workspaceLoading} error={workspaceError} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHistorySidebarCollapsed(true);
                  setTaskListOpen(true);
                }}
              >
                <GitBranch className="mr-2 h-4 w-4" />
                最近任务
              </Button>
              <Button size="sm" onClick={() => openInspectorTab("graph")}>
                <Network className="mr-2 h-4 w-4" />
                图谱
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-4 py-4">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message) => {
                const messageRun = message.runId ? runs.find((item) => item.runId === message.runId) : undefined;
                const isSelectedMessageRun = Boolean(message.runId && selectedRun?.runId === message.runId);
                const messageReports = isSelectedMessageRun ? reports : messageRun?.reports ?? [];
                const messageEvidence = isSelectedMessageRun ? evidence : [];

                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "border bg-muted/40 text-foreground"
                      }`}
                    >
                      <p>{message.content}</p>
                      {message.runId ? (
                        <ChatRunAttachment
                          run={messageRun}
                          runId={message.runId}
                          reports={messageReports}
                          evidence={messageEvidence}
                          onOpenRun={() => {
                            openRunInspector(message.runId, "run");
                          }}
                          onOpenGraph={() => {
                            openRunInspector(message.runId, "graph");
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {selectedRun ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-blue-700" />
                        <p className="font-semibold text-blue-950">投研任务</p>
                        <Badge variant={RUN_STATUS_BADGE[selectedRun.status]}>{RUN_STATUS_LABEL[selectedRun.status]}</Badge>
                      </div>
                      <p className="line-clamp-1 text-sm text-blue-950">{selectedRun.target}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-blue-950">
                      <span className="rounded-md bg-white px-2.5 py-1">角色 {selectedRun.agents.length}</span>
                      <span className="rounded-md bg-white px-2.5 py-1">证据 {evidence.length || selectedRun.evidenceIds.length}</span>
                      <span className="rounded-md bg-white px-2.5 py-1">报告 {reports.length || selectedRun.reports.length}</span>
                      <span className="rounded-md bg-white px-2.5 py-1">置信度 {formatPercent(decision?.confidence)}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openInspectorTab("run")}>
                      查看详情
                    </Button>
                  </div>
                </div>
              ) : null}

              {decision ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-amber-950">
                    <AlertTriangle className="h-4 w-4" />
                    重要结论 · {displayDecision.title}
                  </div>
                  <div className="mt-3">
                    <DecisionBrief decision={decision} evidence={evidence} trace={selectedRun?.decisionTrace} />
                  </div>
                  {selectedRun ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-white/70 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-900">人工复核</p>
                        <p className="text-sm text-amber-950">
                          当前状态：{REVIEW_STATUS_LABEL[selectedReviewStatus]}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(["approved", "needs_revision", "rejected"] as ResearchReviewStatus[]).map((status) => (
                          <Button
                            key={status}
                            type="button"
                            size="sm"
                            variant={selectedReviewStatus === status ? "default" : "outline"}
                            className={selectedReviewStatus === status ? "h-8" : "h-8 bg-white"}
                            disabled={Boolean(reviewSubmitting)}
                            onClick={() => void updateSelectedRunReview(status)}
                          >
                            {reviewSubmitting === status ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            {REVIEW_STATUS_LABEL[status]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="mx-auto max-w-4xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={draftTarget.targetSource === "known_asset" ? "default" : "outline"} className="h-6">
                  {draftTarget.targetSource === "empty" ? "等待标的" : `研究标的：${draftTarget.assetLabel}`}
                </Badge>
                <span>
                  {draftTarget.targetSource === "known_asset"
                    ? "已匹配内部资产，会加载本地数据并叠加外部信息。"
                    : draftTarget.targetSource === "question_text"
                      ? "未匹配内部资产，会把标的写入问题并走外部检索与多 Agent 流程。"
                      : "可输入任意 ETF、基金、指数代码或名称。"}
                </span>
                {RESEARCH_TARGET_EXAMPLES.map((example) => (
                  <Button
                    key={example.label}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    disabled={submitting}
                    onClick={() => setDraft(example.value)}
                  >
                    {example.label}
                  </Button>
                ))}
              </div>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={submitting}
                className="min-h-[4.5rem] resize-none"
                placeholder="输入标的和投研问题，例如：分析 510300.SH 沪深300ETF 是否适合中期配置。"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openInspectorTab("evidence")}>
                    <Search className="mr-2 h-4 w-4" />
                    引用证据
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openInspectorTab("graph")}>
                    <Network className="mr-2 h-4 w-4" />
                    证据图谱
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openInspectorTab("run")}>
                    <Play className="mr-2 h-4 w-4" />
                    运行状态
                  </Button>
                </div>
                <Button size="sm" onClick={() => void submitDraft()} disabled={submitting || !draft.trim()}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {submitting ? "提交中" : "发送"}
                </Button>
              </div>
            </div>
          </div>
        </main>

        <aside className="relative flex min-h-0 flex-col rounded-lg border bg-background">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整右侧检查器宽度"
            title="拖动调整右侧检查器宽度"
            className="absolute -left-3 top-0 z-10 h-full w-3 cursor-col-resize"
            onPointerDown={startInspectorResize}
          >
            <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-blue-400" />
          </div>
          <Tabs value={inspectorTab} onValueChange={(value) => openInspectorTab(value as InspectorTab)} className="min-h-0">
            <TabsContent value="run" className="min-h-0 flex-1">
              <ScrollArea className="h-[calc(100vh-10.5rem)] p-4">
                {selectedRun ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">投研流程</p>
                          <p className="text-xs text-muted-foreground">
                            进度 {agentFlowPercent}% · 已完成 {agentFlowCompletedLabel}
                          </p>
                        </div>
                        <Badge variant={RUN_STATUS_BADGE[selectedRun.status]}>{RUN_STATUS_LABEL[selectedRun.status]}</Badge>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(agentFlowPercent, selectedRun.status === "QUEUED" ? 2 : 8)}%` }} />
                      </div>
                      {agentProgressItems.map((item) => (
                        <div key={item.agent.agentId} className="rounded-md border px-3 py-2 text-sm">
                          <div className="grid grid-cols-[auto,minmax(8.5rem,11rem),minmax(0,1fr),auto] items-center gap-2.5">
                            <AgentProgressDonut item={item} />
                            <div className="min-w-0">
                              <p className="truncate font-medium leading-5">{displayAgentName(item.agent, item.agent.name)}</p>
                              <p className="truncate text-xs leading-4 text-muted-foreground">{formatStepLabel(item.currentStep)}</p>
                              <p className="truncate text-[11px] leading-4 text-muted-foreground">{formatRoleLabel(item.agent.role)}</p>
                            </div>
                            <AgentProgressSummary
                              item={item}
                              run={selectedRun}
                              reports={reports}
                              evidence={evidence}
                              runtimeEvents={runtimeEvents}
                              decision={decision}
                            />
                            <Badge
                              className="justify-self-end"
                              variant={item.status === "FAILED" ? "destructive" : item.status === "RUNNING" ? "secondary" : item.status === "COMPLETED" ? "default" : "outline"}
                            >
                              {agentStatusLabel(item.status)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{displayRunName(selectedRun)}</CardTitle>
                        <CardDescription>{selectedRun.target}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">状态</span>
                          <Badge variant={RUN_STATUS_BADGE[selectedRun.status]}>{RUN_STATUS_LABEL[selectedRun.status]}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">启动时间</span>
                          <span>{formatDateTime(selectedRun.startedAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">模型</span>
                          <span>{selectedRun.modelName ?? "-"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">耗时</span>
                          <span>{selectedRun.metrics.durationSeconds}s</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Token 消耗</span>
                          <span className="text-right">{formatTokenUsage(selectedRun.metrics)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">任务详情</span>
                          <a href={buildRunDetailUrl(selectedRun.runId)} className="truncate text-right text-blue-600 underline underline-offset-2">
                            {buildRunDetailUrl(selectedRun.runId)}
                          </a>
                        </div>
                      </CardContent>
                    </Card>

                    <LatestReportPreview report={latestReport} decision={decision} evidence={evidence} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无可展示的投研任务。</p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="evidence" className="min-h-0 flex-1">
              <ScrollArea className="h-[calc(100vh-10.5rem)] p-4">
                <div className="space-y-3">
                  {loadingDetails ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : evidence.length ? (
                    <>
                      <EvidenceBusinessPanel evidence={evidence} decision={decision} />
                      <div className="space-y-3">
                        {evidence.map((item) => (
                          <div key={item.id} className="rounded-md border bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{evidenceMetaLine(item)}</p>
                              </div>
                              <Badge variant="outline">{formatScore(item.reliabilityScore)}</Badge>
                            </div>
                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{sanitizeResearchText(item.summary, 240) || item.summary}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary">{formatEvidenceTypeLabel(item.evidenceType)}</Badge>
                              <Badge variant="outline">{formatSourceTypeLabel(item.sourceType)}</Badge>
                              {item.sourceApiName ? <Badge variant="outline">API {item.sourceApiName}</Badge> : null}
                              {item.snapshotId ? <Badge variant="outline">Snapshot {compactText(item.snapshotId, 18)}</Badge> : null}
                              {item.url ? (
                                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 underline underline-offset-2">
                                  来源链接
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      当前投研任务没有返回证据详情；正式链路需要把任务证据 ID 与证据中心实体打通。
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="graph" className="min-h-0 flex-1">
              <ScrollArea className="h-[calc(100vh-10.5rem)] p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold">业务链路视图</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      先看配置结论如何从数据、证据、观点和风险一步步收敛，再向下查看证据主题明细。
                    </p>
                  </div>
                  <EvidenceGraph
                    nodes={graph.nodes}
                    edges={graph.edges}
                    onNodeClick={(node) => setSelectedGraphNode(node)}
                  />
                  {selectedRun ? (
                    <div className="space-y-3 pt-1">
                      <div>
                        <p className="text-sm font-semibold">证据主题明细</p>
                        <p className="mt-1 text-xs text-muted-foreground">用于解释上方链路中的内部数据、外部校验和风险约束来自哪里。</p>
                      </div>
                      <EvidenceBusinessPanel evidence={evidence} decision={selectedRun.finalDecision} />
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <Dialog open={taskListOpen} onOpenChange={setTaskListOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-blue-600" />
              <DialogTitle>最近投研任务</DialogTitle>
            </div>
            <DialogDescription>任务历史默认收起，需要回溯时再打开。</DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">当前上下文：</span>
            数据源 AlphaTrace Domain Seed Store，外部补充 Bocha Search，任务模式中期配置研究。
          </div>

          {loadingRuns ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : loadError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {loadError}
            </div>
          ) : (
            <ScrollArea className="max-h-[28rem] pr-3">
              <div className="space-y-2">
                {runs.map((run) => (
                  <RunMiniCard
                    key={run.runId}
                    run={run}
                    selected={selectedRun?.runId === run.runId}
                    reportCount={selectedRun?.runId === run.runId ? reports.length || run.reports.length : undefined}
                    onSelect={() => {
                      openRunInspector(run.runId, "run");
                      setTaskListOpen(false);
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      <GraphNodeDetailDialog
        node={selectedGraphNode}
        open={Boolean(selectedGraphNode)}
        onOpenChange={(open) => {
          if (!open) setSelectedGraphNode(undefined);
        }}
      />
    </div>
  );
};

export default ResearchAssistantLabPage;
