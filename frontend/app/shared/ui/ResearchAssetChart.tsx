import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ExternalLink, Search, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type Time,
} from "lightweight-charts";
import type { Asset } from "@/entities/asset/model";
import {
  getAssetFundManagersAsync,
  getAssetMarketKlinesAsync,
  getAssetMarketSnapshotAsync,
  type AlphaTraceFundManagerProfile,
  type AlphaTraceFundManagerProfileResponse,
  type AlphaTraceMarketKline,
  type AlphaTraceMarketQuote,
  type AlphaTraceMarketSnapshot,
} from "@/entities/asset/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y";
type DisplayChartType = "candlestick" | "line" | "area";
type AssetResearchTab = "kline" | "profile" | "managers";

interface ResearchAssetChartProps {
  asset: Asset;
  compact?: boolean;
  marketQuote?: AlphaTraceMarketQuote;
  marketSnapshot?: AlphaTraceMarketSnapshot;
  assetOptions?: Asset[];
  selectedAssetId?: string;
  onSelectAsset?: (assetId: string) => void;
  onOpenAsset?: () => void;
  onStartAgentAnalysis?: () => void;
}

interface ResearchPoint {
  date: string;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ma20: number | null;
  drawdown: number;
  volatility: number;
  flow: number;
  volume: number;
}

interface ResearchStats {
  cumulativeReturn: number;
  maxDrawdown: number;
  latestVolatility: number;
  latestClose: number;
  trendLabel: string;
  trendTone: "positive" | "neutral" | "negative";
}

const RANGE_CONFIG: Record<RangeKey, { label: string; days: number }> = {
  "1M": { label: "1M", days: 30 },
  "3M": { label: "3M", days: 66 },
  "6M": { label: "6M", days: 126 },
  "1Y": { label: "1Y", days: 252 },
  "3Y": { label: "3Y", days: 756 },
  "5Y": { label: "5Y", days: 1260 },
};
const KLINE_HISTORY_LIMIT = 1500;

const formatDateLabel = (date: Date): string => {
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const mapKlinesToResearchSeries = (klines: AlphaTraceMarketKline[]): ResearchPoint[] => {
  let runningHigh = 0;
  const closes: number[] = [];
  const returns: number[] = [];

  return klines.map((item, index) => {
    const date = new Date(item.datetime);
    const open = item.open || item.close;
    const high = item.high || Math.max(open, item.close);
    const low = item.low || Math.min(open, item.close);
    const close = item.close;
    const previousClose = index > 0 ? klines[index - 1].close : close;
    const dailyReturn = previousClose > 0 ? close / previousClose - 1 : 0;
    returns.push(dailyReturn);
    runningHigh = Math.max(runningHigh || high, high, close);
    closes.push(close);
    const maWindow = closes.slice(Math.max(0, closes.length - 20));
    const ma20 = maWindow.length >= 5 ? maWindow.reduce((sum, item) => sum + item, 0) / maWindow.length : null;
    const returnWindow = returns.slice(Math.max(0, returns.length - 20));
    const avgReturn = returnWindow.reduce((sum, value) => sum + value, 0) / Math.max(returnWindow.length, 1);
    const variance =
      returnWindow.reduce((sum, value) => sum + (value - avgReturn) ** 2, 0) / Math.max(returnWindow.length, 1);
    const dateText = item.datetime.slice(0, 10);

    return {
      date: dateText,
      label: formatDateLabel(date),
      open,
      high,
      low,
      close,
      ma20,
      drawdown: (close / runningHigh - 1) * 100,
      volatility: Math.sqrt(variance) * Math.sqrt(252) * 100,
      flow: item.amount,
      volume: item.volume,
    };
  });
};

const computeResearchStats = (series: ResearchPoint[]): ResearchStats => {
  if (series.length === 0) {
    return {
      cumulativeReturn: 0,
      maxDrawdown: 0,
      latestVolatility: 0,
      latestClose: 0,
      trendLabel: "无数据",
      trendTone: "neutral",
    };
  }
  const first = series[0];
  const latest = series[series.length - 1];
  const previous = series[Math.max(0, series.length - 8)];
  const cumulativeReturn = first ? (latest.close / first.close - 1) * 100 : 0;
  const maxDrawdown = Math.min(...series.map((point) => point.drawdown), 0);
  const latestVolatility = latest.volatility;
  const trendScore = latest.ma20 == null ? latest.close - previous.close : latest.close - latest.ma20;
  const trendLabel = trendScore > latest.close * 0.01 ? "上行" : trendScore < -latest.close * 0.01 ? "转弱" : "震荡";
  const trendTone = trendLabel === "上行" ? "positive" : trendLabel === "转弱" ? "negative" : "neutral";

  return {
    cumulativeReturn,
    maxDrawdown,
    latestVolatility,
    latestClose: latest.close,
    trendLabel,
    trendTone,
  };
};

const formatPercent = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

const formatValue = (value: number): string => {
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

const formatDays = (value: unknown): string => {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(days) || days <= 0) return "-";
  if (days >= 365) return `${(days / 365).toFixed(1)}年`;
  return `${Math.round(days)}天`;
};

const toneClass = (tone: ResearchStats["trendTone"]): string => {
  if (tone === "positive") return "text-emerald-600";
  if (tone === "negative") return "text-red-600";
  return "text-amber-600";
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const asRecordArray = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const isRatioKey = (key: string): boolean => /收益|回撤|占比|费率|股息|溢折价|换手|ratio|rate|return|drawdown|premium/i.test(key);

const formatProfileValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (isRatioKey(key) && Math.abs(value) <= 5) return `${(value * 100).toFixed(2)}%`;
    if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
    if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
    return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
  }
  if (typeof value === "string") {
    return value.length > 88 ? `${value.slice(0, 88)}...` : value;
  }
  return String(value);
};

function SnapshotMetricGrid({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => !Array.isArray(value) && !isRecord(value));
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <p className="mb-2 text-xs font-medium">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {entries.slice(0, 8).map(([key, value]) => (
          <div key={`${title}-${key}`} className="min-w-0">
            <span className="text-muted-foreground">{key}: </span>
            <span className="break-words font-medium">{formatProfileValue(key, value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FundFlowProfile({ data }: { data: Record<string, unknown> }) {
  const managers = asRecordArray(data["管理人"]);
  const holdings = asRecordArray(data["前十大持仓"]);
  const industries = asRecordArray(data["行业配置"]);
  const allocation = asRecord(data["资产配置"]);
  const fees = asRecord(data["费用"]);
  if (managers.length === 0 && holdings.length === 0 && industries.length === 0 && Object.keys(allocation).length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">配置 / 持仓 / 费用</p>
        {managers.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            管理人 {managers.map((item) => formatProfileValue("manager", item.manager_name)).join(" / ")}
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-1 text-xs">
          <p className="font-medium text-muted-foreground">资产配置</p>
          {Object.entries(allocation).slice(0, 5).map(([key, value]) => (
            <p key={key}>
              {key}: <span className="font-medium">{formatProfileValue(key, value)}</span>
            </p>
          ))}
          {Object.entries(fees).slice(0, 3).map(([key, value]) => (
            <p key={key}>
              {key}: <span className="font-medium">{formatProfileValue(key, value)}</span>
            </p>
          ))}
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-medium text-muted-foreground">行业配置</p>
          {industries.slice(0, 5).map((item) => (
            <p key={String(item.industry_code ?? item.industry_name)}>
              {formatProfileValue("industry", item.industry_name)}
              <span className="ml-2 font-medium">{formatProfileValue("占比", item.net_value_ratio)}</span>
            </p>
          ))}
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-medium text-muted-foreground">前十大持仓</p>
          {holdings.slice(0, 6).map((item) => (
            <p key={String(item.holding_stock_code)}>
              {formatProfileValue("code", item.holding_stock_code)}
              <span className="ml-2 text-muted-foreground">{formatProfileValue("market", item.stock_area_code)}</span>
              <span className="ml-2 font-medium">{formatProfileValue("占比", item.net_value_ratio)}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManagerProfileCard({
  manager,
  onExternalSearch,
  isSearching,
}: {
  manager: AlphaTraceFundManagerProfile;
  onExternalSearch: () => void;
  isSearching: boolean;
}) {
  const currentFund = asRecord(manager.currentFund);
  const basic = asRecord(manager.basic);
  const career = asRecord(manager.career);
  const funds = asRecordArray(manager.managedFunds);
  const performance = asRecord(manager.performance);
  const externalItems = asRecordArray(manager.externalSearch?.items);
  const resume = formatProfileValue("resume", basic.resume);
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{manager.managerName}</p>
            <Badge variant={manager.status === "在任" ? "default" : "secondary"} className="rounded-md">
              {manager.status}
            </Badge>
            {manager.styleSignals.map((tag) => (
              <Badge key={`${manager.managerCode}-${tag}`} variant="outline" className="rounded-md">
                {tag}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {manager.managerCode} · 本基金任职 {formatDays(currentFund.tenureDays)} · 全市场从业 {formatDays(career.careerDays)}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={onExternalSearch} disabled={isSearching}>
          <Search className="h-3.5 w-3.5" />
          {isSearching ? "检索中" : "Bocha 外部线索"}
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <SnapshotMetricGrid
          title="任职概览"
          data={{
            管理基金数: career.totalFunds,
            在任基金数: career.activeFunds,
            在任规模: career.activeScale,
            当前基金任职: formatDays(currentFund.tenureDays),
            首次任职: career.firstAppointment,
            在任平均ROI: career.averageActiveTenureRoi,
            在任年化ROI: career.averageActiveAnnualizedRoi,
            规模加权ROI: career.scaleWeightedActiveTenureRoi,
            在任平均近1年: career.averageActiveReturn1y,
            在任最深回撤: career.worstActiveDrawdown,
          }}
        />
        <SnapshotMetricGrid title="理杏仁经理指标" data={performance} />
        <div className="rounded-md border bg-muted/10 p-3 xl:col-span-2">
          <p className="mb-2 text-xs font-medium">履历摘要</p>
          <p className="text-xs leading-5 text-muted-foreground">{resume}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border bg-muted/10 p-3">
          <p className="mb-2 text-xs font-medium">管理基金画像</p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">基金</th>
                  <th className="py-1 pr-3 font-medium">状态</th>
                  <th className="py-1 pr-3 font-medium">任职</th>
                  <th className="py-1 pr-3 font-medium">规模</th>
                  <th className="py-1 pr-3 font-medium">任职ROI</th>
                  <th className="py-1 pr-3 font-medium">年化ROI</th>
                  <th className="py-1 pr-3 font-medium">近1年</th>
                  <th className="py-1 pr-3 font-medium">回撤</th>
                  <th className="py-1 pr-3 font-medium">换手</th>
                </tr>
              </thead>
              <tbody>
                {funds.slice(0, 12).map((fund) => (
                  <tr key={`${manager.managerCode}-${String(fund.fundCode)}`} className="border-t">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{formatProfileValue("fundName", fund.fundName)}</div>
                      <div className="text-muted-foreground">{formatProfileValue("fundCode", fund.fundCode)}</div>
                    </td>
                    <td className="py-2 pr-3">{fund.isActive ? "在任" : "离任"}</td>
                    <td className="py-2 pr-3">{formatDays(fund.tenureDays)}</td>
                    <td className="py-2 pr-3">{formatProfileValue("规模", fund.latestScale)}</td>
                    <td className="py-2 pr-3">
                      <div>{formatProfileValue("ROI", fund.tenureRoi)}</div>
                      <div className="text-muted-foreground">{formatProfileValue("来源", fund.roiSource)}</div>
                    </td>
                    <td className="py-2 pr-3">{formatProfileValue("ROI", fund.annualizedRoi)}</td>
                    <td className="py-2 pr-3">{formatProfileValue("收益", fund.return1y)}</td>
                    <td className="py-2 pr-3">{formatProfileValue("回撤", fund.latestDrawdown)}</td>
                    <td className="py-2 pr-3">{formatProfileValue("换手", fund.turnoverRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-md border bg-muted/10 p-3">
          <p className="mb-2 text-xs font-medium">外部线索</p>
          <p className="mb-2 text-xs text-muted-foreground">{manager.externalSearch?.message ?? manager.externalSearch?.query}</p>
          <div className="space-y-2">
            {externalItems.length > 0 ? (
              externalItems.slice(0, 3).map((item, index) => (
                <a
                  key={`${manager.managerCode}-external-${index}`}
                  href={String(item.url ?? "#")}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border bg-background p-2 text-xs hover:border-primary/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{formatProfileValue("title", item.title)}</span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-muted-foreground">{formatProfileValue("summary", item.summary)}</p>
                </a>
              ))
            ) : (
              <div className="rounded-md border border-dashed bg-background px-3 py-6 text-center text-xs text-muted-foreground">
                暂无外部线索。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FundManagerProfilePanel({
  profile,
  isLoading,
  error,
  onExternalSearch,
  isSearching,
}: {
  profile?: AlphaTraceFundManagerProfileResponse;
  isLoading: boolean;
  error: string | null;
  onExternalSearch: () => void;
  isSearching: boolean;
}) {
  if (isLoading) {
    return <div className="rounded-md border bg-muted/10 px-3 py-10 text-center text-sm text-muted-foreground">正在读取基金经理画像...</div>;
  }
  if (error) {
    return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">基金经理画像加载失败：{error}</p>;
  }
  if (!profile || profile.managers.length === 0) {
    return <div className="rounded-md border bg-muted/10 px-3 py-10 text-center text-sm text-muted-foreground">暂无基金经理画像。</div>;
  }
  return (
    <div className="space-y-3">
      {profile.managers.map((manager) => (
        <ManagerProfileCard
          key={manager.managerCode}
          manager={manager}
          onExternalSearch={onExternalSearch}
          isSearching={isSearching}
        />
      ))}
    </div>
  );
}

function ResearchKlineChart({
  series,
  chartType,
  compact,
  visibleDays,
}: {
  series: ResearchPoint[];
  chartType: DisplayChartType;
  compact: boolean;
  visibleDays: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || series.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || (compact ? 420 : 540),
      layout: {
        background: { color: "transparent" },
        textColor: "#8f98a8",
        attributionLogo: false,
      },
      localization: {
        locale: "en-US",
        priceFormatter: formatValue,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.14)" },
        horzLines: { color: "rgba(148, 163, 184, 0.14)" },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(100, 116, 139, 0.45)", width: 1, style: 0 },
        horzLine: { color: "rgba(100, 116, 139, 0.45)", width: 1, style: 0 },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.25)",
        minimumWidth: 72,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.25)",
        timeVisible: false,
        secondsVisible: false,
        barSpacing: compact ? 7 : 9,
        rightBarStaysOnScroll: false,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
    });

    const volumePane = chart.addPane();
    chart.panes()[0].setStretchFactor(2);
    volumePane.setStretchFactor(1);

    const mainSeries =
      chartType === "candlestick"
        ? chart.addSeries(CandlestickSeries, {
            upColor: "#5fbf74",
            downColor: "#df5b4f",
            borderUpColor: "#5fbf74",
            borderDownColor: "#df5b4f",
            wickUpColor: "#5fbf74",
            wickDownColor: "#df5b4f",
          })
        : chartType === "area"
          ? chart.addSeries(AreaSeries, {
              lineColor: "#4169f5",
              topColor: "rgba(65, 105, 245, 0.22)",
              bottomColor: "rgba(65, 105, 245, 0.03)",
              lineWidth: 2,
            })
          : chart.addSeries(LineSeries, {
              color: "#4169f5",
              lineWidth: 2,
            });

    const ma20Series = chart.addSeries(LineSeries, {
      color: "#1f2937",
      lineWidth: 1,
      lineStyle: 2,
    });
    const volumeSeries = volumePane.addSeries(HistogramSeries, {
      color: "#94a3b8",
      priceFormat: { type: "volume" },
    });

    const candleData = series.map((point) => ({
      time: point.date as Time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    }));
    const lineData = series.map((point) => ({
      time: point.date as Time,
      value: point.close,
    }));
    const ma20Data = series
      .filter((point) => point.ma20 != null)
      .map((point) => ({
        time: point.date as Time,
        value: point.ma20 as number,
      }));
    const volumeData = series.map((point) => ({
      time: point.date as Time,
      value: point.volume,
      color: point.close >= point.open ? "rgba(95, 191, 116, 0.78)" : "rgba(223, 91, 79, 0.78)",
    }));

    if (chartType === "candlestick") {
      mainSeries.setData(candleData);
    } else {
      mainSeries.setData(lineData);
    }
    ma20Series.setData(ma20Data);
    volumeSeries.setData(volumeData);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, series.length - visibleDays),
      to: series.length + 5,
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight || (compact ? 420 : 540),
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [chartType, compact, series, visibleDays]);

  return <div ref={containerRef} className={compact ? "h-[440px] w-full" : "h-[560px] w-full"} />;
}

export default function ResearchAssetChart({
  asset,
  compact = false,
  marketQuote,
  marketSnapshot,
  assetOptions,
  selectedAssetId,
  onSelectAsset,
  onOpenAsset,
  onStartAgentAnalysis,
}: ResearchAssetChartProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const [range, setRange] = useState<RangeKey>("6M");
  const [chartType, setChartType] = useState<DisplayChartType>("candlestick");
  const [activeTab, setActiveTab] = useState<AssetResearchTab>("kline");
  const [marketKlines, setMarketKlines] = useState<AlphaTraceMarketKline[]>([]);
  const [snapshot, setSnapshot] = useState<AlphaTraceMarketSnapshot | undefined>(marketSnapshot);
  const [managerProfile, setManagerProfile] = useState<AlphaTraceFundManagerProfileResponse | undefined>();
  const [isLoadingKlines, setIsLoadingKlines] = useState(false);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);
  const [isSearchingManagers, setIsSearchingManagers] = useState(false);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [managerError, setManagerError] = useState<string | null>(null);
  const series = useMemo(() => mapKlinesToResearchSeries(marketKlines), [marketKlines]);
  const visibleSeries = useMemo(() => series.slice(-RANGE_CONFIG[range].days), [range, series]);
  const stats = useMemo(() => computeResearchStats(visibleSeries), [visibleSeries]);
  const activeSnapshot = snapshot ?? marketSnapshot;
  const sourceLabel = marketKlines[0]?.source ?? marketQuote?.source ?? activeSnapshot?.source ?? "ClickHouse";
  const chartTypeLabel: Record<DisplayChartType, string> = {
    candlestick: isZh ? "蜡烛图" : "Candles",
    line: isZh ? "折线图" : "Line",
    area: isZh ? "面积图" : "Area",
  };
  const assetChartLabel: Record<Asset["assetType"], string> = {
    ETF: isZh ? "ETF K线" : "ETF K-line",
    FUND: isZh ? "基金净值K线" : "Fund NAV K-line",
    FUTURE: isZh ? "期货主连K线" : "Futures K-line",
    INDEX: isZh ? "指数K线" : "Index K-line",
  };
  const tabLabel: Record<AssetResearchTab, string> = {
    kline: isZh ? "K线" : "K-line",
    profile: isZh ? "资产画像" : "Profile",
    managers: isZh ? "基金经理" : "Managers",
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoadingKlines(true);
    setKlineError(null);
    getAssetMarketKlinesAsync(asset.id, KLINE_HISTORY_LIMIT)
      .then((items) => {
        if (cancelled) return;
        setMarketKlines(items);
      })
      .catch((error) => {
        if (cancelled) return;
        setMarketKlines([]);
        setKlineError(error instanceof Error ? error.message : "ClickHouse K-line request failed.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingKlines(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(marketSnapshot);
    getAssetMarketSnapshotAsync(asset.id)
      .then((item) => {
        if (!cancelled) {
          setSnapshot(item);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot(marketSnapshot);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, marketSnapshot]);

  useEffect(() => {
    let cancelled = false;
    if (asset.assetType !== "ETF" && asset.assetType !== "FUND") {
      setManagerProfile(undefined);
      setManagerError(null);
      setIsLoadingManagers(false);
      return () => {
        cancelled = true;
      };
    }
    setIsLoadingManagers(true);
    setManagerError(null);
    getAssetFundManagersAsync(asset.id)
      .then((item) => {
        if (!cancelled) {
          setManagerProfile(item);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setManagerProfile(undefined);
          setManagerError(error instanceof Error ? error.message : "ClickHouse manager profile request failed.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingManagers(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.assetType]);

  const refreshManagersWithExternal = () => {
    if (asset.assetType !== "ETF" && asset.assetType !== "FUND") return;
    setIsSearchingManagers(true);
    setManagerError(null);
    getAssetFundManagersAsync(asset.id, true)
      .then((item) => {
        setManagerProfile(item);
      })
      .catch((error) => {
        setManagerError(error instanceof Error ? error.message : "Bocha external manager search failed.");
      })
      .finally(() => {
        setIsSearchingManagers(false);
      });
  };

  return (
    <Card className="shrink-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle className="text-sm">{assetChartLabel[asset.assetType]}</CardTitle>
            <Badge variant="secondary" className="rounded-md">{asset.symbol}</Badge>
            <span className="text-xs text-muted-foreground">{asset.name}</span>
            <span className="text-xs text-muted-foreground">{asset.market}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">{sourceLabel}</span>
            {onOpenAsset ? (
              <Button size="sm" variant="outline" className="h-8" onClick={onOpenAsset}>
                {isZh ? "详情" : "Detail"}
              </Button>
            ) : null}
            {onStartAgentAnalysis ? (
              <Button size="sm" className="h-8" onClick={onStartAgentAnalysis}>
                <Bot className="h-3.5 w-3.5" />
                Agent
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {assetOptions?.length && onSelectAsset ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {assetOptions.slice(0, compact ? 8 : 12).map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={(selectedAssetId ?? asset.id) === option.id ? "default" : "outline"}
                className="h-8 shrink-0"
                onClick={() => onSelectAsset(option.id)}
              >
                {option.symbol}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[96px] rounded-md border px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "最新" : "Last"} </span>
              <span className="font-medium">{formatValue(stats.latestClose)}</span>
            </div>
            <div className="min-w-[96px] rounded-md border px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "收益" : "Return"} </span>
              <span className={stats.cumulativeReturn >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
                {formatPercent(stats.cumulativeReturn)}
              </span>
            </div>
            <div className="min-w-[96px] rounded-md border px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "回撤" : "DD"} </span>
              <span className="font-medium text-red-600">{formatPercent(stats.maxDrawdown)}</span>
            </div>
            <div className="min-w-[96px] rounded-md border px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "趋势" : "Regime"} </span>
              <span className={`font-medium ${toneClass(stats.trendTone)}`}>{stats.trendLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {(Object.keys(RANGE_CONFIG) as RangeKey[]).map((item) => (
              <Button key={item} size="sm" variant={range === item ? "default" : "outline"} className="h-8" onClick={() => setRange(item)}>
                {RANGE_CONFIG[item].label}
              </Button>
            ))}
            {(["candlestick", "line", "area"] as DisplayChartType[]).map((item) => (
              <Button key={item} size="sm" variant={chartType === item ? "default" : "outline"} className="h-8" onClick={() => setChartType(item)}>
                {chartTypeLabel[item]}
              </Button>
            ))}
          </div>
        </div>

        {klineError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">ClickHouse K线加载失败：{klineError}</p> : null}

        <div className="flex flex-wrap gap-2 border-b pb-2">
          {(["kline", "profile", "managers"] as AssetResearchTab[]).map((tab) => (
            <Button key={tab} size="sm" variant={activeTab === tab ? "default" : "outline"} className="h-8" onClick={() => setActiveTab(tab)}>
              {tabLabel[tab]}
            </Button>
          ))}
        </div>

        {activeTab === "profile" && activeSnapshot ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <SnapshotMetricGrid title={asset.assetType === "INDEX" ? "指数估值" : "净值 / 估值"} data={activeSnapshot.valuation} />
            <SnapshotMetricGrid title="流动性 / 规模" data={activeSnapshot.liquidity} />
            <SnapshotMetricGrid title="风险收益" data={activeSnapshot.volatility} />
            <SnapshotMetricGrid title="基础资料" data={activeSnapshot.trend} />
            <FundFlowProfile data={activeSnapshot.fundFlow} />
            <SnapshotMetricGrid title="溢折价" data={activeSnapshot.premiumDiscount} />
          </div>
        ) : null}

        {activeTab === "managers" ? (
          <FundManagerProfilePanel
            profile={managerProfile}
            isLoading={isLoadingManagers}
            error={managerError}
            onExternalSearch={refreshManagersWithExternal}
            isSearching={isSearchingManagers}
          />
        ) : null}

        {activeTab === "kline" ? (
          <div className="rounded-md border bg-[#fbfcff] px-2 py-2">
            {isLoadingKlines ? (
              <div className={compact ? "flex h-[440px] items-center justify-center text-sm text-muted-foreground" : "flex h-[560px] items-center justify-center text-sm text-muted-foreground"}>
                {isZh ? "正在加载 ClickHouse K线..." : "Loading ClickHouse K-lines..."}
              </div>
            ) : series.length > 0 ? (
              <ResearchKlineChart series={series} chartType={chartType} compact={compact} visibleDays={RANGE_CONFIG[range].days} />
            ) : (
              <div className={compact ? "flex h-[440px] items-center justify-center text-sm text-muted-foreground" : "flex h-[560px] items-center justify-center text-sm text-muted-foreground"}>
                {isZh ? "暂无 ClickHouse K线数据" : "No ClickHouse K-line data"}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
