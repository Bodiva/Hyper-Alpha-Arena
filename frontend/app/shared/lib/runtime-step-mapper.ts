import type { AgentDecision, AgentReport, AgentRunStatus } from "@/entities/agent/model";
import type { AgentRuntimeEvent, AgentRuntimeTimelineItem } from "@/entities/agent/runtime-events";

export type AgentRunStepId =
  | "evidence_retrieval"
  | "market_view"
  | "bull_view"
  | "bear_view"
  | "research_manager"
  | "risk_review"
  | "final_decision";

export type AgentRunStepStatus = "pending" | "running" | "completed" | "failed";

export interface AgentRunProgressStep {
  stepId: AgentRunStepId;
  label: string;
  status: AgentRunStepStatus;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  liveOutput?: string;
}

export interface AgentRunProgressSummary {
  steps: AgentRunProgressStep[];
  completedCount: number;
  totalSteps: number;
  percent: number;
  currentStep: string;
  lastCompletedStep: string;
  latestEvent: AgentRuntimeTimelineItem | null;
  latestEventText: string;
  hasFailed: boolean;
  failureMessage?: string;
  recentEvents: AgentRuntimeTimelineItem[];
}

const STEP_DEFINITIONS: Array<Pick<AgentRunProgressStep, "stepId" | "label">> = [
  { stepId: "evidence_retrieval", label: "证据检索" },
  { stepId: "market_view", label: "市场观点" },
  { stepId: "bull_view", label: "正方观点" },
  { stepId: "bear_view", label: "反方观点" },
  { stepId: "research_manager", label: "研究汇总" },
  { stepId: "risk_review", label: "风险复核" },
  { stepId: "final_decision", label: "最终决策" },
];

const normalize = (value: unknown): string => String(value ?? "").toLowerCase();

const payloadRecord = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) {
    return event.payload as Record<string, unknown>;
  }
  return {};
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const payloadProgress = (event: AgentRuntimeEvent): number | undefined => {
  const payload = payloadRecord(event);
  const value = payload.progress;
  if (typeof value === "number" && Number.isFinite(value)) return clampPercent(value <= 1 ? value * 100 : value);
  return undefined;
};

const payloadText = (event: AgentRuntimeEvent): string => {
  const payload = payloadRecord(event);
  return [
    payload.toolName,
    payload.title,
    payload.summary,
    payload.content,
    payload.error,
    Array.isArray(payload.evidenceIds) ? payload.evidenceIds.join(" ") : undefined,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ");
};

const eventText = (event: AgentRuntimeEvent): string =>
  normalize(`${event.type} ${event.agentName ?? ""} ${payloadText(event)}`);

const markStarted = (step: AgentRunProgressStep, event: AgentRuntimeEvent, summary?: string): void => {
  if (step.status === "pending") {
    step.status = "running";
  }
  step.startedAt = step.startedAt ?? event.timestamp;
  step.summary = summary ?? step.summary;
  step.progress = Math.max(step.progress ?? 0, payloadProgress(event) ?? 15);
};

const markCompleted = (step: AgentRunProgressStep, event?: AgentRuntimeEvent, summary?: string): void => {
  step.status = "completed";
  step.startedAt = step.startedAt ?? event?.timestamp;
  step.completedAt = step.completedAt ?? event?.timestamp;
  step.summary = summary ?? step.summary;
  step.progress = 100;
};

const markReportFallback = (stepsById: Map<AgentRunStepId, AgentRunProgressStep>, reports: AgentReport[]): void => {
  reports.forEach((report) => {
    const text = normalize(`${report.title} ${report.summary}`);
    const target = text.includes("market view")
      ? "market_view"
      : text.includes("bull view")
        ? "bull_view"
        : text.includes("bear view")
          ? "bear_view"
          : text.includes("research manager") || text.includes("research synthesis")
            ? "research_manager"
            : text.includes("risk review")
              ? "risk_review"
              : undefined;

    if (target) {
      const step = stepsById.get(target);
      if (step && step.status !== "completed") {
        markCompleted(step, undefined, report.title);
        step.completedAt = step.completedAt ?? report.createdAt;
      }
    }
  });
};


const inferStepIdFromContent = (content: string): AgentRunStepId | undefined => {
  const text = normalize(content);
  if (text.includes("market view") || content.includes("市场")) return "market_view";
  if (text.includes("bull view") || content.includes("正方")) return "bull_view";
  if (text.includes("bear view") || content.includes("反方")) return "bear_view";
  if (text.includes("research manager") || text.includes("research synthesis") || content.includes("研究经理")) return "research_manager";
  if (text.includes("risk review") || content.includes("风险")) return "risk_review";
  if (text.includes("final decision") || content.includes("最终") || content.includes("建议")) return "final_decision";
  return undefined;
};

const stepIdFromEvent = (event: AgentRuntimeEvent): AgentRunStepId | undefined => {
  const payload = payloadRecord(event);
  const stepId = payload.stepId;
  if (typeof stepId === "string" && STEP_DEFINITIONS.some((step) => step.stepId === stepId)) return stepId as AgentRunStepId;
  const sectionHint = payload.sectionHint;
  if (typeof sectionHint === "string" && STEP_DEFINITIONS.some((step) => step.stepId === sectionHint)) return sectionHint as AgentRunStepId;
  return inferStepIdFromContent(`${event.agentName ?? ""} ${payloadText(event)}`);
};

const buildLiveOutputsByStep = (events: AgentRuntimeEvent[]): Map<AgentRunStepId, string> => {
  const outputs = new Map<AgentRunStepId, string>();
  [...events].sort((a, b) => a.sequence - b.sequence).forEach((event) => {
    if (event.type !== "reasoning.chunk") return;
    const payload = payloadRecord(event);
    if (typeof payload.content !== "string") return;
    const stepId = stepIdFromEvent(event);
    if (!stepId) return;
    outputs.set(stepId, `${outputs.get(stepId) ?? ""}${payload.content}`);
  });
  return outputs;
};

const isStreamingChunkEvent = (event: AgentRuntimeEvent): boolean => {
  if (event.type !== "reasoning.chunk" && event.type !== "debate.message") return false;
  const payload = payloadRecord(event);
  return typeof payload.content === "string" && payload.content.trim().length > 0;
};

const buildTimelineFromEvents = (events: AgentRuntimeEvent[]): AgentRuntimeTimelineItem[] => {
  const items: AgentRuntimeTimelineItem[] = [];
  const streamingGroups = new Map<
    string,
    {
      event: AgentRuntimeEvent;
      count: number;
      contentLength: number;
      tail: string;
    }
  >();
  const metricGroups = new Map<
    string,
    {
      event: AgentRuntimeEvent;
      count: number;
    }
  >();

  [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((event) => {
      if (isStreamingChunkEvent(event)) {
        const payload = payloadRecord(event);
        const stepId = stepIdFromEvent(event) ?? "unknown";
        const key = `${stepId}:${event.agentName ?? "System"}:${event.type}`;
        const content = String(payload.content ?? "");
        const current = streamingGroups.get(key);
        if (current) {
          current.event = event;
          current.count += 1;
          current.contentLength += content.length;
          current.tail = `${current.tail}${content}`.slice(-260);
        } else {
          streamingGroups.set(key, {
            event,
            count: 1,
            contentLength: content.length,
            tail: content.slice(-260),
          });
        }
        return;
      }

      if (event.type === "metric.updated") {
        const stepId = stepIdFromEvent(event) ?? "unknown";
        const key = `${stepId}:${event.agentName ?? "System"}`;
        const current = metricGroups.get(key);
        if (current) {
          current.event = event;
          current.count += 1;
        } else {
          metricGroups.set(key, { event, count: 1 });
        }
      }
    });

  [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((event) => {
      if (isStreamingChunkEvent(event)) return;
      if (event.type === "metric.updated") return;
      const payload = payloadRecord(event);
      const summary =
        typeof payload.summary === "string"
          ? payload.summary
          : typeof payload.content === "string"
            ? payload.content
            : typeof payload.title === "string"
              ? payload.title
              : typeof payload.error === "string"
                ? payload.error
                : event.type;

      items.push({
        eventId: event.eventId,
        type: event.type,
        timestamp: event.timestamp,
        agentName: event.agentName,
        summary,
      });
    });

  streamingGroups.forEach((group, key) => {
    const stepId = stepIdFromEvent(group.event);
    const stepLabel = stepId ? STEP_DEFINITIONS.find((step) => step.stepId === stepId)?.label : undefined;
    const compactTail = group.tail.replace(/\s+/g, " ").trim();
    items.push({
      eventId: `stream-${key}`,
      type: "live.output",
      timestamp: group.event.timestamp,
      agentName: group.event.agentName,
      summary: `${stepLabel ? `${stepLabel}：` : ""}已接收 ${group.count} 段实时输出，共 ${group.contentLength} 字符。${compactTail ? ` 最新内容：${compactTail}` : ""}`,
    });
  });

  metricGroups.forEach((group, key) => {
    const stepId = stepIdFromEvent(group.event);
    const stepLabel = stepId ? STEP_DEFINITIONS.find((step) => step.stepId === stepId)?.label : undefined;
    items.push({
      eventId: `metrics-${key}`,
      type: "metric.updated.summary",
      timestamp: group.event.timestamp,
      agentName: group.event.agentName,
      summary: `${stepLabel ? `${stepLabel}：` : ""}已汇总 ${group.count} 次运行指标更新。`,
    });
  });

  return items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-120);
};

const buildTimelineFromSnapshot = (timeline: AgentRuntimeTimelineItem[] | undefined): AgentRuntimeTimelineItem[] =>
  (timeline ?? []).filter((event) => event.type !== "reasoning.chunk" && event.type !== "debate.message");

const buildTimelineFromLegacyEvents = (events: AgentRuntimeEvent[]): AgentRuntimeTimelineItem[] =>
  events.map((event) => {
    const payload = payloadRecord(event);
    const summary =
      typeof payload.summary === "string"
        ? payload.summary
        : typeof payload.content === "string"
          ? payload.content
          : typeof payload.title === "string"
            ? payload.title
            : typeof payload.error === "string"
              ? payload.error
              : event.type;

    return {
      eventId: event.eventId,
      type: event.type,
      timestamp: event.timestamp,
      agentName: event.agentName,
      summary,
    };
  });

export const buildAgentRunProgress = ({
  events,
  timeline,
  reports,
  decision,
  runStatus,
}: {
  events: AgentRuntimeEvent[];
  timeline?: AgentRuntimeTimelineItem[];
  reports: AgentReport[];
  decision?: AgentDecision;
  runStatus?: AgentRunStatus;
}): AgentRunProgressSummary => {
  const steps = STEP_DEFINITIONS.map((step) => ({ ...step, status: "pending" as AgentRunStepStatus }));
  const stepsById = new Map<AgentRunStepId, AgentRunProgressStep>(steps.map((step) => [step.stepId, step]));
  const sortedEvents = [...events].sort((a, b) => a.sequence - b.sequence);
  const liveOutputsByStep = buildLiveOutputsByStep(sortedEvents);
  let failureMessage: string | undefined;

  sortedEvents.forEach((event) => {
    const text = eventText(event);
    const payload = payloadRecord(event);

    if (event.type === "agent.run.failed" || event.type === "agent.failed") {
      failureMessage = typeof payload.error === "string" ? payload.error : payloadText(event) || "Agent Run 失败。";
      const runningStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending");
      if (runningStep) {
        runningStep.status = "failed";
        runningStep.summary = failureMessage;
      }
      return;
    }

    const evidenceStep = stepsById.get("evidence_retrieval");
    if (evidenceStep && (text.includes("evidence.retrieve") || event.type === "evidence.linked")) {
      markStarted(evidenceStep, event, "正在检索证据");
      if (event.type === "tool.result" || event.type === "evidence.linked") {
        markCompleted(evidenceStep, event, "证据已关联");
      }
    }

    const marketStep = stepsById.get("market_view");
    if (marketStep && (text.includes("market view") || text.includes("market analyst"))) {
      markStarted(marketStep, event, "正在生成市场观点");
      if (event.type === "report.generated") markCompleted(marketStep, event, "市场观点已生成");
    }

    const bullStep = stepsById.get("bull_view");
    if (bullStep && (text.includes("bull view") || text.includes("bull researcher") || text.includes("stance bull"))) {
      markStarted(bullStep, event, "正在生成正方观点");
      if (event.type === "report.generated" || event.type === "debate.message") markCompleted(bullStep, event, "正方观点已生成");
    }

    const bearStep = stepsById.get("bear_view");
    if (bearStep && (text.includes("bear view") || text.includes("bear researcher") || text.includes("stance bear"))) {
      markStarted(bearStep, event, "正在生成反方观点");
      if (event.type === "report.generated" || event.type === "debate.message") markCompleted(bearStep, event, "反方观点已生成");
    }

    const researchManagerStep = stepsById.get("research_manager");
    if (researchManagerStep && (text.includes("research manager") || text.includes("research synthesis"))) {
      markStarted(researchManagerStep, event, "正在汇总研究观点");
      if (event.type === "report.generated" || event.type === "agent.completed") {
        markCompleted(researchManagerStep, event, "研究汇总已生成");
      }
    }

    const riskStep = stepsById.get("risk_review");
    if (riskStep && (text.includes("risk review") || text.includes("risk analyst") || event.type === "risk.warning")) {
      markStarted(riskStep, event, "正在复核风险");
      if (event.type === "report.generated" || event.type === "risk.warning") markCompleted(riskStep, event, "风险复核已生成");
    }

    const decisionStep = stepsById.get("final_decision");
    if (decisionStep && (text.includes("final decision") || text.includes("portfolio manager") || event.type === "decision.updated")) {
      markStarted(decisionStep, event, "正在形成最终决策");
      if (event.type === "decision.updated" || event.type === "agent.run.completed") {
        markCompleted(decisionStep, event, "最终决策已更新");
      }
    }

    if (event.type === "agent.run.completed") {
      steps.forEach((step) => {
        if (step.status !== "completed") markCompleted(step, event, step.summary);
      });
    }
  });

  steps.forEach((step) => {
    const liveOutput = liveOutputsByStep.get(step.stepId);
    if (liveOutput?.trim()) {
      step.liveOutput = liveOutput;
      if (step.status === "pending") {
        step.status = "running";
        step.summary = `正在输出${step.label}`;
        step.progress = Math.max(step.progress ?? 0, 25);
      }
    }
  });

  markReportFallback(stepsById, reports);

  if (decision) {
    const decisionStep = stepsById.get("final_decision");
    if (decisionStep && decisionStep.status !== "completed") {
      markCompleted(decisionStep, undefined, decision.summary ?? "最终决策可用");
    }
  }

  if (runStatus === "COMPLETED" && decision) {
    steps.forEach((step) => {
      if (step.status !== "completed") markCompleted(step, undefined, step.summary ?? "已完成");
    });
  }

  if (runStatus === "FAILED") {
    const runningStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending");
    if (runningStep) {
      runningStep.status = "failed";
      runningStep.summary = failureMessage ?? runningStep.summary ?? "Agent Run 失败。";
    }
    failureMessage = failureMessage ?? "Agent Run 失败。";
  }

  if (runStatus === "RUNNING" && !steps.some((step) => step.status === "running" || step.status === "failed")) {
    const nextStep = steps.find((step) => step.status === "pending");
    if (nextStep) {
      nextStep.status = "running";
      nextStep.progress = Math.max(nextStep.progress ?? 0, 10);
    }
  }

  const completedCount = steps.filter((step) => step.status === "completed").length;
  const totalSteps = steps.length;
  const progressTotal = steps.reduce((sum, step) => {
    if (step.status === "completed") return sum + 100;
    if (step.status === "failed") return sum + (step.progress ?? 100);
    if (step.status === "running") return sum + Math.max(step.progress ?? 10, 10);
    return sum;
  }, 0);
  const percent = totalSteps > 0 ? Math.round(progressTotal / totalSteps) : 0;
  const hasFailed = steps.some((step) => step.status === "failed") || runStatus === "FAILED";
  const latestTimeline = sortedEvents.length ? buildTimelineFromEvents(sortedEvents) : buildTimelineFromSnapshot(timeline);
  const recentEvents = latestTimeline.slice(-20).reverse();
  const latestEvent = recentEvents[0] ?? null;
  const runningStep = steps.find((step) => step.status === "running");
  const failedStep = steps.find((step) => step.status === "failed");
  const pendingStep = steps.find((step) => step.status === "pending");
  const lastCompleted = [...steps].reverse().find((step) => step.status === "completed");

  return {
    steps,
    completedCount,
    totalSteps,
    percent: hasFailed ? Math.min(percent, 99) : percent,
    currentStep: failedStep?.label ?? runningStep?.label ?? pendingStep?.label ?? "已完成",
    lastCompletedStep: lastCompleted?.label ?? "-",
    latestEvent,
    latestEventText: latestEvent?.summary ?? "暂无运行事件",
    hasFailed,
    failureMessage,
    recentEvents,
  };
};

