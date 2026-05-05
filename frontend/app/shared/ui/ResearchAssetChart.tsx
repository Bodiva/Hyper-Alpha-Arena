import { useEffect, useMemo, useRef, useState } from "react";
import { Bot } from "lucide-react";
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
import type { AlphaTraceMarketQuote, AlphaTraceMarketSnapshot } from "@/entities/asset/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RangeKey = "1M" | "3M" | "6M" | "1Y";
type DisplayChartType = "candlestick" | "line" | "area";

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
};

const hashSeed = (value: string): number => {
  return value.split("").reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100_000, 17);
};

const getBaseValue = (asset: Asset, quote?: AlphaTraceMarketQuote): number => {
  if (quote?.price && quote.price > 0) return quote.price;
  if (asset.assetType === "FUND") return asset.profile.nav;
  if (asset.assetType === "FUTURE") return Math.max(20, 100 + asset.profile.basis * 2);
  if (asset.assetType === "ETF") return Math.max(0.5, asset.profile.aum / 1_000_000_000);
  return 100;
};

const getResearchProfile = (asset: Asset) => {
  if (asset.assetType === "ETF") {
    return {
      drift: (asset.profile.liquidityScore - 70) / 9000,
      volatility: 0.006 + asset.profile.trackingError / 800,
      cycle: asset.profile.premiumDiscount / 10,
    };
  }
  if (asset.assetType === "FUND") {
    return {
      drift: asset.profile.drawdown > 15 ? -0.00015 : 0.00018,
      volatility: 0.005 + asset.profile.drawdown / 2800,
      cycle: asset.profile.holdings.length / 20,
    };
  }
  if (asset.assetType === "FUTURE") {
    return {
      drift: asset.profile.basis / 6000,
      volatility: 0.012 + Math.min(0.018, asset.profile.volume / 20_000_000),
      cycle: asset.profile.openInterest / 900_000,
    };
  }
  const maxExposure = Math.max(...asset.profile.sectorExposure.map((item) => item.value), 0);
  return {
    drift: 0.00008,
    volatility: 0.006 + maxExposure / 5000,
    cycle: asset.profile.constituents.length / 18,
  };
};

const formatDateLabel = (date: Date): string => {
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const generateResearchSeries = (asset: Asset, range: RangeKey, quote?: AlphaTraceMarketQuote): ResearchPoint[] => {
  const seed = hashSeed(`${asset.id}-${asset.symbol}`);
  const { days } = RANGE_CONFIG[range];
  const profile = getResearchProfile(asset);
  const baseValue = getBaseValue(asset, quote);
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  let previousClose = baseValue * (1 - profile.drift * days * 0.45);
  let runningHigh = previousClose;
  const points: ResearchPoint[] = [];
  const closes: number[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - days + index + 1);
    const wave = Math.sin((index + seed % 19) * 0.17) + Math.cos((index + seed % 23) * 0.071 + profile.cycle);
    const impulse = Math.sin((index + 1) * ((seed % 7) + 3) * 0.037) * 0.45;
    const dailyReturn = profile.drift + (wave + impulse) * profile.volatility * 0.38;
    const open = previousClose * (1 + Math.sin(index + seed) * profile.volatility * 0.1);
    const close = Math.max(baseValue * 0.1, previousClose * (1 + dailyReturn));
    const wick = Math.max(open, close) * profile.volatility * (0.8 + Math.abs(wave) * 0.3);
    const high = Math.max(open, close) + wick;
    const low = Math.max(baseValue * 0.05, Math.min(open, close) - wick * 0.85);

    runningHigh = Math.max(runningHigh, high);
    closes.push(close);
    const maWindow = closes.slice(Math.max(0, closes.length - 20));
    const ma20 = maWindow.length >= 5 ? maWindow.reduce((sum, item) => sum + item, 0) / maWindow.length : null;

    points.push({
      date: date.toISOString().slice(0, 10),
      label: formatDateLabel(date),
      open,
      high,
      low,
      close,
      ma20,
      drawdown: (close / runningHigh - 1) * 100,
      volatility: profile.volatility * 100 * (1 + Math.abs(wave) * 0.35),
      flow: Math.sin(index * 0.13 + seed) * 40 + profile.drift * 25_000,
      volume: Math.max(1, Math.abs(Math.sin(index * 0.19 + seed) + 0.25) * 50 + Math.abs(dailyReturn) * 18_000),
    });

    previousClose = close;
  }

  if (quote?.price && points.length > 0) {
    const scale = quote.price / points[points.length - 1].close;
    return points.map((point) => ({
      ...point,
      open: point.open * scale,
      high: point.high * scale,
      low: point.low * scale,
      close: point.close * scale,
      ma20: point.ma20 == null ? null : point.ma20 * scale,
    }));
  }

  return points;
};

const computeResearchStats = (series: ResearchPoint[]): ResearchStats => {
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

const toneClass = (tone: ResearchStats["trendTone"]): string => {
  if (tone === "positive") return "text-emerald-600";
  if (tone === "negative") return "text-red-600";
  return "text-amber-600";
};

function ResearchKlineChart({
  series,
  chartType,
  compact,
}: {
  series: ResearchPoint[];
  chartType: DisplayChartType;
  compact: boolean;
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
    chart.timeScale().fitContent();

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
  }, [chartType, compact, series]);

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
  const series = useMemo(() => generateResearchSeries(asset, range, marketQuote), [asset, marketQuote, range]);
  const stats = useMemo(() => computeResearchStats(series), [series]);
  const sourceLabel = marketQuote?.source ?? marketSnapshot?.source ?? "AlphaTrace research seed";
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

  return (
    <Card className="overflow-hidden">
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

        <div className="rounded-md border bg-[#fbfcff] px-2 py-2">
          <ResearchKlineChart series={series} chartType={chartType} compact={compact} />
        </div>
      </CardContent>
    </Card>
  );
}
