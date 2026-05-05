import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Database,
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
import { listDataSources } from "@/entities/data-source/api";
import { listStrategies } from "@/entities/strategy/api";
import {
  ASSET_TYPE_OPTIONS,
  DATA_SOURCE_STATUS_OPTIONS,
  DECISION_STATUS_OPTIONS,
  EVIDENCE_QUALITY_OPTIONS,
  LEADERBOARD_SORT_OPTIONS,
  MARKET_OPTIONS,
  TAG_OPTIONS,
  deleteBochaRuntimeConfig,
  getRuntimeCredentialStatus,
  getSettings,
  saveBochaRuntimeConfig,
  saveQwenRuntimeConfig,
  testCurrentQwenRuntimeConfig,
  type DataSourceDefaultStatus,
  type DecisionDefaultStatus,
  type EvidenceQualityThreshold,
  type LeaderboardSortMetric,
} from "@/entities/settings/api";
import { API_BASE_URL } from "@/shared/api/api-config";
import { navigateTo } from "@/shared/lib/navigation";
import {
  BRAND_BADGE,
  BRAND_CN_BADGE,
  BRAND_OWNER,
  LEGACY_PROJECT_NAME,
  PRODUCT_ASSET_SCOPE,
  PRODUCT_CN_NAME,
  PRODUCT_CN_SUBTITLE,
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_SUBTITLE,
} from "@/shared/lib/product-branding";
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

interface WorkspaceDefaultPreset {
  id: string;
  name: string;
  description: string;
  assetTypes: string[];
  markets: string[];
  tags: string[];
  leaderboardSortMetric: LeaderboardSortMetric;
  evidenceQualityThreshold: EvidenceQualityThreshold;
  decisionDefaultStatus: DecisionDefaultStatus;
  dataSourceDefaultStatus: DataSourceDefaultStatus;
}

const SETTINGS_NAV = [
  { id: "runtime", label: "运行时接入", icon: KeyRound },
  { id: "workspace", label: "工作台默认", icon: SlidersHorizontal },
  { id: "risk-model", label: "风险与模型", icon: ShieldAlert },
  { id: "agents", label: "Agent 模板", icon: Bot },
  { id: "data-policy", label: "数据源策略", icon: Database },
  { id: "preview", label: "预览与操作", icon: MonitorCog },
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
  },
];

const scrollToSection = (id: string) => {
  document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const SettingsSection = ({ id, title, description, icon, children, action }: SettingsSectionProps) => (
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
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const SummaryTile = ({ label, value, helper }: SummaryTileProps) => (
  <div className="rounded-lg border bg-background p-3">
    <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    {helper ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{helper}</div> : null}
  </div>
);

const FieldBlock = ({ label, helper, children }: FieldBlockProps) => (
  <div className="space-y-2">
    <div>
      <p className="text-xs font-medium">{label}</p>
      {helper ? <p className="mt-0.5 text-[11px] text-muted-foreground">{helper}</p> : null}
    </div>
    {children}
  </div>
);

export default function SettingsPage() {
  const settings = useMemo(() => getSettings(), []);
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
  const [pagePreferences, setPagePreferences] = useState(settings.pagePreferences);
  const [activeWorkspacePresetId, setActiveWorkspacePresetId] = useState("balanced-research");
  const [operationNote, setOperationNote] = useState("当前配置面板已支持 Runtime Credentials 写入后端；其余产品偏好仍为前端本地状态。");

  const [runtimeConfigLoading, setRuntimeConfigLoading] = useState(false);
  const [runtimeConfigSaving, setRuntimeConfigSaving] = useState<"qwen" | "bocha" | "delete-bocha" | null>(null);
  const [runtimeConfigMessage, setRuntimeConfigMessage] = useState("Runtime credentials are stored encrypted on the backend. API keys are never stored in frontend state after save.");
  const [qwenConfigured, setQwenConfigured] = useState(false);
  const [qwenApiKeyAvailable, setQwenApiKeyAvailable] = useState(false);
  const [qwenConfigSource, setQwenConfigSource] = useState("missing");
  const [qwenModel, setQwenModel] = useState("qwen-plus");
  const [qwenBaseUrl, setQwenBaseUrl] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [qwenApiKey, setQwenApiKey] = useState("");
  const [bochaConfigured, setBochaConfigured] = useState(false);
  const [bochaApiKeyAvailable, setBochaApiKeyAvailable] = useState(false);
  const [bochaConfigSource, setBochaConfigSource] = useState("missing");
  const [bochaApiKey, setBochaApiKey] = useState("");

  const loadRuntimeCredentials = async () => {
    setRuntimeConfigLoading(true);
    try {
      const status = await getRuntimeCredentialStatus();
      const qwenProvider = status.providers.find((provider) => provider.id === "qwen");
      const bochaTool = status.tools.find((tool) => tool.name === "bocha");
      const qwenHasKey = Boolean(status.profile.llm_api_key_available);
      setQwenApiKeyAvailable(qwenHasKey);
      setQwenConfigSource(status.profile.llm_config_source || "missing");
      setQwenConfigured(Boolean(status.profile.llm_configured && qwenHasKey && String(status.profile.llm_provider ?? "").toLowerCase() === "qwen"));
      setQwenModel(status.profile.llm_model || qwenProvider?.models?.[2] || qwenProvider?.models?.[0] || "qwen-plus");
      setQwenBaseUrl(status.profile.llm_base_url || qwenProvider?.base_url || "https://dashscope.aliyuncs.com/compatible-mode/v1");
      setBochaConfigured(Boolean(bochaTool?.configured));
      setBochaApiKeyAvailable(Boolean(bochaTool?.api_key_available ?? bochaTool?.configured));
      setBochaConfigSource(bochaTool?.config_source || "missing");
      setRuntimeConfigMessage("Runtime credential status loaded from backend.");
    } catch (error) {
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to load runtime credential status."));
    } finally {
      setRuntimeConfigLoading(false);
    }
  };

  useEffect(() => {
    void loadRuntimeCredentials();
  }, []);

  const saveQwenCredentials = async () => {
    if (!qwenApiKey.trim()) {
      setRuntimeConfigMessage("Please enter a Qwen API key before saving.");
      return;
    }
    setRuntimeConfigSaving("qwen");
    try {
      await saveQwenRuntimeConfig({ apiKey: qwenApiKey.trim(), model: qwenModel.trim() || "qwen-plus", baseUrl: qwenBaseUrl.trim() });
      setQwenApiKey("");
      setQwenConfigured(true);
      setQwenApiKeyAvailable(true);
      setRuntimeConfigMessage("Qwen configuration saved and connection test passed. AlphaTrace QwenRunner will reuse this backend config.");
      await loadRuntimeCredentials();
    } catch (error) {
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
    try {
      const result = await saveBochaRuntimeConfig(bochaApiKey.trim(), true);
      if (result.success === false) {
        throw new Error(result.error || "Bocha API key save failed.");
      }
      setBochaApiKey("");
      setBochaConfigured(true);
      setBochaApiKeyAvailable(true);
      setRuntimeConfigMessage("Bocha API key saved encrypted on backend. Evidence retrieval will use Bocha when available and fallback to static seed on failure.");
      await loadRuntimeCredentials();
    } catch (error) {
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to save Bocha configuration."));
    } finally {
      setRuntimeConfigSaving(null);
    }
  };

  const testCurrentQwenCredentials = async () => {
    setRuntimeConfigSaving("qwen");
    try {
      const result = await testCurrentQwenRuntimeConfig();
      setQwenConfigured(true);
      setQwenApiKeyAvailable(true);
      setRuntimeConfigMessage(`Current Qwen configuration test passed: ${result.provider}/${result.model}.`);
      await loadRuntimeCredentials();
    } catch (error) {
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
      setRuntimeConfigMessage("Bocha API key removed. Evidence retrieval will use static seed fallback.");
      await loadRuntimeCredentials();
    } catch (error) {
      setRuntimeConfigMessage(getErrorMessage(error, "Failed to remove Bocha configuration."));
    } finally {
      setRuntimeConfigSaving(null);
    }
  };

  const availableMarkets = useMemo(() => Array.from(new Set(assets.map((asset) => asset.market))), [assets]);
  const availableTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags))), [assets]);

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

  const previewSummary = useMemo(
    () => ({
      assetScopeSummary: `资产类型 ${defaultAssetTypes.join(" / ")}；市场 ${defaultMarkets.join(" / ")}；标签 ${defaultTags.join(" / ")}`,
      riskSummary: `单资产上限 ${riskThresholds.maxSingleAssetWeightPct}%｜行业暴露上限 ${riskThresholds.maxSectorExposurePct}%｜最大回撤预警 ${riskThresholds.maxDrawdownAlertPct}%｜波动率预警 ${riskThresholds.volatilityAlertPct}%`,
      enabledAgentTemplateCount: agentTemplates.filter((template) => template.defaultEnabled).length,
      dataSourcePolicySummary: `优先级 ${dataSourcePolicy.priority.join(" > ")}；质量阈值 ${dataSourcePolicy.minQualityScore}；失败重试 ${dataSourcePolicy.retryStrategy}`,
      pagePreferenceSummary: `默认首页 ${pagePreferences.defaultHomePage}；主题 ${pagePreferences.theme}；语言 ${pagePreferences.language}；默认显示证据链 ${pagePreferences.showEvidenceTrace ? "是" : "否"}`,
    }),
    [agentTemplates, dataSourcePolicy, defaultAssetTypes, defaultMarkets, defaultTags, pagePreferences, riskThresholds],
  );

  const resetSettings = () => {
    setDefaultAssetTypes(settings.defaultAssetTypes);
    setDefaultMarkets(settings.defaultMarkets);
    setDefaultTags(settings.defaultTags);
    setLeaderboardSortMetric(settings.leaderboardSortMetric);
    setEvidenceQualityThreshold(settings.evidenceQualityThreshold);
    setDecisionDefaultStatus(settings.decisionDefaultStatus);
    setDataSourceDefaultStatus(settings.dataSourceDefaultStatus);
    setRiskThresholds(settings.riskThresholds);
    setAgentTemplates(settings.agentTemplates);
    setModelConfig(settings.modelConfig);
    setDataSourcePolicy(settings.dataSourcePolicy);
    setPagePreferences(settings.pagePreferences);
    setActiveWorkspacePresetId("balanced-research");
    setOperationNote("已重置为默认配置（前端本地状态）。");
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-background pb-6">
      <ResearchWorkspaceNav />

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Settings 工作台设置</h1>
              <Badge variant="secondary">AlphaTrace</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              统一管理 {PRODUCT_NAME} 的运行时接入、默认资产范围、筛选偏好、风险阈值、Agent 模板和数据源策略。
            </p>
            <p className="text-xs text-muted-foreground">
              Runtime Credentials 会写入后端加密配置；其余工作台偏好当前仍是前端本地状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOperationNote("保存配置占位：当前仅更新前端本地状态，未写入后端。")}>
              <Save className="h-4 w-4" />
              保存本地偏好
            </Button>
            <Button size="sm" variant="outline" onClick={resetSettings}>
              <RotateCcw className="h-4 w-4" />
              重置默认
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Qwen Runtime" value={qwenConfigured ? "已配置" : "未配置"} helper={`source: ${qwenConfigSource}`} />
          <SummaryTile label="Bocha Search" value={bochaConfigured ? "已配置" : "未配置"} helper={`source: ${bochaConfigSource}`} />
          <SummaryTile label="资产样本" value={assets.length} helper={PRODUCT_CN_NAME} />
          <SummaryTile label="数据源样本" value={dataSources.length} helper={`Runtime API: ${API_BASE_URL}`} />
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
                <Badge variant={qwenConfigured ? "default" : "outline"}>Qwen {qwenConfigured ? "configured" : "not configured"}</Badge>
                <Badge variant={bochaConfigured ? "default" : "outline"}>Bocha {bochaConfigured ? "configured" : "not configured"}</Badge>
                <Badge variant="outline">Qwen key: {qwenApiKeyAvailable ? "available" : "missing"}</Badge>
                <Badge variant="outline">Bocha key: {bochaApiKeyAvailable ? "available" : "missing"}</Badge>
                <Badge variant="outline">Runtime API: {API_BASE_URL}</Badge>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Qwen / DashScope Runtime</h2>
                      <p className="mt-1 text-xs text-muted-foreground">用于 QwenRunner 和 TradingAgents PoC 的后端 LLM provider。</p>
                    </div>
                    <Badge variant={qwenConfigured ? "default" : "outline"}>{qwenConfigured ? "ready" : "missing"}</Badge>
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
                    <FieldBlock label="DASHSCOPE_API_KEY" helper="保存后写入后端加密配置，前端不会持久化明文。">
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
                      <p className="mt-1 text-xs text-muted-foreground">用于 Evidence Retrieval 的外部网页证据，失败时回退 static seed。</p>
                    </div>
                    <Badge variant={bochaConfigured ? "default" : "outline"}>{bochaConfigured ? "ready" : "missing"}</Badge>
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
                  <p className="text-xs text-muted-foreground">选择一个常用工作流模板，自动套用资产范围和默认筛选偏好。</p>
                </div>
                <Badge variant="outline">
                  当前模板：{WORKSPACE_DEFAULT_PRESETS.find((preset) => preset.id === activeWorkspacePresetId)?.name ?? "自定义"}
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {WORKSPACE_DEFAULT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyWorkspacePreset(preset)}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary hover:bg-muted/50 ${
                      activeWorkspacePresetId === preset.id ? "border-primary bg-primary/5" : "bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{preset.name}</p>
                      {activeWorkspacePresetId === preset.id ? <Badge variant="default">active</Badge> : null}
                    </div>
                    <p className="mt-2 min-h-[2.5rem] text-xs text-muted-foreground">{preset.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {preset.assetTypes.slice(0, 3).map((item) => (
                        <Badge key={`${preset.id}-${item}`} variant="outline">{item}</Badge>
                      ))}
                      {preset.assetTypes.length > 3 ? <Badge variant="outline">+{preset.assetTypes.length - 3}</Badge> : null}
                    </div>
                  </button>
                ))}
              </div>
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
                  <p className="mt-1 text-xs text-muted-foreground">当前仍是前端偏好占位；真实运行时 Key 在“运行时接入”配置。</p>
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
            <div className="divide-y rounded-lg border bg-background">
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
            id="preview"
            title="预览与操作"
            description="汇总当前本地偏好，明确哪些只是占位操作。"
            icon={<MonitorCog className="h-4 w-4" />}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-4">
                  <h2 className="mb-3 text-sm font-semibold">页面偏好</h2>
                  <div className="grid gap-3 md:grid-cols-2">
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
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {[
                      ["默认打开最近一次 Agent Run", "openRecentAgentRunByDefault"],
                      ["默认显示 ResearchWorkspaceNav", "showResearchWorkspaceNav"],
                      ["默认显示风险提示", "showRiskWarnings"],
                      ["默认显示证据链", "showEvidenceTrace"],
                    ].map(([label, key]) => (
                      <div key={key} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                        <span>{label}</span>
                        <Switch
                          checked={Boolean(pagePreferences[key as keyof typeof pagePreferences])}
                          onCheckedChange={(checked) => setPagePreferences((prev) => ({ ...prev, [key]: checked }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-4 text-xs">
                  <h2 className="mb-3 text-sm font-semibold">配置预览</h2>
                  <div className="space-y-2 text-muted-foreground">
                    <p><span className="font-medium text-foreground">默认资产范围：</span>{previewSummary.assetScopeSummary}</p>
                    <p><span className="font-medium text-foreground">风险阈值摘要：</span>{previewSummary.riskSummary}</p>
                    <p><span className="font-medium text-foreground">默认 Agent 模板：</span>{previewSummary.enabledAgentTemplateCount} / {agentTemplates.length}</p>
                    <p><span className="font-medium text-foreground">数据源策略：</span>{previewSummary.dataSourcePolicySummary}</p>
                    <p><span className="font-medium text-foreground">页面偏好：</span>{previewSummary.pagePreferenceSummary}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">资产样本 {assets.length}</Badge>
                    <Badge variant="outline">策略样本 {strategies.length}</Badge>
                    <Badge variant="outline">数据源样本 {dataSources.length}</Badge>
                    <Badge variant="outline">Decision {decisionStatusLabelMap[decisionDefaultStatus]}</Badge>
                    <Badge variant="outline">Data Source {statusLabelMap[dataSourceDefaultStatus]}</Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-4">
                  <h2 className="mb-3 text-sm font-semibold">操作</h2>
                  <div className="grid gap-2">
                    <Button size="sm" onClick={() => setOperationNote("保存配置占位：当前仅更新前端本地状态，未写入后端。")}>
                      <Save className="h-4 w-4" />
                      保存配置
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetSettings}>
                      <RotateCcw className="h-4 w-4" />
                      重置默认
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOperationNote("导出配置占位：后续可输出 JSON 配置文件。")}>
                      <Upload className="h-4 w-4" />
                      导出配置
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOperationNote("导入配置占位：后续将支持 JSON/YAML 导入并校验。")}>
                      <Upload className="h-4 w-4" />
                      导入配置
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOperationNote("配置变更记录占位：后续将接入审计日志。")}>
                      <History className="h-4 w-4" />
                      变更记录
                    </Button>
                  </div>
                  <p className="mt-3 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">{operationNote}</p>
                </div>

                <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                  <h2 className="mb-2 text-sm font-semibold text-foreground">产品信息</h2>
                  <p><span className="font-medium text-foreground">产品：</span>{PRODUCT_CN_NAME} / {PRODUCT_NAME}</p>
                  <p><span className="font-medium text-foreground">副标题：</span>{PRODUCT_SUBTITLE} / {PRODUCT_CN_SUBTITLE}</p>
                  <p><span className="font-medium text-foreground">定位：</span>{PRODUCT_DESCRIPTION}</p>
                  <p><span className="font-medium text-foreground">背书：</span>{BRAND_OWNER} · {BRAND_CN_BADGE} · {BRAND_BADGE}</p>
                  <p><span className="font-medium text-foreground">Legacy：</span>基于原 {LEGACY_PROJECT_NAME} 能力渐进式重构，不作为当前主品牌。</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PRODUCT_ASSET_SCOPE.map((scope) => (
                      <Badge key={scope} variant="outline">{scope}</Badge>
                    ))}
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
