import { useMemo, useState } from "react";
import { ChevronDown, Cloud, CloudSun, Star } from "lucide-react";

type Timeframe = "1h" | "4h" | "1d";
type Source = "综合行情" | "关注资产池";
type FilterValue = "ALL" | string;

interface RadarAsset {
  symbol: string;
  name: string;
  assetType: "ETF" | "基金" | "股票" | "期货" | "指数";
  price: string;
  confidence: number;
  rank: number;
  accent: string;
  bg: string;
  adx: number;
  atr: string;
  bandwidth: number;
  location: "inside" | "upper" | "lower";
  participation: string;
  flow: string;
  dmi: string;
  lastPrice: string;
  note: string;
}

interface StrategyIdea {
  id: number;
  title: string;
  type: "定投" | "分批" | "风控" | "再平衡";
  period: "1h" | "4h" | "1d";
  risk: "低" | "中" | "高";
  summary: string;
  logic: string;
  tags: string[];
}

const RADAR_ASSETS: RadarAsset[] = [
  { symbol: "510300", name: "沪深300 ETF", assetType: "ETF", price: "¥3.78", confidence: 52, rank: 1, accent: "#ef6f6c", bg: "#331515", adx: 23.5, atr: "1.03x", bandwidth: 60, location: "inside", participation: "成交温和", flow: "份额稳定", dmi: "22.8 / 19.6", lastPrice: "3.78", note: "区间仍未选择方向，适合先定义突破和失效条件。" },
  { symbol: "510050", name: "上证50 ETF", assetType: "ETF", price: "¥2.68", confidence: 49, rank: 2, accent: "#4f8cff", bg: "#10213f", adx: 22.7, atr: "0.98x", bandwidth: 55, location: "inside", participation: "高流动性", flow: "资金中性", dmi: "21.9 / 19.2", lastPrice: "2.68", note: "权重板块偏防守，等待银行、保险和消费权重同步确认。" },
  { symbol: "510500", name: "中证500 ETF", assetType: "ETF", price: "¥5.42", confidence: 44, rank: 3, accent: "#60a5fa", bg: "#12243b", adx: 21.1, atr: "1.19x", bandwidth: 70, location: "inside", participation: "成交温和", flow: "资金分歧", dmi: "20.4 / 21.8", lastPrice: "5.42", note: "中盘弹性尚未形成趋势，先等待方向选择。" },
  { symbol: "159845", name: "中证1000 ETF", assetType: "ETF", price: "¥2.13", confidence: 41, rank: 4, accent: "#8b5cf6", bg: "#29163f", adx: 20.4, atr: "1.24x", bandwidth: 73, location: "inside", participation: "活跃", flow: "小幅流出", dmi: "19.6 / 22.4", lastPrice: "2.13", note: "小盘波动较高但趋势不清，适合先控制观察仓位。" },
  { symbol: "159915", name: "创业板 ETF", assetType: "ETF", price: "¥1.92", confidence: 42, rank: 5, accent: "#c0569c", bg: "#32162d", adx: 22.8, atr: "1.16x", bandwidth: 69, location: "inside", participation: "成交温和", flow: "资金偏弱", dmi: "21.0 / 20.4", lastPrice: "1.92", note: "成长风格方向不稳，不适合追单。" },
  { symbol: "588000", name: "科创50 ETF", assetType: "ETF", price: "¥0.84", confidence: 41, rank: 6, accent: "#14b8a6", bg: "#0f302c", adx: 20.9, atr: "1.11x", bandwidth: 66, location: "inside", participation: "成交温和", flow: "资金分歧", dmi: "19.8 / 20.7", lastPrice: "0.84", note: "结构仍处于修复早期，等待成交同步放大。" },
  { symbol: "512480", name: "半导体 ETF", assetType: "基金", price: "¥0.91", confidence: 38, rank: 7, accent: "#7c8cff", bg: "#24173d", adx: 19.6, atr: "1.28x", bandwidth: 72, location: "lower", participation: "活跃", flow: "资金流出", dmi: "18.3 / 24.2", lastPrice: "0.91", note: "波动有扩张但方向偏弱，反弹前需要先看止跌结构。" },
  { symbol: "512880", name: "证券 ETF", assetType: "基金", price: "¥0.79", confidence: 47, rank: 8, accent: "#f97316", bg: "#321b12", adx: 23.2, atr: "1.31x", bandwidth: 79, location: "inside", participation: "活跃", flow: "波动流入", dmi: "24.8 / 18.6", lastPrice: "0.79", note: "券商弹性较高，但需要指数成交额同步放大确认。" },
  { symbol: "515790", name: "光伏 ETF", assetType: "基金", price: "¥0.62", confidence: 35, rank: 9, accent: "#22c55e", bg: "#11281e", adx: 18.9, atr: "1.35x", bandwidth: 76, location: "lower", participation: "成交活跃", flow: "资金流出", dmi: "17.2 / 25.9", lastPrice: "0.62", note: "行业仍偏弱，策略应先等待底部结构或放量反转。" },
  { symbol: "512690", name: "酒 ETF", assetType: "基金", price: "¥0.72", confidence: 45, rank: 10, accent: "#d6a63d", bg: "#2d2411", adx: 21.6, atr: "1.07x", bandwidth: 58, location: "inside", participation: "成交温和", flow: "资金中性", dmi: "21.4 / 19.1", lastPrice: "0.72", note: "消费权重处于震荡修复，先观察区间上沿是否被有效拿回。" },
  { symbol: "515030", name: "新能源车 ETF", assetType: "基金", price: "¥1.04", confidence: 39, rank: 11, accent: "#10b981", bg: "#0f302c", adx: 20.2, atr: "1.22x", bandwidth: 71, location: "inside", participation: "活跃", flow: "资金偏弱", dmi: "19.3 / 22.1", lastPrice: "1.04", note: "板块弹性仍在，但资金没有形成连续流入。" },
  { symbol: "512170", name: "医疗 ETF", assetType: "基金", price: "¥0.36", confidence: 37, rank: 12, accent: "#fb7185", bg: "#35161d", adx: 18.8, atr: "1.18x", bandwidth: 67, location: "lower", participation: "成交温和", flow: "资金流出", dmi: "17.9 / 23.4", lastPrice: "0.36", note: "医药医疗仍需等待止跌和成交回暖，不宜提前加速。" },
  { symbol: "600519", name: "贵州茅台", assetType: "股票", price: "¥1,645", confidence: 46, rank: 13, accent: "#d6a63d", bg: "#2d2411", adx: 21.2, atr: "0.94x", bandwidth: 52, location: "inside", participation: "权重活跃", flow: "资金中性", dmi: "20.9 / 18.6", lastPrice: "1,645", note: "白酒权重处于震荡修复，先观察消费 ETF 和指数是否同步走强。" },
  { symbol: "300750", name: "宁德时代", assetType: "股票", price: "¥196.8", confidence: 43, rank: 14, accent: "#22c55e", bg: "#11281e", adx: 22.4, atr: "1.21x", bandwidth: 70, location: "inside", participation: "成交活跃", flow: "资金分歧", dmi: "21.6 / 20.8", lastPrice: "196.8", note: "新能源权重仍缺少连续流入，适合只作为板块确认项观察。" },
  { symbol: "601318", name: "中国平安", assetType: "股票", price: "¥43.6", confidence: 49, rank: 15, accent: "#0ea5e9", bg: "#10283a", adx: 24.0, atr: "0.99x", bandwidth: 56, location: "inside", participation: "权重稳定", flow: "资金中性", dmi: "23.4 / 17.9", lastPrice: "43.6", note: "金融权重偏稳，更多用于确认上证50和沪深300的风险偏好。" },
  { symbol: "IF", name: "沪深300 股指期货", assetType: "期货", price: "3,890", confidence: 51, rank: 16, accent: "#38bdf8", bg: "#10283a", adx: 27.7, atr: "1.26x", bandwidth: 82, location: "inside", participation: "持仓增加", flow: "基差收敛", dmi: "30.7 / 13.7", lastPrice: "3,890", note: "趋势上行方向信号偏弱，仍需现货指数同步确认。" },
  { symbol: "IH", name: "上证50 股指期货", assetType: "期货", price: "2,635", confidence: 48, rank: 17, accent: "#38bdf8", bg: "#10283a", adx: 24.2, atr: "1.02x", bandwidth: 57, location: "inside", participation: "持仓稳定", flow: "基差稳定", dmi: "23.8 / 18.5", lastPrice: "2,635", note: "权重指数更偏防守，等待上证50和沪深300是否同步确认。" },
  { symbol: "IC", name: "中证500 股指期货", assetType: "期货", price: "5,420", confidence: 43, rank: 18, accent: "#a855f7", bg: "#29163f", adx: 21.1, atr: "1.19x", bandwidth: 70, location: "inside", participation: "持仓回落", flow: "基差分歧", dmi: "20.4 / 21.8", lastPrice: "5,420", note: "中盘弹性尚未形成趋势，先等待方向选择。" },
  { symbol: "AU", name: "沪金期货", assetType: "期货", price: "¥558", confidence: 64, rank: 19, accent: "#eab54f", bg: "#2d2411", adx: 32.6, atr: "1.34x", bandwidth: 84, location: "upper", participation: "持仓高位", flow: "避险流入", dmi: "35.8 / 13.9", lastPrice: "558", note: "趋势和避险资金同步，入场需要明确回撤与止损规则。" },
  { symbol: "AG", name: "沪银期货", assetType: "期货", price: "¥7,120", confidence: 57, rank: 20, accent: "#94a3b8", bg: "#1f2937", adx: 28.9, atr: "1.42x", bandwidth: 86, location: "upper", participation: "成交活跃", flow: "资金流入", dmi: "31.6 / 16.2", lastPrice: "7,120", note: "波动扩张明显，适合等待回撤后的二次确认。" },
  { symbol: "CSI300", name: "沪深300 指数", assetType: "指数", price: "3,875", confidence: 50, rank: 21, accent: "#ef4444", bg: "#35161d", adx: 24.9, atr: "1.05x", bandwidth: 62, location: "inside", participation: "指数观察", flow: "资金中性", dmi: "24.1 / 18.9", lastPrice: "3,875", note: "指数仍在区间内，等待资金和期指同步给出方向。" },
  { symbol: "SSE50", name: "上证50 指数", assetType: "指数", price: "2,640", confidence: 48, rank: 22, accent: "#0ea5e9", bg: "#10283a", adx: 23.8, atr: "0.99x", bandwidth: 53, location: "inside", participation: "指数观察", flow: "权重稳定", dmi: "22.5 / 18.4", lastPrice: "2,640", note: "权重指数处于压缩区间，先等待金融和消费权重确认。" },
];

const STRATEGIES: StrategyIdea[] = [
  { id: 6, title: "宽基 ETF 分批买入计划", type: "分批", period: "1h", risk: "低", summary: "当沪深300、上证50等宽基处于震荡区间时，优先使用小额分批，而不是一次性买满。", logic: "先设定总预算和 3-5 次买入节奏；只有当指数仍在区间内且资金流没有明显恶化时执行下一笔。", tags: ["宽基", "分批"] },
  { id: 7, title: "行业主题暂停新增规则", type: "风控", period: "1h", risk: "中", summary: "半导体、光伏、新能源等主题基金波动较高，若趋势和资金流同时偏弱，先暂停新增。", logic: "不做追跌补仓。等待止跌结构、成交回暖或同类 ETF 强弱排名改善后，再恢复观察仓位。", tags: ["主题", "暂停"] },
  { id: 8, title: "定投候选筛选", type: "定投", period: "1d", risk: "低", summary: "适合定投的标的应具备长期代表性、成交活跃、波动可承受，而不是只看短期涨跌。", logic: "优先选择宽基和核心行业 ETF；若连续多期资金流偏弱，则降低本期定投金额。", tags: ["定投", "核心池"] },
  { id: 9, title: "已有持仓再平衡提醒", type: "再平衡", period: "4h", risk: "中", summary: "当某类资产短期涨幅过快或仓位占比偏离目标，先考虑再平衡，而不是继续加仓。", logic: "检查目标仓位、当前仓位和风险等级；超配主题基金优先减速，低配宽基可等待回调补足。", tags: ["持仓", "再平衡"] },
  { id: 10, title: "同类 ETF 替代比较", type: "分批", period: "1d", risk: "低", summary: "同一指数或行业下，优先比较成交活跃度、跟踪稳定性和波动状态，再决定是否加入关注池。", logic: "若两个标的主题相同，优先保留成交更活跃、波动更可控、资金流更稳定的候选。", tags: ["同类比较", "流动性"] },
  { id: 11, title: "宏观事件冷却规则", type: "风控", period: "1h", risk: "中", summary: "在重要会议、利率、汇率或政策窗口附近，基金/ETF 买入应降低节奏，等待波动回落。", logic: "事件前不扩大主题仓位；事件后至少等待一次受控回踩或区间确认，再恢复分批计划。", tags: ["宏观", "冷却"] },
  { id: 12, title: "止损后观察清单重置", type: "风控", period: "1h", risk: "低", summary: "某个基金或 ETF 失效后，不应立刻用同一理由补回，而是重新判断它在关注池里的优先级。", logic: "记录失效原因、同类替代和新的观察条件；下一笔买入必须重新满足资金流、趋势和风险预算。", tags: ["重置", "复盘"] },
  { id: 13, title: "高波动主题轻仓规则", type: "定投", period: "4h", risk: "高", summary: "当主题 ETF 波动明显高于宽基时，即使出现机会，也应降低单次买入比例。", logic: "仅使用小额观察仓位；若成交参与度过热或价格接近波动上沿，等待回调后再评估。", tags: ["主题", "轻仓"] },
];

const formatUpdatedAt = () => "2026-05-05 12:00";

const valueForLocation = (location: RadarAsset["location"]) => {
  if (location === "upper") return "上沿附近";
  if (location === "lower") return "下沿附近";
  return "区间内";
};

const typeMark = (assetType: RadarAsset["assetType"]) => {
  if (assetType === "ETF") return "E";
  if (assetType === "基金") return "F";
  if (assetType === "股票") return "S";
  if (assetType === "期货") return "Q";
  if (assetType === "指数") return "I";
  return "A";
};

const decisionForAsset = (asset: RadarAsset) => {
  if (asset.location === "lower" && asset.confidence < 42) return "暂缓新增";
  if (asset.location === "upper" && asset.confidence >= 57) return "等待回调";
  if (asset.assetType === "ETF" && asset.confidence >= 50) return "可小额分批";
  if (asset.assetType === "基金" && asset.confidence < 42) return "观察止跌";
  if (asset.assetType === "股票") return "仅作权重观察";
  return "震荡观察";
};

const bucketForAsset = (asset: RadarAsset) => {
  if (asset.assetType === "股票") return "权重观察";
  if (asset.assetType === "期货") return "对冲参考";
  if (asset.assetType === "指数") return "市场基准";
  if (asset.name.includes("沪深300") || asset.name.includes("上证50") || asset.name.includes("中证") || asset.name.includes("创业板") || asset.name.includes("科创50")) return "宽基核心";
  return "行业主题";
};

const riskForAsset = (asset: RadarAsset) => {
  if (asset.assetType === "股票" || asset.location === "lower" || asset.bandwidth >= 75) return "较高";
  if (asset.assetType === "ETF" && asset.bandwidth < 65) return "中低";
  return "中等";
};

const horizonForAsset = (asset: RadarAsset) => {
  if (asset.assetType === "期货") return "日内-2周";
  if (asset.assetType === "股票") return "2-6周";
  return "2-8周";
};

export default function StrategyRadarPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("510300");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [source, setSource] = useState<Source>("综合行情");
  const [sort, setSort] = useState("推荐");
  const [typeFilter, setTypeFilter] = useState<FilterValue>("ALL");
  const [periodFilter, setPeriodFilter] = useState<FilterValue>("ALL");
  const [riskFilter, setRiskFilter] = useState<FilterValue>("ALL");

  const selectedAsset = RADAR_ASSETS.find((asset) => asset.symbol === selectedSymbol) ?? RADAR_ASSETS[0];
  const selectedDecision = decisionForAsset(selectedAsset);
  const filteredStrategies = useMemo(() => {
    return STRATEGIES
      .filter((strategy) => typeFilter === "ALL" || strategy.type === typeFilter)
      .filter((strategy) => periodFilter === "ALL" || strategy.period === periodFilter)
      .filter((strategy) => riskFilter === "ALL" || strategy.risk === riskFilter)
      .sort((a, b) => (sort === "策略 #" ? a.id - b.id : a.risk.localeCompare(b.risk, "zh-CN") || a.id - b.id));
  }, [periodFilter, riskFilter, sort, typeFilter]);

  return (
    <div className="h-full w-full max-w-full overflow-auto overflow-x-hidden bg-[#080a10] p-4 text-[#e9eefb] md:p-6">
      <div className="mx-auto flex w-full max-w-[calc(100vw-2rem)] min-w-0 flex-col gap-5 md:max-w-[1840px]">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">Strategy Radar</p>
          <h1 className="sr-only">Strategy Radar</h1>
          <p className="max-w-full break-words text-sm leading-6 text-[#c7d5ee] md:max-w-4xl">
            把用户关注的基金、ETF 和少量权重观察项翻译成可执行的定投、分批、观察和再平衡计划。
          </p>
        </header>

        <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(560px,0.98fr)_minmax(560px,1.02fr)]">
          <section className="flex min-h-0 w-full max-w-full min-w-0 flex-col gap-4">
            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-white/14 bg-[#15161f] shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
              <div className="flex flex-col items-stretch justify-between gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center md:px-6">
                <button className="flex h-14 w-full min-w-0 items-center gap-3 rounded-lg border border-white/16 bg-white/[0.06] px-3 text-left transition hover:bg-white/[0.09] sm:w-auto sm:pr-5">
                  <span className="flex size-9 items-center justify-center rounded-full" style={{ backgroundColor: selectedAsset.accent }}>
                    <span className="text-sm font-bold text-white">{typeMark(selectedAsset.assetType)}</span>
                  </span>
                  <span className="min-w-0 text-xl font-semibold">{selectedAsset.symbol}</span>
                  <ChevronDown className="size-4 text-slate-400" />
                </button>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                  <span className="text-xs text-slate-400">资产环境</span>
                  <div className="flex shrink-0 rounded-lg border border-white/10 bg-[#10121a] p-1">
                    {(["1h", "4h", "1d"] as Timeframe[]).map((item) => (
                      <button
                        key={item}
                        className={`h-8 min-w-10 rounded-md px-2 text-xs font-semibold transition sm:min-w-12 sm:px-3 ${timeframe === item ? "bg-white/12 text-white" : "text-slate-400 hover:text-white"}`}
                        onClick={() => setTimeframe(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-6 px-4 py-5 md:grid-cols-[1.15fr_1fr] md:px-6">
                <div className="flex min-h-[350px] min-w-0 flex-col items-center justify-center gap-5 border-white/10 md:border-r md:pr-6">
                  <Cloud className="size-28 text-[#eef4ff] drop-shadow-[0_10px_26px_rgba(215,228,255,0.24)]" />
                  <div className="text-center">
                    <h2 className="text-4xl font-semibold tracking-tight">{selectedDecision}</h2>
                    <p className="mt-2 max-w-full break-words text-sm leading-6 text-[#c7d5ee] md:max-w-md">
                      {selectedAsset.symbol} · {selectedAsset.name}。{bucketForAsset(selectedAsset)}，适合周期 {horizonForAsset(selectedAsset)}，风险 {riskForAsset(selectedAsset)}；{selectedAsset.note}
                    </p>
                  </div>
                  <div className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-amber-300" />
                      <p className="min-w-0 break-words"><span className="font-semibold text-white">买入条件</span><span className="ml-3 text-slate-300">先确认预算、分批次数和最大回撤；若资金流、成交参与度或区间结构恶化，暂停新增。</span></p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-amber-300">建议：不自动下单，仅生成可执行的观察和买入计划。</p>
                </div>

                <div className="flex min-w-0 flex-col gap-5">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-slate-300">策略可测试度</p>
                    <div className="flex w-full min-w-0 rounded-lg border border-white/10 bg-[#10121a] p-1 sm:w-auto">
                      {(["综合行情", "关注资产池"] as Source[]).map((item) => (
                        <button
                          key={item}
                          className={`h-8 flex-1 rounded-md px-2 text-xs font-semibold transition sm:px-3 ${source === item ? "bg-white/12 text-white" : "text-slate-400 hover:text-white"}`}
                          onClick={() => setSource(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div
                      className="grid size-36 place-items-center rounded-full"
                      style={{
                        background: `conic-gradient(#c9ceda ${selectedAsset.confidence * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
                      }}
                    >
                      <div className="grid size-28 place-items-center rounded-full bg-[#15161f]">
                        <span className="text-4xl font-bold">{selectedAsset.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
                    <Metric label="资产类型" value={bucketForAsset(selectedAsset)} />
                    <Metric label="适合动作" value={selectedDecision} />
                    <Metric label="ATR 相对基线" value={selectedAsset.atr} />
                    <Metric label="布林带宽分位" value={String(selectedAsset.bandwidth)} />
                    <Metric label="布林带位置" value={valueForLocation(selectedAsset.location)} />
                    <Metric label="最新价" value={selectedAsset.lastPrice} />
                    <Metric label="参与度" value={selectedAsset.participation} />
                    <Metric label="风险等级" value={riskForAsset(selectedAsset)} />
                  </div>
                  <p className="text-xs text-slate-400">更新时间 · {formatUpdatedAt()} · {source} · {timeframe}</p>
                </div>
              </div>
            </div>

            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#13151d] p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-1">
                <p className="text-sm text-slate-300">关注资产热力图</p>
                <p className="text-sm text-[#d8e5ff]">用户关注的基金、ETF、少量权重股票、期货和指数按当前决策状态着色，点击可聚焦。</p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {RADAR_ASSETS.map((asset) => (
                  <button
                    key={asset.symbol}
                    onClick={() => setSelectedSymbol(asset.symbol)}
                    className={`min-w-0 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-white/35 ${
                      selectedSymbol === asset.symbol ? "border-[#e6edf8] bg-white/[0.08]" : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: asset.accent }}>
                          {typeMark(asset.assetType)}
                        </span>
                        <p className="text-sm font-semibold leading-none">{asset.symbol}</p>
                      </div>
                      <span className="shrink-0 text-xs text-[#c7d5ee]">{asset.confidence}%</span>
                    </div>
                    <p className="mt-1 truncate pl-10 text-[11px] text-slate-400">{bucketForAsset(asset)} · {asset.name}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-[#d5e4ff]">
                      <CloudSun className="size-4 text-slate-100" />
                      <span>{asset.price}</span>
                      <span className="text-slate-500">· {decisionForAsset(asset)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 w-full max-w-full min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#13141b] p-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Cloud className="size-4 text-slate-100" />
                <span>匹配 {selectedDecision}</span>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <FilterSelect label="排序" value={sort} options={["推荐", "策略 #"]} onChange={setSort} />
                <FilterSelect label="类型" value={typeFilter} options={["ALL", "定投", "分批", "风控", "再平衡"]} onChange={setTypeFilter} />
                <FilterSelect label="周期" value={periodFilter} options={["ALL", "1h", "4h", "1d"]} onChange={setPeriodFilter} />
                <FilterSelect label="风险" value={riskFilter} options={["ALL", "低", "中", "高"]} onChange={setRiskFilter} />
              </div>
            </div>

            <div className="w-full min-w-0 rounded-lg border border-white/70 bg-[#13141b] p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>因子：</span>
                <span className="rounded bg-white/10 px-2 py-0.5">资金流</span>
                <span className="rounded bg-white/10 px-2 py-0.5">参与度</span>
              </div>
              <p className="break-words text-sm leading-6 text-slate-300">不自动下单。根据资金流、成交参与度、波动区间和用户持仓意图，生成观察、定投、分批或再平衡建议。</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <span>风控过滤 · {timeframe}</span>
                <span className="flex items-center gap-1 font-semibold"><Star className="size-4 fill-slate-500 text-slate-500" /> SUNYARD AI精选</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {filteredStrategies.map((strategy) => (
                <article key={strategy.id} className="w-full min-w-0 rounded-lg border border-white/70 bg-[#11131a] p-5 transition hover:bg-[#151821]">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold tracking-tight">{strategy.title}</h3>
                      <p className="mt-3 break-words text-sm leading-6 text-slate-300">{strategy.summary}</p>
                    </div>
                    <span className="w-fit shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">策略 #{strategy.id}</span>
                  </div>
                  <p className="mt-3 break-words text-sm leading-6 text-slate-400">{strategy.logic}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <div className="flex flex-wrap gap-2">
                      <span>{strategy.type}规划 · {strategy.period}</span>
                      {strategy.tags.map((tag) => <span key={tag} className="rounded bg-white/[0.06] px-2 py-0.5">{tag}</span>)}
                    </div>
                    <span className="flex items-center gap-1 font-semibold"><Star className="size-4 fill-slate-500 text-slate-500" /> SUNYARD AI精选</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-white/10 pb-1.5">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0e1119] px-3 text-xs text-slate-300">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent font-semibold text-white outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#0e1119] text-white">
            {option === "ALL" ? "全部" : option}
          </option>
        ))}
      </select>
    </label>
  );
}
