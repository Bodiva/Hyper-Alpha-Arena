import type { AgentDecision, AgentReport, AgentRunStatus } from "@/entities/agent/model";
import type { AgentRuntimeEvent, AgentRuntimeTimelineItem } from "@/entities/agent/runtime-events";

export type AgentRunStepId =
  | "evidence_retrieval"
  | "market_view"
  | "bull_view"
  | "bear_view"
  | "risk_review"
  | "final_decision";

export type AgentRunStepStatus = "pending" | "running" | "completed" | "failed";

export interface AgentRunProgressStep {
  stepId: AgentRunStepId;
  label: string;
  status: AgentRunStepStatus;
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
  { stepId: "evidence_retrieval", label: "Evidence Retrieval" },
  { stepId: "market_view", label: "Market View" },
  { stepId: "bull_view", label: "Bull View" },
  { stepId: "bear_view", label: "Bear View" },
  { stepId: "risk_review", label: "Risk Review" },
  { stepId: "final_decision", label: "Final Decision" },
];

const normalize = (value: unknown): string => String(value ?? "").toLowerCase();

const payloadRecord = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) {
    return event.payload as Record<string, unknown>;
  }
  return {};
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
};

const markCompleted = (step: AgentRunProgressStep, event?: AgentRuntimeEvent, summary?: string): void => {
  step.status = "completed";
  step.startedAt = step.startedAt ?? event?.timestamp;
  step.completedAt = step.completedAt ?? event?.timestamp;
  step.summary = summary ?? step.summary;
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
    if (payload.streaming !== true || typeof payload.content !== "string") return;
    const stepId = stepIdFromEvent(event);
    if (!stepId) return;
    outputs.set(stepId, `${outputs.get(stepId) ?? ""}${payload.content}`);
  });
  return outputs;
};
const buildTimelineFromEvents = (events: AgentRuntimeEvent[]): AgentRuntimeTimelineItem[] =>
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
      failureMessage = typeof payload.error === "string" ? payload.error : payloadText(event) || "Agent run failed.";
      const runningStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending");
      if (runningStep) {
        runningStep.status = "failed";
        runningStep.summary = failureMessage;
      }
      return;
    }

    const evidenceStep = stepsById.get("evidence_retrieval");
    if (evidenceStep && (text.includes("evidence.retrieve") || event.type === "evidence.linked")) {
      markStarted(evidenceStep, event, "Evidence retrieval in progress");
      if (event.type === "tool.result" || event.type === "evidence.linked") {
        markCompleted(evidenceStep, event, "Evidence linked");
      }
    }

    const marketStep = stepsById.get("market_view");
    if (marketStep && (text.includes("market view") || text.includes("market analyst"))) {
      markStarted(marketStep, event, "Market view in progress");
      if (event.type === "report.generated") markCompleted(marketStep, event, "Market View generated");
    }

    const bullStep = stepsById.get("bull_view");
    if (bullStep && (text.includes("bull view") || text.includes("bull researcher") || text.includes("stance bull"))) {
      markStarted(bullStep, event, "Bull view in progress");
      if (event.type === "report.generated" || event.type === "debate.message") markCompleted(bullStep, event, "Bull View generated");
    }

    const bearStep = stepsById.get("bear_view");
    if (bearStep && (text.includes("bear view") || text.includes("bear researcher") || text.includes("stance bear"))) {
      markStarted(bearStep, event, "Bear view in progress");
      if (event.type === "report.generated" || event.type === "debate.message") markCompleted(bearStep, event, "Bear View generated");
    }

    const riskStep = stepsById.get("risk_review");
    if (riskStep && (text.includes("risk review") || text.includes("risk analyst") || event.type === "risk.warning")) {
      markStarted(riskStep, event, "Risk review in progress");
      if (event.type === "report.generated" || event.type === "risk.warning") markCompleted(riskStep, event, "Risk Review generated");
    }

    const decisionStep = stepsById.get("final_decision");
    if (decisionStep && (text.includes("final decision") || text.includes("portfolio manager") || event.type === "decision.updated")) {
      markStarted(decisionStep, event, "Final decision in progress");
      if (event.type === "decision.updated" || event.type === "agent.run.completed") {
        markCompleted(decisionStep, event, "Final decision updated");
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
        step.summary = `Streaming ${step.label}`;
      }
    }
  });

  markReportFallback(stepsById, reports);

  if (decision) {
    const decisionStep = stepsById.get("final_decision");
    if (decisionStep && decisionStep.status !== "completed") {
      markCompleted(decisionStep, undefined, decision.summary ?? "Final decision available");
    }
  }

  if (runStatus === "COMPLETED" && decision) {
    steps.forEach((step) => {
      if (step.status !== "completed") markCompleted(step, undefined, step.summary ?? "Completed");
    });
  }

  if (runStatus === "FAILED") {
    const runningStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending");
    if (runningStep) {
      runningStep.status = "failed";
      runningStep.summary = failureMessage ?? runningStep.summary ?? "Agent run failed.";
    }
    failureMessage = failureMessage ?? "Agent run failed.";
  }

  if (runStatus === "RUNNING" && !steps.some((step) => step.status === "running" || step.status === "failed")) {
    const nextStep = steps.find((step) => step.status === "pending");
    if (nextStep) nextStep.status = "running";
  }

  const completedCount = steps.filter((step) => step.status === "completed").length;
  const totalSteps = steps.length;
  const percent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const hasFailed = steps.some((step) => step.status === "failed") || runStatus === "FAILED";
  const latestTimeline = timeline?.length ? timeline : buildTimelineFromEvents(sortedEvents);
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
    currentStep: failedStep?.label ?? runningStep?.label ?? pendingStep?.label ?? "Completed",
    lastCompletedStep: lastCompleted?.label ?? "-",
    latestEvent,
    latestEventText: latestEvent?.summary ?? "No runtime event yet",
    hasFailed,
    failureMessage,
    recentEvents,
  };
};

