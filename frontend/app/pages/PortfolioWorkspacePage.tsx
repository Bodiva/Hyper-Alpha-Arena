import { useEffect, useMemo, useState } from "react";
import type { Asset, AssetType } from "@/entities/asset/model";
import type { Decision } from "@/entities/decision/model";
import type { Portfolio } from "@/entities/portfolio/model";
import type { Strategy } from "@/entities/strategy/model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPortfolioAssetsAsync,
  getPortfolioByIdAsync,
  getPortfolioDecisionsAsync,
  getPortfolioHoldingsAsync,
  getPortfolioRecommendationsAsync,
  getPortfolioStrategiesAsync,
  listPortfoliosAsync,
} from "@/entities/portfolio/api";
import { submitAgentRunAsync } from "@/entities/agent/api";
import { listAssets } from "@/entities/asset/api";
import { listDecisions } from "@/entities/decision/api";
import { listStrategies } from "@/entities/strategy/api";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

const ACTION_LABEL: Record<"INCREASE" | "DECREASE" | "REPLACE" | "HOLD", string> = {
  INCREASE: "增配",
  DECREASE: "减配",
  REPLACE: "替换",
  HOLD: "持有",
};

const STATUS_LABEL: Record<NonNullable<Portfolio["status"]>, string> = {
  ACTIVE: "运行中",
  WATCH: "观察中",
  REBALANCING: "调仓中",
};

const RISK_BADGE: Record<Portfolio["riskLevel"], "default" | "secondary" | "destructive"> = {
  LOW: "default",
  MEDIUM: "secondary",
  HIGH: "destructive",
};

const formatPercent = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;
const formatMoney = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const formatDateTime = (timestamp?: string): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const normalizeExposureMap = (map: Map<string, number>): Array<{ name: string; value: number }> => {
  const rows = Array.from(map.entries()).filter(([, value]) => value > 0);
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return [];
  return rows
    .map(([name, value]) => ({ name, value: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
};

const mapMarketBucket = (market: string): string => {
  if (market.includes("A股")) return "A股";
  if (market.includes("港")) return "港股";
  if (market.includes("美")) return "美股";
  if (market.includes("商品")) return "商品";
  if (market.includes("债")) return "债券";
  return "其他";
};

const styleFromTags = (tags: string[]): string[] => {
  const styleMap: Array<{ key: string; style: string }> = [
    { key: "红利", style: "Dividend" },
    { key: "成长", style: "Growth" },
    { key: "低波", style: "Low Volatility" },
    { key: "宏观", style: "Macro" },
    { key: "商品", style: "Commodity" },
    { key: "债券", style: "Bond" },
    { key: "value", style: "Value" },
    { key: "momentum", style: "Momentum" },
  ];
  return styleMap.filter((item) => tags.some((tag) => tag.toLowerCase().includes(item.key.toLowerCase()))).map((item) => item.style);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
};

const mapPortfolioRiskPreference = (riskLevel?: Portfolio["riskLevel"]): "conservative" | "balanced" | "aggressive" => {
  if (riskLevel === "LOW") return "conservative";
  if (riskLevel === "HIGH") return "aggressive";
  return "balanced";
};

export default function PortfolioWorkspacePage() {
  const apiMode = getApiMode();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioDetail, setSelectedPortfolioDetail] = useState<Portfolio | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [diagnosisSubmitStatus, setDiagnosisSubmitStatus] = useState<"idle" | "loading" | "error">("idle");
  const [diagnosisSubmitError, setDiagnosisSubmitError] = useState<string | null>(null);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedPortfolioId = initialRouteParams.get("portfolioId") ?? undefined;
  const linkedAssetId = initialRouteParams.get("assetId") ?? undefined;
  const linkedRunId = initialRouteParams.get("runId") ?? undefined;

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(linkedPortfolioId ?? "");

  useEffect(() => {
    let cancelled = false;

    const loadPortfolios = async () => {
      setIsLoadingPortfolios(true);
      setPortfolioError(null);
      try {
        const nextPortfolios = await listPortfoliosAsync({ limit: 100 });
        if (cancelled) return;
        setPortfolios(nextPortfolios);
        setSelectedPortfolioId((current) => current || linkedPortfolioId || nextPortfolios[0]?.portfolioId || "");
      } catch (error) {
        if (!cancelled) {
          setPortfolioError(getErrorMessage(error));
          setPortfolios([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPortfolios(false);
        }
      }
    };

    loadPortfolios();

    return () => {
      cancelled = true;
    };
  }, [linkedPortfolioId]);

  useEffect(() => {
    if (!selectedPortfolioId) return;

    let cancelled = false;

    const loadSelectedPortfolioContext = async () => {
      setPortfolioError(null);
      try {
        const [detail, holdings, recommendations, relatedAssets, relatedStrategies, relatedDecisions] = await Promise.all([
          getPortfolioByIdAsync(selectedPortfolioId),
          getPortfolioHoldingsAsync(selectedPortfolioId),
          getPortfolioRecommendationsAsync(selectedPortfolioId),
          apiMode === "real" ? getPortfolioAssetsAsync(selectedPortfolioId) : Promise.resolve(listAssets()),
          apiMode === "real" ? getPortfolioStrategiesAsync(selectedPortfolioId) : Promise.resolve(listStrategies()),
          apiMode === "real" ? getPortfolioDecisionsAsync(selectedPortfolioId) : Promise.resolve(listDecisions()),
        ]);

        if (cancelled) return;

        setSelectedPortfolioDetail(
          detail
            ? {
                ...detail,
                positions: holdings.length > 0 ? holdings : detail.positions,
                rebalanceSuggestions:
                  recommendations.length > 0 ? recommendations : detail.rebalanceSuggestions,
              }
            : null,
        );
        setAssets(relatedAssets);
        setStrategies(relatedStrategies);
        setDecisions(relatedDecisions);
      } catch (error) {
        if (!cancelled) {
          setPortfolioError(getErrorMessage(error));
          setSelectedPortfolioDetail(null);
          if (apiMode === "real") {
            setAssets([]);
            setStrategies([]);
            setDecisions([]);
          }
        }
      }
    };

    loadSelectedPortfolioContext();

    return () => {
      cancelled = true;
    };
  }, [apiMode, selectedPortfolioId]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedPortfolio = useMemo(
    () => selectedPortfolioDetail ?? portfolios.find((item) => item.portfolioId === selectedPortfolioId) ?? portfolios[0],
    [selectedPortfolioDetail, selectedPortfolioId, portfolios],
  );

  const quickSelection = useMemo(() => {
    const findBy = (predicate: (portfolio: Portfolio) => boolean) => portfolios.find(predicate);
    return {
      etf: findBy((portfolio) => /ETF/i.test(portfolio.name)),
      multiAsset: findBy((portfolio) => /Multi|多资产/i.test(portfolio.name)),
      stable: findBy((portfolio) => portfolio.riskLevel !== "HIGH"),
      aggressive: findBy((portfolio) => portfolio.riskLevel === "HIGH"),
    };
  }, [portfolios]);

  const derived = useMemo(() => {
    if (!selectedPortfolio) return null;

    const totalAsset = selectedPortfolio.positions.reduce((sum, position) => sum + position.marketValue, 0);
    const totalWeight = selectedPortfolio.positions.reduce((sum, position) => sum + position.weight, 0);
    const cashOtherWeight = Math.max(0, 1 - totalWeight);
    const maxSingleWeight = Math.max(...selectedPortfolio.positions.map((position) => position.weight), 0);

    const assetTypeWeight: Record<AssetType | "CASH_OTHER", number> = {
      ETF: 0,
      FUND: 0,
      FUTURE: 0,
      INDEX: 0,
      CASH_OTHER: cashOtherWeight,
    };

    selectedPortfolio.positions.forEach((position) => {
      const assetType = assetById.get(position.assetId)?.assetType;
      if (assetType) {
        assetTypeWeight[assetType] += position.weight;
      }
    });

    const riskRaw = selectedPortfolio.positions.map((position) => {
      const asset = assetById.get(position.assetId);
      const assetRiskFactor =
        asset?.assetType === "FUTURE"
          ? 1.55
          : asset?.assetType === "ETF"
            ? 1
            : asset?.assetType === "FUND"
              ? 0.9
              : 1.1;
      return position.weight * assetRiskFactor * (1 + Math.abs(position.unrealizedPnlPct) / 15);
    });
    const riskRawTotal = riskRaw.reduce((sum, value) => sum + value, 0) || 1;

    const suggestionByAsset = new Map(selectedPortfolio.rebalanceSuggestions.map((item) => [item.assetId, item]));
    const positions = selectedPortfolio.positions.map((position, index) => {
      const asset = assetById.get(position.assetId);
      const riskContribution = (riskRaw[index] / riskRawTotal) * 100;
      const returnContribution = position.unrealizedPnlPct * position.weight;
      return {
        ...position,
        assetType: asset?.assetType ?? "ETF",
        riskContribution,
        returnContribution,
        suggestion: suggestionByAsset.get(position.assetId),
      };
    });

    const topHoldings = [...positions].sort((a, b) => b.weight - a.weight).slice(0, 5);
    const topRisk = [...positions].sort((a, b) => b.riskContribution - a.riskContribution).slice(0, 5);

    const sectorMap = new Map<string, number>();
    const styleMap = new Map<string, number>();
    const marketMap = new Map<string, number>();

    positions.forEach((position) => {
      const asset = assetById.get(position.assetId);
      if (!asset) return;

      marketMap.set(mapMarketBucket(asset.market), (marketMap.get(mapMarketBucket(asset.market)) ?? 0) + position.weight);

      if (asset.assetType === "ETF") {
        asset.profile.exposures
          .filter((item) => item.dimension === "sector")
          .forEach((item) => sectorMap.set(item.name, (sectorMap.get(item.name) ?? 0) + position.weight * (item.value / 100)));
        asset.profile.exposures
          .filter((item) => item.dimension === "style")
          .forEach((item) => styleMap.set(item.name, (styleMap.get(item.name) ?? 0) + position.weight * (item.value / 100)));
      } else if (asset.assetType === "FUND") {
        asset.profile.holdings.forEach((holding) => {
          if (holding.sector) {
            sectorMap.set(holding.sector, (sectorMap.get(holding.sector) ?? 0) + position.weight * (holding.weight / 100));
          }
        });
        asset.profile.styleExposure.forEach((item) => {
          styleMap.set(item.name, (styleMap.get(item.name) ?? 0) + position.weight * (item.value / 100));
        });
      } else if (asset.assetType === "INDEX") {
        asset.profile.sectorExposure.forEach((item) => {
          sectorMap.set(item.name, (sectorMap.get(item.name) ?? 0) + position.weight * (item.value / 100));
        });
        asset.profile.styleExposure.forEach((item) => {
          styleMap.set(item.name, (styleMap.get(item.name) ?? 0) + position.weight * (item.value / 100));
        });
      } else if (asset.assetType === "FUTURE") {
        const sector = /crude|oil|SC/i.test(asset.symbol) ? "Energy" : "Equity Index";
        sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + position.weight);
        styleMap.set("Commodity", (styleMap.get("Commodity") ?? 0) + (/SC/i.test(asset.symbol) ? position.weight : 0));
        styleMap.set("Macro", (styleMap.get("Macro") ?? 0) + position.weight * 0.5);
      }

      styleFromTags(asset.tags).forEach((style) => {
        styleMap.set(style, (styleMap.get(style) ?? 0) + position.weight * 0.2);
      });
    });

    const sectorExposure = normalizeExposureMap(sectorMap).slice(0, 8);
    const styleExposure = normalizeExposureMap(styleMap).slice(0, 8);
    const marketExposure = normalizeExposureMap(marketMap);

    const liquidityRisk = (() => {
      const score = positions.reduce((sum, position) => {
        const asset = assetById.get(position.assetId);
        if (!asset) return sum + position.weight * 40;
        if (asset.assetType === "ETF") return sum + position.weight * (100 - asset.profile.liquidityScore);
        if (asset.assetType === "FUTURE") return sum + position.weight * 45;
        if (asset.assetType === "FUND") return sum + position.weight * 38;
        return sum + position.weight * 35;
      }, 0);
      return Math.min(100, Math.max(0, score));
    })();

    const concentrationRisk = maxSingleWeight * 100;
    const correlationRisk = Math.min(100, 20 + Math.max(assetTypeWeight.ETF, assetTypeWeight.FUND, assetTypeWeight.FUTURE, assetTypeWeight.INDEX) * 80);
    const scenarioRisk = Math.min(100, 20 + assetTypeWeight.FUTURE * 120 + selectedPortfolio.riskMetrics.maxDrawdown * 2);
    const riskScore = Math.min(
      100,
      0.3 * selectedPortfolio.riskMetrics.volatility +
        0.3 * selectedPortfolio.riskMetrics.maxDrawdown +
        0.2 * selectedPortfolio.riskMetrics.var95 * 10 +
        0.2 * concentrationRisk,
    );

    const relatedDecisions = decisions.filter((decision) => {
      if (decision.portfolioId !== selectedPortfolio.portfolioId) return false;
      if (linkedAssetId && !decision.assetIds.includes(linkedAssetId)) return false;
      if (linkedRunId && decision.runId !== linkedRunId) return false;
      return true;
    });
    const portfolioAssetTypes = new Set(positions.map((position) => position.assetType as AssetType));
    const relatedStrategies = strategies.filter((strategy) => strategy.assetTypes.some((assetType) => portfolioAssetTypes.has(assetType)));

    const diagnosisStrengths: string[] = [];
    const diagnosisRisks: string[] = [];
    const watchMetrics: string[] = [];

    if (selectedPortfolio.riskMetrics.sharpe >= 1) diagnosisStrengths.push("风险调整后收益处于较优区间（Sharpe >= 1）");
    if (selectedPortfolio.positions.length >= 4) diagnosisStrengths.push("组合持仓分散度较好，具备多来源收益结构");
    if (assetTypeWeight.FUTURE > 0 && assetTypeWeight.ETF > 0) diagnosisStrengths.push("具备现货与期货联合配置能力");
    if (diagnosisStrengths.length === 0) diagnosisStrengths.push("组合结构清晰，具备持续优化空间");

    if (concentrationRisk > 35) diagnosisRisks.push("单一资产权重偏高，集中度风险需要控制");
    if (liquidityRisk > 30) diagnosisRisks.push("流动性风险偏高，建议预留更多防御性仓位");
    if (scenarioRisk > 55) diagnosisRisks.push("情景风险暴露偏高，需增加极端事件缓冲");
    if (diagnosisRisks.length === 0) diagnosisRisks.push("当前风险分布可控，仍需保持事件监控");

    watchMetrics.push("组合波动率与最大回撤同步变化");
    watchMetrics.push("前五大持仓风险贡献占比");
    watchMetrics.push("商品与权益相关性变化");
    if (assetTypeWeight.FUTURE > 0.2) watchMetrics.push("期货仓位事件窗口下的VaR变化");

    const shouldRunPortfolioAgent = riskScore >= 55 || selectedPortfolio.rebalanceSuggestions.length > 0;
    const nextAgentSuggestion = shouldRunPortfolioAgent
      ? "建议发起组合诊断 Agent Run，重点验证调仓建议与风险预算一致性。"
      : "建议保持例行周度复核，并跟踪关键暴露指标。";

    return {
      totalAsset,
      assetTypeWeight,
      maxSingleWeight,
      positions,
      topHoldings,
      topRisk,
      sectorExposure,
      styleExposure,
      marketExposure,
      liquidityRisk,
      concentrationRisk,
      correlationRisk,
      scenarioRisk,
      riskScore,
      relatedDecisions,
      relatedStrategies,
      diagnosisStrengths,
      diagnosisRisks,
      watchMetrics,
      shouldRunPortfolioAgent,
      nextAgentSuggestion,
      cashOtherWeight,
    };
  }, [assetById, linkedAssetId, linkedRunId, selectedPortfolio, decisions, strategies]);

  const handleSubmitPortfolioDiagnosis = async () => {
    if (!selectedPortfolio) return;

    setDiagnosisSubmitStatus("loading");
    setDiagnosisSubmitError(null);

    try {
      const run = await submitAgentRunAsync({
        portfolioId: selectedPortfolio.portfolioId,
        taskType: "portfolio_diagnosis",
        question: "请诊断当前组合的资产配置、风险暴露、调仓建议和后续观察指标",
        horizon: "medium_term",
        riskPreference: mapPortfolioRiskPreference(selectedPortfolio.riskLevel),
        runnerConfig: {
          runnerType: apiMode === "real" ? "qwen" : "stub",
          modelProvider: apiMode === "real" ? "qwen" : "none",
          modelName: apiMode === "real" ? "qwen-plus" : "none",
          enableStreaming: true,
        },
      });

      if (apiMode !== "real") {
        setDiagnosisSubmitError("当前为 Mock Mode，已跳转到本地样例 Agent Run。");
      }
      setDiagnosisSubmitStatus("idle");
      navigateTo(`/agent-lab/runs/${encodeURIComponent(run.runId)}`);
    } catch (error) {
      setDiagnosisSubmitStatus("error");
      setDiagnosisSubmitError(getErrorMessage(error));
    }
  };

  if (portfolios.length === 0 || !selectedPortfolio || !derived) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <ResearchWorkspaceNav />
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xl">Portfolio Workspace 组合工作台</CardTitle>
              <Badge variant={apiMode === "real" ? "default" : "secondary"}>
                Data Mode: {apiMode === "real" ? "Real API / Static Portfolio Store" : "Mock"}
              </Badge>
            </div>
            <CardDescription>连接资产研究、Agent 决策、风险暴露和调仓建议</CardDescription>
          </CardHeader>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">
              {isLoadingPortfolios ? "正在加载组合数据" : "暂无组合数据"}
            </p>
            <p className="text-xs text-muted-foreground">
              {portfolioError ? `Portfolio API 加载失败：${portfolioError}` : "请创建组合或导入持仓后查看组合工作台。"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl">Portfolio Workspace 组合工作台</CardTitle>
            <Badge variant={apiMode === "real" ? "default" : "secondary"}>
              Data Mode: {apiMode === "real" ? "Real API / Static Portfolio Store" : "Mock"}
            </Badge>
          </div>
          <CardDescription>连接资产研究、Agent 决策、风险暴露和调仓建议</CardDescription>
          <p className="text-xs text-muted-foreground">从单资产判断升级到组合层面的配置、风险和复盘闭环。</p>
        </CardHeader>
      </Card>

      {isLoadingPortfolios ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">正在加载组合数据...</CardContent>
        </Card>
      ) : null}

      {portfolioError ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Portfolio API 加载失败：{portfolioError}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">组合选择区</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selectedPortfolioId === quickSelection.etf?.portfolioId ? "default" : "outline"}
              disabled={!quickSelection.etf}
              onClick={() => quickSelection.etf && setSelectedPortfolioId(quickSelection.etf.portfolioId)}
            >
              ETF 组合
            </Button>
            <Button
              size="sm"
              variant={selectedPortfolioId === quickSelection.multiAsset?.portfolioId ? "default" : "outline"}
              disabled={!quickSelection.multiAsset}
              onClick={() => quickSelection.multiAsset && setSelectedPortfolioId(quickSelection.multiAsset.portfolioId)}
            >
              多资产组合
            </Button>
            <Button
              size="sm"
              variant={selectedPortfolioId === quickSelection.stable?.portfolioId ? "default" : "outline"}
              disabled={!quickSelection.stable}
              onClick={() => quickSelection.stable && setSelectedPortfolioId(quickSelection.stable.portfolioId)}
            >
              稳健组合
            </Button>
            <Button
              size="sm"
              variant={selectedPortfolioId === quickSelection.aggressive?.portfolioId ? "default" : "outline"}
              disabled={!quickSelection.aggressive}
              onClick={() => quickSelection.aggressive && setSelectedPortfolioId(quickSelection.aggressive.portfolioId)}
            >
              进取组合
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {portfolios.map((portfolio) => (
              <Button
                key={portfolio.portfolioId}
                size="sm"
                variant={selectedPortfolioId === portfolio.portfolioId ? "default" : "outline"}
                onClick={() => setSelectedPortfolioId(portfolio.portfolioId)}
              >
                {portfolio.name}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2 text-xs text-muted-foreground">
            <p>portfolioId: {selectedPortfolio.portfolioId}</p>
            <p>name: {selectedPortfolio.name}</p>
            <p>objective: {selectedPortfolio.objective}</p>
            <p>
              riskLevel: <Badge variant={RISK_BADGE[selectedPortfolio.riskLevel]}>{selectedPortfolio.riskLevel}</Badge>
            </p>
            <p>updatedAt: {formatDateTime(selectedPortfolio.updatedAt)}</p>
            <p>组合总资产: {formatMoney(derived.totalAsset)}</p>
            <p>当前状态: {selectedPortfolio.status ? STATUS_LABEL[selectedPortfolio.status] : "运行中（Mock）"}</p>
          </div>
          {linkedAssetId || linkedRunId ? (
            <p className="text-xs text-muted-foreground">
              当前链路上下文：
              {linkedAssetId ? ` assetId=${linkedAssetId}` : ""}
              {linkedRunId ? ` runId=${linkedRunId}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>持仓数量</CardDescription><CardTitle className="text-lg">{selectedPortfolio.positions.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>最大单一资产权重</CardDescription><CardTitle className="text-lg">{formatPercent(derived.maxSingleWeight * 100, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>ETF 权重</CardDescription><CardTitle className="text-lg">{formatPercent(derived.assetTypeWeight.ETF * 100, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>基金权重</CardDescription><CardTitle className="text-lg">{formatPercent(derived.assetTypeWeight.FUND * 100, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>期货权重</CardDescription><CardTitle className="text-lg">{formatPercent(derived.assetTypeWeight.FUTURE * 100, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>现金/其他权重</CardDescription><CardTitle className="text-lg">{formatPercent(derived.cashOtherWeight * 100, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>组合波动率</CardDescription><CardTitle className="text-lg">{formatPercent(selectedPortfolio.riskMetrics.volatility, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>最大回撤</CardDescription><CardTitle className="text-lg">{formatPercent(selectedPortfolio.riskMetrics.maxDrawdown, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Sharpe</CardDescription><CardTitle className="text-lg">{selectedPortfolio.riskMetrics.sharpe.toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>风险评分</CardDescription><CardTitle className="text-lg">{derived.riskScore.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>调仓建议数量</CardDescription><CardTitle className="text-lg">{selectedPortfolio.rebalanceSuggestions.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>关联决策数量</CardDescription><CardTitle className="text-lg">{derived.relatedDecisions.length}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">持仓表</CardTitle>
          <CardDescription>持仓权重、收益贡献与风险贡献</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>symbol</TableHead>
                <TableHead>name</TableHead>
                <TableHead>assetType</TableHead>
                <TableHead>weight</TableHead>
                <TableHead>quantity/notional</TableHead>
                <TableHead>cost / marketValue</TableHead>
                <TableHead>unrealizedPnl</TableHead>
                <TableHead>riskContribution</TableHead>
                <TableHead>returnContribution</TableHead>
                <TableHead>action suggestion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {derived.positions.map((position) => (
                <TableRow key={position.assetId}>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => navigateTo(`/assets/${encodeURIComponent(position.assetId)}`)}>
                      {position.symbol}
                    </Button>
                  </TableCell>
                  <TableCell>{position.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{position.assetType}</Badge>
                  </TableCell>
                  <TableCell>{formatPercent(position.weight * 100, 1)}</TableCell>
                  <TableCell>{formatMoney(position.quantity)}</TableCell>
                  <TableCell>
                    {formatMoney(position.avgCost)} / {formatMoney(position.marketValue)}
                  </TableCell>
                  <TableCell>{formatPercent(position.unrealizedPnlPct, 2)}</TableCell>
                  <TableCell>{formatPercent(position.riskContribution, 1)}</TableCell>
                  <TableCell>{formatPercent(position.returnContribution, 2)}</TableCell>
                  <TableCell>
                    {position.suggestion
                      ? `${ACTION_LABEL[position.suggestion.action]} ${formatPercent(position.suggestion.fromWeight * 100, 1)} → ${formatPercent(position.suggestion.toWeight * 100, 1)}`
                      : "持有"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">资产类别配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {(["ETF", "FUND", "FUTURE", "INDEX"] as AssetType[]).map((type) => (
              <div key={type} className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{type}</span>
                  <span>{formatPercent(derived.assetTypeWeight[type] * 100, 1)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-blue-500" style={{ width: `${derived.assetTypeWeight[type] * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>CASH / OTHER</span>
                <span>{formatPercent(derived.cashOtherWeight * 100, 1)}</span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-slate-400" style={{ width: `${derived.cashOtherWeight * 100}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">前五大持仓权重</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.topHoldings.map((position) => (
              <div key={`holding-${position.assetId}`} className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{position.symbol}</span>
                  <span>{formatPercent(position.weight * 100, 1)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-emerald-500" style={{ width: `${position.weight * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">风险贡献 Top 5</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.topRisk.map((position) => (
              <div key={`risk-${position.assetId}`} className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{position.symbol}</span>
                  <span>{formatPercent(position.riskContribution, 1)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-rose-500" style={{ width: `${position.riskContribution}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">行业暴露</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.sectorExposure.map((item) => (
              <div key={`sector-${item.name}`} className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{item.name}</span>
                  <span>{formatPercent(item.value, 1)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-indigo-500" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">风格暴露</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.styleExposure.map((item) => (
              <div key={`style-${item.name}`} className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{item.name}</span>
                  <span>{formatPercent(item.value, 1)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-cyan-500" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">区域/市场暴露</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.marketExposure.map((item) => (
              <div key={`market-${item.name}`} className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{item.name}</span>
                  <span>{formatPercent(item.value, 1)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-amber-500" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">风险指标区</CardTitle>
          <CardDescription>风险预算与集中度诊断</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <div className="rounded border p-2"><p className="text-muted-foreground">volatility</p><p className="font-medium">{formatPercent(selectedPortfolio.riskMetrics.volatility, 1)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">maxDrawdown</p><p className="font-medium">{formatPercent(selectedPortfolio.riskMetrics.maxDrawdown, 1)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">VaR</p><p className="font-medium">{formatPercent(selectedPortfolio.riskMetrics.var95, 1)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">Sharpe</p><p className="font-medium">{selectedPortfolio.riskMetrics.sharpe.toFixed(2)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">concentration risk</p><p className="font-medium">{formatPercent(derived.concentrationRisk, 1)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">liquidity risk</p><p className="font-medium">{formatPercent(derived.liquidityRisk, 1)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">correlation risk</p><p className="font-medium">{formatPercent(derived.correlationRisk, 1)}</p></div>
            <div className="rounded border p-2"><p className="text-muted-foreground">scenario risk</p><p className="font-medium">{formatPercent(derived.scenarioRisk, 1)}</p></div>
          </div>
          <div className="rounded border p-2 text-muted-foreground space-y-1">
            <p>
              风险是否集中：{derived.concentrationRisk > 35 ? "是，单一资产权重较高" : "否，组合集中度可控"}。
            </p>
            <p>
              是否过度暴露：{derived.assetTypeWeight.FUTURE > 0.25 ? "期货暴露偏高，需关注回撤预算" : "资产类别暴露总体均衡"}。
            </p>
            <p>
              是否建议降波动/回撤：
              {selectedPortfolio.riskMetrics.volatility > 14 || selectedPortfolio.riskMetrics.maxDrawdown > 12
                ? "建议通过减仓高风险资产并提升防御仓位降波动。"
                : "当前波动和回撤在可接受范围。"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">调仓建议区</CardTitle>
          <CardDescription>调仓动作、依据与风险影响</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {selectedPortfolio.rebalanceSuggestions.map((item) => {
            const asset = assetById.get(item.assetId);
            return (
              <div key={`${item.assetId}-${item.action}`} className="rounded border p-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {ACTION_LABEL[item.action]} · {asset?.symbol ?? item.assetId}
                  </p>
                  <div className="flex gap-1">
                    <Badge variant="outline">{item.priority}</Badge>
                    <Badge variant="secondary">{item.status ?? "PENDING"}</Badge>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  currentWeight {formatPercent(item.fromWeight * 100, 1)} → targetWeight {formatPercent(item.toWeight * 100, 1)} · change{" "}
                  {formatPercent((item.toWeight - item.fromWeight) * 100, 1)}
                </p>
                <p className="text-muted-foreground">reason: {item.reason}</p>
                <p className="text-muted-foreground">expectedImpact: {item.expectedImpact ?? "占位"}</p>
                <p className="text-muted-foreground">riskImpact: {item.riskImpact ?? "占位"}</p>
                <div className="flex flex-wrap gap-1">
                  {(item.evidenceIds ?? []).map((id) => (
                    <Button key={`${item.assetId}-${id}`} size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: id })}>
                      evidence:{id}
                    </Button>
                  ))}
                  {(item.relatedDecisionIds ?? []).map((id) => (
                    <Button key={`${item.assetId}-${id}-decision`} size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { decisionId: id })}>
                      decision:{id}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">关联决策区</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.relatedDecisions.length === 0 ? (
              <p className="text-muted-foreground">暂无关联决策。</p>
            ) : (
              derived.relatedDecisions.map((decision) => (
                <div key={decision.decisionId} className="rounded border p-2 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{decision.decisionId}</p>
                    <Badge variant="outline">{decision.action}</Badge>
                  </div>
                  <p className="text-muted-foreground">confidence {(decision.confidence * 100).toFixed(0)}%</p>
                  <p className="text-muted-foreground">{decision.thesis}</p>
                  <p className="text-muted-foreground">
                    actualOutcome:{" "}
                    {decision.actualOutcome
                      ? `${decision.actualOutcome.status} · return ${formatPercent(decision.actualOutcome.realizedReturn, 1)}`
                      : "PENDING"}
                  </p>
                  <p className="text-muted-foreground">attribution: {decision.attribution.summary}</p>
                  <p className="text-muted-foreground">evidence count: {decision.evidenceIds.length}</p>
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
            <CardTitle className="text-base">相关策略区</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {derived.relatedStrategies.map((strategy) => (
              <div key={strategy.strategyId} className="rounded border p-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{strategy.name}</p>
                  <Badge variant="outline">{strategy.status}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {strategy.strategyType} · {strategy.styleLabel}
                </p>
                <p className="text-muted-foreground">assetTypes: {strategy.assetTypes.join(" / ")}</p>
                <p className="text-muted-foreground">
                  backtest: return {formatPercent(strategy.backtestSummary.totalReturn, 1)} · maxDD{" "}
                  {formatPercent(strategy.backtestSummary.maxDrawdown, 1)} · Sharpe {strategy.backtestSummary.sharpe.toFixed(2)}
                </p>
                <div className="pt-1">
                  <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { strategyId: strategy.strategyId, portfolioId: selectedPortfolio.portfolioId })}>
                    查看策略表现
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">组合诊断区</CardTitle>
          <CardDescription>组合优势、风险与下一步 Agent 组合分析建议</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-3 text-xs">
          <div className="rounded border p-2 space-y-1">
            <p className="font-medium">当前组合优势</p>
            {derived.diagnosisStrengths.map((item, index) => (
              <p key={`strength-${index}`} className="text-muted-foreground">{item}</p>
            ))}
          </div>
          <div className="rounded border p-2 space-y-1">
            <p className="font-medium">当前组合风险</p>
            {derived.diagnosisRisks.map((item, index) => (
              <p key={`risk-${index}`} className="text-muted-foreground">{item}</p>
            ))}
          </div>
          <div className="rounded border p-2 space-y-1">
            <p className="font-medium">建议关注指标</p>
            {derived.watchMetrics.map((item, index) => (
              <p key={`watch-${index}`} className="text-muted-foreground">{item}</p>
            ))}
          </div>
          <div className="rounded border p-2 space-y-1">
            <p className="font-medium">下一步 Agent 分析建议</p>
            <p className="text-muted-foreground">{derived.nextAgentSuggestion}</p>
            <p className="text-muted-foreground">
              是否建议发起组合诊断 Agent Run：{derived.shouldRunPortfolioAgent ? "建议发起" : "可先继续观察"}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSubmitPortfolioDiagnosis}
                disabled={diagnosisSubmitStatus === "loading"}
              >
                {diagnosisSubmitStatus === "loading"
                  ? "Submitting Portfolio Diagnosis..."
                  : "Submit Portfolio Diagnosis Agent Task"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/agent-lab", { portfolioId: selectedPortfolio.portfolioId })}>
                查看 Agent Lab
              </Button>
            </div>
            {diagnosisSubmitError ? (
              <p className={diagnosisSubmitStatus === "error" ? "text-destructive" : "text-muted-foreground"}>
                {diagnosisSubmitError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
