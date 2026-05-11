import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Database,
  Download,
  History,
  KeyRound,
  MonitorCog,
  RefreshCcw,
  RotateCcw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { listAssets } from "@/entities/asset/api";
import { getClickHouseOverviewAsync, listDataSources } from "@/entities/data-source/api";
import { listStrategies } from "@/entities/strategy/api";
import {
  ASSET_TYPE_OPTIONS,
  DATA_SOURCE_STATUS_OPTIONS,
  DECISION_STATUS_OPTIONS,
  EVIDENCE_QUALITY_OPTIONS,
  LEADERBOARD_SORT_OPTIONS,
  MARKET_OPTIONS,
  TAG_OPTIONS,
  deleteSettingsModulePreset,
  deleteBochaRuntimeConfig,
  deleteWorkspaceDefaultPreset,
  getRuntimeCredentialStatus,
  getSettings,
  getSettingsModulePresets,
  getWorkspaceDefaultPresets,
  saveBochaRuntimeConfig,
  saveQwenRuntimeConfig,
  saveSettingsModulePreset,
  saveWorkspaceDefaultPreset,
  testCurrentQwenRuntimeConfig,
  type DataSourceDefaultStatus,
  type DecisionDefaultStatus,
  type EvidenceQualityThreshold,
  type LeaderboardSortMetric,
  type SettingsMock,
  type SettingsModulePresetKey,
  type SettingsModulePresetPayload,
  type WorkspaceDefaultPresetPayload,
} from "@/entities/settings/api";
import { API_BASE_URL } from "@/shared/api/api-config";
import { getHideAutomationTradingOps, setHideAutomationTradingOps } from "@/shared/lib/menu-preferences";
import { navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

const arrayToggle = (items: string[], value: string): string[] =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const numberParser = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

const statusLabelMap: Record<DataSourceDefaultStatus, string> = {
  ALL: "全部",
  NORMAL: "正常",
  WARNING: "警告",
  FAILED: "失败",
};

const decisionStatusLabelMap: Record<DecisionDefaultStatus, string> = {
  ALL: "全部",
  VERIFIED: "已验证",
  POSITIVE: "正向",
  NEGATIVE: "负向",
  PENDING: "待验证",
};

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

interface SummaryTileProps {
  label: string;
  value: string | number;
  helper?: string;
}

interface FieldBlockProps {
  label: string;
  helper?: string;
  children: ReactNode;
}

type ConnectionStatus = "missing" | "configured" | "testing" | "passed" | "failed";
type NamedSettingsModuleKey = SettingsModulePresetKey;

interface WorkspaceDefaultPreset extends WorkspaceDefaultPresetPayload {
  id: string;
  description: string;
  source: "builtin" | "database";
}

interface NamedSettingsPreset extends SettingsModulePresetPayload<Record<string, unknown>> {
  id: string;
  moduleKey: NamedSettingsModuleKey;
  description: string;
  source: "database";
}

interface SettingsSnapshot extends SettingsMock {
  savedAt: string;
  activeWorkspacePresetId: string;
}

interface SettingsHistoryItem {
  id: string;
  action: string;
  at: string;
  summary: string;
}

const LOCAL_SETTINGS_STORAGE_KEY = "alphatrace.settings.snapshot";
const LOCAL_SETTINGS_HISTORY_KEY = "alphatrace.settings.history";

const isBrowser = () => typeof window !== "undefined";

const readSettingsHistory = (): SettingsHistoryItem[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_SETTINGS_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
};

const appendSettingsHistory = (item: Omit<SettingsHistoryItem, "id" | "at">) => {
  if (!isBrowser()) return;
  const nextItem: SettingsHistoryItem = {
    ...item,
    id: `settings_history_${Date.now()}`,
    at: new Date().toISOString(),
  };
  window.localStorage.setItem(LOCAL_SETTINGS_HISTORY_KEY, JSON.stringify([nextItem, ...readSettingsHistory()].slice(0, 20)));
};

const readLocalSettingsSnapshot = (fallback: SettingsMock): Partial<SettingsSnapshot> | null => {
  if (!isBrowser()) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_SETTINGS_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...fallback,
      ...parsed,
      riskThresholds: { ...fallback.riskThresholds, ...(parsed.riskThresholds || {}) },
      modelConfig: { ...fallback.modelConfig, ...(parsed.modelConfig || {}) },
      dataSourcePolicy: { ...fallback.dataSourcePolicy, ...(parsed.dataSourcePolicy || {}) },
      pagePreferences: { ...fallback.pagePreferences, ...(parsed.pagePreferences || {}) },
    };
  } catch {
    return null;
  }
};

const SETTINGS_NAV = [
  { id: "runtime", label: "运行时接入", icon: KeyRound },
  { id: "workspace", label: "工作台默认", icon: SlidersHorizontal },
  { id: "risk-model", label: "风险与模型", icon: ShieldAlert },
  { id: "agents", label: "Agent 模板", icon: Bot },
  { id: "data-policy", label: "数据源策略", icon: Database },
  { id: "page-preferences", label: "页面偏好", icon: MonitorCog },
];

const WORKSPACE_DEFAULT_PRESETS: WorkspaceDefaultPreset[] = [
  {
    id: "balanced-research",
    name: "综合研究默认",
    description: "适合日常全市场研究，覆盖 ETF、基金、期货、指数和组合。",
    assetTypes: ["ETF", "基金", "期货", "指数", "组合"],
    markets: ["A股", "美股", "商品期货"],
    tags: ["红利", "成长", "宽基", "低波", "宏观"],
    leaderboardSortMetric: "COMPOSITE_SCORE",
    evidenceQualityThreshold: "GE_80",
    decisionDefaultStatus: "VERIFIED",
    dataSourceDefaultStatus: "NORMAL",
    source: "builtin",
  },
  {
    id: "etf-index",
    name: "ETF / 指数研究",
    description: "优先看宽基、行业和低波 ETF，对应资产研究与策略实验入口。",
    assetTypes: ["ETF", "指数"],
    markets: ["A股", "港股", "美股"],
    tags: ["宽基", "行业", "低波", "红利"],
    leaderboardSortMetric: "SHARPE",
    evidenceQualityThreshold: "GE_80",
    decisionDefaultStatus: "VERIFIED",
    dataSourceDefaultStatus: "NORMAL",
    source: "builtin",
  },
  {
    id: "fund-selection",
    name: "基金筛选",
    description: "偏基金风格、回撤和持仓结构分析，适合基金池筛选。",
    assetTypes: ["基金", "组合"],
    markets: ["A股", "港股", "美股", "债券"],
    tags: ["成长", "债券", "低波", "跨境"],
    leaderboardSortMetric: "MAX_DRAWDOWN",
    evidenceQualityThreshold: "GE_90",
    decisionDefaultStatus: "VERIFIED",
    dataSourceDefaultStatus: "NORMAL",
    source: "builtin",
  },
  {
    id: "futures-macro",
    name: "期货 / 宏观",
    description: "偏商品、股指期货和宏观事件跟踪，适合趋势与结构研究。",
    assetTypes: ["期货", "指数"],
    markets: ["商品期货", "股指期货", "美股"],
    tags: ["商品", "宏观", "跨境"],
    leaderboardSortMetric: "TOTAL_RETURN",
    evidenceQualityThreshold: "GE_70",
    decisionDefaultStatus: "ALL",
    dataSourceDefaultStatus: "ALL",
    source: "builtin",
  },
  {
    id: "portfolio-risk",
    name: "组合风控",
    description: "偏组合暴露、风险预算和决策复盘，默认更重视风控评分。",
    assetTypes: ["ETF", "基金", "组合"],
    markets: ["A股", "港股", "美股", "债券"],
    tags: ["低波", "债券", "红利", "宏观"],
    leaderboardSortMetric: "RISK_SCORE",
    evidenceQualityThreshold: "GE_90",
    decisionDefaultStatus: "PENDING",
    dataSourceDefaultStatus: "WARNING",
    source: "builtin",
  },
];

const NAMED_SETTINGS_MODULES: NamedSettingsModuleKey[] = ["riskModel", "agents", "dataPolicy", "pagePreferences"];

const EMPTY_NAMED_PRESETS: Record<NamedSettingsModuleKey, NamedSettingsPreset[]> = {
  riskModel: [],
  agents: [],
  dataPolicy: [],
  pagePreferences: [],
};

const MODULE_LABELS: Record<NamedSettingsModuleKey, string> = {
  riskModel: "风险与模型",
  agents: "Agent 模板",
  dataPolicy: "数据源策略",
  pagePreferences: "页面偏好",
};

const scrollToSection = (id: string) => {
  document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const SettingsSection = ({ id, title, icon, children, action }: SettingsSectionProps) => (
  <Card id={`settings-${id}`} className="scroll-mt-4 bg-card/95 shadow-sm">
    <CardHeader className="pb-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const SummaryTile = ({ label, value }: SummaryTileProps) => (
  <div className="rounded-lg border bg-background p-3">
    <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 truncate text-lg font-semibold">{value}</div>
  </div>
);

const FieldBlock = ({ label, children }: FieldBlockProps) => (
  <div className="space-y-2">
    <div>
      <p className="text-xs font-medium">{label}</p>
    </div>
    {children}
  </div>
);

const connectionStatusMeta: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  missing: { label: "未配置", dot: "bg-slate-300", text: "text-muted-foreground" },
  configured: { label: "已配置", dot: "bg-emerald-500", text: "text-emerald-700" },
  testing: { label: "测试中", dot: "bg-amber-500", text: "text-amber-700" },
  passed: { label: "联通正常", dot: "bg-emerald-500", text: "text-emerald-700" },
  failed: { label: "联通失败", dot: "bg-red-500", text: "text-red-700" },
};

const ConnectionIndicator = ({ status }: { status: ConnectionStatus }) => {
  const meta = connectionStatusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-1 text-[11px] font-medium ${meta.text}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

interface NamedPresetPanelProps {
  moduleKey: NamedSettingsModuleKey;
  name: string;
  onNameChange: (value: string) => void;
  presets: NamedSettingsPreset[];
  activePresetId?: string;
  saving: boolean;
  loading: boolean;
  onSave: () => void;
  onRefresh: () => void;
  onApply: (preset: NamedSettingsPreset) => void;
  onDelete: (preset: NamedSettingsPreset) => void;
}

const NamedPresetPanel = ({
  moduleKey,
  name,
  onNameChange,
  presets,
  activePresetId,
  saving,
  loading,
  onSave,
  onRefresh,
  onApply,
  onDelete,
}: NamedPresetPanelProps) => (
  <div className="rounded-md border bg-muted/20 p-3">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{MODULE_LABELS[moduleKey]}方案</h2>
          <Badge variant="outline">{presets.length} 个</Badge>
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={`输入${MODULE_LABELS[moduleKey]}方案名称`}
          className="md:w-64"
        />
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "保存中..." : "保存为方案"}
        </Button>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          {loading ? "读取中..." : "刷新"}
        </Button>
      </div>
    </div>
    {presets.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs ${
              activePresetId === preset.id ? "border-primary bg-primary/10 text-primary" : "bg-background"
            }`}
          >
            <button type="button" onClick={() => onApply(preset)} className="max-w-[12rem] truncate font-medium">
              {preset.name}
            </button>
            {activePresetId === preset.id ? <span className="text-[10px] font-semibold">当前</span> : null}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(preset)}
              disabled={saving}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    ) : (
      <p className="mt-3 text-xs text-muted-foreground">暂无自定义方案。</p>
    )}
  </div>
);

export default function SettingsPage() {
  const baseSettings = useMemo(() => getSettings(), []);
  const localSettingsSnapshot = useMemo(() => readLocalSettingsSnapshot(baseSettings), [baseSettings]);
  const settings = useMemo<SettingsMock>(
    () => ({
      ...baseSettings,
      ...(localSettingsSnapshot || {}),
      riskThresholds: {
        ...baseSettings.riskThresholds,
        ...(localSettingsSnapshot?.riskThresholds || {}),
      },
      modelConfig: {
        ...baseSettings.modelConfig,
        ...(localSettingsSnapshot?.modelConfig || {}),
      },
      dataSourcePolicy: {
        ...baseSettings.dataSourcePolicy,
        ...(localSettingsSnapshot?.dataSourcePolicy || {}),
      },
      pagePreferences: {
        ...baseSettings.pagePreferences,
        ...(localSettingsSnapshot?.pagePreferences || {}),
      },
    }),
    [baseSettings, localSettingsSnapshot],
  );
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const initialPagePreferences = useMemo(
    () => ({
      ...settings.pagePreferences,
      hideAutomationTradingOps: getHideAutomationTradingOps(),
    }),
    [settings.pagePreferences],
  );
  const assets = useMemo(() => {
    try {
      return listAssets();
    } catch {
      return [];
    }
  }, []);
  const strategies = useMemo(() => {
    try {
      return listStrategies();
    } catch {
      return [];
    }
  }, []);
  const dataSources = useMemo(() => {
    try {
      return listDataSources();
    } catch {
      return [];
    }
  }, []);

  const [defaultAssetTypes, setDefaultAssetTypes] = useState<string[]>(settings.defaultAssetTypes);
  const [defaultMarkets, setDefaultMarkets] = useState<string[]>(settings.defaultMarkets);
  const [defaultTags, setDefaultTags] = useState<string[]>(settings.defaultTags);

  const [leaderboardSortMetric, setLeaderboardSortMetric] = useState<LeaderboardSortMetric>(settings.leaderboardSortMetric);
  const [evidenceQualityThreshold, setEvidenceQualityThreshold] = useState<EvidenceQualityThreshold>(settings.evidenceQualityThreshold);
  const [decisionDefaultStatus, setDecisionDefaultStatus] = useState<DecisionDefaultStatus>(settings.decisionDefaultStatus);
  const [dataSourceDefaultStatus, setDataSourceDefaultStatus] = useState<DataSourceDefaultStatus>(settings.dataSourceDefaultStatus);

  const [riskThresholds, setRiskThresholds] = useState(settings.riskThresholds);
  const [agentTemplates, setAgentTemplates] = useState(settings.agentTemplates);
  const [modelConfig, setModelConfig] = useState(settings.modelConfig);
  const [dataSourcePolicy, setDataSourcePolicy] = useState(settings.dataSourcePolicy);
  const [pagePreferences, setPagePreferences] = useState(initialPagePreferences);
  const [activeWorkspacePresetId, setActiveWorkspacePresetId] = useState(localSettingsSnapshot?.activeWorkspacePresetId || "balanced-research");
  const [databaseWorkspacePresets, setDatabaseWorkspacePresets] = useState<WorkspaceDefaultPreset[]>([]);
  const [workspacePresetName, setWorkspacePresetName] = useState("");
  const [workspacePresetLoading, setWorkspacePresetLoading] = useState(false);
  const [workspacePresetSaving, setWorkspacePresetSaving] = useState(false);
  const [operationNote, setOperationNote] = useState("Runtime Credentials 和命名方案会写入后端；页面内未标注保存的字段仍是当前会话状态。");

  const [runtimeConfigLoading, setRuntimeConfigLoading] = useState(false);
  const [runtimeConfigSaving, setRuntimeConfigSaving] = useState<"qwen" | "bocha" | "delete-bocha" | null>(null);
  const [runtimeConfigMessage, setRuntimeConfigMessage] = useState("Runtime credentials are stored encrypted on the backend. API keys are never stored in frontend state after save.");
  const [qwenConfigured, setQwenConfigured] = useState(false);
  const [qwenApiKeyAvailable, setQwenApiKeyAvailable] = useState(false);
  const [, setQwenConfigSource] = useState("missing");
  const [qwenModel, setQwenModel] = useState("qwen-plus");
  const [qwenBaseUrl, setQwenBaseUrl] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [qwenApiKey, setQwenApiKey] = useState("");
  const [bochaConfigured, setBochaConfigured] = useState(false);
  const [bochaApiKeyAvailable, setBochaApiKeyAvailable] = useState(false);
  const [bochaConfigSource, setBochaConfigSource] = useState("missing");
  const [bochaApiKey, setBochaApiKey] = useState("");
  const [qwenConnectionStatus, setQwenConnectionStatus] = useState<ConnectionStatus>("missing");
  const [bochaConnectionStatus, setBochaConnectionStatus] = useState<ConnectionStatus>("missing");
  const [clickHouseConnectionStatus, setClickHouseConnectionStatus] = useState<ConnectionStatus>("missing");
  const [clickHouseVersion, setClickHouseVersion] = useState("-");
  const [clickHouseTableCount, setClickHouseTableCount] = useState(0);
  const [modulePresetNames, setModulePresetNames] = useState<Record<NamedSettingsModuleKey, string>>({
    riskModel: "",
    agents: "",
    dataPolicy: "",
    pagePreferences: "",
  });
  const [modulePresets, setModulePresets] = useState<Record<NamedSettingsModuleKey, NamedSettingsPreset[]>>(EMPTY_NAMED_PRESETS);
  const [activeModulePresetIds, setActiveModulePresetIds] = useState<Partial<Record<NamedSettingsModuleKey, string>>>({});
  const [modulePresetLoading, setModulePresetLoading] = useState<Partial<Record<NamedSettingsModuleKey, boolean>>>({});
  const [modulePresetSaving, setModulePresetSaving] = useState<Partial<Record<NamedSettingsModuleKey, boolean>>>({});

  const loadRuntimeCredentials = async () => {
    setRuntimeConfigLoading(true);
    setClickHouseConnectionStatus("testing");
    try {
      const status = await getRuntimeCredentialStatus();
      const qwenProvider = status.providers.find((provider) => provider.id === "qwen");
      const bochaTool = status.tools.find((tool) => tool.name === "bocha");
      const qwenHasKey = Boolean(status.profile.llm_api_key_available);
      setQwenApiKeyAvailable(qwenHasKey);
      setQwenConfigSource(status.profile.llm_config_source || "missing");
      const nextQwenConfigured = Boolean(status.profile.llm_configured && qwenHasKey && String(status.profile.llm_provider ?? "").toLowerCase() === "qwen");
      setQwenConfigured(nextQwenConfigured);
      setQwenConnectionStatus(nextQwenConfigured ? "configured" : "missing");
      setQwenModel(status.profile.llm_model || qwenProvider?.models?.[2] || qwenProvider?.models?.[0] || "qwen-plus");
      setQwenBaseUrl(status.profile.llm_base_url || qwenProvider?.base_url || "https://dashscope.aliyuncs.com/compatible-mode/v1");
      const nextBochaConfigured = Boolean(bochaTool?.configured);
      setBochaConfigured(nextBochaConfigured);
      setBochaConnectionStatus(nextBochaConfigured ? "configured" : "missing");
      setBochaApiKeyAvailable(Boolean(bochaTool?.api_key_available ?? bochaTool?.configured));
      setBochaConfigSource(bochaTool?.config_source || "missing");
      setRuntimeConfigMessage("Runtime credential status loaded from backend.");
    } catch (error) {
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to load runtime credential status."));
    }

    try {
      const clickHouseStatus = await getClickHouseOverviewAsync();
      const clickHouseReady = clickHouseStatus.status === "OK";
      setClickHouseConnectionStatus(clickHouseReady ? "passed" : "failed");
      setClickHouseVersion(clickHouseStatus.version || "-");
      setClickHouseTableCount(clickHouseStatus.tables.length);
    } catch {
      setClickHouseConnectionStatus("failed");
      setClickHouseVersion("-");
      setClickHouseTableCount(0);
    } finally {
      setRuntimeConfigLoading(false);
    }
  };

  useEffect(() => {
    void loadRuntimeCredentials();
  }, []);

  const normalizeDatabasePreset = (preset: WorkspaceDefaultPresetPayload): WorkspaceDefaultPreset => ({
    ...preset,
    id: preset.id || `custom-${preset.name}`,
    description: preset.description || "自定义工作台默认模板",
    source: "database",
  });

  const loadWorkspacePresets = async () => {
    setWorkspacePresetLoading(true);
    try {
      const result = await getWorkspaceDefaultPresets();
      setDatabaseWorkspacePresets((result.presets || []).map(normalizeDatabasePreset));
    } catch (error) {
      setOperationNote(getErrorMessage(error, "读取自定义工作台模板失败。"));
    } finally {
      setWorkspacePresetLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspacePresets();
  }, []);

  const normalizeModulePreset = (
    moduleKey: NamedSettingsModuleKey,
    preset: SettingsModulePresetPayload,
  ): NamedSettingsPreset => ({
    id: preset.id || `custom-${preset.name}`,
    moduleKey,
    name: preset.name,
    description: preset.description || "自定义配置方案",
    data: (preset.data || {}) as Record<string, unknown>,
    source: "database",
  });

  const loadModulePresets = async (moduleKey: NamedSettingsModuleKey) => {
    setModulePresetLoading((prev) => ({ ...prev, [moduleKey]: true }));
    try {
      const result = await getSettingsModulePresets(moduleKey);
      setModulePresets((prev) => ({
        ...prev,
        [moduleKey]: (result.presets || []).map((preset) => normalizeModulePreset(moduleKey, preset)),
      }));
    } catch (error) {
      setOperationNote(getErrorMessage(error, `读取${MODULE_LABELS[moduleKey]}方案失败。`));
    } finally {
      setModulePresetLoading((prev) => ({ ...prev, [moduleKey]: false }));
    }
  };

  useEffect(() => {
    NAMED_SETTINGS_MODULES.forEach((moduleKey) => {
      void loadModulePresets(moduleKey);
    });
  }, []);

  const saveQwenCredentials = async () => {
    if (!qwenApiKey.trim()) {
      setRuntimeConfigMessage("Please enter a Qwen API key before saving.");
      return;
    }
    setRuntimeConfigSaving("qwen");
    setQwenConnectionStatus("testing");
    try {
      await saveQwenRuntimeConfig({ apiKey: qwenApiKey.trim(), model: qwenModel.trim() || "qwen-plus", baseUrl: qwenBaseUrl.trim() });
      setQwenApiKey("");
      setQwenConfigured(true);
      setQwenApiKeyAvailable(true);
      setQwenConnectionStatus("passed");
      setRuntimeConfigMessage("Qwen configuration saved and connection test passed. AlphaTrace QwenRunner will reuse this backend config.");
      await loadRuntimeCredentials();
      setQwenConnectionStatus("passed");
    } catch (error) {
      setQwenConnectionStatus("failed");
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to save Qwen configuration."));
    } finally {
      setRuntimeConfigSaving(null);
    }
  };

  const saveBochaCredentials = async () => {
    if (!bochaApiKey.trim()) {
      setRuntimeConfigMessage("Please enter a Bocha API key before saving.");
      return;
    }
    setRuntimeConfigSaving("bocha");
    setBochaConnectionStatus("testing");
    try {
      const result = await saveBochaRuntimeConfig(bochaApiKey.trim(), true);
      if (result.success === false) {
        throw new Error(result.error || "Bocha API key save failed.");
      }
      setBochaApiKey("");
      setBochaConfigured(true);
      setBochaApiKeyAvailable(true);
      setBochaConnectionStatus("passed");
      setRuntimeConfigMessage("Bocha API key saved encrypted on backend. Evidence retrieval will use Bocha when available.");
      await loadRuntimeCredentials();
      setBochaConnectionStatus("passed");
    } catch (error) {
      setBochaConnectionStatus("failed");
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to save Bocha configuration."));
    } finally {
      setRuntimeConfigSaving(null);
    }
  };

  const testCurrentQwenCredentials = async () => {
    setRuntimeConfigSaving("qwen");
    setQwenConnectionStatus("testing");
    try {
      const result = await testCurrentQwenRuntimeConfig();
      setQwenConfigured(true);
      setQwenApiKeyAvailable(true);
      setQwenConnectionStatus("passed");
      setRuntimeConfigMessage(`Current Qwen configuration test passed: ${result.provider}/${result.model}.`);
      await loadRuntimeCredentials();
      setQwenConnectionStatus("passed");
    } catch (error) {
      setQwenConnectionStatus("failed");
      setRuntimeConfigMessage(getErrorMessage(error, "Current Qwen configuration test failed."));
    } finally {
      setRuntimeConfigSaving(null);
    }
  };

  const removeBochaCredentials = async () => {
    setRuntimeConfigSaving("delete-bocha");
    try {
      await deleteBochaRuntimeConfig();
      setBochaApiKey("");
      setBochaConfigured(false);
      setBochaApiKeyAvailable(false);
      setBochaConfigSource("missing");
      setBochaConnectionStatus("missing");
      setRuntimeConfigMessage("Bocha API key removed. Evidence retrieval will require another configured source.");
      await loadRuntimeCredentials();
    } catch (error) {
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to remove Bocha configuration."));
    } finally {
      setRuntimeConfigSaving(null);
    }
  };

  const availableMarkets = useMemo(() => Array.from(new Set(assets.map((asset) => asset.market))), [assets]);
  const availableTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags))), [assets]);
  const workspacePresetOptions = useMemo(
    () => [...WORKSPACE_DEFAULT_PRESETS, ...databaseWorkspacePresets],
    [databaseWorkspacePresets],
  );

  const applyWorkspacePreset = (preset: WorkspaceDefaultPreset) => {
    setDefaultAssetTypes(preset.assetTypes);
    setDefaultMarkets(preset.markets);
    setDefaultTags(preset.tags);
    setLeaderboardSortMetric(preset.leaderboardSortMetric);
    setEvidenceQualityThreshold(preset.evidenceQualityThreshold);
    setDecisionDefaultStatus(preset.decisionDefaultStatus);
    setDataSourceDefaultStatus(preset.dataSourceDefaultStatus);
    setActiveWorkspacePresetId(preset.id);
    setOperationNote(`已套用“${preset.name}”工作台默认模板（当前为前端本地状态）。`);
  };

  const saveCurrentWorkspacePreset = async () => {
    const name = workspacePresetName.trim();
    if (!name) {
      setOperationNote("请输入自定义模板名称。");
      return;
    }

    setWorkspacePresetSaving(true);
    try {
      const result = await saveWorkspaceDefaultPreset({
        name,
        description: `保存于 Settings：${previewSummary.assetScopeSummary}`,
        assetTypes: defaultAssetTypes,
        markets: defaultMarkets,
        tags: defaultTags,
        leaderboardSortMetric,
        evidenceQualityThreshold,
        decisionDefaultStatus,
        dataSourceDefaultStatus,
      });
      const nextPresets = (result.presets || []).map(normalizeDatabasePreset);
      setDatabaseWorkspacePresets(nextPresets);
      setActiveWorkspacePresetId(result.preset.id || nextPresets[0]?.id || activeWorkspacePresetId);
      setWorkspacePresetName("");
      setOperationNote(`已保存自定义模板“${result.preset.name}”到数据库。`);
    } catch (error) {
      setOperationNote(getErrorMessage(error, "保存自定义工作台模板失败。"));
    } finally {
      setWorkspacePresetSaving(false);
    }
  };

  const removeWorkspacePreset = async (preset: WorkspaceDefaultPreset) => {
    if (preset.source !== "database") return;
    setWorkspacePresetSaving(true);
    try {
      const result = await deleteWorkspaceDefaultPreset(preset.id);
      setDatabaseWorkspacePresets((result.presets || []).map(normalizeDatabasePreset));
      if (activeWorkspacePresetId === preset.id) {
        setActiveWorkspacePresetId("balanced-research");
      }
      setOperationNote(`已删除自定义模板“${preset.name}”。`);
    } catch (error) {
      setOperationNote(getErrorMessage(error, "删除自定义工作台模板失败。"));
    } finally {
      setWorkspacePresetSaving(false);
    }
  };

  const buildModulePresetData = (moduleKey: NamedSettingsModuleKey): Record<string, unknown> => {
    if (moduleKey === "riskModel") {
      return { riskThresholds, modelConfig };
    }
    if (moduleKey === "agents") {
      return { agentTemplates };
    }
    if (moduleKey === "dataPolicy") {
      return { dataSourcePolicy };
    }
    return { pagePreferences };
  };

  const applyModulePreset = (moduleKey: NamedSettingsModuleKey, preset: NamedSettingsPreset) => {
    const data = preset.data as Record<string, any>;
    if (moduleKey === "riskModel") {
      if (data.riskThresholds) setRiskThresholds(data.riskThresholds);
      if (data.modelConfig) setModelConfig(data.modelConfig);
    }
    if (moduleKey === "agents" && data.agentTemplates) {
      setAgentTemplates(data.agentTemplates);
    }
    if (moduleKey === "dataPolicy" && data.dataSourcePolicy) {
      setDataSourcePolicy(data.dataSourcePolicy);
    }
    if (moduleKey === "pagePreferences" && data.pagePreferences) {
      const nextPagePreferences = {
        ...settings.pagePreferences,
        ...data.pagePreferences,
      };
      setPagePreferences(nextPagePreferences);
      setHideAutomationTradingOps(Boolean(nextPagePreferences.hideAutomationTradingOps));
    }
    setActiveModulePresetIds((prev) => ({ ...prev, [moduleKey]: preset.id }));
    setOperationNote(`已套用“${preset.name}”${MODULE_LABELS[moduleKey]}方案。`);
  };

  const saveNamedModulePreset = async (moduleKey: NamedSettingsModuleKey) => {
    const name = modulePresetNames[moduleKey].trim();
    if (!name) {
      setOperationNote(`请输入${MODULE_LABELS[moduleKey]}方案名称。`);
      return;
    }
    setModulePresetSaving((prev) => ({ ...prev, [moduleKey]: true }));
    try {
      const result = await saveSettingsModulePreset(moduleKey, {
        name,
        description: `保存于 Settings：${MODULE_LABELS[moduleKey]}`,
        data: buildModulePresetData(moduleKey),
      });
      const nextPresets = (result.presets || []).map((preset) => normalizeModulePreset(moduleKey, preset));
      setModulePresets((prev) => ({ ...prev, [moduleKey]: nextPresets }));
      setActiveModulePresetIds((prev) => ({
        ...prev,
        [moduleKey]: result.preset.id || nextPresets[0]?.id,
      }));
      setModulePresetNames((prev) => ({ ...prev, [moduleKey]: "" }));
      setOperationNote(`已保存“${result.preset.name}”${MODULE_LABELS[moduleKey]}方案到数据库。`);
    } catch (error) {
      setOperationNote(getErrorMessage(error, `保存${MODULE_LABELS[moduleKey]}方案失败。`));
    } finally {
      setModulePresetSaving((prev) => ({ ...prev, [moduleKey]: false }));
    }
  };

  const removeNamedModulePreset = async (moduleKey: NamedSettingsModuleKey, preset: NamedSettingsPreset) => {
    setModulePresetSaving((prev) => ({ ...prev, [moduleKey]: true }));
    try {
      const result = await deleteSettingsModulePreset(moduleKey, preset.id);
      setModulePresets((prev) => ({
        ...prev,
        [moduleKey]: (result.presets || []).map((item) => normalizeModulePreset(moduleKey, item)),
      }));
      if (activeModulePresetIds[moduleKey] === preset.id) {
        setActiveModulePresetIds((prev) => ({ ...prev, [moduleKey]: undefined }));
      }
      setOperationNote(`已删除“${preset.name}”${MODULE_LABELS[moduleKey]}方案。`);
    } catch (error) {
      setOperationNote(getErrorMessage(error, `删除${MODULE_LABELS[moduleKey]}方案失败。`));
    } finally {
      setModulePresetSaving((prev) => ({ ...prev, [moduleKey]: false }));
    }
  };

  const previewSummary = useMemo(
    () => ({
      assetScopeSummary: `资产类型 ${defaultAssetTypes.join(" / ")}；市场 ${defaultMarkets.join(" / ")}；标签 ${defaultTags.join(" / ")}`,
      riskSummary: `单资产上限 ${riskThresholds.maxSingleAssetWeightPct}%｜行业暴露上限 ${riskThresholds.maxSectorExposurePct}%｜最大回撤预警 ${riskThresholds.maxDrawdownAlertPct}%｜波动率预警 ${riskThresholds.volatilityAlertPct}%`,
      enabledAgentTemplateCount: agentTemplates.filter((template) => template.defaultEnabled).length,
      dataSourcePolicySummary: `优先级 ${dataSourcePolicy.priority.join(" > ")}；质量阈值 ${dataSourcePolicy.minQualityScore}；失败重试 ${dataSourcePolicy.retryStrategy}`,
      pagePreferenceSummary: `默认首页 ${pagePreferences.defaultHomePage}；主题 ${pagePreferences.theme}；语言 ${pagePreferences.language}；默认显示证据链 ${pagePreferences.showEvidenceTrace ? "是" : "否"}；隐藏自动化菜单 ${pagePreferences.hideAutomationTradingOps ? "是" : "否"}`,
    }),
    [agentTemplates, dataSourcePolicy, defaultAssetTypes, defaultMarkets, defaultTags, pagePreferences, riskThresholds],
  );

  const buildCurrentSettingsSnapshot = (): SettingsSnapshot => ({
    savedAt: new Date().toISOString(),
    activeWorkspacePresetId,
    defaultAssetTypes,
    defaultMarkets,
    defaultTags,
    leaderboardSortMetric,
    evidenceQualityThreshold,
    decisionDefaultStatus,
    dataSourceDefaultStatus,
    riskThresholds,
    agentTemplates,
    modelConfig,
    dataSourcePolicy,
    pagePreferences,
  });

  const applySettingsSnapshot = (snapshot: Partial<SettingsSnapshot>, sourceLabel: string) => {
    const merged: SettingsSnapshot = {
      ...baseSettings,
      ...snapshot,
      savedAt: snapshot.savedAt || new Date().toISOString(),
      activeWorkspacePresetId: snapshot.activeWorkspacePresetId || "balanced-research",
      riskThresholds: { ...baseSettings.riskThresholds, ...(snapshot.riskThresholds || {}) },
      modelConfig: { ...baseSettings.modelConfig, ...(snapshot.modelConfig || {}) },
      dataSourcePolicy: { ...baseSettings.dataSourcePolicy, ...(snapshot.dataSourcePolicy || {}) },
      pagePreferences: { ...baseSettings.pagePreferences, ...(snapshot.pagePreferences || {}) },
    };
    setDefaultAssetTypes(merged.defaultAssetTypes);
    setDefaultMarkets(merged.defaultMarkets);
    setDefaultTags(merged.defaultTags);
    setLeaderboardSortMetric(merged.leaderboardSortMetric);
    setEvidenceQualityThreshold(merged.evidenceQualityThreshold);
    setDecisionDefaultStatus(merged.decisionDefaultStatus);
    setDataSourceDefaultStatus(merged.dataSourceDefaultStatus);
    setRiskThresholds(merged.riskThresholds);
    setAgentTemplates(merged.agentTemplates);
    setModelConfig(merged.modelConfig);
    setDataSourcePolicy(merged.dataSourcePolicy);
    setPagePreferences(merged.pagePreferences);
    setHideAutomationTradingOps(Boolean(merged.pagePreferences.hideAutomationTradingOps));
    setActiveWorkspacePresetId(merged.activeWorkspacePresetId);
    window.localStorage.setItem(LOCAL_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    appendSettingsHistory({
      action: sourceLabel,
      summary: `${merged.defaultAssetTypes.length} 类资产 / ${merged.agentTemplates.filter((template) => template.defaultEnabled).length} 个 Agent / 数据质量阈值 ${merged.dataSourcePolicy.minQualityScore}`,
    });
  };

  const saveLocalSettings = () => {
    const snapshot = buildCurrentSettingsSnapshot();
    window.localStorage.setItem(LOCAL_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
    appendSettingsHistory({
      action: "保存本地配置",
      summary: `${defaultAssetTypes.length} 类资产 / ${previewSummary.enabledAgentTemplateCount} 个 Agent / ${dataSourcePolicy.minQualityScore} 数据质量阈值`,
    });
    setOperationNote(`已保存当前配置到本地浏览器。保存时间：${new Date(snapshot.savedAt).toLocaleString("zh-CN", { hour12: false })}`);
  };

  const exportSettings = () => {
    const snapshot = buildCurrentSettingsSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alphatrace-settings-${snapshot.savedAt.replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    appendSettingsHistory({
      action: "导出配置",
      summary: previewSummary.pagePreferenceSummary,
    });
    setOperationNote("已导出当前配置快照。");
  };

  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    try {
      const snapshot = JSON.parse(await file.text()) as Partial<SettingsSnapshot>;
      if (!snapshot || typeof snapshot !== "object") {
        throw new Error("配置文件格式不正确。");
      }
      applySettingsSnapshot(snapshot, `导入配置：${file.name}`);
      setOperationNote(`已导入配置文件“${file.name}”，并保存到本地浏览器。`);
    } catch (error) {
      setOperationNote(getErrorMessage(error, "导入配置失败。"));
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = "";
      }
    }
  };

  const showSettingsHistory = () => {
    const history = readSettingsHistory();
    if (!history.length) {
      setOperationNote("暂无配置变更记录。保存、导入、导出或重置后会记录最近 20 条。");
      return;
    }
    setOperationNote(
      history
        .slice(0, 6)
        .map((item) => `${new Date(item.at).toLocaleString("zh-CN", { hour12: false })} · ${item.action} · ${item.summary}`)
        .join("\n"),
    );
  };

  const resetSettings = () => {
    setDefaultAssetTypes(baseSettings.defaultAssetTypes);
    setDefaultMarkets(baseSettings.defaultMarkets);
    setDefaultTags(baseSettings.defaultTags);
    setLeaderboardSortMetric(baseSettings.leaderboardSortMetric);
    setEvidenceQualityThreshold(baseSettings.evidenceQualityThreshold);
    setDecisionDefaultStatus(baseSettings.decisionDefaultStatus);
    setDataSourceDefaultStatus(baseSettings.dataSourceDefaultStatus);
    setRiskThresholds(baseSettings.riskThresholds);
    setAgentTemplates(baseSettings.agentTemplates);
    setModelConfig(baseSettings.modelConfig);
    setDataSourcePolicy(baseSettings.dataSourcePolicy);
    setPagePreferences(baseSettings.pagePreferences);
    setHideAutomationTradingOps(baseSettings.pagePreferences.hideAutomationTradingOps);
    setActiveWorkspacePresetId("balanced-research");
    window.localStorage.removeItem(LOCAL_SETTINGS_STORAGE_KEY);
    appendSettingsHistory({
      action: "重置默认配置",
      summary: "已清除本地配置快照并恢复默认值",
    });
    setOperationNote("已重置为默认配置，并清除本地保存的配置快照。");
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-background pb-6">
      <ResearchWorkspaceNav />

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveLocalSettings}>
              <Save className="h-4 w-4" />
              保存配置
            </Button>
            <Button size="sm" variant="outline" onClick={exportSettings}>
              <Download className="h-4 w-4" />
              导出
            </Button>
            <Button size="sm" variant="outline" onClick={() => importFileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              导入
            </Button>
            <Button size="sm" variant="outline" onClick={showSettingsHistory}>
              <History className="h-4 w-4" />
              记录
            </Button>
            <Button size="sm" variant="outline" onClick={resetSettings}>
              <RotateCcw className="h-4 w-4" />
              重置默认
            </Button>
          </div>
        </div>
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void importSettings(event.target.files?.[0])}
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border bg-background p-3">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">Qwen Runtime</div>
            <div className="mt-2"><ConnectionIndicator status={qwenConnectionStatus} /></div>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">Bocha Search</div>
            <div className="mt-2"><ConnectionIndicator status={bochaConnectionStatus} /></div>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">ClickHouse DB</div>
            <div className="mt-2"><ConnectionIndicator status={clickHouseConnectionStatus} /></div>
          </div>
          <SummaryTile label="资产样本" value={assets.length} />
          <SummaryTile label="数据源样本" value={dataSources.length} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-4 rounded-xl border bg-card p-2 shadow-sm">
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground">设置分组</p>
            <div className="space-y-1">
              {SETTINGS_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <SettingsSection
            id="runtime"
            title="运行时接入"
            description="配置 AlphaTrace Runtime 使用的 Qwen / DashScope 和 Bocha Key。Key 只提交到后端加密存储，不保存在前端。"
            icon={<KeyRound className="h-4 w-4" />}
            action={
              <Button size="sm" variant="outline" onClick={() => void loadRuntimeCredentials()} disabled={runtimeConfigLoading}>
                <RefreshCcw className="h-4 w-4" />
                {runtimeConfigLoading ? "Loading..." : "刷新状态"}
              </Button>
            }
          >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <ConnectionIndicator status={qwenConnectionStatus} />
                  <ConnectionIndicator status={bochaConnectionStatus} />
                  <ConnectionIndicator status={clickHouseConnectionStatus} />
                  <Badge variant="outline">Qwen key: {qwenApiKeyAvailable ? "available" : "missing"}</Badge>
                  <Badge variant="outline">Bocha key: {bochaApiKeyAvailable ? "available" : "missing"}</Badge>
                  <Badge variant="outline">CK: {clickHouseVersion} · {clickHouseTableCount} tables</Badge>
                  <Badge variant="outline">Runtime API: {API_BASE_URL}</Badge>
                </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Qwen / DashScope Runtime</h2>
                    </div>
                    <ConnectionIndicator status={qwenConnectionStatus} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <FieldBlock label="Provider">
                      <Input value="qwen" readOnly />
                    </FieldBlock>
                    <FieldBlock label="Model">
                      <Input value={qwenModel} onChange={(event) => setQwenModel(event.target.value)} placeholder="qwen-plus" />
                    </FieldBlock>
                  </div>
                  <div className="mt-3">
                    <FieldBlock label="Base URL">
                      <Input value={qwenBaseUrl} onChange={(event) => setQwenBaseUrl(event.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
                    </FieldBlock>
                  </div>
                  <div className="mt-3">
                    <FieldBlock label="DASHSCOPE_API_KEY">
                      <Input type="password" value={qwenApiKey} onChange={(event) => setQwenApiKey(event.target.value)} placeholder={qwenConfigured ? "输入新 key 可更新" : "DashScope API key"} autoComplete="off" />
                    </FieldBlock>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void saveQwenCredentials()} disabled={runtimeConfigSaving === "qwen"}>
                      {runtimeConfigSaving === "qwen" ? "Testing & Saving..." : "Save Qwen Config"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void testCurrentQwenCredentials()} disabled={!qwenConfigured || runtimeConfigSaving === "qwen"}>
                      {runtimeConfigSaving === "qwen" ? "Testing..." : "Test Current"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Bocha Web Search</h2>
                    </div>
                    <ConnectionIndicator status={bochaConnectionStatus} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryTile label="Config Source" value={bochaConfigSource} />
                    <SummaryTile label="Backend Key" value={bochaApiKeyAvailable ? "available" : "missing"} />
                  </div>
                  <div className="mt-3">
                    <FieldBlock label="Endpoint">
                      <Input value="https://api.bocha.cn/v1/web-search" readOnly />
                    </FieldBlock>
                  </div>
                  <div className="mt-3">
                    <FieldBlock label="API Key">
                      <Input type="password" value={bochaApiKey} onChange={(event) => setBochaApiKey(event.target.value)} placeholder={bochaConfigured ? "输入新 key 可更新" : "Bocha API key"} autoComplete="off" />
                    </FieldBlock>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void saveBochaCredentials()} disabled={runtimeConfigSaving === "bocha"}>
                      {runtimeConfigSaving === "bocha" ? "Testing & Saving..." : "Save Bocha Key"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void removeBochaCredentials()} disabled={!bochaConfigured || runtimeConfigSaving === "delete-bocha"}>
                      {runtimeConfigSaving === "delete-bocha" ? "Removing..." : "Remove Key"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">ClickHouse Database</h2>
                    </div>
                    <ConnectionIndicator status={clickHouseConnectionStatus} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                    <SummaryTile label="Version" value={clickHouseVersion} />
                    <SummaryTile label="Tables" value={clickHouseTableCount} />
                  </div>
                  <div className="mt-3">
                    <FieldBlock label="Endpoint">
                      <Input value="CLICKHOUSE_HOST / CLICKHOUSE_PORT via SSH tunnel" readOnly />
                    </FieldBlock>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void loadRuntimeCredentials()} disabled={runtimeConfigLoading}>
                      {runtimeConfigLoading ? "Refreshing..." : "Refresh CK Status"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigateTo("/data-catalog", { tab: "clickhouse" })}>
                      Open CK Data
                    </Button>
                  </div>
                </div>
              </div>
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{runtimeConfigMessage}</p>
            </div>
          </SettingsSection>

          <SettingsSection
            id="workspace"
            title="工作台默认"
            description="这些是 Asset Research、Strategy Lab、Leaderboard、Evidence、Decision 和 Data Sources 的默认打开范围。"
            icon={<SlidersHorizontal className="h-4 w-4" />}
          >
            <div className="mb-6 rounded-lg border bg-background p-4">
              <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">预设模板</h2>
                  <p className="text-xs text-muted-foreground">选择一个常用工作流模板，自动套用资产范围和默认筛选偏好；自定义模板会保存到数据库。</p>
                </div>
                <Badge variant="outline">
                  当前模板：{workspacePresetOptions.find((preset) => preset.id === activeWorkspacePresetId)?.name ?? "自定义"}
                </Badge>
              </div>
              <div className="mb-4 flex flex-col gap-2 rounded-md border bg-muted/20 p-3 md:flex-row md:items-center">
                <Input
                  value={workspacePresetName}
                  onChange={(event) => setWorkspacePresetName(event.target.value)}
                  placeholder="输入自定义模板名称，例如：我的 ETF 低波模板"
                  className="md:max-w-sm"
                />
                <Button size="sm" onClick={() => void saveCurrentWorkspacePreset()} disabled={workspacePresetSaving}>
                  <Save className="h-4 w-4" />
                  {workspacePresetSaving ? "保存中..." : "保存当前为模板"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void loadWorkspacePresets()} disabled={workspacePresetLoading}>
                  <RefreshCcw className="h-4 w-4" />
                  {workspacePresetLoading ? "读取中..." : "刷新模板"}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {workspacePresetOptions.map((preset) => (
                  <div
                    key={preset.id}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary hover:bg-muted/50 ${
                      activeWorkspacePresetId === preset.id ? "border-primary bg-primary/5" : "bg-card"
                    }`}
                  >
                    <button type="button" onClick={() => applyWorkspacePreset(preset)} className="block w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{preset.name}</p>
                        {activeWorkspacePresetId === preset.id ? (
                          <Badge variant="default">active</Badge>
                        ) : (
                          <Badge variant="outline">{preset.source === "database" ? "custom" : "built-in"}</Badge>
                        )}
                      </div>
                      <p className="mt-2 min-h-[2.5rem] text-xs text-muted-foreground">{preset.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {preset.assetTypes.slice(0, 3).map((item) => (
                          <Badge key={`${preset.id}-${item}`} variant="outline">{item}</Badge>
                        ))}
                        {preset.assetTypes.length > 3 ? <Badge variant="outline">+{preset.assetTypes.length - 3}</Badge> : null}
                      </div>
                    </button>
                    {preset.source === "database" ? (
                      <div className="mt-3 border-t pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-full text-xs"
                          onClick={() => void removeWorkspacePreset(preset)}
                          disabled={workspacePresetSaving}
                        >
                          删除自定义模板
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {databaseWorkspacePresets.length > 0 ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  数据库自定义模板：{databaseWorkspacePresets.length} 个
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="space-y-5">
                <FieldBlock label="默认资产类型" helper="决定资产研究和策略实验默认关注的资产类别。">
                  <div className="flex flex-wrap gap-2">
                    {ASSET_TYPE_OPTIONS.map((option) => (
                      <Button key={option} size="sm" variant={defaultAssetTypes.includes(option) ? "default" : "outline"} onClick={() => setDefaultAssetTypes((prev) => arrayToggle(prev, option))}>
                        {option}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
                <FieldBlock label="默认市场" helper={`当前资产库覆盖：${availableMarkets.length ? availableMarkets.join(" / ") : "暂无"}`}>
                  <div className="flex flex-wrap gap-2">
                    {MARKET_OPTIONS.map((option) => (
                      <Button key={option} size="sm" variant={defaultMarkets.includes(option) ? "default" : "outline"} onClick={() => setDefaultMarkets((prev) => arrayToggle(prev, option))}>
                        {option}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
                <FieldBlock label="默认标签" helper={`资产库标签样例：${availableTags.length ? availableTags.slice(0, 10).join(" / ") : "暂无"}`}>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((option) => (
                      <Button key={option} size="sm" variant={defaultTags.includes(option) ? "default" : "outline"} onClick={() => setDefaultTags((prev) => arrayToggle(prev, option))}>
                        {option}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
              </div>

              <div className="space-y-4 rounded-lg border bg-background p-4">
                <h2 className="text-sm font-semibold">默认筛选偏好</h2>
                <FieldBlock label="Leaderboard 排序">
                  <div className="flex flex-wrap gap-2">
                    {LEADERBOARD_SORT_OPTIONS.map((option) => (
                      <Button key={option.value} size="sm" variant={leaderboardSortMetric === option.value ? "default" : "outline"} onClick={() => setLeaderboardSortMetric(option.value)}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
                <FieldBlock label="Evidence 质量阈值">
                  <div className="flex flex-wrap gap-2">
                    {EVIDENCE_QUALITY_OPTIONS.map((option) => (
                      <Button key={option.value} size="sm" variant={evidenceQualityThreshold === option.value ? "default" : "outline"} onClick={() => setEvidenceQualityThreshold(option.value)}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
                <FieldBlock label="Decision 默认状态">
                  <div className="flex flex-wrap gap-2">
                    {DECISION_STATUS_OPTIONS.map((option) => (
                      <Button key={option.value} size="sm" variant={decisionDefaultStatus === option.value ? "default" : "outline"} onClick={() => setDecisionDefaultStatus(option.value)}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
                <FieldBlock label="Data Sources 默认状态">
                  <div className="flex flex-wrap gap-2">
                    {DATA_SOURCE_STATUS_OPTIONS.map((option) => (
                      <Button key={option.value} size="sm" variant={dataSourceDefaultStatus === option.value ? "default" : "outline"} onClick={() => setDataSourceDefaultStatus(option.value)}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </FieldBlock>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="risk-model"
            title="风险与模型"
            description="把组合风险阈值和模型偏好放在同一个区域，便于理解 Agent 生成结果时的约束。"
            icon={<ShieldAlert className="h-4 w-4" />}
          >
            <div className="space-y-6">
              <NamedPresetPanel
                moduleKey="riskModel"
                name={modulePresetNames.riskModel}
                onNameChange={(value) => setModulePresetNames((prev) => ({ ...prev, riskModel: value }))}
                presets={modulePresets.riskModel}
                activePresetId={activeModulePresetIds.riskModel}
                saving={Boolean(modulePresetSaving.riskModel)}
                loading={Boolean(modulePresetLoading.riskModel)}
                onSave={() => void saveNamedModulePreset("riskModel")}
                onRefresh={() => void loadModulePresets("riskModel")}
                onApply={(preset) => applyModulePreset("riskModel", preset)}
                onDelete={(preset) => void removeNamedModulePreset("riskModel", preset)}
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["最大单资产权重 (%)", "maxSingleAssetWeightPct"],
                  ["最大行业暴露 (%)", "maxSectorExposurePct"],
                  ["最大回撤预警 (%)", "maxDrawdownAlertPct"],
                  ["波动率预警 (%)", "volatilityAlertPct"],
                  ["流动性风险阈值", "liquidityRiskThreshold"],
                  ["相关性风险阈值", "correlationRiskThreshold"],
                  ["组合风险评分预警线", "portfolioRiskScoreAlert"],
                ].map(([label, key]) => (
                  <FieldBlock key={key} label={label}>
                    <Input
                      type="number"
                      value={riskThresholds[key as keyof typeof riskThresholds]}
                      onChange={(event) =>
                        setRiskThresholds((prev) => ({
                          ...prev,
                          [key]: numberParser(event.target.value, prev[key as keyof typeof prev]),
                        }))
                      }
                    />
                  </FieldBlock>
                ))}
              </div>

              <div className="rounded-lg border bg-background p-4">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold">模型偏好</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <FieldBlock label="quick thinking model">
                    <Input value={modelConfig.quickThinkingModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, quickThinkingModel: event.target.value }))} />
                  </FieldBlock>
                  <FieldBlock label="deep thinking model">
                    <Input value={modelConfig.deepThinkingModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, deepThinkingModel: event.target.value }))} />
                  </FieldBlock>
                  <FieldBlock label="report generation model">
                    <Input value={modelConfig.reportGenerationModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, reportGenerationModel: event.target.value }))} />
                  </FieldBlock>
                  <FieldBlock label="risk review model">
                    <Input value={modelConfig.riskReviewModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, riskReviewModel: event.target.value }))} />
                  </FieldBlock>
                  <FieldBlock label="fallback model">
                    <Input value={modelConfig.fallbackModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, fallbackModel: event.target.value }))} />
                  </FieldBlock>
                  <FieldBlock label="temperature">
                    <Input type="number" step="0.1" value={modelConfig.temperature} onChange={(event) => setModelConfig((prev) => ({ ...prev, temperature: numberParser(event.target.value, prev.temperature) }))} />
                  </FieldBlock>
                  <FieldBlock label="reasoning effort">
                    <div className="flex flex-wrap gap-2">
                      {(["low", "medium", "high"] as const).map((effort) => (
                        <Button key={effort} size="sm" variant={modelConfig.reasoningEffort === effort ? "default" : "outline"} onClick={() => setModelConfig((prev) => ({ ...prev, reasoningEffort: effort }))}>
                          {effort}
                        </Button>
                      ))}
                    </div>
                  </FieldBlock>
                  <FieldBlock label="成本预算 (CNY / 月)">
                    <Input type="number" value={modelConfig.monthlyBudgetCny} onChange={(event) => setModelConfig((prev) => ({ ...prev, monthlyBudgetCny: numberParser(event.target.value, prev.monthlyBudgetCny) }))} />
                  </FieldBlock>
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="agents"
            title="Agent 模板"
            description="默认启用哪些 Agent 角色，以及它们关联的工具和输出类型。"
            icon={<Bot className="h-4 w-4" />}
          >
            <NamedPresetPanel
              moduleKey="agents"
              name={modulePresetNames.agents}
              onNameChange={(value) => setModulePresetNames((prev) => ({ ...prev, agents: value }))}
              presets={modulePresets.agents}
              activePresetId={activeModulePresetIds.agents}
              saving={Boolean(modulePresetSaving.agents)}
              loading={Boolean(modulePresetLoading.agents)}
              onSave={() => void saveNamedModulePreset("agents")}
              onRefresh={() => void loadModulePresets("agents")}
              onApply={(preset) => applyModulePreset("agents", preset)}
              onDelete={(preset) => void removeNamedModulePreset("agents", preset)}
            />
            <div className="mt-4 divide-y rounded-lg border bg-background">
              {agentTemplates.map((template) => (
                <div key={template.id} className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(0,1fr)_170px] lg:items-center">
                  <div>
                    <p className="text-sm font-semibold">{template.role}</p>
                    <p className="text-xs text-muted-foreground">{template.team}</p>
                  </div>
                  <div className="min-w-0 space-y-2 text-xs">
                    <p>{template.purpose}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">output: {template.outputType}</Badge>
                      {template.relatedTools.map((tool) => (
                        <Badge key={`${template.id}-${tool}`} variant="outline">{tool}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <Badge variant={template.defaultEnabled ? "default" : "outline"}>{template.defaultEnabled ? "enabled" : "disabled"}</Badge>
                    <Switch
                      checked={template.defaultEnabled}
                      onCheckedChange={() =>
                        setAgentTemplates((prev) =>
                          prev.map((item) => (item.id === template.id ? { ...item, defaultEnabled: !item.defaultEnabled } : item)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            id="data-policy"
            title="数据源策略"
            description="默认数据源优先级、质量阈值、重试与低可信度处理策略。"
            icon={<Database className="h-4 w-4" />}
            action={
              <Button size="sm" variant="outline" onClick={() => navigateTo("/data-sources")}>
                前往 Data Sources
              </Button>
            }
          >
            <div className="space-y-4">
              <NamedPresetPanel
                moduleKey="dataPolicy"
                name={modulePresetNames.dataPolicy}
                onNameChange={(value) => setModulePresetNames((prev) => ({ ...prev, dataPolicy: value }))}
                presets={modulePresets.dataPolicy}
                activePresetId={activeModulePresetIds.dataPolicy}
                saving={Boolean(modulePresetSaving.dataPolicy)}
                loading={Boolean(modulePresetLoading.dataPolicy)}
                onSave={() => void saveNamedModulePreset("dataPolicy")}
                onRefresh={() => void loadModulePresets("dataPolicy")}
                onApply={(preset) => applyModulePreset("dataPolicy", preset)}
                onDelete={(preset) => void removeNamedModulePreset("dataPolicy", preset)}
              />
              <FieldBlock label="默认数据源优先级">
                <div className="flex flex-wrap gap-2">
                  {dataSourcePolicy.priority.map((item, index) => (
                    <Badge key={`${item}-${index}`} variant="outline">{index + 1}. {item}</Badge>
                  ))}
                </div>
              </FieldBlock>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <FieldBlock label="数据质量最低阈值">
                  <Input type="number" value={dataSourcePolicy.minQualityScore} onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, minQualityScore: numberParser(event.target.value, prev.minQualityScore) }))} />
                </FieldBlock>
                <FieldBlock label="同步失败重试策略">
                  <Input value={dataSourcePolicy.retryStrategy} onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, retryStrategy: event.target.value }))} />
                </FieldBlock>
                <FieldBlock label="过期数据提醒周期 (小时)">
                  <Input type="number" value={dataSourcePolicy.staleDataReminderHours} onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, staleDataReminderHours: numberParser(event.target.value, prev.staleDataReminderHours) }))} />
                </FieldBlock>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <FieldBlock label="Evidence 自动入库策略">
                  <Input value={dataSourcePolicy.evidenceIngestionPolicy} onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, evidenceIngestionPolicy: event.target.value }))} />
                </FieldBlock>
                <FieldBlock label="低可信度数据标记策略">
                  <Input value={dataSourcePolicy.lowReliabilityTagPolicy} onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, lowReliabilityTagPolicy: event.target.value }))} />
                </FieldBlock>
              </div>
              <Badge variant="secondary">当前数据源样本：{dataSources.length}</Badge>
            </div>
          </SettingsSection>

          <SettingsSection
            id="page-preferences"
            title="页面偏好"
            description="只管理页面打开方式、主题、语言和默认显示项；全局动作集中放在右侧。"
            icon={<MonitorCog className="h-4 w-4" />}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <NamedPresetPanel
                  moduleKey="pagePreferences"
                  name={modulePresetNames.pagePreferences}
                  onNameChange={(value) => setModulePresetNames((prev) => ({ ...prev, pagePreferences: value }))}
                  presets={modulePresets.pagePreferences}
                  activePresetId={activeModulePresetIds.pagePreferences}
                  saving={Boolean(modulePresetSaving.pagePreferences)}
                  loading={Boolean(modulePresetLoading.pagePreferences)}
                  onSave={() => void saveNamedModulePreset("pagePreferences")}
                  onRefresh={() => void loadModulePresets("pagePreferences")}
                  onApply={(preset) => applyModulePreset("pagePreferences", preset)}
                  onDelete={(preset) => void removeNamedModulePreset("pagePreferences", preset)}
                />
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="space-y-4 rounded-md border bg-background p-4">
                    <FieldBlock label="默认首页">
                      <Badge variant="outline">{pagePreferences.defaultHomePage}</Badge>
                    </FieldBlock>
                    <FieldBlock label="默认主题">
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "SYSTEM", label: "跟随系统" },
                          { value: "LIGHT", label: "浅色" },
                          { value: "DARK", label: "深色" },
                        ].map((option) => (
                          <Button key={option.value} size="sm" variant={pagePreferences.theme === option.value ? "default" : "outline"} onClick={() => setPagePreferences((prev) => ({ ...prev, theme: option.value as "SYSTEM" | "LIGHT" | "DARK" }))}>
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </FieldBlock>
                    <FieldBlock label="默认展示语言">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={pagePreferences.language === "ZH" ? "default" : "outline"} onClick={() => setPagePreferences((prev) => ({ ...prev, language: "ZH" }))}>中文</Button>
                        <Button size="sm" variant={pagePreferences.language === "EN" ? "default" : "outline"} onClick={() => setPagePreferences((prev) => ({ ...prev, language: "EN" }))}>英文</Button>
                      </div>
                    </FieldBlock>
                  </div>
                  <div className="grid gap-2">
                      {[
                        ["默认打开最近一次 Agent Run", "openRecentAgentRunByDefault"],
                        ["默认显示 ResearchWorkspaceNav", "showResearchWorkspaceNav"],
                        ["默认显示风险提示", "showRiskWarnings"],
                        ["默认显示证据链", "showEvidenceTrace"],
                        ["隐藏自动化、交易与运维菜单", "hideAutomationTradingOps"],
                      ].map(([label, key]) => (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-xs">
                          <span>{label}</span>
                          <Switch
                            checked={Boolean(pagePreferences[key as keyof typeof pagePreferences])}
                            onCheckedChange={(checked) => {
                              setPagePreferences((prev) => ({ ...prev, [key]: checked }));
                              if (key === "hideAutomationTradingOps") {
                                setHideAutomationTradingOps(checked);
                                setOperationNote(checked ? "已隐藏左侧菜单中的自动化、交易与运维分组。" : "已显示左侧菜单中的自动化、交易与运维分组。");
                              }
                            }}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-md border bg-background p-4">
                  <h2 className="mb-3 text-sm font-semibold">全局操作</h2>
                  <div className="grid gap-2">
                    <Button size="sm" variant="outline" onClick={resetSettings}>
                      <RotateCcw className="h-4 w-4" />
                      重置默认
                    </Button>
                    <Button size="sm" onClick={saveLocalSettings}>
                      <Save className="h-4 w-4" />
                      保存配置
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportSettings}>
                      <Download className="h-4 w-4" />
                      导出配置
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => importFileInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      导入配置
                    </Button>
                    <Button size="sm" variant="outline" onClick={showSettingsHistory}>
                      <History className="h-4 w-4" />
                      变更记录
                    </Button>
                  </div>
                  <p className="mt-3 whitespace-pre-line rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">{operationNote}</p>
                </div>

                <div className="rounded-md border bg-muted/20 p-4 text-xs">
                  <h2 className="mb-3 text-sm font-semibold">当前摘要</h2>
                  <div className="space-y-2 text-muted-foreground">
                    <p><span className="font-medium text-foreground">资产范围：</span>{defaultAssetTypes.length} 类 / {defaultMarkets.length} 市场 / {defaultTags.length} 标签</p>
                    <p><span className="font-medium text-foreground">风险：</span>单资产 {riskThresholds.maxSingleAssetWeightPct}% · 回撤 {riskThresholds.maxDrawdownAlertPct}%</p>
                    <p><span className="font-medium text-foreground">Agent：</span>{previewSummary.enabledAgentTemplateCount} / {agentTemplates.length} 启用</p>
                    <p><span className="font-medium text-foreground">数据源：</span>质量阈值 {dataSourcePolicy.minQualityScore} · {statusLabelMap[dataSourceDefaultStatus]}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline">资产样本 {assets.length}</Badge>
                    <Badge variant="outline">策略样本 {strategies.length}</Badge>
                    <Badge variant="outline">数据源样本 {dataSources.length}</Badge>
                    <Badge variant="outline">Decision {decisionStatusLabelMap[decisionDefaultStatus]}</Badge>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>
        </main>
      </div>
    </div>
  );
}
