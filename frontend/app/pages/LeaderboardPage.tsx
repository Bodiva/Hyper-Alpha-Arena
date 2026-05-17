import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listClickHouseRankingsAsync, listLeaderboardAsync } from "@/entities/strategy/api";
import type { ClickHouseRankingItem, ClickHouseRankingType, LeaderboardItem } from "@/entities/strategy/model";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";
import "./LeaderboardPage.css";

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
type RankingTab = ClickHouseRankingType;
type SortDirection = "asc" | "desc";
type RankingSortKey =
  | "rank"
  | "managerName"
  | "representativeFundName"
  | "name"
  | "fundCompany"
  | "fundType"
  | "activeFundCount"
  | "activeScale"
  | "scale"
  | "latestNav"
  | "return1y"
  | "drawdown"
  | "representativeManager"
  | "averageTenureRoi"
  | "averageAnnualizedRoi"
  | "scaleWeightedRoi"
  | "score"
  | "rationale";

interface RankingSortState {
  key: RankingSortKey;
  direction: SortDirection;
}

interface RankedLeaderboardItem extends LeaderboardItem {
  compositeScore: number;
  scoreIndex: number;
  ranking: number;
  assetCategory: Exclude<AssetFilter, "ALL">;
}

type InsightTagTone = "tech" | "growth" | "defense" | "cycle" | "health" | "consumer" | "finance" | "global" | "quality";

interface InsightTag {
  label: string;
  tone: InsightTagTone;
}

const ASSET_FILTERS: AssetFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "MULTI_ASSET"];
const RANKING_TABS: Array<{ key: RankingTab; label: string; description: string }> = [
  { key: "manager", label: "基金经理排行", description: "按任期收益、年化收益、在管规模和基金数量综合排序" },
  { key: "fund", label: "基金排行", description: "按近一年收益、规模、回撤和净值覆盖排序" },
  { key: "etf", label: "ETF 排行", description: "按交易型开放式基金近一年收益、规模和回撤排序" },
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

const DEFAULT_RANKING_SORTS: Record<RankingTab, RankingSortState> = {
  manager: { key: "score", direction: "desc" },
  fund: { key: "score", direction: "desc" },
  etf: { key: "score", direction: "desc" },
};

const SORTABLE_NUMERIC_KEYS = new Set<RankingSortKey>([
  "rank",
  "activeFundCount",
  "activeScale",
  "scale",
  "latestNav",
  "return1y",
  "drawdown",
  "averageTenureRoi",
  "averageAnnualizedRoi",
  "scaleWeightedRoi",
  "score",
]);

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

function formatRatioPercent(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function hasFiniteNumber(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatAum(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`;
  return value.toLocaleString("zh-CN");
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "";
  if (start && end) return `${start} 至 ${end}`;
  return start ?? end ?? "";
}

function managerRationale(item: ClickHouseRankingItem): string {
  const fundCount = item.activeFundCount ?? 0;
  const representativeFund = item.representativeFundName ?? item.representativeFundCode ?? "-";
  if (hasFiniteNumber(item.scaleWeightedRoi)) {
    return `管理 ${fundCount} 只在任基金；代表基金 ${representativeFund}；规模加权任期 ROI ${formatRatioPercent(item.scaleWeightedRoi)}。`;
  }
  if (hasFiniteNumber(item.averageTenureRoi)) {
    return `管理 ${fundCount} 只在任基金；代表基金 ${representativeFund}；平均任期收益 ${formatRatioPercent(item.averageTenureRoi)}。`;
  }
  if (hasFiniteNumber(item.averageAnnualizedRoi)) {
    return `管理 ${fundCount} 只在任基金；代表基金 ${representativeFund}；平均年化收益 ${formatRatioPercent(item.averageAnnualizedRoi)}。`;
  }
  return item.rationale || `管理 ${fundCount} 只在任基金；代表基金 ${representativeFund}。`;
}

function addUniqueInsightTag(tags: InsightTag[], label: string, tone: InsightTagTone): void {
  if (!tags.some((tag) => tag.label === label)) {
    tags.push({ label, tone });
  }
}

function inferFocusTags(item: ClickHouseRankingItem): InsightTag[] {
  const tags: InsightTag[] = [];
  const sourceText = [
    item.name,
    item.representativeFundName,
    item.fundCompany,
    item.fundType,
    item.assetType,
    ...(item.managedFunds ?? []).map((fund) => fund.name),
  ]
    .filter(Boolean)
    .join(" ");

  const rules: Array<{ pattern: RegExp; label: string; tone: InsightTagTone }> = [
    { pattern: /人工智能|AI|智能|机器人|算力|云计算|软件|计算机/i, label: "AI 科技", tone: "tech" },
    { pattern: /半导体|芯片|通信|电子|设备|信创/i, label: "科技硬件", tone: "tech" },
    { pattern: /科创|创业板|创新|成长|新兴/i, label: "成长弹性", tone: "growth" },
    { pattern: /红利|低波|价值|央企|国企|公用事业/i, label: "红利价值", tone: "defense" },
    { pattern: /医药|医疗|生物|创新药|疫苗/i, label: "医药健康", tone: "health" },
    { pattern: /新能源|光伏|电池|锂|储能|电动车/i, label: "新能源链", tone: "growth" },
    { pattern: /军工|国防|卫星|高端制造|装备/i, label: "高端制造", tone: "cycle" },
    { pattern: /消费|食品|白酒|家电|旅游/i, label: "消费复苏", tone: "consumer" },
    { pattern: /有色|资源|煤炭|钢铁|化工|周期/i, label: "资源周期", tone: "cycle" },
    { pattern: /证券|银行|保险|金融|非银/i, label: "金融板块", tone: "finance" },
    { pattern: /港股|恒生|中概|纳斯达克|标普|海外|全球/i, label: "跨境资产", tone: "global" },
    { pattern: /沪深300|中证A?500|上证50|宽基|指数/i, label: "宽基核心", tone: "quality" },
    { pattern: /债|货币|短融|信用|利率/i, label: "固收低波", tone: "defense" },
  ];

  rules.forEach((rule) => {
    if (rule.pattern.test(sourceText)) {
      addUniqueInsightTag(tags, rule.label, rule.tone);
    }
  });

  if (hasFiniteNumber(item.return1y)) {
    if (item.return1y >= 1) addUniqueInsightTag(tags, "高弹性收益", "growth");
    else if (item.return1y >= 0.3) addUniqueInsightTag(tags, "收益领先", "quality");
  }
  if (hasFiniteNumber(item.scale) && item.scale >= 20_000_000_000) {
    addUniqueInsightTag(tags, "大规模流动性", "quality");
  }
  if (hasFiniteNumber(item.drawdown) && item.drawdown > -0.05) {
    addUniqueInsightTag(tags, "回撤控制", "defense");
  }
  if ((item.activeFundCount ?? 0) >= 10) {
    addUniqueInsightTag(tags, "多产品管理", "quality");
  }
  if (hasFiniteNumber(item.scaleWeightedRoi) && item.scaleWeightedRoi >= 0.6) {
    addUniqueInsightTag(tags, "规模收益强", "growth");
  }
  if (hasFiniteNumber(item.averageAnnualizedRoi) && item.averageAnnualizedRoi >= 0.3) {
    addUniqueInsightTag(tags, "年化领先", "quality");
  }

  if (tags.length === 0) {
    addUniqueInsightTag(tags, item.rankingType === "manager" ? "综合选基" : "均衡配置", "quality");
  }

  return tags.slice(0, 4);
}

function RankingInsightCell({ item, rationale }: { item: ClickHouseRankingItem; rationale: string }) {
  const tags = inferFocusTags(item);
  return (
    <div className="leaderboard-insight-cell">
      <p>{rationale}</p>
      <div className="leaderboard-insight-tags">
        {tags.map((tag) => (
          <span key={tag.label} className={`leaderboard-insight-tag leaderboard-insight-tag--${tag.tone}`}>
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function rankingSortValue(item: ClickHouseRankingItem, key: RankingSortKey): number | string | null | undefined {
  if (key === "fundType") return item.fundType ?? item.assetType;
  return item[key as keyof ClickHouseRankingItem] as number | string | null | undefined;
}

function compareRankingValues(a: ClickHouseRankingItem, b: ClickHouseRankingItem, key: RankingSortKey, direction: SortDirection): number {
  const multiplier = direction === "asc" ? 1 : -1;
  const aValue = rankingSortValue(a, key);
  const bValue = rankingSortValue(b, key);
  const aEmpty = aValue === null || aValue === undefined || aValue === "";
  const bEmpty = bValue === null || bValue === undefined || bValue === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (SORTABLE_NUMERIC_KEYS.has(key)) {
    const aNumber = Number(aValue);
    const bNumber = Number(bValue);
    const aInvalid = Number.isNaN(aNumber);
    const bInvalid = Number.isNaN(bNumber);
    if (aInvalid && bInvalid) return 0;
    if (aInvalid) return 1;
    if (bInvalid) return -1;
    return (aNumber - bNumber) * multiplier;
  }

  return String(aValue).localeCompare(String(bValue), "zh-CN", { numeric: true, sensitivity: "base" }) * multiplier;
}

function sortRankingRows(rows: ClickHouseRankingItem[], sort: RankingSortState): ClickHouseRankingItem[] {
  return [...rows].sort((a, b) => compareRankingValues(a, b, sort.key, sort.direction) || a.rank - b.rank);
}

function SortableTableHead({
  sortKey,
  label,
  activeSort,
  onSort,
}: {
  sortKey: RankingSortKey;
  label: string;
  activeSort: RankingSortState;
  onSort: (key: RankingSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  const Icon = active ? (activeSort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = active ? (activeSort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHead aria-sort={ariaSort}>
      <button
        type="button"
        className={`leaderboard-sort-button${active ? " is-active" : ""}`}
        aria-label={`${label}排序，当前${active ? (activeSort.direction === "asc" ? "升序" : "降序") : "未排序"}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <Icon size={13} />
      </button>
    </TableHead>
  );
}

function formatManagedFundsTooltip(funds?: ClickHouseRankingItem["managedFunds"]): string {
  if (!funds || funds.length === 0) {
    return "暂无在管基金明细";
  }
  return funds
    .map((fund, index) => `${index + 1}. ${fund.name || "-"} (${fund.code || "-"}) · ${formatAum(fund.scale ?? undefined)}`)
    .join("\n");
}

function formatRuntimePercent(value?: number): string {
  return `${((value ?? 0) * 100).toFixed(0)}%`;
}

function formatRuntimeNumber(value?: number): string {
  return `${value ?? 0}`;
}

function scoreToIndex(score: number): number {
  const raw = ((score + 1) / 5) * 100;
  return Math.max(0, Math.min(100, raw));
}

export default function LeaderboardPage() {
  const apiMode = getApiMode();
  const isRealMode = apiMode === "real";
  const [leaderboardItems, setLeaderboardItems] = useState<LeaderboardItem[]>([]);
  const [clickHouseRankings, setClickHouseRankings] = useState<Record<RankingTab, ClickHouseRankingItem[]>>({
    manager: [],
    fund: [],
    etf: [],
  });
  const [activeRankingTab, setActiveRankingTab] = useState<RankingTab>("manager");
  const [rankingSorts, setRankingSorts] = useState<Record<RankingTab, RankingSortState>>(DEFAULT_RANKING_SORTS);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);
  const [isRefreshingLeaderboard, setIsRefreshingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedStrategyId = initialRouteParams.get("strategyId") ?? undefined;
  const routeAssetType = initialRouteParams.get("assetType");

  const linkedAssetType = useMemo(() => {
    const fromRoute = routeAssetType as AssetFilter | null;
    if (fromRoute && ASSET_FILTERS.includes(fromRoute)) return fromRoute;
    return null;
  }, [routeAssetType]);

  const [assetFilter, setAssetFilter] = useState<AssetFilter>(linkedAssetType ?? "ALL");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("ALL");
  const [runModeFilter, setRunModeFilter] = useState<RunModeFilter>("ALL");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeFilter>("ALL");

  const loadLeaderboard = async ({ refresh = false, cancelledRef }: { refresh?: boolean; cancelledRef?: { current: boolean } } = {}) => {
    if (refresh) {
      setIsRefreshingLeaderboard(true);
    } else {
      setIsLoadingLeaderboard(true);
    }
    setLeaderboardError(null);
    try {
      const [nextLeaderboard, nextRankings] = await Promise.all([
        listLeaderboardAsync({ strategyId: linkedStrategyId }),
        Promise.all([
          listClickHouseRankingsAsync({ rankingType: "manager", limit: 80, refresh }),
          listClickHouseRankingsAsync({ rankingType: "fund", limit: 80, refresh }),
          listClickHouseRankingsAsync({ rankingType: "etf", limit: 80, refresh }),
        ]),
      ]);
      if (cancelledRef?.current) return;
      setLeaderboardItems(nextLeaderboard);
      setClickHouseRankings({
        manager: nextRankings[0],
        fund: nextRankings[1],
        etf: nextRankings[2],
      });
    } catch (error) {
      if (cancelledRef?.current) return;
      setLeaderboardItems([]);
      setClickHouseRankings({ manager: [], fund: [], etf: [] });
      setLeaderboardError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!cancelledRef?.current) {
        setIsLoadingLeaderboard(false);
        setIsRefreshingLeaderboard(false);
      }
    }
  };

  useEffect(() => {
    const cancelledRef = { current: false };

    loadLeaderboard({ cancelledRef });

    return () => {
      cancelledRef.current = true;
    };
  }, [linkedStrategyId]);

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

    if (isRealMode) {
      return filtered
        .map((item) => {
          const scoreIndex = Math.max(0, Math.min(100, item.runtimeQualityScore ?? item.evidenceScore ?? 0));
          return {
            ...item,
            compositeScore: scoreIndex,
            scoreIndex,
          };
        })
        .sort((a, b) => b.scoreIndex - a.scoreIndex)
        .map((item, index) => ({
          ...item,
          ranking: index + 1,
        }));
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
  }, [assetFilter, isRealMode, leaderboardItems, linkedStrategyId, styleFilter, runModeFilter, timeRangeFilter]);

  const leaders = useMemo(() => {
    if (rankedData.length === 0) {
      return null;
    }
    if (isRealMode) {
      return {
        topQuality: rankedData.reduce((best, current) => ((current.runtimeQualityScore ?? 0) > (best.runtimeQualityScore ?? 0) ? current : best), rankedData[0]),
        topCompletedRuns: rankedData.reduce((best, current) => ((current.completedRuns ?? 0) > (best.completedRuns ?? 0) ? current : best), rankedData[0]),
        topConfidence: rankedData.reduce((best, current) => ((current.averageConfidence ?? 0) > (best.averageConfidence ?? 0) ? current : best), rankedData[0]),
        topEvidence: rankedData.reduce((best, current) => (current.evidenceScore > best.evidenceScore ? current : best), rankedData[0]),
        topRisk: rankedData.reduce((best, current) => (current.riskScore > best.riskScore ? current : best), rankedData[0]),
      };
    }
    return {
      topReturn: rankedData.reduce((best, current) => (current.totalReturn > best.totalReturn ? current : best), rankedData[0]),
      minDrawdown: rankedData.reduce((best, current) => (current.maxDrawdown < best.maxDrawdown ? current : best), rankedData[0]),
      topSharpe: rankedData.reduce((best, current) => (current.sharpe > best.sharpe ? current : best), rankedData[0]),
      topEvidence: rankedData.reduce((best, current) => (current.evidenceScore > best.evidenceScore ? current : best), rankedData[0]),
      topRisk: rankedData.reduce((best, current) => (current.riskScore > best.riskScore ? current : best), rankedData[0]),
    };
  }, [isRealMode, rankedData]);

  const topStrategy = rankedData[0] ?? null;

  const totalTraderCount = new Set(rankedData.map((item) => item.traderId)).size;
  const strategyCount = rankedData.length;
  const coverageTypes = new Set(rankedData.map((item) => item.assetCategory));
  const activeRankingRows = clickHouseRankings[activeRankingTab];
  const activeRankingSort = rankingSorts[activeRankingTab];
  const sortedActiveRankingRows = useMemo(
    () => sortRankingRows(activeRankingRows, activeRankingSort),
    [activeRankingRows, activeRankingSort],
  );
  const showManagerScaleColumn = useMemo(
    () => clickHouseRankings.manager.some((manager) => hasFiniteNumber(manager.activeScale) && manager.activeScale > 0),
    [clickHouseRankings.manager],
  );
  const showManagerScaleWeightedRoiColumn = useMemo(
    () => clickHouseRankings.manager.some((manager) => hasFiniteNumber(manager.scaleWeightedRoi)),
    [clickHouseRankings.manager],
  );
  const topManager = clickHouseRankings.manager[0] ?? null;
  const topFund = clickHouseRankings.fund[0] ?? null;
  const topEtf = clickHouseRankings.etf[0] ?? null;
  const topActiveRanking = sortedActiveRankingRows[0] ?? null;

  const handleRankingSort = (key: RankingSortKey) => {
    setRankingSorts((current) => {
      const previous = current[activeRankingTab];
      return {
        ...current,
        [activeRankingTab]: {
          key,
          direction: previous.key === key && previous.direction === "desc" ? "asc" : "desc",
        },
      };
    });
  };

  const returnRank = [...rankedData].sort((a, b) => b.totalReturn - a.totalReturn);
  const drawdownRank = [...rankedData].sort((a, b) => a.maxDrawdown - b.maxDrawdown);
  const runtimeQualityRank = [...rankedData].sort((a, b) => (b.runtimeQualityScore ?? 0) - (a.runtimeQualityScore ?? 0));
  const evidenceCoverageRank = [...rankedData].sort((a, b) => (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0));

  const returnMin = rankedData.length ? Math.min(...rankedData.map((item) => item.totalReturn)) : 0;
  const returnMax = rankedData.length ? Math.max(...rankedData.map((item) => item.totalReturn)) : 1;
  const drawdownMax = rankedData.length ? Math.max(...rankedData.map((item) => item.maxDrawdown)) : 1;
  const volatilityMin = rankedData.length ? Math.min(...rankedData.map((item) => item.volatility)) : 0;
  const volatilityMax = rankedData.length ? Math.max(...rankedData.map((item) => item.volatility)) : 1;

  return (
    <div className="leaderboard-page">
      <ResearchWorkspaceNav />
      <div className="leaderboard-content">
      <section className="leaderboard-hero">
        <div>
          <h1>投研排行</h1>
          <p>汇总基金经理、基金、ETF 与 Agent 策略表现，便于快速比较收益、回撤、规模和评分。</p>
        </div>
        <div className="leaderboard-hero-metrics">
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadLeaderboard({ refresh: true })}
            disabled={isLoadingLeaderboard || isRefreshingLeaderboard}
            title="重新计算并更新榜单缓存"
          >
            <RefreshCw size={14} className={isRefreshingLeaderboard ? "animate-spin" : undefined} />
            {isRefreshingLeaderboard ? "更新中" : "更新"}
          </Button>
          <span>榜单 {activeRankingRows.length}</span>
          <span>策略 {strategyCount}</span>
          <span>交易员 {totalTraderCount}</span>
        </div>
      </section>

      <div className="leaderboard-summary-grid grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>基金经理</CardDescription>
            <CardTitle className="text-lg">{clickHouseRankings.manager.length}</CardTitle>
            <p className="text-xs text-muted-foreground">{topManager?.managerName ?? "-"}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>基金</CardDescription>
            <CardTitle className="text-lg">{clickHouseRankings.fund.length}</CardTitle>
            <p className="text-xs text-muted-foreground">{topFund?.name ?? "-"}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETF</CardDescription>
            <CardTitle className="text-lg">{clickHouseRankings.etf.length}</CardTitle>
            <p className="text-xs text-muted-foreground">{topEtf?.name ?? "-"}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agent 策略</CardDescription>
            <CardTitle className="text-lg">{strategyCount}</CardTitle>
            <p className="text-xs text-muted-foreground">{totalTraderCount} 个交易员 · {coverageTypes.size} 类资产</p>
          </CardHeader>
        </Card>
      </div>

      {isLoadingLeaderboard ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">正在加载排行榜数据...</CardContent>
        </Card>
      ) : null}

      {leaderboardError ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            排行数据加载失败：{leaderboardError}
          </CardContent>
        </Card>
      ) : null}

      <Card className="leaderboard-main-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">投研排行</CardTitle>
              <CardDescription>
                基金经理按任期收益、年化收益、在管规模和基金数量排序；基金和 ETF 按收益、规模与回撤排序。
              </CardDescription>
            </div>
            {topActiveRanking ? (
              <Badge variant="default">
                当前第一：{topActiveRanking.managerName ?? topActiveRanking.name} · {topActiveRanking.score.toFixed(1)}
              </Badge>
            ) : (
              <Badge variant="secondary">暂无排行数据</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="leaderboard-tab-strip flex flex-wrap gap-2">
            {RANKING_TABS.map((tab) => (
              <Button
                key={tab.key}
                size="sm"
                variant={activeRankingTab === tab.key ? "default" : "outline"}
                onClick={() => setActiveRankingTab(tab.key)}
                title={tab.description}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          {activeRankingRows.length === 0 ? (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground leaderboard-empty-ranking">
              <p className="font-medium">当前榜单暂无可展示数据</p>
              <p className="mt-1 text-xs">请确认 ClickHouse 的基金收益、规模或经理快照已完成同步；同步完成后榜单会自动刷新。</p>
            </div>
          ) : activeRankingTab === "manager" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="rank" label="排名" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="managerName" label="基金经理" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="representativeFundName" label="代表基金" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="fundCompany" label="基金公司" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="activeFundCount" label="在管基金" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  {showManagerScaleColumn ? (
                    <SortableTableHead sortKey="activeScale" label="在管规模" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  ) : null}
                  <SortableTableHead sortKey="averageTenureRoi" label="任期收益" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="averageAnnualizedRoi" label="年化收益" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  {showManagerScaleWeightedRoiColumn ? (
                    <SortableTableHead sortKey="scaleWeightedRoi" label="规模加权收益" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  ) : null}
                  <SortableTableHead sortKey="score" label="综合分" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="rationale" label="说明" activeSort={activeRankingSort} onSort={handleRankingSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedActiveRankingRows.map((manager, index) => {
                  const roiDateRange = formatDateRange(manager.earliestRoiStartDate, manager.latestRoiEndDate);
                  const representativeLabel = manager.representativeFundName ?? manager.representativeFundCode;
                  return (
                    <TableRow key={manager.managerCode ?? `${manager.managerName}-${manager.rank}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{manager.managerName ?? "-"}</TableCell>
                      <TableCell>
                        {representativeLabel ? (
                          <div className="space-y-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigateTo("/assets", { assetId: `ck_fund_${manager.representativeFundCode ?? ""}` })}
                              disabled={!manager.representativeFundCode}
                              className="leaderboard-fund-button"
                            >
                              {representativeLabel}
                            </Button>
                            {manager.representativeFundCode ? (
                              <p className="text-xs text-muted-foreground">{manager.representativeFundCode}</p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">暂无代表基金</span>
                        )}
                      </TableCell>
                      <TableCell>{manager.fundCompany ?? <span className="text-xs text-muted-foreground">待补充</span>}</TableCell>
                      <TableCell>
                        <span
                          className="cursor-help underline decoration-dotted underline-offset-4"
                          title={formatManagedFundsTooltip(manager.managedFunds)}
                        >
                          {manager.activeFundCount ?? 0}
                        </span>
                      </TableCell>
                      {showManagerScaleColumn ? <TableCell>{formatAum(manager.activeScale)}</TableCell> : null}
                      <TableCell className={(manager.averageTenureRoi ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>
                        <div className="space-y-1">
                          <span>{formatRatioPercent(manager.averageTenureRoi)}</span>
                          {roiDateRange ? <p className="text-xs text-muted-foreground">{roiDateRange}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell className={(manager.averageAnnualizedRoi ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>
                        {formatRatioPercent(manager.averageAnnualizedRoi)}
                      </TableCell>
                      {showManagerScaleWeightedRoiColumn ? (
                        <TableCell className={(manager.scaleWeightedRoi ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>
                          {formatRatioPercent(manager.scaleWeightedRoi)}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Badge variant={manager.score >= 80 ? "default" : "secondary"}>{manager.score.toFixed(1)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                        <RankingInsightCell item={manager} rationale={managerRationale(manager)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="rank" label="排名" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="name" label={activeRankingTab === "etf" ? "ETF" : "基金"} activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="fundCompany" label="基金公司" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="fundType" label="类型" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="scale" label="规模" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="latestNav" label="最新净值/收盘" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="return1y" label="近一年收益" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="drawdown" label="回撤" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="representativeManager" label="基金经理" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="score" label="综合分" activeSort={activeRankingSort} onSort={handleRankingSort} />
                  <SortableTableHead sortKey="rationale" label="要点" activeSort={activeRankingSort} onSort={handleRankingSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedActiveRankingRows.map((fund, index) => (
                  <TableRow key={fund.code ?? `${fund.name}-${fund.rank}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigateTo("/assets", { assetId: `ck_fund_${fund.code ?? ""}` })}
                          disabled={!fund.code}
                        >
                          {fund.name ?? "-"}
                        </Button>
                        <p className="text-xs text-muted-foreground">{fund.code ?? "-"} · {fund.latestDate ?? "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{fund.fundCompany ?? "-"}</TableCell>
                    <TableCell>{fund.fundType ?? fund.assetType ?? "-"}</TableCell>
                    <TableCell>{formatAum(fund.scale)}</TableCell>
                    <TableCell>{typeof fund.latestNav === "number" ? fund.latestNav.toFixed(4) : "-"}</TableCell>
                    <TableCell className={(fund.return1y ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {formatRatioPercent(fund.return1y)}
                    </TableCell>
                    <TableCell className={(fund.drawdown ?? 0) <= -0.1 ? "text-red-500" : "text-emerald-600"}>
                      {formatRatioPercent(fund.drawdown)}
                    </TableCell>
                    <TableCell>{fund.representativeManager ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={fund.score >= 80 ? "default" : "secondary"}>{fund.score.toFixed(1)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[400px] text-xs text-muted-foreground">
                      <RankingInsightCell item={fund} rationale={fund.rationale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="leaderboard-filter-card">
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
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="leaderboard-highlight-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{isRealMode ? "最高运行质量" : "最高累计收益"}</CardDescription>
                <CardTitle className="text-lg">
                  {isRealMode ? (leaders!.topQuality.runtimeQualityScore ?? leaders!.topQuality.scoreIndex).toFixed(1) : formatPercent(leaders!.topReturn.totalReturn)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{isRealMode ? leaders!.topQuality.traderName : leaders!.topReturn.traderName}</p>
                <p>{isRealMode ? leaders!.topQuality.strategyName : leaders!.topReturn.strategyName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{isRealMode ? "最多完成 Run" : "最低最大回撤"}</CardDescription>
                <CardTitle className="text-lg">
                  {isRealMode ? formatRuntimeNumber(leaders!.topCompletedRuns.completedRuns) : formatPercent(leaders!.minDrawdown.maxDrawdown)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{isRealMode ? leaders!.topCompletedRuns.traderName : leaders!.minDrawdown.traderName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{isRealMode ? "最高平均置信度" : "最高 Sharpe"}</CardDescription>
                <CardTitle className="text-lg">
                  {isRealMode ? formatRuntimePercent(leaders!.topConfidence.averageConfidence) : leaders!.topSharpe.sharpe.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{isRealMode ? leaders!.topConfidence.traderName : leaders!.topSharpe.traderName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最高证据评分</CardDescription>
                <CardTitle className="text-lg">{leaders!.topEvidence.evidenceScore.toFixed(0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.topEvidence.strategyName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>最高风控评分</CardDescription>
                <CardTitle className="text-lg">{leaders!.topRisk.riskScore.toFixed(0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{leaders!.topRisk.strategyName}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="leaderboard-main-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {isRealMode ? "Agent Runtime 质量排行榜" : "策略排行榜（综合评分排序）"}
              </CardTitle>
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
                    {isRealMode ? (
                      <>
                        <TableHead>完成 Run</TableHead>
                        <TableHead>失败 Run</TableHead>
                        <TableHead>平均置信度</TableHead>
                        <TableHead>Evidence</TableHead>
                        <TableHead>Reports</TableHead>
                        <TableHead>Risk Warnings</TableHead>
                        <TableHead>Decisions</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>累计收益</TableHead>
                        <TableHead>年化收益</TableHead>
                        <TableHead>最大回撤</TableHead>
                        <TableHead>波动率</TableHead>
                        <TableHead>Sharpe</TableHead>
                        <TableHead>胜率</TableHead>
                        <TableHead>换手率</TableHead>
                      </>
                    )}
                    <TableHead>证据评分</TableHead>
                    <TableHead>风控评分</TableHead>
                    <TableHead>{isRealMode ? "运行质量" : "综合评分"}</TableHead>
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
                      {isRealMode ? (
                        <>
                          <TableCell>{formatRuntimeNumber(item.completedRuns)}</TableCell>
                          <TableCell>{formatRuntimeNumber(item.failedRuns)}</TableCell>
                          <TableCell>{formatRuntimePercent(item.averageConfidence)}</TableCell>
                          <TableCell>{formatRuntimeNumber(item.evidenceCount)}</TableCell>
                          <TableCell>{formatRuntimeNumber(item.reportCount)}</TableCell>
                          <TableCell>{formatRuntimeNumber(item.riskWarnings)}</TableCell>
                          <TableCell>{formatRuntimeNumber(item.decisionCount)}</TableCell>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
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

          {isRealMode ? (
            <div className="leaderboard-chart-grid grid grid-cols-1 xl:grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">运行质量对比</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {runtimeQualityRank.map((item) => {
                    const width = Math.max(8, Math.min(100, item.runtimeQualityScore ?? item.scoreIndex));
                    return (
                      <div key={item.strategyId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="truncate max-w-[180px]">{item.strategyName}</span>
                          <span className="text-emerald-600">{(item.runtimeQualityScore ?? item.scoreIndex).toFixed(1)}</span>
                        </div>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">证据覆盖对比</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {evidenceCoverageRank.map((item) => {
                    const maxEvidence = Math.max(...evidenceCoverageRank.map((rankItem) => rankItem.evidenceCount ?? 0), 1);
                    const width = ((item.evidenceCount ?? 0) / maxEvidence) * 100;
                    return (
                      <div key={item.strategyId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="truncate max-w-[180px]">{item.strategyName}</span>
                          <span>{item.evidenceCount ?? 0} evidence</span>
                        </div>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-blue-500 rounded" style={{ width: `${Math.max(width, 8)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">运行产物分布</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded border p-3">
                    <p className="text-muted-foreground">Completed Runs</p>
                    <p className="text-lg font-semibold">{rankedData.reduce((sum, item) => sum + (item.completedRuns ?? 0), 0)}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-muted-foreground">Failed Runs</p>
                    <p className="text-lg font-semibold">{rankedData.reduce((sum, item) => sum + (item.failedRuns ?? 0), 0)}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-muted-foreground">Reports</p>
                    <p className="text-lg font-semibold">{rankedData.reduce((sum, item) => sum + (item.reportCount ?? 0), 0)}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-muted-foreground">Decisions</p>
                    <p className="text-lg font-semibold">{rankedData.reduce((sum, item) => sum + (item.decisionCount ?? 0), 0)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="leaderboard-chart-grid grid grid-cols-1 xl:grid-cols-3 gap-3">
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
          )}

          <Card className="leaderboard-main-card">
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
                <p className="text-xs text-muted-foreground">Summary</p>
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
    </div>
  );
}
