import { useEffect, useMemo, useState } from "react";
import type { Asset, AssetType } from "@/entities/asset/model";
import type { Evidence } from "@/entities/evidence/model";
import type { Decision } from "@/entities/decision/model";
import type { Portfolio } from "@/entities/portfolio/model";
import type { LeaderboardItem, Strategy, StrategyLifecycleStatus, StrategyType } from "@/entities/strategy/model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listLeaderboard, listStrategiesAsync } from "@/entities/strategy/api";
import { listAssets, listAssetsAsync } from "@/entities/asset/api";
import { listEvidence, listEvidenceAsync } from "@/entities/evidence/api";
import { listDecisions } from "@/entities/decision/api";
import { listPortfolios } from "@/entities/portfolio/api";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

type StrategyTypeFilter = "ALL" | StrategyType;
type StyleFilter =
  | "ALL"
  | "红利防御"
  | "成长进攻"
  | "宏观配置"
  | "商品周期"
  | "低波稳健"
  | "趋势择时"
  | "均值回归"
  | "风险平价";
type AssetTypeFilter = "ALL" | AssetType | "MULTI_ASSET";
type StatusFilter = "ALL" | "DRAFT" | "VERIFIED" | "RUNNING" | "PAUSED" | "ARCHIVED";

interface StrategyView {
  strategy: Strategy;
  lifecycleStatus: StrategyLifecycleStatus;
  assetBucket: AssetTypeFilter;
  relatedAssets: Asset[];
  relatedEvidence: Evidence[];
  relatedDecisions: Decision[];
  relatedPortfolios: Portfolio[];
  relatedLeaderboard: LeaderboardItem[];
  relatedEvidenceCount: number;
  relatedDecisionCount: number;
  relatedPortfolioCount: number;
}

const STRATEGY_TYPE_FILTERS: StrategyTypeFilter[] = [
  "ALL",
  "ETF_ROTATION",
  "FUND_SELECTION",
  "FUTURES_TIMING",
  "MULTI_ASSET_ALLOCATION",
  "RULE_BASED",
  "AGENT_GENERATED",
];

const STYLE_FILTERS: StyleFilter[] = [
  "ALL",
  "红利防御",
  "成长进攻",
  "宏观配置",
  "商品周期",
  "低波稳健",
  "趋势择时",
  "均值回归",
  "风险平价",
];

const ASSET_TYPE_FILTERS: AssetTypeFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "INDEX", "MULTI_ASSET"];
const STATUS_FILTERS: StatusFilter[] = ["ALL", "DRAFT", "VERIFIED", "RUNNING", "PAUSED", "ARCHIVED"];

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "全部",
  DRAFT: "草稿",
  VERIFIED: "已验证",
  RUNNING: "运行中",
  PAUSED: "暂停",
  ARCHIVED: "归档",
};

const STATUS_BADGE: Record<Exclude<StatusFilter, "ALL">, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  VERIFIED: "default",
  RUNNING: "secondary",
  PAUSED: "outline",
  ARCHIVED: "outline",
};

const formatPercent = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toText = (value: unknown): string => String(value).toLowerCase();

const inferLifecycleStatus = (strategy: Strategy): StrategyLifecycleStatus => {
  if (strategy.lifecycleStatus) return strategy.lifecycleStatus;
  if (strategy.status === "DRAFT") return "DRAFT";
  if (strategy.status === "PAUSED") return "PAUSED";
  if (strategy.status === "ARCHIVED") return "ARCHIVED";
  return "RUNNING";
};

const inferAssetBucket = (assetTypes: AssetType[]): AssetTypeFilter => {
  if (assetTypes.length > 1) return "MULTI_ASSET";
  return assetTypes[0] ?? "MULTI_ASSET";
};

const normalizeBar = (value: number, max: number): number => {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(6, (Math.abs(value) / max) * 100));
};

const uniqueById = <T,>(items: T[], getId: (item: T) => string): T[] =>
  Array.from(new Map(items.map((item) => [getId(item), item])).values());

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
};

export default function StrategyLabPage() {
  const apiMode = getApiMode();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(true);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const decisions = useMemo<Decision[]>(() => {
    try {
      return listDecisions();
    } catch {
      return [];
    }
  }, []);
  const portfolios = useMemo<Portfolio[]>(() => {
    try {
      return listPortfolios();
    } catch {
      return [];
    }
  }, []);
  const leaderboardItems = useMemo<LeaderboardItem[]>(() => {
    try {
      return listLeaderboard();
    } catch {
      return [];
    }
  }, []);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const queryStrategyId = initialRouteParams.get("strategyId") ?? undefined;
  const queryAssetType = initialRouteParams.get("assetType") as AssetTypeFilter | null;

  const [typeFilter, setTypeFilter] = useState<StrategyTypeFilter>("ALL");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("ALL");
  const [assetFilter, setAssetFilter] = useState<AssetTypeFilter>(
    queryAssetType && ASSET_TYPE_FILTERS.includes(queryAssetType) ? queryAssetType : "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(queryStrategyId ?? null);

  useEffect(() => {
    let cancelled = false;

    const loadStrategies = async () => {
      setIsLoadingStrategies(true);
      setStrategyError(null);

      try {
        const nextStrategies = await listStrategiesAsync({ limit: 100 });
        let nextAssets: Asset[] = [];
        let nextEvidence: Evidence[] = [];

        if (apiMode === "real") {
          const [assetItems, evidenceItems] = await Promise.all([
            listAssetsAsync({ limit: 100 }),
            listEvidenceAsync({ limit: 100 }),
          ]);
          nextAssets = uniqueById(assetItems, (asset) => asset.id);
          nextEvidence = uniqueById(evidenceItems, (item) => item.id);
        } else {
          nextAssets = listAssets();
          nextEvidence = listEvidence();
        }

        if (!cancelled) {
          setStrategies(nextStrategies);
          setAssets(nextAssets);
          setEvidenceItems(nextEvidence);
        }
      } catch (error) {
        if (!cancelled) {
          setStrategies([]);
          setAssets([]);
          setEvidenceItems([]);
          setStrategyError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStrategies(false);
        }
      }
    };

    loadStrategies();

    return () => {
      cancelled = true;
    };
  }, [apiMode]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const evidenceById = useMemo(() => new Map(evidenceItems.map((item) => [item.id, item])), [evidenceItems]);
  const decisionById = useMemo(() => new Map(decisions.map((item) => [item.decisionId, item])), [decisions]);
  const portfolioById = useMemo(() => new Map(portfolios.map((item) => [item.portfolioId, item])), [portfolios]);

  const strategyViews = useMemo<StrategyView[]>(() => {
    return strategies.map((strategy) => {
      const lifecycleStatus = inferLifecycleStatus(strategy);
      const assetBucket = inferAssetBucket(strategy.assetTypes);

      const relatedAssetIds =
        strategy.relatedAssetIds && strategy.relatedAssetIds.length > 0
          ? strategy.relatedAssetIds
          : assets
              .filter((asset) => strategy.assetTypes.includes(asset.assetType))
              .map((asset) => asset.id);

      const relatedAssets = Array.from(
        new Map(
          relatedAssetIds
            .map((assetId) => assetById.get(assetId))
            .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
            .map((asset) => [asset.id, asset]),
        ).values(),
      );

      const relatedEvidence = (
        strategy.relatedEvidenceIds && strategy.relatedEvidenceIds.length > 0
          ? strategy.relatedEvidenceIds
              .map((evidenceId) => evidenceById.get(evidenceId))
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
          : evidenceItems.filter((item) => item.relatedAssetIds.some((assetId) => relatedAssetIds.includes(assetId)))
      ).slice(0, 8);

      const relatedDecisions = (
        strategy.relatedDecisionIds && strategy.relatedDecisionIds.length > 0
          ? strategy.relatedDecisionIds
              .map((decisionId) => decisionById.get(decisionId))
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
          : decisions.filter((decision) => decision.assetIds.some((assetId) => relatedAssetIds.includes(assetId)))
      ).slice(0, 8);

      const relatedPortfolios = (
        strategy.relatedPortfolioIds && strategy.relatedPortfolioIds.length > 0
          ? strategy.relatedPortfolioIds
              .map((portfolioId) => portfolioById.get(portfolioId))
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
          : portfolios.filter((portfolio) =>
              portfolio.positions.some((position) => relatedAssetIds.includes(position.assetId)),
            )
      ).slice(0, 6);

      const relatedLeaderboard = leaderboardItems.filter((item) => {
        if (item.strategyId === strategy.strategyId) return true;
        return toText(item.strategyName) === toText(strategy.name);
      });

      return {
        strategy,
        lifecycleStatus,
        assetBucket,
        relatedAssets,
        relatedEvidence,
        relatedDecisions,
        relatedPortfolios,
        relatedLeaderboard,
        relatedEvidenceCount: relatedEvidence.length,
        relatedDecisionCount: relatedDecisions.length,
        relatedPortfolioCount: relatedPortfolios.length,
      };
    });
  }, [assetById, decisionById, evidenceById, portfolioById, strategies, assets, evidenceItems, decisions, portfolios, leaderboardItems]);

  const stats = useMemo(() => {
    const lifecycle = strategyViews.map((item) => item.lifecycleStatus);
    return {
      total: strategyViews.length,
      etfRotation: strategyViews.filter((item) => item.strategy.strategyType === "ETF_ROTATION").length,
      fundSelection: strategyViews.filter((item) => item.strategy.strategyType === "FUND_SELECTION").length,
      futuresTiming: strategyViews.filter((item) => item.strategy.strategyType === "FUTURES_TIMING").length,
      multiAsset: strategyViews.filter((item) => item.strategy.strategyType === "MULTI_ASSET_ALLOCATION").length,
      agentGenerated: strategyViews.filter((item) => item.strategy.strategyType === "AGENT_GENERATED").length,
      running: lifecycle.filter((status) => status === "RUNNING").length,
      verified: lifecycle.filter((status) => status === "VERIFIED").length,
      avgReturn: average(strategyViews.map((item) => item.strategy.backtestSummary.totalReturn)),
      avgDrawdown: average(strategyViews.map((item) => item.strategy.backtestSummary.maxDrawdown)),
    };
  }, [strategyViews]);

  const filteredStrategies = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return strategyViews
      .filter((item) => {
        const strategy = item.strategy;
        const typePass = typeFilter === "ALL" || strategy.strategyType === typeFilter;
        const stylePass = styleFilter === "ALL" || strategy.styleLabel === styleFilter;
        const assetPass =
          assetFilter === "ALL" ||
          (assetFilter === "MULTI_ASSET"
            ? item.assetBucket === "MULTI_ASSET"
            : strategy.assetTypes.includes(assetFilter));
        const statusPass = statusFilter === "ALL" || item.lifecycleStatus === statusFilter;
        const queryStrategyPass = !queryStrategyId || strategy.strategyId === queryStrategyId;

        const searchableText = [
          strategy.name,
          strategy.description,
          strategy.styleLabel,
          strategy.style,
          strategy.strategyType,
          strategy.rules.map((rule) => `${rule.name} ${rule.expression} ${rule.note ?? ""}`).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        const searchPass = keyword.length === 0 || searchableText.includes(keyword);

        return typePass && stylePass && assetPass && statusPass && queryStrategyPass && searchPass;
      })
      .sort((a, b) => b.strategy.backtestSummary.totalReturn - a.strategy.backtestSummary.totalReturn);
  }, [assetFilter, queryStrategyId, searchKeyword, statusFilter, strategyViews, styleFilter, typeFilter]);

  useEffect(() => {
    if (filteredStrategies.length === 0) {
      setSelectedStrategyId(null);
      return;
    }
    const exists = selectedStrategyId && filteredStrategies.some((item) => item.strategy.strategyId === selectedStrategyId);
    if (!exists) {
      setSelectedStrategyId(filteredStrategies[0].strategy.strategyId);
    }
  }, [filteredStrategies, selectedStrategyId]);

  const selected = useMemo(() => {
    if (filteredStrategies.length === 0) return null;
    return filteredStrategies.find((item) => item.strategy.strategyId === selectedStrategyId) ?? filteredStrategies[0];
  }, [filteredStrategies, selectedStrategyId]);

  const styleDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredStrategies.forEach((item) => map.set(item.strategy.styleLabel, (map.get(item.strategy.styleLabel) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [filteredStrategies]);

  const typeDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredStrategies.forEach((item) => map.set(item.strategy.strategyType, (map.get(item.strategy.strategyType) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [filteredStrategies]);

  const selectedBacktestBars = useMemo(() => {
    if (!selected) return [];
    const summary = selected.strategy.backtestSummary;
    const bars = [
      { name: "Total Return", value: summary.totalReturn, display: formatPercent(summary.totalReturn, 1), color: "bg-emerald-500" },
      { name: "Annualized Return", value: summary.annualizedReturn, display: formatPercent(summary.annualizedReturn, 1), color: "bg-blue-500" },
      { name: "Max Drawdown", value: summary.maxDrawdown, display: formatPercent(summary.maxDrawdown, 1), color: "bg-rose-500" },
      { name: "Sharpe", value: summary.sharpe * 10, display: summary.sharpe.toFixed(2), color: "bg-amber-500" },
    ];
    const maxAbs = Math.max(...bars.map((item) => Math.abs(item.value)), 1);
    return bars.map((item) => ({ ...item, width: normalizeBar(item.value, maxAbs) }));
  }, [selected]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      {isLoadingStrategies ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">正在加载策略数据...</CardContent>
        </Card>
      ) : null}

      {strategyError ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Strategy API 加载失败：{strategyError}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>策略总数</CardDescription><CardTitle className="text-lg">{stats.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>ETF 轮动策略</CardDescription><CardTitle className="text-lg">{stats.etfRotation}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>基金筛选策略</CardDescription><CardTitle className="text-lg">{stats.fundSelection}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>期货择时策略</CardDescription><CardTitle className="text-lg">{stats.futuresTiming}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>多资产配置策略</CardDescription><CardTitle className="text-lg">{stats.multiAsset}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Agent 生成策略</CardDescription><CardTitle className="text-lg">{stats.agentGenerated}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>运行中策略</CardDescription><CardTitle className="text-lg">{stats.running}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>已验证策略</CardDescription><CardTitle className="text-lg">{stats.verified}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均回测收益</CardDescription><CardTitle className="text-lg">{formatPercent(stats.avgReturn, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均最大回撤</CardDescription><CardTitle className="text-lg">{formatPercent(stats.avgDrawdown, 1)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选区</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">策略类型</p>
            <div className="flex flex-wrap gap-2">
              {STRATEGY_TYPE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={typeFilter === filter ? "default" : "outline"} onClick={() => setTypeFilter(filter)}>
                  {filter}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">策略风格</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={styleFilter === filter ? "default" : "outline"} onClick={() => setStyleFilter(filter)}>
                  {filter}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">资产类型</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_TYPE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={assetFilter === filter ? "default" : "outline"} onClick={() => setAssetFilter(filter)}>
                  {filter}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">状态</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={statusFilter === filter ? "default" : "outline"} onClick={() => setStatusFilter(filter)}>
                  {STATUS_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">搜索</p>
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索 strategy name / description / style / rule"
              className="w-full md:max-w-md h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {filteredStrategies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配策略</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-3 space-y-3">
            {filteredStrategies.map((item) => {
              const strategy = item.strategy;
              return (
                <Card key={strategy.strategyId}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{strategy.name}</CardTitle>
                        <CardDescription>{strategy.description}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{strategy.strategyType}</Badge>
                        <Badge variant="outline">{strategy.styleLabel}</Badge>
                        <Badge variant={STATUS_BADGE[item.lifecycleStatus]}>{STATUS_LABEL[item.lifecycleStatus]}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1 text-muted-foreground">
                      <p>strategyId: {strategy.strategyId}</p>
                      <p>ownerAgentId: {strategy.ownerAgentId}</p>
                      <p>assetTypes: {strategy.assetTypes.join(" / ")}</p>
                      <p>totalReturn: {formatPercent(strategy.backtestSummary.totalReturn, 1)}</p>
                      <p>annualizedReturn: {formatPercent(strategy.backtestSummary.annualizedReturn, 1)}</p>
                      <p>maxDrawdown: {formatPercent(strategy.backtestSummary.maxDrawdown, 1)}</p>
                      <p>sharpe: {strategy.backtestSummary.sharpe.toFixed(2)}</p>
                      <p>winRate: {formatPercent(strategy.backtestSummary.winRate, 1)}</p>
                      <p>turnover: {formatPercent(strategy.backtestSummary.turnover ?? 0, 1)}</p>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p>rules: {strategy.rules.slice(0, 2).map((rule) => rule.name).join(" / ") || "无"}</p>
                      <p>
                        relatedEvidenceIds: {item.relatedEvidenceCount} · relatedDecisionIds: {item.relatedDecisionCount} · relatedPortfolioIds:{" "}
                        {item.relatedPortfolioCount}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant={selectedStrategyId === strategy.strategyId ? "default" : "outline"} onClick={() => setSelectedStrategyId(strategy.strategyId)}>
                        查看详情
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { strategyId: strategy.strategyId })}>
                        查看排行榜表现
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { strategyId: strategy.strategyId })}>
                        应用到组合
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="xl:col-span-2 space-y-3">
            {!selected ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">请选择策略查看详情。</CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">策略详情面板</CardTitle>
                    <CardDescription>{selected.strategy.strategyId}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">1. 策略基本信息</p>
                      <p className="text-muted-foreground">name: {selected.strategy.name}</p>
                      <p className="text-muted-foreground">strategyType: {selected.strategy.strategyType}</p>
                      <p className="text-muted-foreground">style: {selected.strategy.styleLabel}</p>
                      <p className="text-muted-foreground">assetTypes: {selected.strategy.assetTypes.join(" / ")}</p>
                      <p className="text-muted-foreground">status: {STATUS_LABEL[selected.lifecycleStatus]}</p>
                      <p className="text-muted-foreground">ownerAgentId: {selected.strategy.ownerAgentId}</p>
                      <p className="text-muted-foreground">description: {selected.strategy.description}</p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">2. 策略规则</p>
                      {selected.strategy.rules.map((rule) => (
                        <div key={rule.ruleId} className="rounded border p-2 text-muted-foreground">
                          <p>{rule.name}</p>
                          <p>{rule.expression}</p>
                          <p>{rule.note ?? "-"}</p>
                        </div>
                      ))}
                      <p className="text-muted-foreground">trigger conditions: {(selected.strategy.triggerConditions ?? []).join(" / ") || "-"}</p>
                      <p className="text-muted-foreground">rebalance frequency: {selected.strategy.rebalanceFrequency ?? "-"}</p>
                      <p className="text-muted-foreground">risk constraints: {(selected.strategy.riskConstraints ?? []).join(" / ") || "-"}</p>
                      <p className="text-muted-foreground">observation indicators: {(selected.strategy.observationIndicators ?? []).join(" / ") || "-"}</p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">3. 回测摘要</p>
                      <p className="text-muted-foreground">totalReturn: {formatPercent(selected.strategy.backtestSummary.totalReturn, 1)}</p>
                      <p className="text-muted-foreground">annualizedReturn: {formatPercent(selected.strategy.backtestSummary.annualizedReturn, 1)}</p>
                      <p className="text-muted-foreground">maxDrawdown: {formatPercent(selected.strategy.backtestSummary.maxDrawdown, 1)}</p>
                      <p className="text-muted-foreground">volatility: {formatPercent(selected.strategy.backtestSummary.volatility, 1)}</p>
                      <p className="text-muted-foreground">sharpe: {selected.strategy.backtestSummary.sharpe.toFixed(2)}</p>
                      <p className="text-muted-foreground">winRate: {formatPercent(selected.strategy.backtestSummary.winRate, 1)}</p>
                      <p className="text-muted-foreground">turnover: {formatPercent(selected.strategy.backtestSummary.turnover ?? 0, 1)}</p>
                      <p className="text-muted-foreground">benchmark: {selected.strategy.backtestSummary.benchmark ?? "-"}</p>
                      <p className="text-muted-foreground">excessReturn: {formatPercent(selected.strategy.backtestSummary.excessReturn ?? 0, 1)}</p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">4. 风险说明</p>
                      <p className="text-muted-foreground">适用场景：{(selected.strategy.applicableScenarios ?? []).join(" / ") || "-"}</p>
                      <p className="text-muted-foreground">失效条件：{(selected.strategy.invalidationConditions ?? []).join(" / ") || "-"}</p>
                      <p className="text-muted-foreground">主要风险：{(selected.strategy.majorRisks ?? []).join(" / ") || "-"}</p>
                      <p className="text-muted-foreground">监控指标：{(selected.strategy.observationIndicators ?? []).join(" / ") || "-"}</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {selected ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">回测指标条形图</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selectedBacktestBars.map((bar) => (
                  <div key={bar.name} className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{bar.name}</span>
                      <span>{bar.display}</span>
                    </div>
                    <div className="h-2 rounded bg-muted">
                      <div className={`h-2 rounded ${bar.color}`} style={{ width: `${bar.width}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">策略风格分布</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {styleDistribution.map((row) => (
                  <div key={row.name} className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{row.name}</span>
                      <span>{row.count}</span>
                    </div>
                    <div className="h-2 rounded bg-muted">
                      <div
                        className="h-2 rounded bg-indigo-500"
                        style={{ width: `${normalizeBar(row.count, Math.max(...styleDistribution.map((item) => item.count), 1))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">策略类型分布</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {typeDistribution.map((row) => (
                  <div key={row.name} className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{row.name}</span>
                      <span>{row.count}</span>
                    </div>
                    <div className="h-2 rounded bg-muted">
                      <div
                        className="h-2 rounded bg-cyan-500"
                        style={{ width: `${normalizeBar(row.count, Math.max(...typeDistribution.map((item) => item.count), 1))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Related Assets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedAssets.length === 0 ? (
                  <p className="text-muted-foreground">无关联资产</p>
                ) : (
                  selected.relatedAssets.map((asset) => (
                    <div key={asset.id} className="rounded border p-2 space-y-1">
                      <p className="font-medium">{asset.symbol} · {asset.name}</p>
                      <p className="text-muted-foreground">{asset.assetType} · {asset.tags.slice(0, 3).join(" / ")}</p>
                      <Button size="sm" variant="outline" onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}>
                        查看资产
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Related Evidence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedEvidence.length === 0 ? (
                  <p className="text-muted-foreground">无关联证据</p>
                ) : (
                  selected.relatedEvidence.map((item) => (
                    <div key={item.id} className="rounded border p-2 space-y-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground">{item.evidenceType} · quality {item.qualityScore} · {item.sourceName}</p>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: item.id })}>
                        查看证据
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Related Decisions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedDecisions.length === 0 ? (
                  <p className="text-muted-foreground">无关联决策</p>
                ) : (
                  selected.relatedDecisions.map((decision) => (
                    <div key={decision.decisionId} className="rounded border p-2 space-y-1">
                      <p className="font-medium">{decision.decisionId}</p>
                      <p className="text-muted-foreground">
                        {decision.action} · confidence {(decision.confidence * 100).toFixed(0)}%
                      </p>
                      <p className="text-muted-foreground">
                        actualOutcome: {decision.actualOutcome ? decision.actualOutcome.status : "PENDING"}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { decisionId: decision.decisionId })}>
                        查看决策归因
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Related Portfolios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedPortfolios.length === 0 ? (
                  <p className="text-muted-foreground">无关联组合</p>
                ) : (
                  selected.relatedPortfolios.map((portfolio) => (
                    <div key={portfolio.portfolioId} className="rounded border p-2 space-y-1">
                      <p className="font-medium">{portfolio.name}</p>
                      <p className="text-muted-foreground">
                        {portfolio.portfolioId} · {portfolio.objective}
                      </p>
                      <p className="text-muted-foreground">riskLevel: {portfolio.riskLevel}</p>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { portfolioId: portfolio.portfolioId })}>
                        查看组合
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Leaderboard Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedLeaderboard.length === 0 ? (
                  <p className="text-muted-foreground">暂无排行榜表现记录</p>
                ) : (
                  selected.relatedLeaderboard.map((item) => (
                    <div key={`${item.traderId}-${item.strategyId}`} className="rounded border p-2 space-y-1">
                      <p className="font-medium">rank {item.rank} · {item.traderName}</p>
                      <p className="text-muted-foreground">
                        return {formatPercent(item.totalReturn, 1)} · maxDD {formatPercent(item.maxDrawdown, 1)} · sharpe {item.sharpe.toFixed(2)}
                      </p>
                      <p className="text-muted-foreground">riskScore: {item.riskScore}</p>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { strategyId: item.strategyId })}>
                        查看排行榜表现
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">策略动作区</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline">复制策略</Button>
              <Button size="sm" variant="outline">编辑规则</Button>
              <Button size="sm" variant="outline">运行回测</Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { strategyId: selected.strategy.strategyId })}>
                应用到组合
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/agent-lab", { strategyId: selected.strategy.strategyId })}>
                发起 Agent 优化
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { strategyId: selected.strategy.strategyId })}>
                查看决策归因
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { strategyId: selected.strategy.strategyId })}>
                查看排行榜表现
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}

    </div>
  );
}
