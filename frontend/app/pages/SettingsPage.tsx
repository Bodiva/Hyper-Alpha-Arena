import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  getSettings,
  type DataSourceDefaultStatus,
  type DecisionDefaultStatus,
  type EvidenceQualityThreshold,
  type LeaderboardSortMetric,
} from "@/entities/settings/api";
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

export default function SettingsPage() {
  const settings = useMemo(() => getSettings(), []);
  const assets = useMemo(() => listAssets(), []);
  const strategies = useMemo(() => listStrategies(), []);
  const dataSources = useMemo(() => listDataSources(), []);

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
  const [operationNote, setOperationNote] = useState("当前为第一阶段前端配置面板，配置尚未写入后端。");

  const availableMarkets = useMemo(() => Array.from(new Set(assets.map((asset) => asset.market))), [assets]);
  const availableTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags))), [assets]);

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
    setOperationNote("已重置为默认配置（前端本地状态）。");
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Settings 工作台设置</CardTitle>
          <CardDescription>统一管理 {PRODUCT_NAME} 的产品配置、Agent 模板、风险阈值与数据源策略</CardDescription>
          <p className="text-xs text-muted-foreground">
            {PRODUCT_CN_NAME} · {PRODUCT_CN_SUBTITLE}
          </p>
          <p className="text-xs text-muted-foreground">{PRODUCT_DESCRIPTION}</p>
          <p className="text-xs text-muted-foreground">{BRAND_BADGE}</p>
          <p className="text-xs text-muted-foreground">Legacy 说明：基于原 {LEGACY_PROJECT_NAME} 工作台能力渐进式重构，但不作为当前产品主品牌。</p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">品牌与产品信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p><span className="font-medium">当前产品名：</span>{PRODUCT_NAME}</p>
          <p><span className="font-medium">中文产品名：</span>{PRODUCT_CN_NAME}</p>
          <p><span className="font-medium">英文副标题：</span>{PRODUCT_SUBTITLE}</p>
          <p><span className="font-medium">中文副标题：</span>{PRODUCT_CN_SUBTITLE}</p>
          <p><span className="font-medium">产品定位说明：</span>{PRODUCT_DESCRIPTION}</p>
          <p><span className="font-medium">品牌背书：</span>{BRAND_OWNER}</p>
          <p><span className="font-medium">中文背书：</span>{BRAND_CN_BADGE}</p>
          <p><span className="font-medium">英文背书：</span>{BRAND_BADGE}</p>
          <p><span className="font-medium">Legacy 来源：</span>基于原 {LEGACY_PROJECT_NAME} 工作台能力渐进式重构（不作为当前主品牌）。</p>
          <div className="flex flex-wrap gap-2">
            <span className="font-medium">资产范围：</span>
            {PRODUCT_ASSET_SCOPE.map((scope) => (
              <Badge key={scope} variant="outline">{scope}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">默认资产范围配置</CardTitle>
          <CardDescription>后续可联动 Asset Research、Strategy Lab、Portfolio Workspace。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium">默认资产类型</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_TYPE_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={defaultAssetTypes.includes(option) ? "default" : "outline"}
                  onClick={() => setDefaultAssetTypes((prev) => arrayToggle(prev, option))}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">默认市场</p>
            <div className="flex flex-wrap gap-2">
              {MARKET_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={defaultMarkets.includes(option) ? "default" : "outline"}
                  onClick={() => setDefaultMarkets((prev) => arrayToggle(prev, option))}
                >
                  {option}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">当前资产库覆盖市场：{availableMarkets.join(" / ")}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">默认标签</p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={defaultTags.includes(option) ? "default" : "outline"}
                  onClick={() => setDefaultTags((prev) => arrayToggle(prev, option))}
                >
                  {option}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">当前资产库覆盖标签（样例）：{availableTags.slice(0, 10).join(" / ")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">默认筛选偏好</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium">Leaderboard 默认排序指标</p>
            <div className="flex flex-wrap gap-2">
              {LEADERBOARD_SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={leaderboardSortMetric === option.value ? "default" : "outline"}
                  onClick={() => setLeaderboardSortMetric(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">Evidence 默认质量阈值</p>
            <div className="flex flex-wrap gap-2">
              {EVIDENCE_QUALITY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={evidenceQualityThreshold === option.value ? "default" : "outline"}
                  onClick={() => setEvidenceQualityThreshold(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">Decision Attribution 默认结果状态</p>
            <div className="flex flex-wrap gap-2">
              {DECISION_STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={decisionDefaultStatus === option.value ? "default" : "outline"}
                  onClick={() => setDecisionDefaultStatus(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">Data Sources 默认状态</p>
            <div className="flex flex-wrap gap-2">
              {DATA_SOURCE_STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={dataSourceDefaultStatus === option.value ? "default" : "outline"}
                  onClick={() => setDataSourceDefaultStatus(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">风险阈值配置</CardTitle>
          <CardDescription>后续可联动 Portfolio Workspace 与 Decision Attribution。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">最大单资产权重阈值 (%)</p>
            <Input
              type="number"
              value={riskThresholds.maxSingleAssetWeightPct}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, maxSingleAssetWeightPct: numberParser(event.target.value, prev.maxSingleAssetWeightPct) }))
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">最大行业暴露阈值 (%)</p>
            <Input
              type="number"
              value={riskThresholds.maxSectorExposurePct}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, maxSectorExposurePct: numberParser(event.target.value, prev.maxSectorExposurePct) }))
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">最大回撤预警阈值 (%)</p>
            <Input
              type="number"
              value={riskThresholds.maxDrawdownAlertPct}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, maxDrawdownAlertPct: numberParser(event.target.value, prev.maxDrawdownAlertPct) }))
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">波动率预警阈值 (%)</p>
            <Input
              type="number"
              value={riskThresholds.volatilityAlertPct}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, volatilityAlertPct: numberParser(event.target.value, prev.volatilityAlertPct) }))
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">流动性风险阈值</p>
            <Input
              type="number"
              value={riskThresholds.liquidityRiskThreshold}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, liquidityRiskThreshold: numberParser(event.target.value, prev.liquidityRiskThreshold) }))
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">相关性风险阈值</p>
            <Input
              type="number"
              value={riskThresholds.correlationRiskThreshold}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, correlationRiskThreshold: numberParser(event.target.value, prev.correlationRiskThreshold) }))
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">组合风险评分预警线</p>
            <Input
              type="number"
              value={riskThresholds.portfolioRiskScoreAlert}
              onChange={(event) =>
                setRiskThresholds((prev) => ({ ...prev, portfolioRiskScoreAlert: numberParser(event.target.value, prev.portfolioRiskScoreAlert) }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agent 模板配置</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {agentTemplates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{template.role}</CardTitle>
                <CardDescription>{template.team}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <p>{template.purpose}</p>
                <p className="text-muted-foreground">output: {template.outputType}</p>
                <div className="flex flex-wrap gap-1">
                  {template.relatedTools.map((tool) => (
                    <Badge key={`${template.id}-${tool}`} variant="outline">{tool}</Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant={template.defaultEnabled ? "default" : "outline"}>{template.defaultEnabled ? "default enabled" : "disabled"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setAgentTemplates((prev) =>
                        prev.map((item) =>
                          item.id === template.id ? { ...item, defaultEnabled: !item.defaultEnabled } : item,
                        ),
                      )
                    }
                  >
                    切换启用状态
                  </Button>
                  <Button size="sm" variant="outline">编辑模板占位</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">模型配置占位</CardTitle>
          <CardDescription>本阶段不接真实模型配置，仅做展示与后续接口占位。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <p className="font-medium">quick thinking model</p>
            <Input value={modelConfig.quickThinkingModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, quickThinkingModel: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="font-medium">deep thinking model</p>
            <Input value={modelConfig.deepThinkingModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, deepThinkingModel: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="font-medium">report generation model</p>
            <Input value={modelConfig.reportGenerationModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, reportGenerationModel: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="font-medium">risk review model</p>
            <Input value={modelConfig.riskReviewModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, riskReviewModel: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="font-medium">fallback model</p>
            <Input value={modelConfig.fallbackModel} onChange={(event) => setModelConfig((prev) => ({ ...prev, fallbackModel: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="font-medium">temperature</p>
            <Input
              type="number"
              step="0.1"
              value={modelConfig.temperature}
              onChange={(event) => setModelConfig((prev) => ({ ...prev, temperature: numberParser(event.target.value, prev.temperature) }))}
            />
          </div>
          <div className="space-y-1">
            <p className="font-medium">reasoning effort</p>
            <div className="flex flex-wrap gap-2">
              {(["low", "medium", "high"] as const).map((effort) => (
                <Button
                  key={effort}
                  size="sm"
                  variant={modelConfig.reasoningEffort === effort ? "default" : "outline"}
                  onClick={() => setModelConfig((prev) => ({ ...prev, reasoningEffort: effort }))}
                >
                  {effort}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium">成本预算 (CNY / 月)</p>
            <Input
              type="number"
              value={modelConfig.monthlyBudgetCny}
              onChange={(event) => setModelConfig((prev) => ({ ...prev, monthlyBudgetCny: numberParser(event.target.value, prev.monthlyBudgetCny) }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">数据源策略配置</CardTitle>
          <CardDescription>默认数据源优先级、质量阈值、重试与低可信度处理策略。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="space-y-2">
            <p className="font-medium">默认数据源优先级</p>
            <div className="flex flex-wrap gap-2">
              {dataSourcePolicy.priority.map((item, index) => (
                <Badge key={`${item}-${index}`} variant="outline">{index + 1}. {item}</Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="font-medium">数据质量最低阈值</p>
              <Input
                type="number"
                value={dataSourcePolicy.minQualityScore}
                onChange={(event) =>
                  setDataSourcePolicy((prev) => ({ ...prev, minQualityScore: numberParser(event.target.value, prev.minQualityScore) }))
                }
              />
            </div>
            <div className="space-y-1">
              <p className="font-medium">同步失败重试策略</p>
              <Input
                value={dataSourcePolicy.retryStrategy}
                onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, retryStrategy: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <p className="font-medium">过期数据提醒周期 (小时)</p>
              <Input
                type="number"
                value={dataSourcePolicy.staleDataReminderHours}
                onChange={(event) =>
                  setDataSourcePolicy((prev) => ({ ...prev, staleDataReminderHours: numberParser(event.target.value, prev.staleDataReminderHours) }))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Evidence 自动入库策略</p>
            <Input
              value={dataSourcePolicy.evidenceIngestionPolicy}
              onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, evidenceIngestionPolicy: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <p className="font-medium">低可信度数据标记策略</p>
            <Input
              value={dataSourcePolicy.lowReliabilityTagPolicy}
              onChange={(event) => setDataSourcePolicy((prev) => ({ ...prev, lowReliabilityTagPolicy: event.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigateTo("/data-sources")}>前往 Data Sources 页面</Button>
            <Badge variant="secondary">当前数据源样本：{dataSources.length}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">页面偏好配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="space-y-2">
            <p className="font-medium">默认首页</p>
            <Badge variant="outline">{pagePreferences.defaultHomePage}</Badge>
          </div>
          <div className="space-y-2">
            <p className="font-medium">默认主题</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "SYSTEM", label: "跟随系统" },
                { value: "LIGHT", label: "浅色" },
                { value: "DARK", label: "深色" },
              ].map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={pagePreferences.theme === option.value ? "default" : "outline"}
                  onClick={() => setPagePreferences((prev) => ({ ...prev, theme: option.value as "SYSTEM" | "LIGHT" | "DARK" }))}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-medium">默认展示语言</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={pagePreferences.language === "ZH" ? "default" : "outline"} onClick={() => setPagePreferences((prev) => ({ ...prev, language: "ZH" }))}>
                中文
              </Button>
              <Button size="sm" variant={pagePreferences.language === "EN" ? "default" : "outline"} onClick={() => setPagePreferences((prev) => ({ ...prev, language: "EN" }))}>
                英文
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded border p-2 flex items-center justify-between gap-2">
              <span>默认打开最近一次 Agent Run</span>
              <Switch checked={pagePreferences.openRecentAgentRunByDefault} onCheckedChange={(checked) => setPagePreferences((prev) => ({ ...prev, openRecentAgentRunByDefault: checked }))} />
            </div>
            <div className="rounded border p-2 flex items-center justify-between gap-2">
              <span>默认显示 ResearchWorkspaceNav</span>
              <Switch checked={pagePreferences.showResearchWorkspaceNav} onCheckedChange={(checked) => setPagePreferences((prev) => ({ ...prev, showResearchWorkspaceNav: checked }))} />
            </div>
            <div className="rounded border p-2 flex items-center justify-between gap-2">
              <span>默认显示风险提示</span>
              <Switch checked={pagePreferences.showRiskWarnings} onCheckedChange={(checked) => setPagePreferences((prev) => ({ ...prev, showRiskWarnings: checked }))} />
            </div>
            <div className="rounded border p-2 flex items-center justify-between gap-2">
              <span>默认显示证据链</span>
              <Switch checked={pagePreferences.showEvidenceTrace} onCheckedChange={(checked) => setPagePreferences((prev) => ({ ...prev, showEvidenceTrace: checked }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">配置预览区</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p><span className="font-medium">默认资产范围：</span>{previewSummary.assetScopeSummary}</p>
          <p><span className="font-medium">风险阈值摘要：</span>{previewSummary.riskSummary}</p>
          <p><span className="font-medium">默认 Agent 模板数量：</span>{previewSummary.enabledAgentTemplateCount} / {agentTemplates.length}</p>
          <p><span className="font-medium">数据源策略摘要：</span>{previewSummary.dataSourcePolicySummary}</p>
          <p><span className="font-medium">页面偏好摘要：</span>{previewSummary.pagePreferenceSummary}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">资产样本 {assets.length}</Badge>
            <Badge variant="outline">策略样本 {strategies.length}</Badge>
            <Badge variant="outline">数据源样本 {dataSources.length}</Badge>
            <Badge variant="outline">Decision 默认状态 {decisionStatusLabelMap[decisionDefaultStatus]}</Badge>
            <Badge variant="outline">Data Source 默认状态 {statusLabelMap[dataSourceDefaultStatus]}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">操作区</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOperationNote("保存配置占位：当前仅更新前端本地状态，未写入后端。")}>保存配置</Button>
            <Button size="sm" variant="outline" onClick={resetSettings}>重置默认</Button>
            <Button size="sm" variant="outline" onClick={() => setOperationNote("导出配置占位：后续可输出 JSON 配置文件。")}>导出配置</Button>
            <Button size="sm" variant="outline" onClick={() => setOperationNote("导入配置占位：后续将支持 JSON/YAML 导入并校验。")}>导入配置</Button>
            <Button size="sm" variant="outline" onClick={() => setOperationNote("配置变更记录占位：后续将接入审计日志。")}>查看配置变更记录</Button>
          </div>
          <p className="text-xs text-muted-foreground">{operationNote}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">阶段说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p>当前 Settings 为第一阶段前端配置面板。</p>
          <p>配置项暂未写入后端。</p>
          <p>后续将与 Asset Research、Strategy Lab、Portfolio Workspace、Decision Attribution 和 Data Sources 联动。</p>
        </CardContent>
      </Card>
    </div>
  );
}
