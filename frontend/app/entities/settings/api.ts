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

interface RuntimeConfigItem {
  name: string;
  status: string;
  configured: boolean;
  available: boolean;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface RuntimeConfigResponse {
  config?: {
    qwen?: RuntimeConfigItem;
    bocha?: RuntimeConfigItem;
  };
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

export type SettingsModulePresetKey = "riskModel" | "agents" | "dataPolicy" | "pagePreferences";

export interface SettingsModulePresetPayload<TData = Record<string, unknown>> {
  id?: string;
  moduleKey?: SettingsModulePresetKey;
  name: string;
  description?: string;
  data: TData;
  source?: "database";
}

export interface WorkspacePresetListResponse {
  presets: WorkspaceDefaultPresetPayload[];
}

export interface WorkspacePresetSaveResponse extends WorkspacePresetListResponse {
  preset: WorkspaceDefaultPresetPayload;
}

export interface SettingsModulePresetListResponse {
  presets: SettingsModulePresetPayload[];
}

export interface SettingsModulePresetSaveResponse extends SettingsModulePresetListResponse {
  preset: SettingsModulePresetPayload;
}

export const defaultHyperAiProfile: HyperAiProfileConfig = {
  llm_configured: false,
  llm_api_key_available: false,
  llm_config_source: "unavailable",
  llm_provider: "qwen",
  llm_model: "qwen-plus",
  llm_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

export const getHyperAiProvidersAsync = (): Promise<{ providers: RuntimeProviderOption[] }> =>
  httpClient.get<{ providers: RuntimeProviderOption[] }>("/hyper-ai/providers");

export const getHyperAiProfileAsync = (): Promise<HyperAiProfileConfig> =>
  httpClient.get<HyperAiProfileConfig>("/hyper-ai/profile");

export const getHyperAiToolsAsync = (): Promise<{ tools: HyperAiToolConfigStatus[] }> =>
  httpClient.get<{ tools: HyperAiToolConfigStatus[] }>("/hyper-ai/tools");

const getAgentRuntimeConfigStatus = (): Promise<RuntimeConfigResponse> =>
  httpClient.get<RuntimeConfigResponse>("/alpha-trace/agent-runs/runtime/config");

export const getRuntimeCredentialStatus = async (): Promise<RuntimeCredentialStatus> => {
  const [providersResult, profileResult, toolsResult, runtimeConfigResult] = await Promise.allSettled([
    getHyperAiProvidersAsync(),
    getHyperAiProfileAsync(),
    getHyperAiToolsAsync(),
    getAgentRuntimeConfigStatus(),
  ]);

  const providers =
    providersResult.status === "fulfilled"
      ? providersResult.value.providers ?? []
      : [
          {
            id: "qwen",
            name: "Qwen",
            base_url: defaultHyperAiProfile.llm_base_url ?? "",
            models: ["qwen-plus", "qwen-max", "qwen-turbo"],
            api_format: "openai_compatible",
            description: "Default Qwen provider. Backend status endpoint is currently unavailable.",
          },
        ];

  const runtimeConfig = runtimeConfigResult.status === "fulfilled" ? runtimeConfigResult.value.config : undefined;
  const qwenRuntime = runtimeConfig?.qwen;
  const bochaRuntime = runtimeConfig?.bocha;
  const qwenMetadata = qwenRuntime?.metadata ?? {};

  const profile: HyperAiProfileConfig = {
    ...(profileResult.status === "fulfilled" ? profileResult.value : defaultHyperAiProfile),
  };
  if (qwenRuntime?.available || qwenRuntime?.configured) {
    profile.llm_configured = true;
    profile.llm_api_key_available = Boolean(qwenRuntime.available);
    profile.llm_config_source = qwenRuntime.source || profile.llm_config_source || "runtime";
    profile.llm_provider = String(qwenMetadata.provider ?? profile.llm_provider ?? "qwen");
    profile.llm_model = String(qwenMetadata.model ?? profile.llm_model ?? "qwen-plus");
    profile.llm_base_url = profile.llm_base_url || providers.find((provider) => provider.id === "qwen")?.base_url;
  }

  const tools = toolsResult.status === "fulfilled" ? [...(toolsResult.value.tools ?? [])] : [];
  if (bochaRuntime?.available || bochaRuntime?.configured) {
    const bochaTool: HyperAiToolConfigStatus = {
      name: "bocha",
      display_name: "Bocha",
      display_name_zh: "博查搜索",
      configured: Boolean(bochaRuntime.configured),
      api_key_available: Boolean(bochaRuntime.available),
      config_source: bochaRuntime.source || "runtime",
      enabled: Boolean(bochaRuntime.available),
    };
    const existingIndex = tools.findIndex((tool) => tool.name === "bocha");
    if (existingIndex >= 0) {
      tools[existingIndex] = {
        ...tools[existingIndex],
        configured: bochaTool.configured,
        api_key_available: bochaTool.api_key_available,
        config_source: bochaTool.config_source,
        enabled: tools[existingIndex].enabled || bochaTool.enabled,
      };
    } else {
      tools.push(bochaTool);
    }
  }

  return {
    providers,
    profile,
    tools,
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

export const getSettingsModulePresets = async (
  moduleKey: SettingsModulePresetKey,
): Promise<SettingsModulePresetListResponse> =>
  httpClient.get(`/config/settings-presets/${encodeURIComponent(moduleKey)}`);

export const saveSettingsModulePreset = async (
  moduleKey: SettingsModulePresetKey,
  payload: SettingsModulePresetPayload,
): Promise<SettingsModulePresetSaveResponse> =>
  httpClient.post(`/config/settings-presets/${encodeURIComponent(moduleKey)}`, payload);

export const deleteSettingsModulePreset = async (
  moduleKey: SettingsModulePresetKey,
  presetId: string,
): Promise<SettingsModulePresetListResponse & { success: boolean }> =>
  httpClient.delete(`/config/settings-presets/${encodeURIComponent(moduleKey)}/${encodeURIComponent(presetId)}`);
