import { replayMockRuntimeEvents, type RuntimeReplayController } from "@/entities/agent/mock-runtime-replay";
import type { AgentRuntimeEvent, AgentRuntimeEventType, RuntimeTransportType } from "@/entities/agent/runtime-events";
import { API_BASE_URL } from "./api-config";

export interface EventStreamClientOptions {
  runId: string;
  transport: RuntimeTransportType;
  url?: string;
  onEvent: (event: AgentRuntimeEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  intervalMs?: number;
  maxEvents?: number;
}

export interface EventStreamClient {
  start: () => void;
  close: () => void;
  transport: RuntimeTransportType;
}

const createUnsupportedClient = (options: EventStreamClientOptions): EventStreamClient => ({
  transport: options.transport,
  start: () => {
    options.onError?.(
      new Error(`${options.transport.toUpperCase()} runtime event transport is reserved but not implemented in this phase.`),
    );
  },
  close: () => undefined,
});

const RUNTIME_EVENT_TYPES: AgentRuntimeEventType[] = [
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "agent.started",
  "agent.completed",
  "agent.failed",
  "tool.called",
  "tool.result",
  "reasoning.chunk",
  "report.generated",
  "debate.message",
  "risk.warning",
  "decision.updated",
  "evidence.linked",
  "metric.updated",
  "checkpoint.created",
];

const resolveStreamUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
};

const parseSseRuntimeEvent = (message: MessageEvent<string>): AgentRuntimeEvent => {
  try {
    return JSON.parse(message.data) as AgentRuntimeEvent;
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid runtime SSE payload: ${error.message}` : "Invalid runtime SSE payload.");
  }
};

const createSseClient = (options: EventStreamClientOptions): EventStreamClient => {
  let eventSource: EventSource | undefined;
  let completed = false;

  const close = () => {
    eventSource?.close();
    eventSource = undefined;
  };

  return {
    transport: "sse",
    start: () => {
      close();
      completed = false;

      if (!options.url) {
        options.onError?.(new Error("SSE runtime event stream URL is required."));
        return;
      }

      if (typeof EventSource === "undefined") {
        options.onError?.(new Error("EventSource is not available in this browser environment."));
        return;
      }

      eventSource = new EventSource(resolveStreamUrl(options.url));

      const handleRuntimeEvent = (message: MessageEvent<string>) => {
        try {
          options.onEvent(parseSseRuntimeEvent(message));
        } catch (error) {
          options.onError?.(error instanceof Error ? error : new Error("Failed to parse runtime SSE event."));
        }
      };

      RUNTIME_EVENT_TYPES.forEach((eventType) => {
        eventSource?.addEventListener(eventType, handleRuntimeEvent as EventListener);
      });

      eventSource.onmessage = handleRuntimeEvent;

      eventSource.addEventListener("complete", () => {
        completed = true;
        close();
        options.onComplete?.();
      });

      eventSource.addEventListener("done", (message) => {
        completed = true;
        close();
        try {
          const payload = JSON.parse((message as MessageEvent<string>).data) as { message?: string; status?: string };
          const status = payload.status?.toLowerCase();
          if (status === "running") {
            options.onComplete?.();
            return;
          }
        } catch {
          // Some servers may emit an empty done payload; treat it as a normal completion marker.
        }
        options.onComplete?.();
      });

      eventSource.addEventListener("failed", (message) => {
        completed = true;
        close();
        try {
          const payload = JSON.parse((message as MessageEvent<string>).data) as { message?: string; status?: string };
          options.onError?.(new Error(payload.message || `Runtime SSE stream ended with status ${payload.status || "failed"}.`));
        } catch {
          options.onError?.(new Error("Runtime SSE stream ended with failed status."));
        }
      });

      eventSource.onerror = () => {
        if (completed) return;
        close();
        options.onError?.(new Error("Runtime SSE stream connection failed or was interrupted."));
      };
    },
    close,
  };
};

export const createEventStreamClient = (options: EventStreamClientOptions): EventStreamClient => {
  if (options.transport === "mock") {
    let controller: RuntimeReplayController | undefined;

    return {
      transport: "mock",
      start: () => {
        controller?.cancel();
        controller = replayMockRuntimeEvents(
          options.runId,
          {
            onEvent: options.onEvent,
            onComplete: options.onComplete,
            onError: options.onError,
          },
          {
            autoStart: true,
            intervalMs: options.intervalMs,
            maxEvents: options.maxEvents,
          },
        );
      },
      close: () => {
        controller?.cancel();
        controller = undefined;
      },
    };
  }

  if (options.transport === "sse") {
    return createSseClient(options);
  }

  // WebSocket connections are intentionally not enabled in this phase.
  // Future endpoint: /ws/agent-runs/:runId.
  return createUnsupportedClient(options);
};
