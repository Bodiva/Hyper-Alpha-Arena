import { ENDPOINTS } from "@/shared/api/endpoints";
import { httpClient } from "@/shared/api/http-client";

type JsonRecord = Record<string, unknown>;

export interface RuntimeArchitectureLayer {
  layerId: string;
  displayName: string;
  status: string;
  contracts?: string[];
}

export interface RuntimeArchitectureIndex {
  version: number;
  layers: RuntimeArchitectureLayer[];
  summaries: JsonRecord;
  boundaries: JsonRecord;
  links: Record<string, string>;
  message?: string;
}

export interface RuntimeConfigStatus {
  status: string;
  available?: boolean;
  source?: string;
  message?: string;
  metadata?: JsonRecord;
}

export interface RuntimeConfigResponse {
  config: Record<string, RuntimeConfigStatus>;
  message?: string;
}

export interface ModelProviderDescriptor {
  provider_id: string;
  display_name: string;
  provider_type: string;
  status: string;
  source: string;
  production_ready: boolean;
  supports_streaming: boolean;
  supports_json_output: boolean;
  used_by_runners: string[];
  configuration_keys: string[];
  notes?: string;
  metadata?: JsonRecord;
}

export interface ModelProvidersResponse {
  version: number;
  providers: ModelProviderDescriptor[];
  summary: JsonRecord;
  message?: string;
}

export interface OrchestratorDescriptor {
  orchestrator_id: string;
  display_name: string;
  status: string;
  execution_boundary: string;
  durable_state: string;
  supported_runners: string[];
  supports_cancel: boolean;
  supports_retry: boolean;
  supports_streaming_events: boolean;
  production_ready: boolean;
  notes?: string;
  metadata?: JsonRecord;
}

export interface OrchestratorsResponse {
  version: number;
  orchestrators: OrchestratorDescriptor[];
  summary: JsonRecord;
  message?: string;
}

export interface AgentRunMetricsSnapshot {
  runId: string;
  status: string;
  runnerType?: string;
  taskType: string;
  assetIds: string[];
  portfolioId?: string | null;
  strategyId?: string | null;
  metrics: JsonRecord;
  counts: JsonRecord;
  eventCounts: JsonRecord;
  agentEventCounts: JsonRecord;
  latestMetricEvent?: JsonRecord | null;
  latestStreamingEvent?: JsonRecord | null;
  persistence: JsonRecord;
  message?: string;
}

export const getRuntimeArchitectureAsync = () =>
  httpClient.get<RuntimeArchitectureIndex>(ENDPOINTS.alphaTraceAgentRuntimeArchitecture);

export const getRuntimeConfigAsync = () =>
  httpClient.get<RuntimeConfigResponse>(ENDPOINTS.alphaTraceAgentRuntimeConfig);

export const getModelProvidersAsync = () =>
  httpClient.get<ModelProvidersResponse>(ENDPOINTS.alphaTraceAgentRuntimeModelProviders);

export const getOrchestratorsAsync = () =>
  httpClient.get<OrchestratorsResponse>(ENDPOINTS.alphaTraceAgentRuntimeOrchestrators);

export const getAgentRunMetricsAsync = (runId: string) =>
  httpClient.get<AgentRunMetricsSnapshot>(ENDPOINTS.alphaTraceAgentRunMetrics(runId));
