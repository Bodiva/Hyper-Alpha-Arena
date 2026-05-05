import { useEffect, useMemo, useState } from "react";
import type { Asset, ETFAsset, FundAsset, FuturesAsset, IndexAsset } from "@/entities/asset/model";
import type { Evidence, EvidenceType } from "@/entities/evidence/model";
import type { AgentRun, AgentRunStatus, AgentRunTaskType } from "@/entities/agent/model";
import type { Strategy } from "@/entities/strategy/model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAssetByIdAsync,
  getAssetEvidenceAsync,
  getAssetMarketIndicatorsAsync,
  getAssetMarketQuoteAsync,
  getAssetMarketSnapshotAsync,
  listAssetsAsync,
  type AlphaTraceMarketIndicator,
  type AlphaTraceMarketQuote,
  type AlphaTraceMarketSnapshot,
} from "@/entities/asset/api";
import { createDemoAgentRunAsync, getAgentRunsByAssetId } from "@/entities/agent/api";
import { listStrategies } from "@/entities/strategy/api";
import { getApiMode } from "@/shared/api/api-mode";
import { goBackOrDashboard, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

interface AssetDetailPageProps {
  assetId?: string;
}

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  news: "新闻",
  announcement: "公告",
  research_report: "研报",
  fund_quarterly_report: "基金季报",
  macro_data: "宏观数据",
  market_snapshot: "行情快照",
  industry_data: "产业数据",
  user_upload: "用户上传",
};

const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  QUEUED: "等待中",
  RUNNING: "运行中",
  COMPLETED: "已完成",
  PARTIALLY_COMPLETED: "部分完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const RUN_STATUS_BADGE: Record<AgentRunStatus, "default" | "secondary" | "outline" | "destructive"> = {
  QUEUED: "outline",
  RUNNING: "secondary",
  COMPLETED: "default",
  PARTIALLY_COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const TASK_TYPE_LABEL: Record<AgentRunTaskType, string> = {
  SINGLE_ASSET_ANALYSIS: "单资产分析",
  MULTI_ASSET_COMPARISON: "多资产比较",
  PORTFOLIO_DIAGNOSTIC: "组合诊断",
  EVENT_IMPACT_ANALYSIS: "事件影响分析",
  REBALANCE_SUGGESTION: "调仓建议",
};

const formatDateTime = (value?: string): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatPercent = (value: number, digits = 2): string => `${value.toFixed(digits)}%`;
const formatNumber = (value: number): string => value.toLocaleString("en-US");
const formatMarketNumber = (value?: number | null, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits }) : "-";

const formatMarketRecordValue = (record: Record<string, unknown> | undefined, keys: string[]): string => {
  if (!record) return "-";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return formatMarketNumber(value);
    if (typeof value === "string" && value.trim()) return value;
  }
  return "-";
};

const inferRiskLevel = (asset: Asset): "LOW" | "MEDIUM" | "HIGH" => {
  if (asset.assetType === "FUTURE") return "HIGH";
  if (asset.assetType === "ETF") return asset.profile.trackingError > 1.2 ? "MEDIUM" : "LOW";
  if (asset.assetType === "FUND") return asset.profile.drawdown > 15 ? "HIGH" : "MEDIUM";
  const maxSector = Math.max(...asset.profile.sectorExposure.map((item) => item.value), 0);
  return maxSector > 30 ? "MEDIUM" : "LOW";
};

const inferLiquidity = (asset: Asset): string => {
  if (asset.assetType === "ETF") return `${asset.profile.liquidityScore}/100`;
  if (asset.assetType === "FUTURE") {
    const score = Math.min(99, Math.round((asset.profile.openInterest + asset.profile.volume) / 5_000));
    return `${score}/100`;
  }
  if (asset.assetType === "FUND") return `${Math.min(95, 60 + asset.profile.holdings.length * 8)}/100`;
  return `${Math.min(96, 65 + asset.profile.constituents.length * 5)}/100`;
};

const inferExposureSummary = (asset: Asset): string => {
  if (asset.assetType === "ETF") {
    const top = asset.profile.exposures
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((item) => `${item.name} ${item.value.toFixed(1)}%`);
    return top.join(" / ") || "-";
  }
  if (asset.assetType === "FUND") {
    const top = asset.profile.styleExposure
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((item) => `${item.name} ${item.value.toFixed(1)}%`);
    return top.join(" / ") || "-";
  }
  if (asset.assetType === "FUTURE") {
    return `Basis ${asset.profile.basis.toFixed(2)} · ${asset.profile.mainContract}`;
  }
  const top = asset.profile.sectorExposure
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((item) => `${item.name} ${item.value.toFixed(1)}%`);
  return top.join(" / ") || "-";
};

const avgBacktest = (strategies: Strategy[]) => {
  if (strategies.length === 0) return null;
  const sum = strategies.reduce(
    (acc, strategy) => {
      acc.totalReturn += strategy.backtestSummary.totalReturn;
      acc.volatility += strategy.backtestSummary.volatility;
      acc.maxDrawdown += strategy.backtestSummary.maxDrawdown;
      return acc;
    },
    { totalReturn: 0, volatility: 0, maxDrawdown: 0 },
  );
  return {
    totalReturn: sum.totalReturn / strategies.length,
    volatility: sum.volatility / strategies.length,
    maxDrawdown: sum.maxDrawdown / strategies.length,
  };
};

const goToAssetResearch = () => {
  navigateTo("/assets");
};

const goToRunDetail = (runId: string) => {
  navigateTo(`/agent-lab/runs/${encodeURIComponent(runId)}`);
};

const renderProfilePanel = (asset: Asset) => {
  if (asset.assetType === "ETF") {
    const etf = asset as ETFAsset;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
        <p>Tracking Index: {etf.profile.trackingIndex}</p>
        <p>Fund Company: {etf.profile.fundCompany}</p>
        <p>AUM: {formatNumber(etf.profile.aum)}</p>
        <p>Expense Ratio: {formatPercent(etf.profile.expenseRatio)}</p>
        <p>Tracking Error: {formatPercent(etf.profile.trackingError)}</p>
        <p>Premium/Discount: {formatPercent(etf.profile.premiumDiscount)}</p>
        <p>Liquidity Score: {etf.profile.liquidityScore}</p>
      </div>
    );
  }

  if (asset.assetType === "FUND") {
    const fund = asset as FundAsset;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
        <p>Fund Manager: {fund.profile.fundManager}</p>
        <p>Fund Company: {fund.profile.fundCompany}</p>
        <p>Fund Type: {fund.profile.fundType}</p>
        <p>NAV: {fund.profile.nav.toFixed(3)}</p>
        <p>AUM: {formatNumber(fund.profile.aum)}</p>
        <p>Expense Ratio: {formatPercent(fund.profile.expenseRatio)}</p>
        <p>Drawdown: {formatPercent(fund.profile.drawdown)}</p>
        <p>
          Style Exposure:{" "}
          {fund.profile.styleExposure
            .slice(0, 2)
            .map((item) => `${item.name} ${item.value.toFixed(1)}%`)
            .join(" / ")}
        </p>
      </div>
    );
  }

  if (asset.assetType === "FUTURE") {
    const future = asset as FuturesAsset;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
        <p>Exchange: {future.profile.exchange}</p>
        <p>Contract Code: {future.profile.contractCode}</p>
        <p>Underlying: {future.profile.underlying}</p>
        <p>Main Contract: {future.profile.mainContract}</p>
        <p>Open Interest: {formatNumber(future.profile.openInterest)}</p>
        <p>Volume: {formatNumber(future.profile.volume)}</p>
        <p>Basis: {future.profile.basis.toFixed(2)}</p>
        <p>Inventory Note: {future.profile.inventoryNote}</p>
      </div>
    );
  }

  const index = asset as IndexAsset;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
      <p>Provider: {index.profile.provider}</p>
      <p>Constituent Count: {index.profile.constituents.length}</p>
      <p>
        Sector Exposure:{" "}
        {index.profile.sectorExposure
          .slice(0, 2)
          .map((item) => `${item.name} ${item.value.toFixed(1)}%`)
          .join(" / ")}
      </p>
      <p>
        Style Exposure:{" "}
        {index.profile.styleExposure
          .slice(0, 2)
          .map((item) => `${item.name} ${item.value.toFixed(1)}%`)
          .join(" / ")}
      </p>
    </div>
  );
};

const renderStructurePanel = (asset: Asset) => {
  if (asset.assetType === "ETF" || asset.assetType === "FUND") {
    const holdings = asset.profile.holdings;
    const exposures = asset.assetType === "ETF" ? asset.profile.exposures : asset.profile.styleExposure;
    return (
      <div className="space-y-3 text-xs">
        <div>
          <p className="font-medium mb-1">Holdings</p>
          {holdings.map((item) => (
            <div key={`${item.symbol}-${item.name}`} className="flex flex-wrap items-center justify-between border-b py-1 text-muted-foreground">
              <span>{item.symbol} · {item.name}</span>
              <span>{item.weight.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div>
          <p className="font-medium mb-1">{asset.assetType === "ETF" ? "Exposure" : "Style Exposure"}</p>
          {exposures.map((item) => (
            <div key={`${item.dimension}-${item.name}`} className="flex flex-wrap items-center justify-between border-b py-1 text-muted-foreground">
              <span>{item.name}</span>
              <span>{item.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (asset.assetType === "INDEX") {
    return (
      <div className="space-y-3 text-xs">
        <div>
          <p className="font-medium mb-1">Constituents</p>
          {asset.profile.constituents.map((item) => (
            <div key={`${item.symbol}-${item.name}`} className="flex flex-wrap items-center justify-between border-b py-1 text-muted-foreground">
              <span>{item.symbol} · {item.name}</span>
              <span>{item.weight.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div>
          <p className="font-medium mb-1">Sector Exposure</p>
          {asset.profile.sectorExposure.map((item) => (
            <div key={`${item.dimension}-${item.name}`} className="flex flex-wrap items-center justify-between border-b py-1 text-muted-foreground">
              <span>{item.name}</span>
              <span>{item.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs text-muted-foreground">
      <p>Term Structure</p>
      {asset.profile.termStructure.map((node) => (
        <div key={node.contract} className="flex flex-wrap items-center justify-between border-b py-1">
          <span>
            {node.contract} · {node.maturityDate}
          </span>
          <span>Annualized Basis {node.annualizedBasis.toFixed(2)}%</span>
        </div>
      ))}
      <p>Basis: {asset.profile.basis.toFixed(2)}</p>
      <p>Inventory Note: {asset.profile.inventoryNote}</p>
      <p>Open Interest / Volume: {formatNumber(asset.profile.openInterest)} / {formatNumber(asset.profile.volume)}</p>
    </div>
  );
};

export default function AssetDetailPage({ assetId }: AssetDetailPageProps) {
  const apiMode = getApiMode();
  const [asset, setAsset] = useState<Asset | undefined>(undefined);
  const [relatedEvidence, setRelatedEvidence] = useState<Evidence[]>([]);
  const [isLoadingAsset, setIsLoadingAsset] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetNotFound, setAssetNotFound] = useState(false);
  const [marketQuote, setMarketQuote] = useState<AlphaTraceMarketQuote | undefined>(undefined);
  const [marketSnapshot, setMarketSnapshot] = useState<AlphaTraceMarketSnapshot | undefined>(undefined);
  const [marketIndicators, setMarketIndicators] = useState<AlphaTraceMarketIndicator[]>([]);
  const [isLoadingMarketData, setIsLoadingMarketData] = useState(false);
  const [marketDataError, setMarketDataError] = useState<string | null>(null);
  const [isCreatingDemoRun, setIsCreatingDemoRun] = useState(false);
  const [demoRunError, setDemoRunError] = useState<string | null>(null);
  const strategies = useMemo(() => {
    try {
      return listStrategies();
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingAsset(true);
    setAssetError(null);
    setAssetNotFound(false);
    setMarketQuote(undefined);
    setMarketSnapshot(undefined);
    setMarketIndicators([]);
    setMarketDataError(null);
    setIsLoadingMarketData(apiMode === "real");

    const loadAsset = async () => {
      try {
        const targetAsset = assetId
          ? await getAssetByIdAsync(assetId)
          : (await listAssetsAsync({ limit: 1 }))[0];

        if (cancelled) return;
        if (!targetAsset) {
          setAsset(undefined);
          setRelatedEvidence([]);
          setAssetNotFound(Boolean(assetId));
          return;
        }

        setAsset(targetAsset);
        setRelatedEvidence(await getAssetEvidenceAsync(targetAsset.id));

        if (apiMode === "real") {
          try {
            const [quote, snapshot, indicators] = await Promise.all([
              getAssetMarketQuoteAsync(targetAsset.id),
              getAssetMarketSnapshotAsync(targetAsset.id),
              getAssetMarketIndicatorsAsync(targetAsset.id),
            ]);
            if (cancelled) return;
            setMarketQuote(quote);
            setMarketSnapshot(snapshot);
            setMarketIndicators(indicators);
          } catch (error) {
            if (cancelled) return;
            setMarketDataError(error instanceof Error ? error.message : "Market data unavailable.");
          } finally {
            if (!cancelled) {
              setIsLoadingMarketData(false);
            }
          }
        } else {
          setIsLoadingMarketData(false);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load asset.";
        setAsset(undefined);
        setRelatedEvidence([]);
        setMarketQuote(undefined);
        setMarketSnapshot(undefined);
        setMarketIndicators([]);
        setAssetError(message);
        setAssetNotFound(Boolean(assetId));
      } finally {
        if (!cancelled) {
          setIsLoadingAsset(false);
          if (apiMode !== "real") {
            setIsLoadingMarketData(false);
          }
        }
      }
    };

    void loadAsset();

    return () => {
      cancelled = true;
    };
  }, [assetId, apiMode]);

  if (isLoadingAsset) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <ResearchWorkspaceNav />
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">Loading asset...</p>
            <p className="text-xs text-muted-foreground">正在读取资产画像和相关证据。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!asset || assetNotFound) {
    return (
      <div className="flex flex-col gap-4 h-full overflow-auto">
        <ResearchWorkspaceNav />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">未找到对应资产</CardTitle>
            <CardDescription>assetId: {assetId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {assetError ? `Asset API error: ${assetError}` : "请返回 Asset Research 页面重新选择资产。"}
            </p>
            <Button variant="outline" onClick={goToAssetResearch}>
              返回 Asset Research
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const relatedRuns = (() => {
    try {
      return getAgentRunsByAssetId(asset.id);
    } catch {
      return [];
    }
  })();

  const handleStartAgentAnalysis = async () => {
    setIsCreatingDemoRun(true);
    setDemoRunError(null);

    try {
      const demoRun = await createDemoAgentRunAsync({
        assetId: asset.id,
        taskType: "single_asset_analysis",
        question: `请分析 ${asset.symbol} ${asset.name} 是否适合中期配置`,
      });
      navigateTo(`/agent-lab/runs/${encodeURIComponent(demoRun.runId)}`);
    } catch (error) {
      if (apiMode === "mock") {
        navigateTo("/agent-lab", { assetId: asset.id });
        return;
      }
      setDemoRunError(error instanceof Error ? error.message : "Demo Agent Run 创建失败");
    } finally {
      setIsCreatingDemoRun(false);
    }
  };

  const tagKeywordHints: Record<string, string[]> = {
    红利: ["dividend", "防御", "DIVIDEND_DEFENSIVE"],
    成长: ["growth", "GROWTH_AGGRESSIVE"],
    宽基: ["rotation", "allocation", "ETF_ROTATION"],
    行业: ["industry", "sector", "COMMODITY_CYCLE"],
    商品: ["commodity", "FUTURES_TIMING", "COMMODITY_CYCLE"],
    债券: ["bond", "risk parity", "RISK_PARITY"],
    跨境: ["global", "overseas", "growth"],
    低波: ["steady", "drawdown", "RISK_PARITY"],
    宏观: ["macro", "allocation", "timing"],
  };

  const relatedStrategies = strategies.filter((strategy) => {
    const assetTypeMatch = strategy.assetTypes.includes(asset.assetType);
    if (assetTypeMatch) return true;

    const text = [
      strategy.strategyType,
      strategy.style,
      strategy.styleLabel,
      strategy.description,
      ...strategy.rules.map((rule) => `${rule.name} ${rule.expression} ${rule.note ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();

    return asset.tags.some((tag) => {
      const hints = tagKeywordHints[tag] ?? [];
      return hints.some((hint) => text.includes(hint.toLowerCase()));
    });
  });

  const backtest = avgBacktest(relatedStrategies);
  const metricsSummary = {
    totalReturn: backtest?.totalReturn ?? null,
    volatility: backtest?.volatility ?? null,
    drawdown: backtest?.maxDrawdown ?? null,
    liquidity: inferLiquidity(asset),
    riskLevel: inferRiskLevel(asset),
    exposure: inferExposureSummary(asset),
    evidenceCount: relatedEvidence.length,
    runCount: relatedRuns.length,
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{asset.symbol}</CardTitle>
                <Badge variant="secondary">{asset.assetType}</Badge>
                <Badge variant={apiMode === "real" ? "default" : "outline"}>
                  Data Mode: {apiMode === "real" ? "Real API" : "Mock"}
                </Badge>
              </div>
              <CardDescription>{asset.name}</CardDescription>
              <p className="text-xs text-muted-foreground">{asset.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={goBackOrDashboard}>返回上一页</Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/dashboard")}>返回 Dashboard</Button>
              <Button size="sm" onClick={handleStartAgentAnalysis} disabled={isCreatingDemoRun}>
                {isCreatingDemoRun ? "正在创建 Demo Run..." : "发起 Agent 分析"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { assetId: asset.id })}>加入组合</Button>
              <Button size="sm" variant="outline">加入自选</Button>
              <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { assetId: asset.id })}>查看策略</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {demoRunError ? <p className="text-xs text-destructive">Demo Agent Run 创建失败：{demoRunError}</p> : null}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
            <p>Market: {asset.market}</p>
            <p>Currency: {asset.currency}</p>
            <p>UpdatedAt: {formatDateTime(asset.updatedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {asset.tags.map((tag) => (
              <Badge key={`${asset.id}-${tag}`} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Asset Profile 资产画像</CardTitle>
        </CardHeader>
        <CardContent>{renderProfilePanel(asset)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Key Metrics 指标区</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground">收益</p>
            <p className="font-medium">{metricsSummary.totalReturn == null ? "占位" : formatPercent(metricsSummary.totalReturn, 1)}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">波动</p>
            <p className="font-medium">{metricsSummary.volatility == null ? "占位" : formatPercent(metricsSummary.volatility, 1)}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">回撤</p>
            <p className="font-medium">{metricsSummary.drawdown == null ? "占位" : formatPercent(metricsSummary.drawdown, 1)}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">流动性</p>
            <p className="font-medium">{metricsSummary.liquidity}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">风险等级</p>
            <p className="font-medium">{metricsSummary.riskLevel}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">相关性/暴露</p>
            <p className="font-medium">{metricsSummary.exposure}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">证据数量</p>
            <p className="font-medium">{metricsSummary.evidenceCount}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Agent Run 数量</p>
            <p className="font-medium">{metricsSummary.runCount}</p>
          </div>
        </CardContent>
      </Card>

      {apiMode === "real" ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">AlphaTrace Market Data v1</CardTitle>
                <CardDescription>后端 static market-data seed；不是 legacy BTC feed，也不是实时行情。</CardDescription>
              </div>
              <Badge variant="outline">Static Seed</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {isLoadingMarketData ? <p className="text-muted-foreground">Loading AlphaTrace market data...</p> : null}
            {marketDataError ? <p className="text-destructive">Market data unavailable: {marketDataError}</p> : null}
            {marketQuote ? (
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-medium">{formatMarketNumber(marketQuote.price, 4)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Change</p>
                  <p className={marketQuote.change >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
                    {formatMarketNumber(marketQuote.change, 4)}
                  </p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Change %</p>
                  <p className={marketQuote.changePercent >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
                    {formatPercent(marketQuote.changePercent, 2)}
                  </p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Volume</p>
                  <p className="font-medium">{formatMarketNumber(marketQuote.volume, 0)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-medium">{formatMarketNumber(marketQuote.amount, 0)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">NAV</p>
                  <p className="font-medium">{formatMarketNumber(marketQuote.nav, 4)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Premium</p>
                  <p className="font-medium">{formatMarketNumber(marketQuote.premiumDiscount, 3)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{marketQuote.source}</p>
                </div>
              </div>
            ) : null}

            {marketSnapshot ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                <div className="rounded border p-2">
                  <p className="font-medium">Valuation</p>
                  <p className="text-muted-foreground">PE: {formatMarketRecordValue(marketSnapshot.valuation, ["pe", "peTtm"])}</p>
                  <p className="text-muted-foreground">PB: {formatMarketRecordValue(marketSnapshot.valuation, ["pb"])}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="font-medium">Liquidity</p>
                  <p className="text-muted-foreground">Score: {formatMarketRecordValue(marketSnapshot.liquidity, ["score", "liquidityScore"])}</p>
                  <p className="text-muted-foreground">Turnover: {formatMarketRecordValue(marketSnapshot.liquidity, ["turnover", "turnoverRate"])}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="font-medium">Volatility / Trend</p>
                  <p className="text-muted-foreground">Vol: {formatMarketRecordValue(marketSnapshot.volatility, ["volatility", "annualizedVolatility"])}</p>
                  <p className="text-muted-foreground">Trend: {formatMarketRecordValue(marketSnapshot.trend, ["summary", "direction", "trend"])}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="font-medium">Fund Flow</p>
                  <p className="text-muted-foreground">Flow: {formatMarketRecordValue(marketSnapshot.fundFlow, ["netInflow", "flow", "summary"])}</p>
                  <p className="text-muted-foreground">Collected: {formatDateTime(marketSnapshot.collectedAt)}</p>
                </div>
              </div>
            ) : null}

            {marketIndicators.length ? (
              <div className="space-y-2">
                <p className="font-medium">Indicators</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {marketIndicators.slice(0, 6).map((indicator) => (
                    <div key={`${indicator.name}-${indicator.updatedAt}`} className="rounded border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{indicator.name}</p>
                        <Badge variant="outline">
                          {typeof indicator.value === "number" ? formatMarketNumber(indicator.value, 3) : indicator.value}
                          {indicator.unit ?? ""}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{indicator.interpretation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Holdings / Constituents / Exposure</CardTitle>
        </CardHeader>
        <CardContent>{renderStructurePanel(asset)}</CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Related Evidence 相关证据</CardTitle>
            <CardDescription>证据追踪与引用来源</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {relatedEvidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无关联证据。</p>
            ) : (
              relatedEvidence.map((item) => (
                <div key={item.id} className="rounded border p-2 text-xs space-y-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground">
                    {EVIDENCE_TYPE_LABEL[item.evidenceType]} · {item.sourceName} · {formatDateTime(item.publishedAt)}
                  </p>
                  <p className="text-muted-foreground">Quality: {item.qualityScore}</p>
                  <p className="text-muted-foreground">{item.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {item.usedByAgentRunIds.map((id) => (
                      <Badge key={`${item.id}-${id}`} variant="outline">
                        {id}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: item.id })}>
                      查看证据详情
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/agent-lab", { assetId: asset.id })}>
                      查看相关 Agent 分析
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Related Agent Runs 相关 Agent 分析</CardTitle>
            <CardDescription>关联任务状态与结论</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {relatedRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无关联 Agent Run。</p>
            ) : (
              relatedRuns.map((run: AgentRun) => (
                <div key={run.runId} className="rounded border p-2 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{run.runId}</p>
                    <Badge variant={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
                  </div>
                  <p className="text-muted-foreground">Task: {TASK_TYPE_LABEL[run.taskType]}</p>
                  <p className="text-muted-foreground">Final Decision: {run.finalDecision.summary ?? run.finalDecision.thesis}</p>
                  <p className="text-muted-foreground">
                    Confidence: {formatPercent(run.finalDecision.confidence, 0)} · Risk: {run.riskLevel}
                  </p>
                  <p className="text-muted-foreground">Updated: {formatDateTime(run.updatedAt ?? run.completedAt ?? run.startedAt)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => goToRunDetail(run.runId)}>
                      查看详情
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { runId: run.runId })}>
                      查看决策归因
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Related Strategies 相关策略</CardTitle>
          <CardDescription>按资产类型与标签匹配策略入口</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {relatedStrategies.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无匹配策略。</p>
          ) : (
            relatedStrategies.map((strategy) => (
              <div key={strategy.strategyId} className="rounded border p-2 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{strategy.name}</p>
                  <Badge variant="outline">{strategy.status}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {strategy.strategyType} · {strategy.styleLabel}
                </p>
                <p className="text-muted-foreground">
                  Backtest: Return {formatPercent(strategy.backtestSummary.totalReturn, 1)} · Drawdown{" "}
                  {formatPercent(strategy.backtestSummary.maxDrawdown, 1)} · Sharpe {strategy.backtestSummary.sharpe.toFixed(2)}
                </p>
                <div className="pt-1">
                  <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { strategyId: strategy.strategyId, assetId: asset.id })}>
                    查看策略表现
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Research Actions 研究动作</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleStartAgentAnalysis} disabled={isCreatingDemoRun}>
            {isCreatingDemoRun ? "正在创建 Demo Run..." : "发起单资产分析"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigateTo("/agent-lab", { assetId: asset.id, taskType: "MULTI_ASSET_COMPARISON" })}>与其他资产比较</Button>
          <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { assetId: asset.id })}>加入组合诊断</Button>
          <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { assetId: asset.id, action: "rebalance" })}>生成调仓建议</Button>
          <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { assetId: asset.id })}>查看历史决策归因</Button>
        </CardContent>
      </Card>
    </div>
  );
}
