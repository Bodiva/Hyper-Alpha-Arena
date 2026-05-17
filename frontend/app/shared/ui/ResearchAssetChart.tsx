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
type TechnicalIndicator =
  | "MA5"
  | "MA10"
  | "MA20"
  | "EMA20"
  | "EMA50"
  | "EMA100"
  | "VWAP"
  | "OBV"
  | "RSI14"
  | "RSI7"
  | "STOCH"
  | "MACD"
  | "BOLL"
  | "ATR14";

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

interface TechnicalIndicatorSet {
  ma: Record<"MA5" | "MA10" | "MA20", Array<number | null>>;
  ema: Record<"EMA20" | "EMA50" | "EMA100", Array<number | null>>;
  vwap: Array<number | null>;
  obv: number[];
  rsi: Record<"RSI14" | "RSI7", Array<number | null>>;
  stoch: { k: Array<number | null>; d: Array<number | null> };
  macd: { macd: Array<number | null>; signal: Array<number | null>; histogram: Array<number | null> };
  boll: { upper: Array<number | null>; middle: Array<number | null>; lower: Array<number | null> };
  atr14: Array<number | null>;
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
const TECHNICAL_INDICATOR_GROUPS: Array<{ label: string; items: TechnicalIndicator[] }> = [
  { label: "趋势", items: ["MA5", "MA10", "MA20", "EMA20", "EMA50", "EMA100"] },
  { label: "成交量", items: ["VWAP", "OBV"] },
  { label: "动量", items: ["RSI14", "RSI7", "STOCH", "MACD"] },
  { label: "波动率", items: ["BOLL", "ATR14"] },
];
const PRICE_INDICATOR_COLORS: Partial<Record<TechnicalIndicator, string>> = {
  MA5: "#2563eb",
  MA10: "#7c3aed",
  MA20: "#1f2937",
  EMA20: "#f97316",
  EMA50: "#0f766e",
  EMA100: "#64748b",
  VWAP: "#db2777",
};
const BOLL_COLORS = {
  upper: "#94a3b8",
  middle: "#475569",
  lower: "#94a3b8",
};

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

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const calculateSma = (values: number[], period: number): Array<number | null> =>
  values.map((_, index) => {
    if (index + 1 < period) return null;
    return average(values.slice(index + 1 - period, index + 1));
  });

const calculateEma = (values: number[], period: number): Array<number | null> => {
  const result: Array<number | null> = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;
  values.forEach((value, index) => {
    if (index + 1 < period) {
      result.push(null);
      return;
    }
    if (ema == null) {
      ema = average(values.slice(index + 1 - period, index + 1));
    } else {
      ema = (value - ema) * multiplier + ema;
    }
    result.push(ema);
  });
  return result;
};

const calculateRsi = (values: number[], period: number): Array<number | null> => {
  const result: Array<number | null> = values.map(() => null);
  if (values.length <= period) return result;
  for (let index = period; index < values.length; index += 1) {
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const diff = values[cursor] - values[cursor - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    if (losses === 0) {
      result[index] = 100;
    } else {
      const rs = gains / losses;
      result[index] = 100 - 100 / (1 + rs);
    }
  }
  return result;
};

const calculateTechnicalIndicators = (series: ResearchPoint[]): TechnicalIndicatorSet => {
  const closes = series.map((point) => point.close);
  const highs = series.map((point) => point.high);
  const lows = series.map((point) => point.low);
  const volumes = series.map((point) => point.volume);
  const ma20 = calculateSma(closes, 20);
  const ema12 = calculateEma(closes, 12);
  const ema26 = calculateEma(closes, 26);
  const macdLine = closes.map((_, index) =>
    ema12[index] != null && ema26[index] != null ? (ema12[index] as number) - (ema26[index] as number) : null,
  );
  const macdSignal = calculateEma(macdLine.map((value) => value ?? 0), 9).map((value, index) => (macdLine[index] == null ? null : value));
  const vwap: Array<number | null> = [];
  const obv: number[] = [];
  const atr14: Array<number | null> = [];
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;
  let runningObv = 0;
  const trueRanges: number[] = [];

  series.forEach((point, index) => {
    const typical = (point.high + point.low + point.close) / 3;
    cumulativeTypicalVolume += typical * point.volume;
    cumulativeVolume += point.volume;
    vwap.push(cumulativeVolume > 0 ? cumulativeTypicalVolume / cumulativeVolume : null);
    if (index === 0) {
      obv.push(0);
    } else {
      if (point.close > series[index - 1].close) runningObv += point.volume;
      if (point.close < series[index - 1].close) runningObv -= point.volume;
      obv.push(runningObv);
    }
    const previousClose = index > 0 ? series[index - 1].close : point.close;
    trueRanges.push(Math.max(point.high - point.low, Math.abs(point.high - previousClose), Math.abs(point.low - previousClose)));
    atr14.push(index + 1 >= 14 ? average(trueRanges.slice(index + 1 - 14, index + 1)) : null);
  });

  const stochK = closes.map((close, index) => {
    if (index + 1 < 14) return null;
    const low = Math.min(...lows.slice(index + 1 - 14, index + 1));
    const high = Math.max(...highs.slice(index + 1 - 14, index + 1));
    return high === low ? 50 : ((close - low) / (high - low)) * 100;
  });
  const stochD = stochK.map((_, index) => {
    if (index + 1 < 3) return null;
    const window = stochK.slice(index - 2, index + 1).filter((value): value is number => value != null);
    return window.length === 3 ? average(window) : null;
  });
  const bollStd = closes.map((_, index) => {
    if (index + 1 < 20 || ma20[index] == null) return null;
    const window = closes.slice(index + 1 - 20, index + 1);
    const middle = ma20[index] as number;
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / window.length;
    return Math.sqrt(variance);
  });

  return {
    ma: {
      MA5: calculateSma(closes, 5),
      MA10: calculateSma(closes, 10),
      MA20: ma20,
    },
    ema: {
      EMA20: calculateEma(closes, 20),
      EMA50: calculateEma(closes, 50),
      EMA100: calculateEma(closes, 100),
    },
    vwap,
    obv,
    rsi: {
      RSI14: calculateRsi(closes, 14),
      RSI7: calculateRsi(closes, 7),
    },
    stoch: { k: stochK, d: stochD },
    macd: {
      macd: macdLine,
      signal: macdSignal,
      histogram: macdLine.map((value, index) => (value != null && macdSignal[index] != null ? value - (macdSignal[index] as number) : null)),
    },
    boll: {
      upper: ma20.map((value, index) => (value != null && bollStd[index] != null ? value + 2 * (bollStd[index] as number) : null)),
      middle: ma20,
      lower: ma20.map((value, index) => (value != null && bollStd[index] != null ? value - 2 * (bollStd[index] as number) : null)),
    },
    atr14,
  };
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
  selectedIndicators,
}: {
  series: ResearchPoint[];
  chartType: DisplayChartType;
  compact: boolean;
  visibleDays: number;
  selectedIndicators: TechnicalIndicator[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicators = useMemo(() => calculateTechnicalIndicators(series), [series]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || series.length === 0) return;
    const indicatorSet = new Set(selectedIndicators);
    const hasMomentumPane = indicatorSet.has("RSI14") || indicatorSet.has("RSI7") || indicatorSet.has("STOCH");
    const hasMacdPane = indicatorSet.has("MACD");
    const hasAtrPane = indicatorSet.has("ATR14");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || (compact ? 380 : 500),
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
    const momentumPane = hasMomentumPane ? chart.addPane() : null;
    const macdPane = hasMacdPane ? chart.addPane() : null;
    const atrPane = hasAtrPane ? chart.addPane() : null;
    chart.panes()[0].setStretchFactor(4);
    volumePane.setStretchFactor(1);
    momentumPane?.setStretchFactor(1);
    macdPane?.setStretchFactor(1);
    atrPane?.setStretchFactor(1);

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

    const volumeSeries = volumePane.addSeries(HistogramSeries, {
      color: "#94a3b8",
      priceFormat: { type: "volume" },
    });
    const createLineData = (values: Array<number | null>) =>
      values
        .map((value, index) => (value == null ? null : { time: series[index].date as Time, value }))
        .filter((item): item is { time: Time; value: number } => item != null);

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
    (["MA5", "MA10", "MA20"] as const).forEach((indicator) => {
      if (!indicatorSet.has(indicator)) return;
      const line = chart.addSeries(LineSeries, {
        color: PRICE_INDICATOR_COLORS[indicator],
        lineWidth: indicator === "MA20" ? 1.5 : 1,
        lineStyle: indicator === "MA20" ? 2 : 0,
      });
      line.setData(createLineData(indicators.ma[indicator]));
    });
    (["EMA20", "EMA50", "EMA100"] as const).forEach((indicator) => {
      if (!indicatorSet.has(indicator)) return;
      const line = chart.addSeries(LineSeries, {
        color: PRICE_INDICATOR_COLORS[indicator],
        lineWidth: 1,
      });
      line.setData(createLineData(indicators.ema[indicator]));
    });
    if (indicatorSet.has("VWAP")) {
      const line = chart.addSeries(LineSeries, {
        color: PRICE_INDICATOR_COLORS.VWAP,
        lineWidth: 1.5,
        lineStyle: 2,
      });
      line.setData(createLineData(indicators.vwap));
    }
    if (indicatorSet.has("BOLL")) {
      [
        ["upper", BOLL_COLORS.upper, 2],
        ["middle", BOLL_COLORS.middle, 1],
        ["lower", BOLL_COLORS.lower, 2],
      ].forEach(([key, color, lineStyle]) => {
        const line = chart.addSeries(LineSeries, {
          color: color as string,
          lineWidth: key === "middle" ? 1 : 1,
          lineStyle: lineStyle as 0 | 1 | 2 | 3 | 4,
        });
        line.setData(createLineData(indicators.boll[key as keyof typeof indicators.boll]));
      });
    }
    volumeSeries.setData(volumeData);
    if (indicatorSet.has("OBV")) {
      const obvSeries = volumePane.addSeries(LineSeries, {
        color: "#0f766e",
        lineWidth: 1,
        priceFormat: { type: "volume" },
      });
      obvSeries.setData(createLineData(indicators.obv));
    }
    if (momentumPane) {
      if (indicatorSet.has("RSI14")) {
        const rsi = momentumPane.addSeries(LineSeries, { color: "#7c3aed", lineWidth: 1 });
        rsi.setData(createLineData(indicators.rsi.RSI14));
      }
      if (indicatorSet.has("RSI7")) {
        const rsi = momentumPane.addSeries(LineSeries, { color: "#2563eb", lineWidth: 1 });
        rsi.setData(createLineData(indicators.rsi.RSI7));
      }
      if (indicatorSet.has("STOCH")) {
        const k = momentumPane.addSeries(LineSeries, { color: "#f97316", lineWidth: 1 });
        const d = momentumPane.addSeries(LineSeries, { color: "#0f766e", lineWidth: 1, lineStyle: 2 });
        k.setData(createLineData(indicators.stoch.k));
        d.setData(createLineData(indicators.stoch.d));
      }
    }
    if (macdPane) {
      const histogram = macdPane.addSeries(HistogramSeries, {
        color: "#94a3b8",
        priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      });
      histogram.setData(
        indicators.macd.histogram
          .map((value, index) =>
            value == null
              ? null
              : {
                  time: series[index].date as Time,
                  value,
                  color: value >= 0 ? "rgba(95, 191, 116, 0.72)" : "rgba(223, 91, 79, 0.72)",
                },
          )
          .filter((item): item is { time: Time; value: number; color: string } => item != null),
      );
      const macd = macdPane.addSeries(LineSeries, { color: "#2563eb", lineWidth: 1 });
      const signal = macdPane.addSeries(LineSeries, { color: "#f97316", lineWidth: 1 });
      macd.setData(createLineData(indicators.macd.macd));
      signal.setData(createLineData(indicators.macd.signal));
    }
    if (atrPane) {
      const atr = atrPane.addSeries(LineSeries, { color: "#dc2626", lineWidth: 1 });
      atr.setData(createLineData(indicators.atr14));
    }
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, series.length - visibleDays),
      to: series.length + 5,
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight || (compact ? 380 : 500),
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [chartType, compact, indicators, selectedIndicators, series, visibleDays]);

  return <div ref={containerRef} className={compact ? "h-[400px] w-full" : "h-[520px] w-full"} />;
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
  const [selectedIndicators, setSelectedIndicators] = useState<TechnicalIndicator[]>(["MA20"]);
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
  const toggleTechnicalIndicator = (indicator: TechnicalIndicator) => {
    setSelectedIndicators((items) =>
      items.includes(indicator) ? items.filter((item) => item !== indicator) : [...items, indicator],
    );
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
      <CardHeader className="border-b px-4 py-2.5">
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
      <CardContent className="space-y-2 p-3">
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

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/10 px-2 py-2">
          <div className="flex flex-wrap gap-1.5">
            <div className="min-w-[88px] rounded border bg-background px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "最新" : "Last"} </span>
              <span className="font-medium">{formatValue(stats.latestClose)}</span>
            </div>
            <div className="min-w-[88px] rounded border bg-background px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "收益" : "Return"} </span>
              <span className={stats.cumulativeReturn >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
                {formatPercent(stats.cumulativeReturn)}
              </span>
            </div>
            <div className="min-w-[88px] rounded border bg-background px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "回撤" : "DD"} </span>
              <span className="font-medium text-red-600">{formatPercent(stats.maxDrawdown)}</span>
            </div>
            <div className="min-w-[88px] rounded border bg-background px-2 py-1 text-xs">
              <span className="text-muted-foreground">{isZh ? "趋势" : "Regime"} </span>
              <span className={`font-medium ${toneClass(stats.trendTone)}`}>{stats.trendLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            {(Object.keys(RANGE_CONFIG) as RangeKey[]).map((item) => (
              <Button key={item} size="sm" variant={range === item ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setRange(item)}>
                {RANGE_CONFIG[item].label}
              </Button>
            ))}
            {(["candlestick", "line", "area"] as DisplayChartType[]).map((item) => (
              <Button key={item} size="sm" variant={chartType === item ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setChartType(item)}>
                {chartTypeLabel[item]}
              </Button>
            ))}
          </div>
        </div>

        {klineError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">ClickHouse K线加载失败：{klineError}</p> : null}

        {activeTab === "kline" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-blue-100 bg-blue-50/40 px-2 py-2 text-xs">
            <div className="flex items-center gap-2">
              <p className="font-medium">{isZh ? "技术指标" : "Technical Indicators"}</p>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setSelectedIndicators([])}>
                {isZh ? "清空" : "Clear"}
              </Button>
            </div>
            {TECHNICAL_INDICATOR_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">{group.label}</span>
                {group.items.map((indicator) => (
                  <Button
                    key={indicator}
                    size="sm"
                    variant={selectedIndicators.includes(indicator) ? "default" : "outline"}
                    className="h-6 rounded-md px-2 text-xs"
                    onClick={() => toggleTechnicalIndicator(indicator)}
                  >
                    {indicator}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {(["kline", "profile", "managers"] as AssetResearchTab[]).map((tab) => (
            <Button key={tab} size="sm" variant={activeTab === tab ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setActiveTab(tab)}>
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
          <div className="space-y-2">
            <div className="rounded-md border bg-[#fbfcff] px-2 py-2">
            {isLoadingKlines ? (
              <div className={compact ? "flex h-[400px] items-center justify-center text-sm text-muted-foreground" : "flex h-[520px] items-center justify-center text-sm text-muted-foreground"}>
                {isZh ? "正在加载 ClickHouse K线..." : "Loading ClickHouse K-lines..."}
              </div>
            ) : series.length > 0 ? (
              <ResearchKlineChart
                series={series}
                chartType={chartType}
                compact={compact}
                visibleDays={RANGE_CONFIG[range].days}
                selectedIndicators={selectedIndicators}
              />
            ) : (
              <div className={compact ? "flex h-[400px] items-center justify-center text-sm text-muted-foreground" : "flex h-[520px] items-center justify-center text-sm text-muted-foreground"}>
                {isZh ? "暂无 ClickHouse K线数据" : "No ClickHouse K-line data"}
              </div>
            )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
