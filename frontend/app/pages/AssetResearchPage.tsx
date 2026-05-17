import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Asset, AssetType } from "@/entities/asset/model";
import type { Evidence } from "@/entities/evidence/model";
import { listAssetsAsync } from "@/entities/asset/api";
import { listEvidenceAsync } from "@/entities/evidence/api";
import { listAgentRuns } from "@/entities/agent/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";
import ResearchAssetChart from "@/shared/ui/ResearchAssetChart";

interface AssetResearchPageProps {
  onOpenAsset?: (assetId: string) => void;
}

type AssetFilter = "ALL" | AssetType;
type MarketFilter = "ALL" | "A股" | "港股" | "美股" | "商品期货" | "股指期货" | "债券" | "其他";
type TagFilter = "ALL" | "红利" | "成长" | "宽基" | "行业" | "商品" | "债券" | "跨境" | "低波" | "宏观";

const ASSET_FILTERS: AssetFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "INDEX"];
const MARKET_FILTERS: MarketFilter[] = ["ALL", "A股", "港股", "美股", "商品期货", "股指期货", "债券", "其他"];
const TAG_FILTERS: TagFilter[] = ["ALL", "红利", "成长", "宽基", "行业", "商品", "债券", "跨境", "低波", "宏观"];
const KNOWN_MARKET_FILTERS = new Set<MarketFilter>(MARKET_FILTERS);

const formatPercent = (value: number, digits = 2): string => `${value.toFixed(digits)}%`;
const formatNumber = (value: number): string => value.toLocaleString("en-US");
const normalizeText = (value: string): string => value.toLowerCase();

const displayMarket = (market: string): MarketFilter => {
  return KNOWN_MARKET_FILTERS.has(market as MarketFilter) ? (market as MarketFilter) : "其他";
};

const renderAssetKeyMetrics = (asset: Asset) => {
  if (asset.assetType === "ETF") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-muted-foreground">
        <p>Tracking Index: {asset.profile.trackingIndex}</p>
        <p>AUM: {formatNumber(asset.profile.aum)}</p>
        <p>Expense Ratio: {formatPercent(asset.profile.expenseRatio)}</p>
        <p>Tracking Error: {formatPercent(asset.profile.trackingError)}</p>
        <p>Liquidity Score: {asset.profile.liquidityScore}</p>
      </div>
    );
  }

  if (asset.assetType === "FUND") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-muted-foreground">
        <p>Fund Manager: {asset.profile.fundManager}</p>
        <p>Fund Company: {asset.profile.fundCompany}</p>
        <p>NAV: {asset.profile.nav.toFixed(3)}</p>
        <p>AUM: {formatNumber(asset.profile.aum)}</p>
        <p>Drawdown: {formatPercent(asset.profile.drawdown)}</p>
      </div>
    );
  }

  if (asset.assetType === "FUTURE") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-muted-foreground">
        <p>Exchange: {asset.profile.exchange}</p>
        <p>Contract: {asset.profile.contractCode}</p>
        <p>Underlying: {asset.profile.underlying}</p>
        <p>Open Interest: {formatNumber(asset.profile.openInterest)}</p>
        <p>Volume: {formatNumber(asset.profile.volume)}</p>
        <p>Basis: {asset.profile.basis.toFixed(2)}</p>
      </div>
    );
  }

  const topSector = asset.profile.sectorExposure
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((item) => `${item.name} ${item.value.toFixed(1)}%`)
    .join(" / ");
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-muted-foreground">
      <p>Provider: {asset.profile.provider}</p>
      <p>Constituent Count: {asset.profile.constituents.length}</p>
      <p className="md:col-span-2">Sector Exposure: {topSector || "-"}</p>
    </div>
  );
};

export default function AssetResearchPage({ onOpenAsset }: AssetResearchPageProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);
  const agentRuns = useMemo(() => {
    try {
      return listAgentRuns();
    } catch {
      return [];
    }
  }, []);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const queryAssetType = initialRouteParams.get("assetType");
  const queryAssetId = initialRouteParams.get("assetId");
  const querySource = initialRouteParams.get("source");
  const isQueryAssetType = (value: string | null): value is AssetType =>
    value === "ETF" || value === "FUND" || value === "FUTURE" || value === "INDEX";

  const [assetFilter, setAssetFilter] = useState<AssetFilter>(isQueryAssetType(queryAssetType) ? queryAssetType : "ALL");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [tagFilter, setTagFilter] = useState<TagFilter>("ALL");
  const [searchKeyword, setSearchKeyword] = useState(querySource ?? "");
  const [chartAssetId, setChartAssetId] = useState<string | null>(queryAssetId);
  const text = {
    all: isZh ? "全部" : "All",
    type: isZh ? "类型" : "Type",
    market: isZh ? "市场" : "Market",
    tags: isZh ? "标签" : "Tags",
    search: isZh ? "搜索" : "Search",
    total: isZh ? "资产" : "Assets",
    etf: "ETF",
    fund: isZh ? "基金" : "Funds",
    future: isZh ? "期货" : "Futures",
    index: isZh ? "指数" : "Index",
    evidence: isZh ? "证据" : "Evidence",
    runs: "Agent Runs",
    empty: isZh ? "无匹配资产" : "No assets",
    detail: isZh ? "详情" : "Detail",
    agent: isZh ? "Agent 分析" : "Agent",
    portfolio: isZh ? "加入组合" : "Portfolio",
    relatedEvidence: isZh ? "证据" : "Evidence",
    attribution: isZh ? "归因" : "Attribution",
    strategy: isZh ? "策略" : "Strategy",
    metrics: isZh ? "指标" : "Metrics",
    loading: isZh ? "加载资产..." : "Loading assets...",
  };
  const optionLabel = (value: string) => (value === "ALL" ? text.all : value);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingAssets(true);
    setAssetError(null);

    Promise.all([
      listAssetsAsync({ limit: 100 }),
      listEvidenceAsync({ limit: 100 }),
    ])
      .then(([assetItems, evidence]) => {
        if (cancelled) return;
        setAssets(assetItems);
        setEvidenceItems(evidence);
      })
      .catch((error) => {
        if (cancelled) return;
        setAssetError(error instanceof Error ? error.message : "Failed to load assets.");
        setAssets([]);
        setEvidenceItems([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAssets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenAsset = (assetId: string) => {
    if (onOpenAsset) {
      onOpenAsset(assetId);
      return;
    }
    navigateTo(`/assets/${encodeURIComponent(assetId)}`);
  };

  const stats = useMemo(() => {
    const assetIds = new Set(assets.map((asset) => asset.id));
    const evidenceCount = evidenceItems.filter((item) => item.relatedAssetIds.some((id) => assetIds.has(id))).length;
    const runCount = agentRuns.filter((run) => run.assetIds.some((id) => assetIds.has(id))).length;

    return {
      total: assets.length,
      etf: assets.filter((asset) => asset.assetType === "ETF").length,
      fund: assets.filter((asset) => asset.assetType === "FUND").length,
      future: assets.filter((asset) => asset.assetType === "FUTURE").length,
      index: assets.filter((asset) => asset.assetType === "INDEX").length,
      evidenceCount,
      runCount,
    };
  }, [agentRuns, assets, evidenceItems]);

  const filteredAssets = useMemo(() => {
    const keyword = normalizeText(searchKeyword.trim());

    return assets.filter((asset) => {
      const typePass = assetFilter === "ALL" || asset.assetType === assetFilter;
      const marketPass = marketFilter === "ALL" || displayMarket(asset.market) === marketFilter;
      const tagPass = tagFilter === "ALL" || asset.tags.includes(tagFilter);
      const searchPass =
        keyword.length === 0 ||
        normalizeText(asset.symbol).includes(keyword) ||
        normalizeText(asset.name).includes(keyword) ||
        asset.tags.some((tag) => normalizeText(tag).includes(keyword));
      const queryAssetPass = !queryAssetId || asset.id === queryAssetId;
      const querySourcePass =
        !querySource || evidenceItems.some((item) => item.sourceName === querySource && item.relatedAssetIds.includes(asset.id));

      return typePass && marketPass && tagPass && searchPass && queryAssetPass && querySourcePass;
    });
  }, [assetFilter, assets, evidenceItems, marketFilter, queryAssetId, querySource, tagFilter, searchKeyword]);

  const relatedStatsByAsset = useMemo(() => {
    return new Map(
      assets.map((asset) => {
        const relatedEvidenceCount = evidenceItems.filter((item) => item.relatedAssetIds.includes(asset.id)).length;
        const relatedRunCount = agentRuns.filter((run) => run.assetIds.includes(asset.id)).length;
        return [asset.id, { relatedEvidenceCount, relatedRunCount }];
      }),
    );
  }, [agentRuns, assets, evidenceItems]);

  const chartFocusAsset = useMemo(() => {
    if (filteredAssets.length === 0) return undefined;
    return filteredAssets.find((asset) => asset.id === chartAssetId) ?? filteredAssets[0];
  }, [chartAssetId, filteredAssets]);

  const statItems = [
    { label: text.total, value: stats.total },
    { label: text.etf, value: stats.etf },
    { label: text.fund, value: stats.fund },
    { label: text.future, value: stats.future },
    { label: text.index, value: stats.index },
    { label: text.evidence, value: stats.evidenceCount },
    { label: text.runs, value: stats.runCount },
  ];

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto">
      <ResearchWorkspaceNav />

      {isLoadingAssets ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">{text.loading}</CardContent>
        </Card>
      ) : null}

      {assetError ? (
        <Card className="border-red-300/70">
          <CardContent className="py-4 text-sm text-red-600">Asset API error: {assetError}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            {statItems.map((item) => (
              <div key={item.label} className="flex min-w-[74px] items-center justify-between gap-2 rounded-md border bg-muted/10 px-2 py-1 text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-semibold text-foreground">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(0,1.45fr)_minmax(220px,0.7fr)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-xs font-medium text-muted-foreground">{text.type}</span>
              {ASSET_FILTERS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={assetFilter === item ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setAssetFilter(item)}
                >
                  {optionLabel(item)}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-xs font-medium text-muted-foreground">{text.market}</span>
              {MARKET_FILTERS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={marketFilter === item ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMarketFilter(item)}
                >
                  {optionLabel(item)}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-xs font-medium text-muted-foreground">{text.tags}</span>
              {TAG_FILTERS.map((item) => (
                <Button key={item} size="sm" variant={tagFilter === item ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setTagFilter(item)}>
                  {optionLabel(item)}
                </Button>
              ))}
            </div>

            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder={isZh ? "代码 / 名称 / 标签" : "Symbol / name / tag"}
              className="h-8 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {chartFocusAsset ? (
        <ResearchAssetChart
          asset={chartFocusAsset}
          assetOptions={filteredAssets}
          selectedAssetId={chartFocusAsset.id}
          onSelectAsset={setChartAssetId}
          onOpenAsset={() => handleOpenAsset(chartFocusAsset.id)}
          onStartAgentAnalysis={() => navigateTo("/agent-lab", { assetId: chartFocusAsset.id })}
          compact
        />
      ) : null}

      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">{text.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filteredAssets.map((asset) => {
            const relatedStats = relatedStatsByAsset.get(asset.id) ?? { relatedEvidenceCount: 0, relatedRunCount: 0 };
            return (
              <Card key={asset.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{asset.symbol}</CardTitle>
                      <CardDescription>{asset.name}</CardDescription>
                    </div>
                    <Badge variant="secondary">{asset.assetType}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <p>{text.market}: {displayMarket(asset.market)}</p>
                    <p>CCY: {asset.currency}</p>
                    <p>{text.evidence}: {relatedStats.relatedEvidenceCount}</p>
                    <p>{text.runs}: {relatedStats.relatedRunCount}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{asset.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {asset.tags.map((tag) => (
                      <Badge key={`${asset.id}-${tag}`} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="rounded border bg-muted/20 p-2">
                    <p className="text-xs font-medium mb-1">{text.metrics}</p>
                    {renderAssetKeyMetrics(asset)}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="default" onClick={() => handleOpenAsset(asset.id)}>
                      {text.detail}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/agent-lab", { assetId: asset.id })}>
                      {text.agent}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { assetId: asset.id })}>
                      {text.portfolio}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { assetId: asset.id })}>
                      {text.relatedEvidence}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { assetId: asset.id })}>
                      {text.attribution}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { assetId: asset.id })}>
                      {text.strategy}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
