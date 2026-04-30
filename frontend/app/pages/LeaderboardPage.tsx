import { useMemo, useState } from "react";
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
import { listAssets } from "@/entities/asset/api";
import { listLeaderboard } from "@/entities/strategy/api";
import type { LeaderboardItem } from "@/entities/strategy/model";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

type AssetFilter = "ALL" | "ETF" | "FUND" | "FUTURE" | "MULTI_ASSET";
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
type RunModeFilter = "ALL" | "BACKTEST" | "PAPER" | "LIVE";
type TimeRangeFilter = "1M" | "3M" | "6M" | "1Y" | "ALL";

interface RankedLeaderboardItem extends LeaderboardItem {
  compositeScore: number;
  scoreIndex: number;
  ranking: number;
  assetCategory: Exclude<AssetFilter, "ALL">;
}

const ASSET_FILTERS: AssetFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "MULTI_ASSET"];
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
const RUN_MODE_FILTERS: RunModeFilter[] = ["ALL", "BACKTEST", "PAPER", "LIVE"];
const TIME_RANGE_FILTERS: TimeRangeFilter[] = ["1M", "3M", "6M", "1Y", "ALL"];

const RUN_MODE_LABEL: Record<RunModeFilter, string> = {
  ALL: "全部",
  BACKTEST: "回测",
  PAPER: "模拟盘",
  LIVE: "实盘",
};

const TIME_RANGE_LABEL: Record<TimeRangeFilter, string> = {
  "1M": "近 1 月",
  "3M": "近 3 月",
  "6M": "近 6 月",
  "1Y": "近 1 年",
  ALL: "全部",
};

const ASSET_FILTER_LABEL: Record<AssetFilter, string> = {
  ALL: "全部",
  ETF: "ETF",
  FUND: "FUND",
  FUTURE: "FUTURE",
  MULTI_ASSET: "MULTI_ASSET",
};

function inferAssetCategory(assetTypes: LeaderboardItem["assetTypes"]): Exclude<AssetFilter, "ALL"> {
  if (assetTypes.length > 1) {
    return "MULTI_ASSET";
  }
  const [first] = assetTypes;
  if (first === "ETF" || first === "FUND" || first === "FUTURE") {
    return first;
  }
  return "MULTI_ASSET";
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0.5;
  }
  return (value - min) / (max - min);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function scoreToIndex(score: number): number {
  const raw = ((score + 1) / 5) * 100;
  return Math.max(0, Math.min(100, raw));
}

export default function LeaderboardPage() {
  const leaderboardItems = useMemo(() => listLeaderboard(), []);
  const assets = useMemo(() => listAssets(), []);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedAssetId = initialRouteParams.get("assetId") ?? undefined;
  const linkedStrategyId = initialRouteParams.get("strategyId") ?? undefined;
  const linkedDecisionId = initialRouteParams.get("decisionId") ?? undefined;
  const routeAssetType = initialRouteParams.get("assetType");

  const linkedAssetType = useMemo(() => {
    const fromRoute = routeAssetType as AssetFilter | null;
    if (fromRoute && ASSET_FILTERS.includes(fromRoute)) return fromRoute;
    if (!linkedAssetId) return null;
    const type = assets.find((asset) => asset.id === linkedAssetId)?.assetType;
    if (!type) return null;
    return type === "INDEX" ? "MULTI_ASSET" : (type as Exclude<AssetFilter, "ALL">);
  }, [assets, linkedAssetId, routeAssetType]);

  const [assetFilter, setAssetFilter] = useState<AssetFilter>(linkedAssetType ?? "ALL");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("ALL");
  const [runModeFilter, setRunModeFilter] = useState<RunModeFilter>("ALL");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeFilter>("ALL");

  const rankedData = useMemo<RankedLeaderboardItem[]>(() => {
    const enriched = leaderboardItems.map((item) => ({
      ...item,
      assetCategory: inferAssetCategory(item.assetTypes),
    }));

    const filtered = enriched.filter((item) => {
      const assetPass = assetFilter === "ALL" || item.assetCategory === assetFilter;
      const stylePass = styleFilter === "ALL" || item.styleLabel === styleFilter;
      const runModePass = runModeFilter === "ALL" || item.runMode === runModeFilter;
      const timePass = timeRangeFilter === "ALL" || item.timeRange === timeRangeFilter;
      const linkedStrategyPass = !linkedStrategyId || item.strategyId === linkedStrategyId;
      return assetPass && stylePass && runModePass && timePass && linkedStrategyPass;
    });

    if (filtered.length === 0) {
      return [];
    }

    const totalReturnMin = Math.min(...filtered.map((item) => item.totalReturn));
    const totalReturnMax = Math.max(...filtered.map((item) => item.totalReturn));
    const sharpeMin = Math.min(...filtered.map((item) => item.sharpe));
    const sharpeMax = Math.max(...filtered.map((item) => item.sharpe));
    const evidenceMin = Math.min(...filtered.map((item) => item.evidenceScore));
    const evidenceMax = Math.max(...filtered.map((item) => item.evidenceScore));
    const riskMin = Math.min(...filtered.map((item) => item.riskScore));
    const riskMax = Math.max(...filtered.map((item) => item.riskScore));
    const drawdownMin = Math.min(...filtered.map((item) => Math.abs(item.maxDrawdown)));
    const drawdownMax = Math.max(...filtered.map((item) => Math.abs(item.maxDrawdown)));

    const scored = filtered.map((item) => {
      const compositeScore =
        normalize(item.totalReturn, totalReturnMin, totalReturnMax) +
        normalize(item.sharpe, sharpeMin, sharpeMax) +
        normalize(item.evidenceScore, evidenceMin, evidenceMax) +
        normalize(item.riskScore, riskMin, riskMax) -
        normalize(Math.abs(item.maxDrawdown), drawdownMin, drawdownMax);

      return {
        ...item,
        compositeScore,
        scoreIndex: scoreToIndex(compositeScore),
      };
    });

    return scored
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .map((item, index) => ({
        ...item,
        ranking: index + 1,
      }));
  }, [assetFilter, leaderboardItems, linkedStrategyId, styleFilter, runModeFilter, timeRangeFilter]);

  const leaders = useMemo(() => {
    if (rankedData.length === 0) {
      return null;
    }
    return {
      topReturn: rankedData.reduce((best, current) => (current.totalReturn > best.totalReturn ? current : best), rankedData[0]),
      minDrawdown: rankedData.reduce((best, current) => (current.maxDrawdown < best.maxDrawdown ? current : best), rankedData[0]),
      topSharpe: rankedData.reduce((best, current) => (current.sharpe > best.sharpe ? current : best), rankedData[0]),
      topEvidence: rankedData.reduce((best, current) => (current.evidenceScore > best.evidenceScore ? current : best), rankedData[0]),
      topRisk: rankedData.reduce((best, current) => (current.riskScore > best.riskScore ? current : best), rankedData[0]),
    };
  }, [rankedData]);

  const topStrategy = rankedData[0] ?? null;

  const totalTraderCount = new Set(rankedData.map((item) => item.traderId)).size;
  const strategyCount = rankedData.length;
  const coverageTypes = new Set(rankedData.map((item) => item.assetCategory));
  const avgEvidenceScore =
    rankedData.length === 0 ? 0 : rankedData.reduce((sum, item) => sum + item.evidenceScore, 0) / rankedData.length;
  const avgRiskScore =
    rankedData.length === 0 ? 0 : rankedData.reduce((sum, item) => sum + item.riskScore, 0) / rankedData.length;

  const returnRank = [...rankedData].sort((a, b) => b.totalReturn - a.totalReturn);
  const drawdownRank = [...rankedData].sort((a, b) => a.maxDrawdown - b.maxDrawdown);

  const returnMin = rankedData.length ? Math.min(...rankedData.map((item) => item.totalReturn)) : 0;
  const returnMax = rankedData.length ? Math.max(...rankedData.map((item) => item.totalReturn)) : 1;
  const drawdownMax = rankedData.length ? Math.max(...rankedData.map((item) => item.maxDrawdown)) : 1;
  const volatilityMin = rankedData.length ? Math.min(...rankedData.map((item) => item.volatility)) : 0;
  const volatilityMax = rankedData.length ? Math.max(...rankedData.map((item) => item.volatility)) : 1;

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
            <div className="xl:col-span-2 space-y-2">
              <h2 className="text-2xl font-semibold">Leaderboard 策略排行榜</h2>
              <p className="text-sm text-muted-foreground">
                多 AI 交易员 / 多策略 / 多观点的量化结果对比中心
              </p>
              <p className="text-xs text-muted-foreground">
                支持 ETF、基金、期货及多资产组合策略的收益、风险、证据质量和风控表现评估。
              </p>
              {linkedDecisionId ? (
                <p className="text-xs text-muted-foreground">当前从决策链路进入：decisionId={linkedDecisionId}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>AI 交易员数量</CardDescription>
                  <CardTitle className="text-lg">{totalTraderCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>策略数量</CardDescription>
                  <CardTitle className="text-lg">{strategyCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>覆盖资产类型</CardDescription>
                  <CardTitle className="text-lg">{coverageTypes.size}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>平均证据/风控评分</CardDescription>
                  <CardTitle className="text-lg">
                    {avgEvidenceScore.toFixed(1)} / {avgRiskScore.toFixed(1)}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">资产类型</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_FILTERS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={assetFilter === option ? "default" : "outline"}
                  onClick={() => setAssetFilter(option)}
                >
                  {ASSET_FILTER_LABEL[option]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">策略风格</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_FILTERS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={styleFilter === option ? "default" : "outline"}
                  onClick={() => setStyleFilter(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium">运行模式</p>
              <div className="flex flex-wrap gap-2">
                {RUN_MODE_FILTERS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={runModeFilter === option ? "default" : "outline"}
                    onClick={() => setRunModeFilter(option)}
                  >
                    {RUN_MODE_LABEL[option]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium">时间区间</p>
              <div className="flex flex-wrap gap-2">
                {TIME_RANGE_FILTERS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={timeRangeFilter === option ? "default" : "outline"}
                    onClick={() => setTimeRangeFilter(option)}
                  >
                    {TIME_RANGE_LABEL[option]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {rankedData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配策略</p>
            <p className="text-xs text-muted-foreground">请调整资产类型、策略风格或时间区间</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最高累计收益</CardDescription>
                <CardTitle className="text-lg">{formatPercent(leaders!.topReturn.totalReturn)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.topReturn.traderName}</p>
                <p>{leaders!.topReturn.strategyName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最低最大回撤</CardDescription>
                <CardTitle className="text-lg">{formatPercent(leaders!.minDrawdown.maxDrawdown)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.minDrawdown.traderName}</p>
                <p>风格稳定性较好</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最高 Sharpe</CardDescription>
                <CardTitle className="text-lg">{leaders!.topSharpe.sharpe.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.topSharpe.traderName}</p>
                <p>收益风险性价比最佳</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最高证据评分</CardDescription>
                <CardTitle className="text-lg">{leaders!.topEvidence.evidenceScore.toFixed(0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.topEvidence.strategyName}</p>
                <p>证据质量完整度突出</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最高风控评分</CardDescription>
                <CardTitle className="text-lg">{leaders!.topRisk.riskScore.toFixed(0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.topRisk.strategyName}</p>
                <p>风险控制表现领先</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">策略排行榜（综合评分排序）</CardTitle>
              <CardDescription>综合评分 = 收益 + Sharpe + 证据 + 风控 - 回撤（标准化后）</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>排名</TableHead>
                    <TableHead>AI 交易员</TableHead>
                    <TableHead>策略名称</TableHead>
                    <TableHead>策略风格</TableHead>
                    <TableHead>资产类型</TableHead>
                    <TableHead>运行模式</TableHead>
                    <TableHead>累计收益</TableHead>
                    <TableHead>年化收益</TableHead>
                    <TableHead>最大回撤</TableHead>
                    <TableHead>波动率</TableHead>
                    <TableHead>Sharpe</TableHead>
                    <TableHead>胜率</TableHead>
                    <TableHead>换手率</TableHead>
                    <TableHead>证据评分</TableHead>
                    <TableHead>风控评分</TableHead>
                    <TableHead>综合评分</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedData.map((item) => (
                    <TableRow key={`${item.traderId}-${item.strategyId}`}>
                      <TableCell>{item.ranking}</TableCell>
                      <TableCell>{item.traderName}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/strategy-lab", { strategyId: item.strategyId })}>
                          {item.strategyName}
                        </Button>
                      </TableCell>
                      <TableCell>{item.styleLabel}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/assets", { assetType: item.assetCategory })}>
                          {item.assetCategory}
                        </Button>
                      </TableCell>
                      <TableCell>{RUN_MODE_LABEL[item.runMode]}</TableCell>
                      <TableCell className={item.totalReturn >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                        {formatPercent(item.totalReturn)}
                      </TableCell>
                      <TableCell>{formatPercent(item.annualizedReturn)}</TableCell>
                      <TableCell className={item.maxDrawdown >= 15 ? "text-red-500" : item.maxDrawdown >= 10 ? "text-amber-500" : "text-emerald-600"}>
                        {formatPercent(item.maxDrawdown)}
                      </TableCell>
                      <TableCell>{formatPercent(item.volatility)}</TableCell>
                      <TableCell>{item.sharpe.toFixed(2)}</TableCell>
                      <TableCell>{formatPercent(item.winRate)}</TableCell>
                      <TableCell>{formatPercent(item.turnover)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { strategyId: item.strategyId })}>
                          {item.evidenceScore.toFixed(0)}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { strategyId: item.strategyId })}>
                          {item.riskScore.toFixed(0)}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.scoreIndex >= 70 ? "default" : "secondary"}>
                          {item.scoreIndex.toFixed(1)}
                        </Badge>
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
                <CardTitle className="text-base">收益对比</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {returnRank.map((item) => {
                  const width = normalize(item.totalReturn, returnMin, returnMax) * 100;
                  return (
                    <div key={item.strategyId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate max-w-[180px]">{item.strategyName}</span>
                        <span className="text-emerald-600">{formatPercent(item.totalReturn)}</span>
                      </div>
                      <div className="h-2 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded" style={{ width: `${Math.max(width, 8)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">回撤对比</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {drawdownRank.map((item) => {
                  const width = drawdownMax === 0 ? 0 : (item.maxDrawdown / drawdownMax) * 100;
                  return (
                    <div key={item.strategyId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate max-w-[180px]">{item.strategyName}</span>
                        <span className={item.maxDrawdown >= 15 ? "text-red-500" : item.maxDrawdown >= 10 ? "text-amber-500" : "text-emerald-600"}>
                          {formatPercent(item.maxDrawdown)}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded ${item.maxDrawdown >= 15 ? "bg-red-500" : item.maxDrawdown >= 10 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.max(width, 8)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">风险收益散点（波动率 vs 累计收益）</CardTitle>
              </CardHeader>
              <CardContent>
                <svg viewBox="0 0 360 220" className="w-full h-[220px] rounded border bg-muted/20">
                  <line x1="30" y1="190" x2="330" y2="190" stroke="currentColor" opacity="0.2" />
                  <line x1="30" y1="20" x2="30" y2="190" stroke="currentColor" opacity="0.2" />
                  {rankedData.map((item) => {
                    const x = 30 + normalize(item.volatility, volatilityMin, volatilityMax) * 300;
                    const y = 190 - normalize(item.totalReturn, returnMin, returnMax) * 170;
                    return (
                      <g key={item.strategyId}>
                        <circle cx={x} cy={y} r={5} fill={item.sharpe >= 1.2 ? "#059669" : item.sharpe >= 1 ? "#2563eb" : "#b45309"} />
                        <text x={x + 6} y={y - 6} fontSize="9" fill="currentColor">
                          {item.strategyName.slice(0, 10)}
                        </text>
                      </g>
                    );
                  })}
                  <text x="285" y="206" fontSize="10" fill="currentColor">
                    波动率
                  </text>
                  <text x="2" y="18" fontSize="10" fill="currentColor">
                    收益
                  </text>
                </svg>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">策略详情概览（当前第 1 名）</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="space-y-2 text-xs">
                <p><span className="text-muted-foreground">AI 交易员：</span>{topStrategy!.traderName}</p>
                <p><span className="text-muted-foreground">策略名称：</span>{topStrategy!.strategyName}</p>
                <p><span className="text-muted-foreground">风格：</span>{topStrategy!.styleLabel}</p>
                <p><span className="text-muted-foreground">适用资产：</span>{topStrategy!.assetTypes.join(" / ")}</p>
                <p><span className="text-muted-foreground">运行模式：</span>{RUN_MODE_LABEL[topStrategy!.runMode]}</p>
                <p><span className="text-muted-foreground">证据评分：</span>{topStrategy!.evidenceScore}</p>
                <p><span className="text-muted-foreground">风控评分：</span>{topStrategy!.riskScore}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => navigateTo("/strategy-lab", { strategyId: topStrategy!.strategyId })}>
                    查看策略详情
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigateTo("/assets", { assetType: topStrategy!.assetCategory })}>
                    查看相关资产
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { strategyId: topStrategy!.strategyId })}>
                    查看评分说明
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">投资逻辑 summary</p>
                <p className="text-xs">{topStrategy!.summary}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">优势</p>
                  <ul className="text-xs list-disc pl-4 space-y-1">
                    {topStrategy!.strengths.map((strength) => (
                      <li key={strength}>{strength}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">风险</p>
                  <ul className="text-xs list-disc pl-4 space-y-1">
                    {topStrategy!.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
