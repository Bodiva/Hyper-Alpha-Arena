import { agentRunsMock } from "@/mocks/agent-runs.mock";
import type { AgentEvent, AgentRun } from "./model";
import type { AgentRuntimeEvent, AgentRuntimeEventPayload } from "./runtime-events";

export interface RuntimeReplayHandlers {
  onEvent: (event: AgentRuntimeEvent) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface RuntimeReplayOptions {
  intervalMs?: number;
  autoStart?: boolean;
  maxEvents?: number;
}

export interface RuntimeReplayController {
  start: () => void;
  cancel: () => void;
  isRunning: () => boolean;
}

const getAgentMeta = (agentRun: AgentRun, agentId?: string) => {
  if (!agentId) return undefined;
  return agentRun.agents.find((agent) => agent.agentId === agentId);
};

const payloadFromAgentEvent = (event: AgentEvent): AgentRuntimeEventPayload => {
  switch (event.type) {
    case "agent.failed":
      return { error: event.error };
    case "tool.called":
      return { toolName: event.toolName, args: event.args, status: "RUNNING" };
    case "tool.result":
      return { toolName: event.toolName, summary: event.summary, evidenceIds: event.evidenceIds, status: "COMPLETED" };
    case "reasoning.chunk":
      return { content: event.content };
    case "report.generated":
      return { reportId: event.reportId, title: event.title };
    case "debate.message":
      return { stance: event.stance, content: event.content };
    case "risk.warning":
      return { level: event.level, content: event.content };
    case "decision.updated":
      return { action: event.action, confidence: event.confidence };
    case "agent.started":
    case "agent.completed":
    default:
      return {};
  }
};

const runtimeTypeFromAgentEvent = (event: AgentEvent): AgentRuntimeEvent["type"] => event.type;

export const buildMockRuntimeEventsFromAgentRun = (agentRun: AgentRun): AgentRuntimeEvent[] => {
  const baseEvents: AgentRuntimeEvent[] = [];
  let sequence = 1;

  baseEvents.push({
    eventId: `${agentRun.runId}_runtime_${sequence}`,
    runId: agentRun.runId,
    type: "agent.run.started",
    timestamp: agentRun.startedAt,
    sequence,
    payload: {},
  });
  sequence += 1;

  agentRun.events.forEach((event) => {
    const agentMeta = "agentId" in event ? getAgentMeta(agentRun, event.agentId) : undefined;
    baseEvents.push({
      eventId: `${agentRun.runId}_runtime_${sequence}`,
      runId: event.runId,
      type: runtimeTypeFromAgentEvent(event),
      timestamp: event.timestamp,
      agentId: "agentId" in event ? event.agentId : undefined,
      agentName: agentMeta?.name,
      team: agentMeta?.team,
      sequence,
      payload: payloadFromAgentEvent(event),
    });
    sequence += 1;
  });

  agentRun.toolCalls.forEach((call) => {
    if (call.evidenceIds?.length) {
      const agentMeta = getAgentMeta(agentRun, call.agentId);
      baseEvents.push({
        eventId: `${agentRun.runId}_runtime_${sequence}`,
        runId: agentRun.runId,
        type: "evidence.linked",
        timestamp: call.completedAt ?? call.startedAt,
        agentId: call.agentId,
        agentName: agentMeta?.name,
        team: agentMeta?.team,
        sequence,
        payload: { evidenceIds: call.evidenceIds, summary: call.summary },
      });
      sequence += 1;
    }
  });

  baseEvents.push({
    eventId: `${agentRun.runId}_runtime_${sequence}`,
    runId: agentRun.runId,
    type: "metric.updated",
    timestamp: agentRun.updatedAt ?? agentRun.completedAt ?? agentRun.startedAt,
    sequence,
    payload: { metrics: agentRun.metrics },
  });
  sequence += 1;

  baseEvents.push({
    eventId: `${agentRun.runId}_runtime_${sequence}`,
    runId: agentRun.runId,
    type: "checkpoint.created",
    timestamp: agentRun.updatedAt ?? agentRun.completedAt ?? agentRun.startedAt,
    sequence,
    payload: {
      checkpointId: `${agentRun.runId}_checkpoint_final`,
      label: agentRun.status === "COMPLETED" ? "Final decision checkpoint" : "Latest runtime checkpoint",
      summary: agentRun.finalDecision.summary,
    },
  });
  sequence += 1;

  if (agentRun.status === "COMPLETED") {
    baseEvents.push({
      eventId: `${agentRun.runId}_runtime_${sequence}`,
      runId: agentRun.runId,
      type: "agent.run.completed",
      timestamp: agentRun.completedAt ?? agentRun.updatedAt ?? agentRun.startedAt,
      sequence,
      payload: {},
    });
  }

  return baseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence);
};

export const replayMockRuntimeEvents = (
  runId: string,
  handlers: RuntimeReplayHandlers,
  options: RuntimeReplayOptions = {},
): RuntimeReplayController => {
  const agentRun = agentRunsMock.find((run) => run.runId === runId);
  let timer: ReturnType<typeof window.setTimeout> | undefined;
  let running = false;
  let cursor = 0;

  const intervalMs = options.intervalMs ?? 450;
  const events = agentRun ? buildMockRuntimeEventsFromAgentRun(agentRun).slice(0, options.maxEvents) : [];

  const cancel = () => {
    running = false;
    if (timer) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  const tick = () => {
    if (!running) return;
    const event = events[cursor];
    if (!event) {
      cancel();
      handlers.onComplete?.();
      return;
    }

    handlers.onEvent(event);
    cursor += 1;
    timer = window.setTimeout(tick, intervalMs);
  };

  const start = () => {
    if (running) return;
    if (!agentRun) {
      handlers.onError?.(new Error(`Mock Agent Run not found: ${runId}`));
      return;
    }
    running = true;
    tick();
  };

  if (options.autoStart ?? true) {
    start();
  }

  return {
    start,
    cancel,
    isRunning: () => running,
  };
};
