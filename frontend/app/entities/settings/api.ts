import {
  ASSET_TYPE_OPTIONS,
  DATA_SOURCE_STATUS_OPTIONS,
  DECISION_STATUS_OPTIONS,
  EVIDENCE_QUALITY_OPTIONS,
  LEADERBOARD_SORT_OPTIONS,
  MARKET_OPTIONS,
  TAG_OPTIONS,
  settingsMock,
  type DataSourceDefaultStatus,
  type DecisionDefaultStatus,
  type EvidenceQualityThreshold,
  type LeaderboardSortMetric,
  type SettingsMock,
} from "@/mocks/settings.mock";
import { httpClient } from "@/shared/api/http-client";

export type {
  DataSourceDefaultStatus,
  DecisionDefaultStatus,
  EvidenceQualityThreshold,
  LeaderboardSortMetric,
  SettingsMock,
};

export {
  ASSET_TYPE_OPTIONS,
  DATA_SOURCE_STATUS_OPTIONS,
  DECISION_STATUS_OPTIONS,
  EVIDENCE_QUALITY_OPTIONS,
  LEADERBOARD_SORT_OPTIONS,
  MARKET_OPTIONS,
  TAG_OPTIONS,
};

export const getSettings = (): SettingsMock => {
  // Settings remains mostly local until the full config backend is introduced.
  // Returning the defaults in real mode keeps the Settings page usable for runtime credentials.
  return settingsMock;
};

export interface RuntimeProviderOption {
  id: string;
  name: string;
  base_url: string;
  models: string[];
  api_format: string;
  description?: string;
}

export interface HyperAiProfileConfig {
  llm_configured: boolean;
  llm_api_key_available?: boolean;
  llm_config_source?: string;
  llm_provider?: string;
  llm_model?: string;
  llm_base_url?: string;
}

export interface HyperAiToolConfigStatus {
  name: string;
  display_name: string;
  display_name_zh?: string;
  configured: boolean;
  api_key_available?: boolean;
  config_source?: string;
  enabled: boolean;
  get_url?: string;
  get_url_label?: string;
  get_url_label_zh?: string;
}

export interface RuntimeCredentialStatus {
  providers: RuntimeProviderOption[];
  profile: HyperAiProfileConfig;
  tools: HyperAiToolConfigStatus[];
}

export interface SaveQwenConfigPayload {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface WorkspaceDefaultPresetPayload {
  id?: string;
  name: string;
  description?: string;
  assetTypes: string[];
  markets: string[];
  tags: string[];
  leaderboardSortMetric: LeaderboardSortMetric;
  evidenceQualityThreshold: EvidenceQualityThreshold;
  decisionDefaultStatus: DecisionDefaultStatus;
  dataSourceDefaultStatus: DataSourceDefaultStatus;
  source?: "builtin" | "database";
}

export interface WorkspacePresetListResponse {
  presets: WorkspaceDefaultPresetPayload[];
}

export interface WorkspacePresetSaveResponse extends WorkspacePresetListResponse {
  preset: WorkspaceDefaultPresetPayload;
}

export const getRuntimeCredentialStatus = async (): Promise<RuntimeCredentialStatus> => {
  const [providersResponse, profile, toolsResponse] = await Promise.all([
    httpClient.get<{ providers: RuntimeProviderOption[] }>("/hyper-ai/providers"),
    httpClient.get<HyperAiProfileConfig>("/hyper-ai/profile"),
    httpClient.get<{ tools: HyperAiToolConfigStatus[] }>("/hyper-ai/tools"),
  ]);

  return {
    providers: providersResponse.providers ?? [],
    profile,
    tools: toolsResponse.tools ?? [],
  };
};

export const saveQwenRuntimeConfig = async (payload: SaveQwenConfigPayload): Promise<{ success: boolean; provider: string; model: string }> =>
  httpClient.post("/hyper-ai/profile/llm", {
    provider: "qwen",
    api_key: payload.apiKey,
    model: payload.model,
    base_url: payload.baseUrl,
  }, { timeoutMs: 45000 });

export const testCurrentQwenRuntimeConfig = async (): Promise<{ success: boolean; provider: string; model: string; base_url?: string }> =>
  httpClient.post("/hyper-ai/profile/llm/test-current", {}, { timeoutMs: 45000 });

export const saveBochaRuntimeConfig = async (apiKey: string, validateKey = false): Promise<{ success: boolean; tool_name: string; error?: string }> =>
  httpClient.put("/hyper-ai/tools/bocha/config", {
    config: { api_key: apiKey },
    validate_key: validateKey,
  }, { timeoutMs: 30000 });

export const deleteBochaRuntimeConfig = async (): Promise<{ success: boolean; tool_name: string }> =>
  httpClient.delete("/hyper-ai/tools/bocha/config");

export const getWorkspaceDefaultPresets = async (): Promise<WorkspacePresetListResponse> =>
  httpClient.get("/config/workspace-presets");

export const saveWorkspaceDefaultPreset = async (
  payload: WorkspaceDefaultPresetPayload,
): Promise<WorkspacePresetSaveResponse> =>
  httpClient.post("/config/workspace-presets", payload);

export const deleteWorkspaceDefaultPreset = async (presetId: string): Promise<WorkspacePresetListResponse & { success: boolean }> =>
  httpClient.delete(`/config/workspace-presets/${encodeURIComponent(presetId)}`);
