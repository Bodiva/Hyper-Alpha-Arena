import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  LayoutGrid,
  ListFilter,
  Loader2,
  Mail,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import remarkGfm from "remark-gfm";
import { apiRequest } from "@/lib/api";
import { navigateTo } from "@/shared/lib/navigation";
import "./DashboardTestPage.css";

type Trend = "up" | "down" | "neutral";
type NewsTabKey = "market" | "portfolio" | "watchlist";
type WatchTabKey = "watchlist" | "portfolio";
type DateRangeKey = "all" | "1h" | "6h" | "24h" | "7d";

interface IndexData {
  assetId?: string;
  name: string;
  symbol: string;
  assetType?: string;
  semanticLabel?: string;
  price: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
  asOfDate?: string | null;
  dataSource?: string;
  sourceName?: string | null;
  sparklineData?: Array<{ time: string; val: number }>;
}

interface InsightTopic {
  text: string;
  trend: Trend;
}

interface Insight {
  market_insight_id: string;
  type: "market_update" | "personalized" | "pre_market" | "post_market";
  headline: string;
  summary: string;
  summaryHtml?: string | null;
  completed_at: string;
  topics: InsightTopic[];
  sources?: Array<{ title: string; source: string; url?: string | null; summary: string }>;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  tickers: string[];
  summary: string;
  url?: string | null;
  publishedAt?: string | null;
  isHot?: boolean;
}

interface DashboardTestBochaResponse {
  status: "completed" | "empty" | "disabled" | "failed" | string;
  query: string;
  message?: string | null;
  newsItems: NewsItem[];
  insight?: Insight | null;
  cacheHit?: boolean;
  cachedAt?: string | null;
  cacheExpiresAt?: string | null;
}

interface DashboardTestMarketCardsResponse {
  status: "completed" | "unavailable" | string;
  message?: string | null;
  cards: IndexData[];
}

interface WatchlistRow {
  watchlist_item_id: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
}

interface PortfolioRow {
  user_portfolio_id: string;
  symbol: string;
  price: number;
  quantity: number;
  average_cost: number;
  marketValue: number;
  unrealizedPlPercent: number;
  isPositive: boolean;
}

interface EarningsEntry {
  symbol: string;
  date: string;
  companyName: string;
}

const marketCardPlaceholders = [
  {
    name: "宽基ETF",
    symbol: "ETF_INDEX",
    semanticLabel: "沪深300 / 中证500 / 创业板",
    hint: "等待 ClickHouse ETF 估值与净值序列",
  },
  {
    name: "行业ETF",
    symbol: "ETF_SECTOR",
    semanticLabel: "科技 / 医药 / 消费 / 红利",
    hint: "等待行业主题 ETF 资金与涨跌映射",
  },
  {
    name: "主动权益基金",
    symbol: "EQUITY_FUND",
    semanticLabel: "股票型 / 偏股混合",
    hint: "等待基金净值、风格与持仓语义",
  },
  {
    name: "固收与债基",
    symbol: "BOND_FUND",
    semanticLabel: "中短债 / 纯债 / 固收+",
    hint: "等待债基收益与回撤指标",
  },
  {
    name: "QDII/跨境",
    symbol: "QDII_ETF",
    semanticLabel: "美股 / 港股 / 商品 / 全球配置",
    hint: "等待跨境 ETF 与 QDII 净值数据",
  },
  {
    name: "商品与另类",
    symbol: "ALT_ASSET",
    semanticLabel: "黄金 / 原油 / 商品 / 多资产",
    hint: "等待商品 ETF 与另类资产数据",
  },
];

const stockResults = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "GSPC", name: "S&P 500" },
  { symbol: "IXIC", name: "NASDAQ Composite" },
];

const loadingInsight = (): Insight => ({
  market_insight_id: "insight-loading",
  type: "market_update",
  headline: "今日市场动态正在生成",
  summary: "正在汇总实时财经资讯，并按市场简报目标过滤无关来源。完成后将展示可追溯的结构化洞察。",
  completed_at: new Date().toISOString(),
  topics: [
    { text: "市场动态", trend: "neutral" },
    { text: "数据过滤", trend: "neutral" },
  ],
});

const dateRangeLabels: Record<DateRangeKey, string> = {
  all: "全部",
  "1h": "1小时",
  "6h": "6小时",
  "24h": "24小时",
  "7d": "7天",
};
function fmt2(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt1(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function normalizeMarketAssetId(assetId?: string) {
  if (!assetId) return undefined;
  if (!assetId.startsWith("ck_etf_index_")) return assetId;
  const rawSymbol = assetId.replace("ck_etf_index_", "");
  const symbol = rawSymbol.replace(/^(SH|SZ)/i, "").replace(/\.(SH|SZ)$/i, "");
  return symbol ? `ck_index_${symbol}` : assetId;
}

function marketPath(symbol: string, assetId?: string) {
  const normalizedAssetId = normalizeMarketAssetId(assetId);
  if (normalizedAssetId) return `/assets/${encodeURIComponent(normalizedAssetId)}`;
  return `/assets/asset_${symbol.replace(/^\^/, "").toLowerCase()}`;
}

function formatRelativeTime(timestamp: string): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}m前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h前`;
  return `${Math.floor(diffHr / 24)}d前`;
}

function sanitizeInsightHtml(value?: string | null) {
  if (!value || typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(value, "text/html");
  const allowedTags = new Set(["P", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "BR"]);
  doc.body.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
  });
  return doc.body.innerHTML;
}

function cleanDashboardDisplayText(value?: string | null) {
  return String(value || "")
    .replace(/\bbocha\b\s*(实时检索|检索)?[:：]?/gi, "")
    .replace(/实时检索[:：]?/g, "")
    .replace(/检索词|模型名|接口名/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[:：，,]+/, "");
}

function InsightSummary({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const safeHtml = useMemo(() => cleanDashboardDisplayText(sanitizeInsightHtml(insight.summaryHtml)), [insight.summaryHtml]);
  if (safeHtml) {
    return <div className={`lat-insight-html ${compact ? "is-compact" : ""}`} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
  }
  return <p>{cleanDashboardDisplayText(insight.summary)}</p>;
}

function parseRelativeTime(timeStr: string) {
  const now = Date.now();
  const match = timeStr.match(/^(\d+)\s*(min|hr|hrs|hour|hours|day|days)/i);
  if (!match) return now;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "min") return now - value * 60 * 1000;
  if (unit.startsWith("hr") || unit.startsWith("hour")) return now - value * 60 * 60 * 1000;
  return now - value * 24 * 60 * 60 * 1000;
}

function getDateRangeCutoff(key: DateRangeKey) {
  const now = Date.now();
  if (key === "1h") return now - 60 * 60 * 1000;
  if (key === "6h") return now - 6 * 60 * 60 * 1000;
  if (key === "24h") return now - 24 * 60 * 60 * 1000;
  if (key === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

async function fetchDashboardTestBochaFeed(options: { llm?: boolean; timeoutMs?: number; refresh?: boolean } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  try {
    const llmParam = options.llm === false ? "&llm=false" : "";
    const refreshParam = options.refresh ? "&refresh=true" : "";
    const response = await apiRequest(`/alpha-trace/dashboard/test/bocha?limit=10${llmParam}${refreshParam}`, { signal: controller.signal });
    return response.json() as Promise<DashboardTestBochaResponse>;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchDashboardTestMarketCards() {
  const response = await apiRequest("/alpha-trace/dashboard/test/market-cards?limit=6");
  return response.json() as Promise<DashboardTestMarketCardsResponse>;
}

function formatFeedUnavailableMessage(message?: string | null) {
  const normalized = (message || "实时财经数据源未配置，当前不展示市场简报。").trim();
  return normalized
    .replace("当前显示离线样例。", "当前不展示离线样例，避免误读。")
    .replace("当前显示离线样例", "当前不展示离线样例，避免误读");
}

function feedStatusLabel(status?: string, itemCount = 0) {
  if (status === "completed") return `实时资讯 ${itemCount} 条`;
  if (status === "empty") return "已连接 · 暂无结果";
  if (status === "disabled") return "Bocha 未配置";
  if (status === "failed") return "资讯接口异常";
  return "等待资讯";
}

function briefUnavailableTitle(status?: string) {
  if (status === "empty") return "实时市场动态暂无结果";
  if (status === "disabled") return "实时资讯源未配置";
  if (status === "failed") return "实时资讯暂不可用";
  return "等待实时市场动态";
}

function briefUnavailableKicker(status?: string) {
  if (status === "empty") return "CK 已接入，等待资讯结果";
  if (status === "disabled") return "等待 Bocha 配置";
  if (status === "failed") return "实时资讯源异常";
  return "等待真实资讯源";
}

function formatMarketCardDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="lat-modal-backdrop" onMouseDown={onClose}>
      <section className="lat-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="lat-modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function DashboardHeaderReplica({
  refreshing,
  onRefreshMarket,
}: {
  refreshing: boolean;
  onRefreshMarket: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [showHelpPopover, setShowHelpPopover] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"classic" | "custom">("classic");
  const [editMode, setEditMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const clean = query.trim().toUpperCase();
    if (!clean) return [];
    return stockResults.filter((item) => item.symbol.includes(clean) || item.name.toUpperCase().includes(clean)).slice(0, 6);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const selectSymbol = (symbol: string) => {
    setQuery(symbol);
    setFocused(false);
    navigateTo(marketPath(symbol));
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const symbol = (results[0]?.symbol || query).trim().toUpperCase();
    if (symbol) selectSymbol(symbol);
  };

  return (
    <div className="lat-dashboard-header">
      <div className="lat-search-wrapper">
        <form className="lat-search-form" onSubmit={submitSearch}>
          <Search size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="搜索标的代码或名称..."
          />
          {!focused && !query ? <span className="lat-shortcut">/</span> : null}
        </form>
        {focused && query.trim() ? (
          <div className="lat-search-dropdown">
            {results.length === 0 ? (
              <div className="lat-search-empty">未找到匹配标的</div>
            ) : (
              results.map((item) => (
                <button key={item.symbol} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectSymbol(item.symbol)}>
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="lat-header-actions">
        <div className="lat-layout-toggle" role="tablist" aria-label="Dashboard layout">
          <button type="button" className={layoutMode === "classic" ? "is-active" : ""} onClick={() => setLayoutMode("classic")}>
            经典
          </button>
          <button type="button" className={layoutMode === "custom" ? "is-active" : ""} onClick={() => setLayoutMode("custom")}>
            <LayoutGrid size={12} />
            自定义
          </button>
        </div>
        {layoutMode === "custom" ? (
          <button className={`lat-icon-button ${editMode ? "is-active" : ""}`} type="button" title="编辑布局" onClick={() => setEditMode((value) => !value)}>
            <Pencil size={16} />
          </button>
        ) : null}
        <button className="lat-header-refresh" type="button" disabled={refreshing} onClick={onRefreshMarket}>
          <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
          {refreshing ? "更新中..." : "更新市场动态"}
        </button>
        <div className="lat-help" onMouseLeave={() => setShowHelpPopover(false)}>
          <button className="lat-icon-button" type="button" title="帮助" onClick={() => setShowHelpPopover((value) => !value)}>
            <HelpCircle size={20} />
          </button>
          {showHelpPopover ? (
            <div className="lat-help-popover">
              <p>需要接入真实行情或 Dashboard 数据源时可联系系统管理员。</p>
              <button type="button" onClick={() => (window.location.href = "mailto:support@alphatrace.local")}>
                <Mail size={14} />
                support@alphatrace.local
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IndexMovementCard({ indices, loading, message }: { indices: IndexData[]; loading: boolean; message?: string | null }) {
  if (!indices.length) {
    return (
      <div className="lat-index-grid">
        {marketCardPlaceholders.map((slot, i) => (
          <button key={slot.symbol} className="lat-index-card lat-index-card-placeholder" type="button" disabled style={{ animationDelay: `${i * 60}ms` }}>
            <div className="lat-index-card-head">
              <div>
                <div className="lat-index-title">
                  <h3>{slot.name}</h3>
                  <span>--</span>
                </div>
                <p>{slot.symbol}</p>
                <em className="lat-index-semantic">{slot.semanticLabel}</em>
              </div>
              <div className="lat-index-price">
                <strong>--</strong>
                <span>{loading ? "加载中" : "待接入"}</span>
              </div>
            </div>
            <div className="lat-index-chart lat-index-placeholder-body">
              <span>{loading ? "正在读取业务数据..." : slot.hint}</span>
            </div>
          </button>
        ))}
        {!loading && message ? <p className="lat-index-grid-note">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="lat-index-grid">
      {indices.map((index, i) => (
        <button
          key={index.assetId || index.symbol}
          className="lat-index-card"
          type="button"
          style={{ animationDelay: `${i * 60}ms` }}
          onClick={() => navigateTo(marketPath(index.symbol, index.assetId))}
        >
          <IndexCardContent index={index} />
        </button>
      ))}
    </div>
  );
}

function IndexCardContent({ index }: { index: IndexData }) {
  const changeStr = fmt2(index.change);
  const pctStr = `(${index.isPositive ? "+" : ""}${fmt2(index.changePercent)}%)`;
  const chartData = index.sparklineData || [];
  const asOfDate = formatMarketCardDate(index.asOfDate);
  return (
    <>
      <div className="lat-index-card-head">
        <div>
          <div className="lat-index-title">
            <h3>{index.name}</h3>
            {asOfDate ? <span>{asOfDate}</span> : null}
          </div>
          <p>{index.symbol}</p>
          <em className="lat-index-semantic">{index.semanticLabel || index.assetType || "市场标的"}</em>
        </div>
        <div className="lat-index-price">
          <strong>{fmt2(index.price)}</strong>
          <span className={index.isPositive ? "is-up" : "is-down"}>
            {changeStr} {pctStr}
          </span>
        </div>
      </div>
      <div className="lat-index-chart">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" hide />
              <Line type="monotone" dataKey="val" stroke={index.isPositive ? "var(--lat-profit)" : "var(--lat-loss)"} strokeWidth={1.75} dot={false} isAnimationActive={false} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="lat-chart-tooltip">
                      <span>{formatMarketCardDate(payload[0].payload.time)}</span>
                      <strong>收盘价：{fmt2(Number(payload[0].payload.val))}</strong>
                    </div>
                  ) : null
                }
              />
              <YAxis domain={["dataMin", "dataMax"]} hide />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <span>{index.dataSource?.startsWith("clickhouse") ? "等待更多时间序列" : "业务数据待导入"}</span>
        )}
      </div>
    </>
  );
}

function TopicBadge({ text, trend, onClick }: { text: string; trend: Trend; onClick?: () => void }) {
  return (
    <button type="button" className={`lat-topic-badge is-${trend}`} onClick={onClick}>
      #{text}
    </button>
  );
}

function AIDailyBriefCard({
  insights,
  loading,
  bochaStatus,
  bochaMessage,
  onGenerateBrief,
  onReadFull,
}: {
  insights: Insight[];
  loading: boolean;
  bochaStatus?: string;
  bochaMessage?: string | null;
  onGenerateBrief: () => Promise<Insight | null>;
  onReadFull: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const latest = insights[0] ?? loadingInsight();
  const hasUsableInsight =
    latest.market_insight_id !== "insight_market_empty" &&
    latest.market_insight_id !== "insight-loading" &&
    (latest.type === "personalized" || (bochaStatus === "completed" && (latest.sources?.length ?? 0) > 0));
  const unavailable = !loading && !hasUsableInsight;
  const unavailableMessage = formatFeedUnavailableMessage(bochaMessage || latest.summary);
  const unavailableTitle = briefUnavailableTitle(bochaStatus);
  const unavailableKicker = briefUnavailableKicker(bochaStatus);
  const latestHeadline = cleanDashboardDisplayText(latest.headline);
  const older = insights.slice(1);
  const briefListItems = older.length
    ? older.slice(0, 5).map((item) => ({
        id: item.market_insight_id,
        label: item.type === "pre_market" ? "盘前" : item.type === "personalized" ? "个性化" : "更新",
        title: item.headline,
        onOpen: () => onReadFull(item.market_insight_id),
      }))
    : (latest.sources ?? []).slice(0, 5).map((source, index) => ({
        id: `source-${index}-${source.url ?? source.title}`,
        label: source.source || "来源",
        title: source.title || source.summary,
        onOpen: () => {
          if (source.url) {
            window.open(source.url, "_blank", "noopener,noreferrer");
            return;
          }
          onReadFull(latest.market_insight_id);
        },
      }));
  const briefListLabel = older.length ? "今日较早洞察" : "简报关联来源";

  const generatePersonalized = async () => {
    if (!hasUsableInsight) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const generated = await onGenerateBrief();
      if (!generated) {
        setGenerateError("未生成新的简报，请稍后重试。");
        return;
      }
    } catch {
      setGenerateError("简报生成失败，请稍后重试。");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="lat-brief-stack">
      {!expanded && briefListItems.length > 0 ? <div className="lat-brief-shadow one" /> : null}
      {!expanded && briefListItems.length > 1 ? <div className="lat-brief-shadow two" /> : null}
      <section className={`lat-brief-card${unavailable ? " lat-brief-card-empty" : ""}`} onClick={() => !unavailable && briefListItems.length > 0 && setExpanded((value) => !value)}>
        <Newspaper className="lat-brief-watermark" size={120} />
        <div className="lat-brief-content">
          <div className="lat-brief-eyebrow">
            <span>
              <Sparkles size={12} />
              {unavailable ? "市场简报未就绪" : latest.type === "personalized" ? "AI 个性化简报" : "AI 生成洞察"}
            </span>
            <small>{loading ? "正在汇总市场动态..." : unavailable ? unavailableKicker : `更新于 ${formatRelativeTime(latest.completed_at)}`}</small>
            {bochaStatus && bochaStatus !== "completed" && !unavailable ? <small className="lat-status-warning">{formatFeedUnavailableMessage(bochaMessage)}</small> : null}
          </div>
          <h2>{unavailable ? unavailableTitle : latestHeadline}</h2>
          {unavailable ? (
            <>
              <p>{unavailableMessage}</p>
              <div className="lat-brief-state-list">
                <span>CK 市场卡片已接入</span>
                <span>实时资讯需要返回至少一条可追溯新闻来源</span>
                <span>数据不足时不生成个性化简报</span>
              </div>
            </>
          ) : (
            <>
              <InsightSummary insight={latest} compact />
              <div className="lat-topic-row">
                {latest.topics.map((topic) => (
                  <TopicBadge key={topic.text} text={topic.text} trend={topic.trend} onClick={() => navigateTo("/evidence")} />
                ))}
              </div>
            </>
          )}
          <div className="lat-brief-actions">
            {unavailable ? (
              <button
                className="lat-secondary-action"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigateTo("/data-sources");
                }}
              >
                <Zap size={16} />
                {bochaStatus === "disabled" ? "配置 Bocha 资讯源" : "查看实时资讯源"}
              </button>
            ) : (
              <button
                className="lat-secondary-action"
                type="button"
                disabled={generating}
                onClick={(event) => {
                  event.stopPropagation();
                  generatePersonalized();
                }}
              >
                <Sparkles size={16} />
                {generating ? "生成中..." : "生成个性化简报"}
              </button>
            )}
            <button
              className="lat-primary-action"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (unavailable) {
                  navigateTo("/data-catalog");
                  return;
                }
                onReadFull(latest.market_insight_id);
              }}
            >
              {unavailable ? "查看数据中心" : "阅读完整简报"}
              <ArrowRight size={16} />
            </button>
          </div>
          {generateError && !unavailable ? <p className="lat-brief-action-error">{generateError}</p> : null}
        </div>
        {!unavailable && briefListItems.length > 0 ? (
          <button
            className="lat-older-toggle"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
          >
            <Clock size={12} />
            {briefListLabel} {briefListItems.length}
            <ChevronDown size={14} className={expanded ? "is-open" : ""} />
          </button>
        ) : null}
        {expanded ? (
          <div className="lat-older-list">
            {briefListItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  item.onOpen();
                }}
              >
                <span>#{index + 1}</span>
                <i />
                <strong>{item.label}</strong>
                <em>{item.title}</em>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function NewsFeedCard({
  marketItems,
  loading,
  bochaStatus,
  bochaMessage,
  onNewsClick,
}: {
  marketItems: NewsItem[];
  loading: boolean;
  bochaStatus?: string;
  bochaMessage?: string | null;
  onNewsClick: (item: NewsItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<NewsTabKey>("market");
  const [tickerFilter, setTickerFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const preferredMarketItems = marketItems;
  const dataMap: Record<NewsTabKey, NewsItem[]> = {
    market: preferredMarketItems,
    portfolio: [],
    watchlist: [],
  };
  const tabLabels: Record<NewsTabKey, string> = {
    market: "市场动态",
    portfolio: "我的持仓",
    watchlist: "我的关注",
  };
  const tabIcons = {
    market: TrendingUp,
    portfolio: Briefcase,
    watchlist: Eye,
  };
  const items = dataMap[activeTab];
  const filteredItems = useMemo(() => {
    const query = tickerFilter.trim().toUpperCase();
    const cutoff = getDateRangeCutoff(dateRange);
    return items.filter((item) => {
      const matchTicker = !query || item.tickers.some((ticker) => ticker.toUpperCase().includes(query));
      const matchTime = dateRange === "all" || parseRelativeTime(item.time) >= cutoff;
      return matchTicker && matchTime;
    });
  }, [activeTab, dateRange, items, tickerFilter]);
  const marketSourceLabel = useMemo(() => {
    const sources = Array.from(new Set(preferredMarketItems.map((item) => item.source).filter(Boolean)));
    return sources.length ? `来源：${sources.slice(0, 6).join(" / ")}` : "来源：雪球 / 东方财富 / 新浪财经 / 财联社 / 证券时报";
  }, [preferredMarketItems]);

  return (
    <section className="lat-glass-card lat-news-card">
      <div className="lat-news-toolbar">
        <div className="lat-tab-group">
          {(Object.keys(tabLabels) as NewsTabKey[]).map((key) => {
            const Icon = tabIcons[key];
            return (
              <button
                key={key}
                type="button"
                className={activeTab === key ? "is-active" : ""}
                onClick={() => {
                  setActiveTab(key);
                  setTickerFilter("");
                  setDateRange("all");
                }}
              >
                <Icon size={13} />
                {tabLabels[key]}
              </button>
            );
          })}
        </div>
        <div className="lat-news-filters">
          <label>
            <Search size={12} />
            <input value={tickerFilter} onChange={(event) => setTickerFilter(event.target.value)} placeholder="标的代码......" />
            {tickerFilter ? (
              <button type="button" onClick={() => setTickerFilter("")}>
                <X size={11} />
              </button>
            ) : null}
          </label>
          <div>
            {(Object.keys(dateRangeLabels) as DateRangeKey[]).map((key) => (
              <button key={key} type="button" className={dateRange === key ? "is-active" : ""} onClick={() => setDateRange(key)}>
                {dateRangeLabels[key]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {activeTab === "market" ? (
        <div className="lat-market-source-strip">
          <span>{loading ? "更新中" : feedStatusLabel(bochaStatus, preferredMarketItems.length)}</span>
          <em>{bochaStatus === "completed" ? marketSourceLabel : formatFeedUnavailableMessage(bochaMessage || "实时财经数据源未就绪，当前不展示离线样例。")}</em>
        </div>
      ) : null}
      <div className="lat-news-list">
        {loading && activeTab === "market" ? (
          <div className="lat-empty-state">正在获取新浪财经、东方财富等市场动态...</div>
        ) : filteredItems.length === 0 ? (
          <div className="lat-empty-state">{tickerFilter ? "没有匹配当前筛选条件的动态" : "暂无高质量市场动态"}</div>
        ) : (
          filteredItems.map((item) => <NewsRow key={item.id} item={item} onNewsClick={onNewsClick} />)
        )}
      </div>
    </section>
  );
}

function NewsRow({ item, onNewsClick }: { item: NewsItem; onNewsClick: (item: NewsItem) => void }) {
  return (
    <button className="lat-news-row" type="button" onClick={() => onNewsClick(item)}>
      <div className="lat-news-dot" data-hot={item.isHot ? "true" : "false"} />
      <div className="lat-news-body">
        <div className="lat-news-meta">
          <strong>{item.source}</strong>
          <span>
            <Clock size={10} />
            {item.time}
          </span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary || "暂无概要，点击查看原文来源。"}</p>
        {item.tickers.length ? (
          <div className="lat-ticker-row">
            {item.tickers.map((ticker) => (
              <span key={ticker}>{ticker}</span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function PortfolioWatchlistCard() {
  const [activeTab, setActiveTab] = useState<WatchTabKey>(() => (localStorage.getItem("portfolio_active_tab") as WatchTabKey) || "watchlist");
  const [valuesHidden, setValuesHidden] = useState(() => localStorage.getItem("portfolio_values_hidden") === "true");
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [dialog, setDialog] = useState<"watchlist" | "portfolio" | null>(null);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [averageCost, setAverageCost] = useState("100");
  const totalValue = portfolio.reduce((sum, item) => sum + item.marketValue, 0);
  const totalCost = portfolio.reduce((sum, item) => sum + item.average_cost * item.quantity, 0);
  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : 0;

  const switchTab = (tab: WatchTabKey) => {
    setActiveTab(tab);
    localStorage.setItem("portfolio_active_tab", tab);
  };

  const toggleValues = () => {
    setValuesHidden((value) => {
      localStorage.setItem("portfolio_values_hidden", String(!value));
      return !value;
    });
  };

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;
    if (dialog === "watchlist") {
      setWatchlist((rows) => [
        { watchlist_item_id: `watch-${clean}-${Date.now()}`, symbol: clean, price: 0, change: 0, changePercent: 0, isPositive: true },
        ...rows,
      ]);
    } else {
      const qty = Number(quantity) || 0;
      const cost = Number(averageCost) || 0;
      setPortfolio((rows) => [
        {
          user_portfolio_id: `port-${clean}-${Date.now()}`,
          symbol: clean,
          price: cost,
          quantity: qty,
          average_cost: cost,
          marketValue: qty * cost,
          unrealizedPlPercent: 0,
          isPositive: true,
        },
        ...rows,
      ]);
    }
    setDialog(null);
    setSymbol("");
  };

  return (
    <>
      <section className="lat-glass-card lat-watch-card">
        <div className="lat-card-head">
          <h2>{activeTab === "watchlist" ? "关注标的" : "持仓"}</h2>
          <div className="lat-card-tabs">
            <button className={activeTab === "watchlist" ? "is-active" : ""} type="button" onClick={() => switchTab("watchlist")}>
              关注
            </button>
            <button className={activeTab === "portfolio" ? "is-active" : ""} type="button" onClick={() => switchTab("portfolio")}>
              持仓
            </button>
          </div>
        </div>
        <div className="lat-watch-list">
          {activeTab === "watchlist" ? (
            <>
              {watchlist.map((item) => (
                <WatchlistItem key={item.watchlist_item_id} item={item} onDelete={(id) => setWatchlist((rows) => rows.filter((row) => row.watchlist_item_id !== id))} />
              ))}
              <AddNewButton label="添加标的" onClick={() => setDialog("watchlist")} />
            </>
          ) : (
            <>
              <div className="lat-portfolio-summary">
                <div>
                  <span>净资产</span>
                  <button type="button" onClick={toggleValues} aria-label={valuesHidden ? "显示金额" : "隐藏金额"}>
                    {valuesHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <strong>{valuesHidden ? "********" : `$${fmt2(totalValue)}`}</strong>
                {!valuesHidden ? (
                  <em className={totalPl >= 0 ? "is-up" : "is-down"}>
                    {totalPl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {totalPl >= 0 ? "+" : "-"}${fmt2(Math.abs(totalPl))} ({fmt1(totalPlPct)}%)
                  </em>
                ) : null}
              </div>
              {portfolio.map((item) => (
                <PortfolioItem
                  key={item.user_portfolio_id}
                  item={item}
                  valuesHidden={valuesHidden}
                  onDelete={(id) => setPortfolio((rows) => rows.filter((row) => row.user_portfolio_id !== id))}
                />
              ))}
              <AddNewButton label="添加交易" onClick={() => setDialog("portfolio")} />
            </>
          )}
        </div>
      </section>
      {dialog ? (
        <Modal title={dialog === "watchlist" ? "添加关注标的" : "添加持仓交易"} onClose={() => setDialog(null)}>
          <form className="lat-form" onSubmit={addItem}>
            <label>
              标的代码
              <input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="例如 NVDA" autoFocus />
            </label>
            {dialog === "portfolio" ? (
              <>
                <label>
                  数量
                  <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0" step="any" />
                </label>
                <label>
                  平均成本
                  <input value={averageCost} onChange={(event) => setAverageCost(event.target.value)} type="number" min="0" step="any" />
                </label>
              </>
            ) : null}
            <div className="lat-form-actions">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button type="submit">添加</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function WatchlistItem({ item, onDelete }: { item: WatchlistRow; onDelete: (id: string) => void }) {
  return (
    <div className="lat-watch-row">
      <button type="button" onClick={() => navigateTo(marketPath(item.symbol))}>
        <span>
          <strong>{item.symbol}</strong>
          <small>关注标的</small>
        </span>
        <span className="lat-price-block">
          <strong>{fmt2(item.price)}</strong>
          <em className={item.isPositive ? "is-up" : "is-down"}>
            {item.isPositive ? "+" : ""}
            {fmt2(item.change)} · {item.isPositive ? "+" : ""}
            {fmt2(item.changePercent)}%
          </em>
        </span>
      </button>
      <button className="lat-row-icon" type="button" title="删除" onClick={() => onDelete(item.watchlist_item_id)}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PortfolioItem({ item, valuesHidden, onDelete }: { item: PortfolioRow; valuesHidden: boolean; onDelete: (id: string) => void }) {
  return (
    <div className="lat-watch-row">
      <button type="button" onClick={() => navigateTo(marketPath(item.symbol))}>
        <span>
          <strong>{item.symbol}</strong>
          <small>{valuesHidden ? "******" : `${item.quantity.toLocaleString("en-US")} shares`}</small>
        </span>
        <span className="lat-price-block">
          <strong>{valuesHidden ? "******" : `$${fmt2(item.marketValue)}`}</strong>
          <em className={item.isPositive ? "is-up" : "is-down"}>
            {item.isPositive ? "+" : ""}
            {fmt2(item.unrealizedPlPercent)}%
          </em>
        </span>
      </button>
      <button className="lat-row-icon" type="button" title="删除" onClick={() => onDelete(item.user_portfolio_id)}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AddNewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="lat-add-button" type="button" onClick={onClick}>
      <Plus size={16} />
      {label}
    </button>
  );
}

function EarningsCalendarCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const earnings: EarningsEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const recent = earnings.filter((item) => item.date < today);
  const upcoming = earnings.filter((item) => item.date >= today).slice(0, 3);
  const previewItems = [...recent, ...upcoming].slice(0, 6);

  return (
    <>
      <section className="lat-glass-card lat-earnings-card">
        <div className="lat-card-head">
          <h2>财报日历</h2>
          <button className="lat-link-button" type="button" onClick={() => setModalOpen(true)}>
            查看全部
            <ChevronRight size={12} />
          </button>
        </div>
        {previewItems.length === 0 ? (
          <div className="lat-empty-state">该时段暂无财报</div>
        ) : (
          <div className="lat-earnings-list">
            {recent.length > 0 ? <SectionLabel label="最近" /> : null}
            {recent.map((item) => (
              <EarningsItem key={`${item.symbol}-${item.date}`} item={item} isPast />
            ))}
            {upcoming.length > 0 ? <SectionLabel label="即将发布" /> : null}
            {upcoming.map((item) => (
              <EarningsItem key={`${item.symbol}-${item.date}`} item={item} />
            ))}
          </div>
        )}
      </section>
      {modalOpen ? <EarningsModal earnings={earnings} onClose={() => setModalOpen(false)} /> : null}
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div className="lat-section-label">{label}</div>;
}

function EarningsItem({ item, isPast }: { item: EarningsEntry; isPast?: boolean }) {
  const displayDate = new Date(`${item.date}T00:00:00`).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  return (
    <button className={`lat-earnings-row ${isPast ? "is-past" : ""}`} type="button" onClick={() => navigateTo(marketPath(item.symbol))}>
      <span>{item.symbol.slice(0, 2)}</span>
      <div>
        <strong>{item.symbol}</strong>
        <small>{item.companyName}</small>
      </div>
      <em>{displayDate}</em>
    </button>
  );
}

function EarningsModal({ earnings, onClose }: { earnings: EarningsEntry[]; onClose: () => void }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, EarningsEntry[]>();
    earnings.forEach((item) => grouped.set(item.date, [...(grouped.get(item.date) || []), item]));
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [earnings]);
  const [activeDate, setActiveDate] = useState(groups[0]?.[0] || "");
  const activeItems = groups.find(([date]) => date === activeDate)?.[1] || [];
  return (
    <Modal title="财报日历" onClose={onClose}>
      <div className="lat-date-tabs">
        {groups.map(([date, items]) => {
          const d = new Date(`${date}T00:00:00`);
          return (
            <button key={date} type="button" className={activeDate === date ? "is-active" : ""} onClick={() => setActiveDate(date)}>
              <span>{d.toLocaleDateString("zh-CN", { weekday: "short" })}</span>
              <strong>{d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}</strong>
              <small>{items.length} 只</small>
            </button>
          );
        })}
      </div>
      <div className="lat-earnings-modal-grid">
        {activeItems.map((item) => (
          <EarningsItem key={`${item.symbol}-${item.date}`} item={item} />
        ))}
      </div>
    </Modal>
  );
}

type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status?: "pending" | "error";
};

type ChatWindowSize = {
  width: number;
  height: number;
};

const clampChatSize = (size: ChatWindowSize): ChatWindowSize => {
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  return {
    width: Math.max(360, Math.min(size.width, viewportWidth - 32)),
    height: Math.max(220, Math.min(size.height, viewportHeight - 96)),
  };
};

const formatOpenClawError = (detail: string): string => {
  const requestId = detail.match(/"requestId"\s*:\s*"([^"]+)"/)?.[1];
  if (detail.includes("PAIRING_REQUIRED") || detail.includes("NOT_PAIRED") || detail.includes("pairing required")) {
    return requestId
      ? `OpenClaw 需要批准当前后端设备。\n\n请在 ECS 上执行：\nopenclaw devices approve ${requestId}`
      : "OpenClaw 需要批准当前后端设备。请在 ECS 上运行 openclaw devices list --json，找到 pending requestId 后执行 openclaw devices approve <requestId>。";
  }
  return detail || "OpenClaw 请求失败";
};

function ChatInputCard() {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(true);
  const [chatSize, setChatSize] = useState<ChatWindowSize>(() => clampChatSize({ width: 860, height: 360 }));
  const [isSized, setIsSized] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const suggestions = ["分析今天的市场主线", "总结我的持仓风险", "找出关注清单里的催化剂", "生成明日关注清单"];

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    window.requestAnimationFrame(() => {
      thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    });
  }, [messages]);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsSized(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = chatSize;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextSize = clampChatSize({
        width: startSize.width + (moveEvent.clientX - startX) * 2,
        height: startSize.height - (moveEvent.clientY - startY),
      });
      setChatSize(nextSize);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const send = async () => {
    const clean = value.trim();
    if (!clean || sending) return;
    setSending(true);
    setValue("");
    const pendingId = `assistant-${Date.now()}`;
    setMessages((items) => [
      ...items,
      { id: `user-${Date.now()}`, role: "user", text: clean },
      { id: pendingId, role: "assistant", text: "OpenClaw 正在分析...", status: "pending" },
    ]);
    try {
      const response = await fetch("/api/openclaw/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "OpenClaw 请求失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latestText = "";

      const applyText = (text: string, status?: ChatBubble["status"]) => {
        latestText = text;
        setMessages((items) =>
          items.map((item) =>
            item.id === pendingId
              ? { id: item.id, role: "assistant", text: text || "OpenClaw 正在分析...", status }
              : item,
          ),
        );
      };

      const handleEvent = (chunk: string) => {
        const dataLine = chunk
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) return;
        const payload = JSON.parse(dataLine.slice(5).trim()) as { type?: string; text?: string; detail?: string };
        if (payload.type === "delta" || payload.type === "final") {
          applyText(payload.text || latestText);
        }
        if (payload.type === "error" || payload.type === "pairing_required") {
          applyText(formatOpenClawError(payload.detail || ""), "error");
        }
      };

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        events.forEach(handleEvent);
      }
      if (buffer.trim()) {
        handleEvent(buffer);
      }
    } catch (error) {
      const errorText = formatOpenClawError(error instanceof Error ? error.message : "OpenClaw 请求失败");
      setMessages((items) =>
        items.map((item) =>
          item.id === pendingId
            ? { id: item.id, role: "assistant", text: errorText, status: "error" }
            : item,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const shellStyle = {
    width: chatSize.width,
    height: isSized || messages.length ? chatSize.height : undefined,
  };

  return (
    <div className="lat-floating-chat-wrapper">
      <div className={`lat-chat-shell ${isSized || messages.length ? "is-sized" : ""}`} style={shellStyle}>
        {focused ? (
          <div className="lat-suggestion-bubbles">
            {suggestions.map((label) => (
              <button key={label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setValue(label)}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="lat-floating-chat" onFocus={() => setFocused(true)} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setFocused(false)}>
          <button
            type="button"
            className="lat-chat-resize-handle"
            aria-label="调整聊天窗口大小"
            onPointerDown={startResize}
            onDoubleClick={() => {
              setChatSize(clampChatSize({ width: 860, height: 360 }));
              setIsSized(false);
            }}
          />
          {messages.length ? (
            <div ref={threadRef} className="lat-chat-thread" aria-live="polite">
              {messages.map((item) => (
                <div key={item.id} className={`lat-chat-bubble-row is-${item.role}`}>
                  <div className={`lat-chat-bubble ${item.status === "error" ? "is-error" : ""} ${item.status === "pending" ? "is-pending" : ""}`}>
                    <span>{item.role === "user" ? "你" : "OpenClaw"}</span>
                    {item.role === "assistant" && item.status !== "error" ? (
                      <div className="lat-chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{item.text}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="向 AI 询问市场趋势、特定股票或投资组合分析......"
            disabled={sending}
          />
          <div className="lat-chat-actions">
            <div>
              <button type="button" onClick={() => setValue((text) => `${text}${text ? " " : ""}#市场`)}>
                <Plus size={18} />
              </button>
              <button type="button" className={flash ? "is-active" : ""} onClick={() => setFlash((value) => !value)}>
                <Zap size={16} />
                Flash
              </button>
            </div>
            <div>
              <span>OpenClaw <ChevronDown size={14} /></span>
              <button type="button" onClick={() => void send()} aria-label="发送" disabled={sending || !value.trim()}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTestPage() {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [bochaFeed, setBochaFeed] = useState<DashboardTestBochaResponse | null>(null);
  const [bochaLoading, setBochaLoading] = useState(true);
  const [bochaRefreshing, setBochaRefreshing] = useState(false);
  const [bochaError, setBochaError] = useState<string | null>(null);
  const [marketCards, setMarketCards] = useState<IndexData[]>([]);
  const [marketCardsLoading, setMarketCardsLoading] = useState(true);
  const [marketCardsMessage, setMarketCardsMessage] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([loadingInsight()]);

  const applyBochaFeed = (feed: DashboardTestBochaResponse) => {
    setBochaFeed(feed);
    if (feed.insight) {
      setInsights((items) => [
        feed.insight as Insight,
        ...items.filter((item) => (
          item.market_insight_id !== feed.insight?.market_insight_id &&
          !item.market_insight_id.startsWith("insight_bocha_") &&
          !item.market_insight_id.startsWith("insight_market_cache_") &&
          !item.market_insight_id.startsWith("insight-personalized-") &&
          item.market_insight_id !== "insight-loading"
        )),
      ]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setBochaLoading(true);
    const applyFeedIfLive = (feed: DashboardTestBochaResponse) => {
      if (cancelled) return;
      applyBochaFeed(feed);
    };

    fetchDashboardTestBochaFeed({ llm: false, timeoutMs: 15000 })
      .then((feed) => {
        applyFeedIfLive(feed);
        void fetchDashboardTestBochaFeed({ llm: true, timeoutMs: 15000 })
          .then(applyFeedIfLive)
          .catch(() => undefined);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBochaError(error instanceof DOMException && error.name === "AbortError" ? "实时财经数据源请求超时" : error instanceof Error ? "实时财经数据源请求失败" : "实时财经数据源请求失败");
      })
      .finally(() => {
        if (!cancelled) setBochaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshMarketFeed = async () => {
    setBochaRefreshing(true);
    setBochaLoading(true);
    setBochaError(null);
    try {
      const fastFeed = await fetchDashboardTestBochaFeed({ llm: false, refresh: true, timeoutMs: 45000 });
      applyBochaFeed(fastFeed);
      const llmFeed = await fetchDashboardTestBochaFeed({ llm: true, refresh: true, timeoutMs: 90000 });
      applyBochaFeed(llmFeed);
    } catch (error: unknown) {
      setBochaError(error instanceof DOMException && error.name === "AbortError" ? "市场动态更新超时" : "市场动态更新失败");
    } finally {
      setBochaRefreshing(false);
      setBochaLoading(false);
    }
  };

  const generateMarketBrief = async (): Promise<Insight | null> => {
    setBochaRefreshing(true);
    setBochaLoading(true);
    setBochaError(null);
    try {
      const llmFeed = await fetchDashboardTestBochaFeed({ llm: true, refresh: true, timeoutMs: 90000 });
      applyBochaFeed(llmFeed);
      if (llmFeed.status !== "completed" || !llmFeed.insight) {
        setBochaError(llmFeed.message || "市场简报未生成，请稍后重试。");
        return null;
      }
      setSelectedInsight(llmFeed.insight);
      return llmFeed.insight;
    } catch (error: unknown) {
      setBochaError(error instanceof DOMException && error.name === "AbortError" ? "市场简报生成超时" : "市场简报生成失败");
      throw error;
    } finally {
      setBochaRefreshing(false);
      setBochaLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setMarketCardsLoading(true);
    fetchDashboardTestMarketCards()
      .then((payload) => {
        if (cancelled) return;
        if (payload.status === "completed" && payload.cards?.length) {
          setMarketCards(payload.cards);
          setMarketCardsMessage(null);
          return;
        }
        setMarketCards([]);
        setMarketCardsMessage(payload.message || "ClickHouse ETF/基金业务数据暂不可用。");
      })
      .catch(() => {
        if (!cancelled) {
          setMarketCards([]);
          setMarketCardsMessage("ETF/基金业务数据接口暂不可用。");
        }
      })
      .finally(() => {
        if (!cancelled) setMarketCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openInsight = (id: string) => {
    setSelectedInsight(insights.find((item) => item.market_insight_id === id) || {
      market_insight_id: id,
      type: "personalized",
      headline: "个性化市场简报",
      summary: "个性化简报已生成。这里优先基于实时市场动态摘要，后续可继续接入更完整的 LangAlpha market_insight_id 详情接口。",
      completed_at: new Date().toISOString(),
      topics: [{ text: "Portfolio", trend: "neutral" }],
    });
  };

  return (
    <div className="dashboard-test-shell langalpha-dashboard">
      <main className="lat-dashboard-main">
        <DashboardHeaderReplica refreshing={bochaRefreshing} onRefreshMarket={refreshMarketFeed} />
        <div className="lat-dashboard-content">
          <div className="lat-heading-row">
            <h1>市场概览</h1>
            <button type="button" onClick={() => navigateTo("/portfolio")}>
              <ListFilter size={14} />
              关注标的
            </button>
          </div>
          <IndexMovementCard indices={marketCards} loading={marketCardsLoading} message={marketCardsMessage} />
          <div className="lat-dashboard-grid">
            <div className="lat-dashboard-left">
              <AIDailyBriefCard
                insights={insights}
                loading={bochaLoading}
                bochaStatus={bochaFeed?.status}
                bochaMessage={bochaError || bochaFeed?.message}
                onGenerateBrief={generateMarketBrief}
                onReadFull={openInsight}
              />
              <NewsFeedCard
                marketItems={bochaFeed?.newsItems || []}
                loading={bochaLoading}
                bochaStatus={bochaFeed?.status}
                bochaMessage={bochaError || bochaFeed?.message}
                onNewsClick={setSelectedNews}
              />
            </div>
            <aside className="lat-dashboard-right">
              <PortfolioWatchlistCard />
              <EarningsCalendarCard />
            </aside>
          </div>
        </div>
        <ChatInputCard />
      </main>
      {selectedNews ? (
        <Modal title="新闻详情" onClose={() => setSelectedNews(null)}>
          <div className="lat-detail-copy">
            <p className="lat-news-meta-detail">{selectedNews.source} · {selectedNews.time}</p>
            <h3>{selectedNews.title}</h3>
            <p>{selectedNews.summary || "当前概要暂为空。"}</p>
            {selectedNews.url ? (
              <a className="lat-source-link" href={selectedNews.url} target="_blank" rel="noreferrer">
                打开原文来源
                <ArrowRight size={14} />
              </a>
            ) : null}
            <div className="lat-ticker-row">
              {selectedNews.tickers.map((ticker) => (
                <button key={ticker} type="button" onClick={() => navigateTo(marketPath(ticker))}>{ticker}</button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
      {selectedInsight ? (
        <Modal title="完整市场简报" onClose={() => setSelectedInsight(null)}>
          <div className="lat-detail-copy">
            <h3>{cleanDashboardDisplayText(selectedInsight.headline)}</h3>
            <InsightSummary insight={selectedInsight} />
            {selectedInsight.sources?.length ? (
              <div className="lat-source-list">
                {selectedInsight.sources.map((source) => (
                  <a key={`${source.title}-${source.url || source.source}`} href={source.url || "#"} target="_blank" rel="noreferrer">
                    <strong>{source.source}</strong>
                    <span>{cleanDashboardDisplayText(source.title)}</span>
                  </a>
                ))}
              </div>
            ) : null}
            <div className="lat-topic-row">
              {selectedInsight.topics.map((topic) => (
                <TopicBadge key={topic.text} text={topic.text} trend={topic.trend} onClick={() => navigateTo("/evidence")} />
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
