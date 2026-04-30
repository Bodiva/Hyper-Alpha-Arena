import { useEffect, useMemo, useState } from "react";
import type { Asset, AssetType } from "@/entities/asset/model";
import type { Evidence } from "@/entities/evidence/model";
import { listAssetsAsync } from "@/entities/asset/api";
import { listEvidenceAsync } from "@/entities/evidence/api";
import { listAgentRuns } from "@/entities/agent/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

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
  const apiMode = getApiMode();
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

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Asset Research 资产研究</CardTitle>
          <CardDescription>面向 ETF / 基金 / 期货 / 指数的资产画像、证据追踪与 Agent 分析入口</CardDescription>
          <p className="text-xs text-muted-foreground">从资产理解出发，连接证据、策略、组合和多 Agent 投研。</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant={apiMode === "real" ? "default" : "secondary"}>
              Data Mode: {apiMode === "real" ? "Real API" : "Mock"}
            </Badge>
            {apiMode === "real" ? <Badge variant="outline">Static Asset Store</Badge> : null}
          </div>
        </CardHeader>
      </Card>

      {isLoadingAssets ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">Loading assets...</CardContent>
        </Card>
      ) : null}

      {assetError ? (
        <Card className="border-red-300/70">
          <CardContent className="py-4 text-sm text-red-600">Asset API error: {assetError}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>资产总数</CardDescription>
            <CardTitle className="text-lg">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETF 数量</CardDescription>
            <CardTitle className="text-lg">{stats.etf}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>基金数量</CardDescription>
            <CardTitle className="text-lg">{stats.fund}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>期货数量</CardDescription>
            <CardTitle className="text-lg">{stats.future}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>指数数量</CardDescription>
            <CardTitle className="text-lg">{stats.index}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已关联证据数量</CardDescription>
            <CardTitle className="text-lg">{stats.evidenceCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已关联 Agent Run 数量</CardDescription>
            <CardTitle className="text-lg">{stats.runCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">资产类型</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_FILTERS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={assetFilter === item ? "default" : "outline"}
                  onClick={() => setAssetFilter(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">市场</p>
            <div className="flex flex-wrap gap-2">
              {MARKET_FILTERS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={marketFilter === item ? "default" : "outline"}
                  onClick={() => setMarketFilter(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">标签</p>
            <div className="flex flex-wrap gap-2">
              {TAG_FILTERS.map((item) => (
                <Button key={item} size="sm" variant={tagFilter === item ? "default" : "outline"} onClick={() => setTagFilter(item)}>
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">搜索</p>
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索 symbol / name / tag"
              className="w-full md:max-w-md h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配资产</p>
            <p className="text-xs text-muted-foreground">请调整资产类型、市场、标签或搜索关键词</p>
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
                    <p>Market: {displayMarket(asset.market)}</p>
                    <p>Currency: {asset.currency}</p>
                    <p>Evidence: {relatedStats.relatedEvidenceCount}</p>
                    <p>Agent Runs: {relatedStats.relatedRunCount}</p>
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
                    <p className="text-xs font-medium mb-1">关键指标摘要</p>
                    {renderAssetKeyMetrics(asset)}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="default" onClick={() => handleOpenAsset(asset.id)}>
                      查看详情
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/agent-lab", { assetId: asset.id })}>
                      发起 Agent 分析
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { assetId: asset.id })}>
                      加入组合
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { assetId: asset.id })}>
                      查看相关证据
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { assetId: asset.id })}>
                      查看决策归因
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { assetId: asset.id })}>
                      策略参考
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">资产类型研究说明</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="rounded border p-2">
            <p className="font-medium text-foreground">ETF</p>
            <p>关注跟踪指数、流动性、折溢价、跟踪误差、持仓暴露。</p>
          </div>
          <div className="rounded border p-2">
            <p className="font-medium text-foreground">基金</p>
            <p>关注基金经理、持仓、风格漂移、净值回撤、同类排名。</p>
          </div>
          <div className="rounded border p-2">
            <p className="font-medium text-foreground">期货</p>
            <p>关注主力合约、基差、期限结构、持仓量、库存和产业事件。</p>
          </div>
          <div className="rounded border p-2">
            <p className="font-medium text-foreground">指数</p>
            <p>关注成分、行业暴露、风格暴露、宏观和政策敏感性。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
