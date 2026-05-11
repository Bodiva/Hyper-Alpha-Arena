import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Braces,
  Database,
  FileCode2,
  FileUp,
  Link2,
  Network,
  RefreshCw,
  ShieldCheck,
  TableProperties,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listDatasetBindingsAsync,
  listImportedFileBatchesAsync,
  saveDatasetBindingAsync,
  type DatasetBinding,
  type ImportedFileBatch,
} from "@/entities/data-source/api";
import { listAssetsAsync } from "@/entities/asset/api";
import type { Asset } from "@/entities/asset/model";
import ClickHouseDataPage from "@/pages/ClickHouseDataPage";
import { createHashUrl, getHashQueryParam, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

type DataDomain = "market" | "research" | "portfolio" | "macro" | "user_upload";
type ScopeFilter = "ALL" | "EXACT_ASSET" | "UNBOUND";
type DataCenterTab = "datasets" | "bindings" | "policy" | "lineage" | "clickhouse";
type LineageAssetType = "index" | "fund";
type LineageFilter = "all" | LineageAssetType;

interface CatalogDataset {
  datasetId: string;
  domain: DataDomain;
  name: string;
  assetSymbol: string;
  assetName: string;
  assetId?: string;
  assetType?: Asset["assetType"];
  rows: number;
  minTradeDate?: string | null;
  maxTradeDate?: string | null;
  importedAt: string;
  sourceName: string;
  fileName: string;
  storage: string;
  quality: "NORMAL" | "EMPTY";
  agentPolicies: string[];
}

interface LixingerLineageApi {
  apiId: string;
  apiName: string;
  categoryPath: string;
  assetType: LineageAssetType;
  endpointType: string;
  priority: "P0" | "P1" | "P2";
  description: string;
  requestUrl: string;
  stagingTable: string;
  businessTables: string[];
  downstream: string[];
}

const DOMAIN_LABEL: Record<DataDomain, string> = {
  market: "市场",
  research: "研究",
  portfolio: "组合",
  macro: "宏观",
  user_upload: "上传",
};

const AGENT_POLICIES = ["Market Analyst", "Risk Analyst", "Portfolio Manager"];
const CLICKHOUSE_TABLE = "alpha_trace.etf_index_valuation_daily";
const DATA_CENTER_TABS = new Set<DataCenterTab>(["datasets", "bindings", "policy", "lineage", "clickhouse"]);

const LINEAGE_FILTER_LABEL: Record<LineageFilter, string> = {
  all: "全部",
  index: "指数",
  fund: "基金",
};

const LINEAGE_ENDPOINT_LABEL: Record<string, string> = {
  dimension: "维表",
  constituent: "成分",
  constituent_weighting: "权重",
  timeseries: "时序行情",
  drawdown: "回撤",
  tracking_fund: "跟踪基金",
  metrics_timeseries: "指标时序",
  financial_metrics: "财务指标",
  snapshot: "快照",
  raw_only: "原始时序",
};

const LIXINGER_LINEAGE_APIS: LixingerLineageApi[] = [
  {
    apiId: "cn_index",
    apiName: "基础信息-指数信息API",
    categoryPath: "大陆 / 指数接口 / 基础信息-指数信息API",
    assetType: "index",
    endpointType: "dimension",
    priority: "P0",
    description: "获取指数名称、代码、市场、币种、发布日和调样频率等基础维度。",
    requestUrl: "https://open.lixinger.com/api/cn/index",
    stagingTable: "monitor.stg_lixinger_cn_index",
    businessTables: ["monitor.dim_lixinger_index"],
    downstream: ["资产主数据", "指数筛选", "Agent 资产上下文"],
  },
  {
    apiId: "cn_index_constituents",
    apiName: "样本信息-样本信息API",
    categoryPath: "大陆 / 指数接口 / 样本信息-样本信息API",
    assetType: "index",
    endpointType: "constituent",
    priority: "P0",
    description: "获取指数在指定日期的成分股集合。",
    requestUrl: "https://open.lixinger.com/api/cn/index/constituents",
    stagingTable: "monitor.stg_lixinger_cn_index_constituents",
    businessTables: ["monitor.index_constituent"],
    downstream: ["指数成分分析", "持仓穿透", "归因输入"],
  },
  {
    apiId: "cn_index_constituent_weightings",
    apiName: "样本权重-指数样本权重API",
    categoryPath: "大陆 / 指数接口 / 样本权重-指数样本权重API",
    assetType: "index",
    endpointType: "constituent_weighting",
    priority: "P0",
    description: "获取指数成分股历史权重。",
    requestUrl: "https://open.lixinger.com/api/cn/index/constituent-weightings",
    stagingTable: "monitor.stg_lixinger_cn_index_constituent_weightings",
    businessTables: ["monitor.index_constituent_weighting"],
    downstream: ["权重变动跟踪", "组合对标", "指数复制"],
  },
  {
    apiId: "cn_index_candlestick",
    apiName: "K线数据-K线数据API",
    categoryPath: "大陆 / 指数接口 / K线数据-K线数据API",
    assetType: "index",
    endpointType: "timeseries",
    priority: "P0",
    description: "获取指数开高低收、成交量和涨跌幅等日频行情。",
    requestUrl: "https://open.lixinger.com/api/cn/index/candlestick",
    stagingTable: "monitor.stg_lixinger_cn_index_candlestick",
    businessTables: ["monitor.factor_index_price_daily"],
    downstream: ["K线图", "回测行情", "趋势因子"],
  },
  {
    apiId: "cn_index_fundamental",
    apiName: "基础面数据-基本面数据API",
    categoryPath: "大陆 / 指数接口 / 基础面数据-基本面数据API",
    assetType: "index",
    endpointType: "metrics_timeseries",
    priority: "P0",
    description: "获取 PE、PB、股息率、市值等指数估值指标。",
    requestUrl: "https://open.lixinger.com/api/cn/index/fundamental",
    stagingTable: "monitor.stg_lixinger_cn_index_fundamental",
    businessTables: ["monitor.factor_index_valuation_daily", "monitor.lixinger_metric_long"],
    downstream: ["估值雷达", "Dashboard", "Agent 证据"],
  },
  {
    apiId: "cn_index_drawdown",
    apiName: "回撤-指数回撤API",
    categoryPath: "大陆 / 指数接口 / 回撤-指数回撤API",
    assetType: "index",
    endpointType: "drawdown",
    priority: "P1",
    description: "获取指数不同周期维度下的回撤序列。",
    requestUrl: "https://open.lixinger.com/api/cn/index/drawdown",
    stagingTable: "monitor.stg_lixinger_cn_index_drawdown",
    businessTables: ["monitor.factor_index_drawdown"],
    downstream: ["风险画像", "最大回撤监控", "策略风控"],
  },
  {
    apiId: "cn_index_tracking_fund",
    apiName: "跟踪基金-指数跟踪基金信息API",
    categoryPath: "大陆 / 指数接口 / 跟踪基金-指数跟踪基金信息API",
    assetType: "index",
    endpointType: "tracking_fund",
    priority: "P1",
    description: "获取指数对应的跟踪基金列表。",
    requestUrl: "https://open.lixinger.com/api/cn/index/tracking-fund",
    stagingTable: "monitor.stg_lixinger_cn_index_tracking_fund",
    businessTables: ["monitor.index_tracking_fund"],
    downstream: ["ETF 候选池", "基金映射", "资产研究"],
  },
  {
    apiId: "cn_fund",
    apiName: "公募基金接口-基金信息API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-基金信息API",
    assetType: "fund",
    endpointType: "dimension",
    priority: "P0",
    description: "获取基金名称、代码、市场、类型和基础属性。",
    requestUrl: "https://open.lixinger.com/api/cn/fund",
    stagingTable: "monitor.stg_lixinger_cn_fund",
    businessTables: ["monitor.dim_lixinger_fund"],
    downstream: ["基金主数据", "基金筛选", "Agent 资产上下文"],
  },
  {
    apiId: "cn_fund_manager",
    apiName: "公募基金接口-基金经理API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-基金经理API",
    assetType: "fund",
    endpointType: "dimension",
    priority: "P1",
    description: "获取基金经理任职关系和历史变动。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/manager",
    stagingTable: "monitor.stg_lixinger_cn_fund_manager",
    businessTables: ["monitor.fund_manager_relation"],
    downstream: ["基金经理画像", "管理人变更监控", "基金研究"],
  },
  {
    apiId: "cn_fund_net_value",
    apiName: "公募基金接口-净值-净值API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-净值-净值API",
    assetType: "fund",
    endpointType: "raw_only",
    priority: "P2",
    description: "获取基金单位净值时序。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/net-value",
    stagingTable: "monitor.stg_lixinger_cn_fund_net_value",
    businessTables: ["monitor.factor_fund_net_value_daily"],
    downstream: ["基金净值曲线", "收益率计算", "基金对比"],
  },
  {
    apiId: "cn_fund_total_net_value",
    apiName: "公募基金接口-基金累积净值API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-基金累积净值-基金累积净值API",
    assetType: "fund",
    endpointType: "raw_only",
    priority: "P2",
    description: "获取基金累计净值时序。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/total-net-value",
    stagingTable: "monitor.stg_lixinger_cn_fund_total_net_value",
    businessTables: ["monitor.factor_fund_total_net_value_daily"],
    downstream: ["累计收益曲线", "长期绩效", "基金排行"],
  },
  {
    apiId: "cn_fund_net_value_of_dividend_reinvestment",
    apiName: "公募基金接口-理杏仁分红再投入净值API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-理杏仁分红再投入净值API",
    assetType: "fund",
    endpointType: "raw_only",
    priority: "P2",
    description: "获取考虑分红再投入后的基金净值。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/net-value-of-dividend-reinvestment",
    stagingTable: "monitor.stg_lixinger_cn_fund_net_value_of_dividend_reinvestment",
    businessTables: ["monitor.factor_fund_reinvestment_net_value_daily"],
    downstream: ["复权净值曲线", "全收益分析", "绩效归因"],
  },
  {
    apiId: "cn_fund_candlestick",
    apiName: "公募基金接口-K线数据API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-K线数据-K线数据API",
    assetType: "fund",
    endpointType: "timeseries",
    priority: "P2",
    description: "获取基金开高低收、成交量和涨跌幅等交易行情。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/candlestick",
    stagingTable: "monitor.stg_lixinger_cn_fund_candlestick",
    businessTables: ["monitor.factor_fund_price_daily"],
    downstream: ["基金 K线", "交易研究", "择时因子"],
  },
  {
    apiId: "cn_fund_drawdown",
    apiName: "公募基金接口-回撤-基金回撤API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-回撤-基金回撤API",
    assetType: "fund",
    endpointType: "drawdown",
    priority: "P2",
    description: "获取基金回撤序列。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/drawdown",
    stagingTable: "monitor.stg_lixinger_cn_fund_drawdown",
    businessTables: ["monitor.factor_fund_drawdown"],
    downstream: ["风险画像", "最大回撤监控", "基金风控"],
  },
  {
    apiId: "cn_fund_shares",
    apiName: "公募基金接口-基金份额API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-基金份额及规模-基金份额API",
    assetType: "fund",
    endpointType: "raw_only",
    priority: "P2",
    description: "获取基金份额、规模和场内份额等数据。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/shares",
    stagingTable: "monitor.stg_lixinger_cn_fund_shares",
    businessTables: ["monitor.factor_fund_shares"],
    downstream: ["规模变化", "流入流出估算", "基金热度"],
  },
  {
    apiId: "cn_fund_dividend",
    apiName: "公募基金接口-分红-分红API",
    categoryPath: "大陆 / 二、基金接口 / 公募基金接口-分红-分红API",
    assetType: "fund",
    endpointType: "raw_only",
    priority: "P2",
    description: "获取基金分红登记日、除权日和每份分红金额。",
    requestUrl: "https://open.lixinger.com/api/cn/fund/dividend",
    stagingTable: "monitor.stg_lixinger_cn_fund_dividend",
    businessTables: ["monitor.fund_dividend"],
    downstream: ["分红事件", "现金流分析", "基金档案"],
  },
];

const getInitialTab = (): DataCenterTab => {
  const tab = getHashQueryParam("tab");
  return tab && DATA_CENTER_TABS.has(tab as DataCenterTab) ? (tab as DataCenterTab) : "datasets";
};

const formatDateRange = (dataset: CatalogDataset): string => {
  if (!dataset.minTradeDate && !dataset.maxTradeDate) return "-";
  if (dataset.minTradeDate === dataset.maxTradeDate) return dataset.minTradeDate ?? "-";
  return `${dataset.minTradeDate ?? "-"} ~ ${dataset.maxTradeDate ?? "-"}`;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; detail?: unknown; status?: unknown; code?: unknown };
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
    const prefix = [record.status, record.code].filter(Boolean).join(" ");
    return prefix ? `${prefix}: ${JSON.stringify(error)}` : JSON.stringify(error);
  }
  return String(error);
};

const findAssetForBatch = (batch: ImportedFileBatch, assets: Asset[]): Asset | undefined => {
  const symbol = batch.assetSymbol.trim().toLowerCase();
  if (!symbol) return undefined;
  return assets.find((asset) => asset.symbol.toLowerCase() === symbol || asset.id.toLowerCase().includes(symbol));
};

const toCatalogDataset = (batch: ImportedFileBatch, assets: Asset[]): CatalogDataset => {
  const asset = findAssetForBatch(batch, assets);
  return {
    datasetId: batch.importId,
    domain: "market",
    name: batch.assetSymbol
      ? `${batch.assetSymbol} 估值日报`
      : batch.fileName.replace(/\.[^.]+$/, ""),
    assetSymbol: batch.assetSymbol,
    assetName: batch.assetName,
    assetId: asset?.id,
    assetType: asset?.assetType,
    rows: batch.rows,
    minTradeDate: batch.minTradeDate,
    maxTradeDate: batch.maxTradeDate,
    importedAt: batch.importedAt,
    sourceName: batch.sourceName,
    fileName: batch.fileName,
    storage: CLICKHOUSE_TABLE,
    quality: batch.rows > 0 ? "NORMAL" : "EMPTY",
    agentPolicies: AGENT_POLICIES,
  };
};

const getNumericMetric = (asset: Asset, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = asset.metrics?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const assetStorageLabel = (asset: Asset): string => {
  if (asset.assetType === "INDEX") return "monitor.dim_lixinger_index / monitor.factor_index_*";
  if (asset.assetType === "FUND") return "monitor.dim_lixinger_fund / monitor.factor_fund_*";
  if (asset.assetType === "ETF") return "alpha_trace.etf_index_valuation_daily / monitor.factor_fund_*";
  return "monitor.factor_future_* / alpha_trace market tables";
};

const toAssetCatalogDataset = (asset: Asset): CatalogDataset => {
  const rows =
    getNumericMetric(asset, ["pricePoints", "valuationPoints", "rows", "dataPoints"]) ??
    ("holdings" in asset.profile && Array.isArray(asset.profile.holdings) ? asset.profile.holdings.length : 0);
  return {
    datasetId: `asset_catalog_${asset.id}`,
    domain: asset.assetType === "INDEX" || asset.assetType === "FUTURE" ? "market" : "research",
    name: `${asset.symbol} ${asset.name}`,
    assetSymbol: asset.symbol,
    assetName: asset.name,
    assetId: asset.id,
    assetType: asset.assetType,
    rows,
    minTradeDate: null,
    maxTradeDate: asset.updatedAt?.slice(0, 10) ?? null,
    importedAt: asset.updatedAt,
    sourceName: asset.tags.includes("投研数据仓库") ? "ClickHouse 投研数据仓库" : "资产主数据",
    fileName: "asset-catalog",
    storage: assetStorageLabel(asset),
    quality: rows > 0 ? "NORMAL" : "EMPTY",
    agentPolicies: AGENT_POLICIES,
  };
};

const getEndpointLabel = (endpointType: string): string => LINEAGE_ENDPOINT_LABEL[endpointType] ?? endpointType;

const getLineageStats = (items: LixingerLineageApi[]) => {
  const businessTables = new Set(items.flatMap((item) => item.businessTables));
  return {
    total: items.length,
    p0: items.filter((item) => item.priority === "P0").length,
    index: items.filter((item) => item.assetType === "index").length,
    fund: items.filter((item) => item.assetType === "fund").length,
    tables: businessTables.size,
  };
};

interface LineageStepProps {
  icon: typeof BookOpen;
  label: string;
  title: string;
  description: string;
}

const LineageStep = ({ icon: Icon, label, title, description }: LineageStepProps) => (
  <div className="min-w-[190px] rounded-lg border bg-background p-3 shadow-sm">
    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <p className="break-words text-sm font-semibold">{title}</p>
    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
  </div>
);

const LineageArrow = () => (
  <div className="flex min-w-8 items-center justify-center text-muted-foreground">
    <ArrowRight className="h-4 w-4" />
  </div>
);

export default function DataCatalogPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [batches, setBatches] = useState<ImportedFileBatch[]>([]);
  const [bindings, setBindings] = useState<DatasetBinding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingBinding, setIsSavingBinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingStatus, setBindingStatus] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [bindingAssetId, setBindingAssetId] = useState("");
  const [activeTab, setActiveTab] = useState<DataCenterTab>(getInitialTab);
  const [lineageFilter, setLineageFilter] = useState<LineageFilter>("all");
  const [selectedLineageApiId, setSelectedLineageApiId] = useState("cn_index_fundamental");

  const datasets = useMemo(() => {
    const importedDatasets = batches.map((batch) => toCatalogDataset(batch, assets));
    const importedAssetIds = new Set(importedDatasets.map((dataset) => dataset.assetId).filter(Boolean));
    const assetCatalogDatasets = assets
      .filter((asset) => !importedAssetIds.has(asset.id))
      .map(toAssetCatalogDataset);
    return [...importedDatasets, ...assetCatalogDatasets];
  }, [assets, batches]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.datasetId === selectedDatasetId) ?? datasets[0],
    [datasets, selectedDatasetId],
  );

  const bindingsByDataset = useMemo(() => {
    const next = new Map<string, DatasetBinding>();
    bindings
      .filter((binding) => binding.status === "ACTIVE")
      .forEach((binding) => {
        const current = next.get(binding.datasetId);
        if (!current || binding.isDefault) {
          next.set(binding.datasetId, binding);
        }
      });
    return next;
  }, [bindings]);

  const selectedBinding = selectedDataset ? bindingsByDataset.get(selectedDataset.datasetId) : undefined;

  const lineageItems = useMemo(
    () =>
      LIXINGER_LINEAGE_APIS.filter((item) => lineageFilter === "all" || item.assetType === lineageFilter),
    [lineageFilter],
  );

  const selectedLineageApi = useMemo(
    () =>
      lineageItems.find((item) => item.apiId === selectedLineageApiId) ??
      lineageItems[0] ??
      LIXINGER_LINEAGE_APIS[0],
    [lineageItems, selectedLineageApiId],
  );

  const lineageStats = useMemo(() => getLineageStats(lineageItems), [lineageItems]);

  const filteredDatasets = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return datasets.filter((dataset) => {
      const binding = bindingsByDataset.get(dataset.datasetId);
      const keywordPass =
        !normalizedKeyword ||
        dataset.name.toLowerCase().includes(normalizedKeyword) ||
        dataset.assetSymbol.toLowerCase().includes(normalizedKeyword) ||
        dataset.assetName.toLowerCase().includes(normalizedKeyword) ||
        dataset.fileName.toLowerCase().includes(normalizedKeyword);
      const scopePass =
        scopeFilter === "ALL" ||
        (scopeFilter === "EXACT_ASSET" && Boolean(binding ?? dataset.assetId)) ||
        (scopeFilter === "UNBOUND" && !binding && !dataset.assetId);
      return keywordPass && scopePass;
    });
  }, [bindingsByDataset, datasets, keyword, scopeFilter]);

  const loadBatches = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [batchResponse, assetItems, bindingResponse] = await Promise.all([
        listImportedFileBatchesAsync(),
        listAssetsAsync({ limit: 200 }),
        listDatasetBindingsAsync(),
      ]);
      setBatches(batchResponse.items);
      setAssets(assetItems);
      setBindings(bindingResponse.items);
      setSelectedDatasetId((current) => current ?? batchResponse.items[0]?.importId ?? (assetItems[0] ? `asset_catalog_${assetItems[0].id}` : null));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setBatches([]);
      setBindings([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "datasets" || activeTab === "bindings") {
      void loadBatches();
    }
  }, [activeTab]);

  useEffect(() => {
    const syncTabFromRoute = () => setActiveTab(getInitialTab());
    window.addEventListener("hashchange", syncTabFromRoute);
    window.addEventListener("popstate", syncTabFromRoute);
    return () => {
      window.removeEventListener("hashchange", syncTabFromRoute);
      window.removeEventListener("popstate", syncTabFromRoute);
    };
  }, []);

  useEffect(() => {
    if (!selectedDataset) {
      setBindingAssetId("");
      return;
    }
    const binding = bindingsByDataset.get(selectedDataset.datasetId);
    setBindingAssetId(binding?.assetId ?? selectedDataset.assetId ?? "");
  }, [bindingsByDataset, selectedDataset]);

  const saveSelectedDatasetBinding = async () => {
    if (!selectedDataset) {
      setBindingStatus("请选择数据集。");
      return;
    }
    if (!bindingAssetId) {
      setBindingStatus("请选择要绑定的资产。");
      return;
    }
    const asset = assets.find((item) => item.id === bindingAssetId);
    setIsSavingBinding(true);
    setBindingStatus(null);
    try {
      const response = await saveDatasetBindingAsync({
        bindingId: selectedBinding?.bindingId,
        name: `${asset?.symbol ?? bindingAssetId} 默认数据集`,
        datasetId: selectedDataset.datasetId,
        tableName: selectedDataset.storage,
        assetId: bindingAssetId,
        assetSymbol: asset?.symbol ?? "",
        assetName: asset?.name ?? "",
        dataSymbol: selectedDataset.assetSymbol,
        primaryMetrics: ["close_price", "pe_etf_weighted", "pb_etf_weighted", "dividend_yield_pct"],
        agentRunners: ["qwen", "alphatrace_native"],
        isDefault: true,
        status: "ACTIVE",
      });
      setBindings(response.items);
      setBindingStatus("已保存默认 Dataset 绑定。");
    } catch (saveError) {
      setBindingStatus(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSavingBinding(false);
    }
  };

  const openAgentLabWithDataset = (dataset: CatalogDataset) => {
    navigateTo("/agent-lab", {
      datasetId: dataset.datasetId,
      assetSymbol: selectedBinding?.assetSymbol || dataset.assetSymbol,
      assetId: selectedBinding?.assetId || dataset.assetId,
      dataContext: "catalog",
    });
  };

  const changeTab = (value: string) => {
    const nextTab = DATA_CENTER_TABS.has(value as DataCenterTab) ? (value as DataCenterTab) : "datasets";
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", createHashUrl("/data-catalog", nextTab === "datasets" ? undefined : { tab: nextTab }));
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">数据中心</h2>
              <p className="mt-1 text-sm text-muted-foreground">数据集、资产绑定和血缘。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => navigateTo("/data-import")}>
                <FileUp className="h-4 w-4" />
                数据导入
              </Button>
              {activeTab !== "clickhouse" && activeTab !== "lineage" ? (
              <Button variant="outline" className="gap-2" onClick={() => void loadBatches()}>
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
              ) : null}
            </div>
          </div>

          {activeTab !== "clickhouse" && activeTab !== "lineage" ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">数据集</p>
              <p className="mt-1 text-2xl font-semibold">{datasets.length}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">已绑定资产</p>
              <p className="mt-1 text-2xl font-semibold">
                {datasets.filter((dataset) => bindingsByDataset.has(dataset.datasetId) || dataset.assetId).length}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">ClickHouse 行数</p>
              <p className="mt-1 text-2xl font-semibold">{datasets.reduce((sum, dataset) => sum + dataset.rows, 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Agent 策略</p>
              <p className="mt-1 text-2xl font-semibold">{AGENT_POLICIES.length}</p>
            </div>
          </div>
          ) : null}
        </CardContent>
      </Card>

      {error && activeTab !== "clickhouse" && activeTab !== "lineage" ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">数据中心加载失败：{error}</CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={changeTab} className="min-h-[520px]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList>
            <TabsTrigger value="datasets">数据集</TabsTrigger>
            <TabsTrigger value="bindings">资产绑定</TabsTrigger>
            <TabsTrigger value="clickhouse">ClickHouse</TabsTrigger>
            <TabsTrigger value="policy">Agent 权限</TabsTrigger>
            <TabsTrigger value="lineage">血缘</TabsTrigger>
          </TabsList>
          {activeTab !== "clickhouse" && activeTab !== "lineage" ? (
          <div className="grid gap-2 md:w-[520px] md:grid-cols-[1fr_180px]">
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索资产、文件、数据集"
            />
            <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部范围</SelectItem>
                <SelectItem value="EXACT_ASSET">已绑定资产</SelectItem>
                <SelectItem value="UNBOUND">未绑定</SelectItem>
              </SelectContent>
            </Select>
          </div>
          ) : null}
        </div>

        <TabsContent value="datasets" className="mt-3">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">数据集</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="px-5 py-8 text-sm text-muted-foreground">正在加载数据资产...</div>
                ) : filteredDatasets.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-muted-foreground">暂无匹配数据集。</div>
                ) : (
                  <div className="divide-y">
                    {filteredDatasets.map((dataset) => (
                      <button
                        key={dataset.datasetId}
                        type="button"
                        className={`w-full px-5 py-4 text-left transition hover:bg-muted/35 ${
                          selectedDataset?.datasetId === dataset.datasetId ? "bg-muted/45" : ""
                        }`}
                        onClick={() => setSelectedDatasetId(dataset.datasetId)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{dataset.name}</p>
                              <Badge variant="outline">{DOMAIN_LABEL[dataset.domain]}</Badge>
                              <Badge variant={dataset.quality === "NORMAL" ? "default" : "outline"}>
                                {dataset.quality === "NORMAL" ? "质量正常" : "空数据"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {dataset.datasetId} · {dataset.storage}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">{dataset.rows} 行</p>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                          <p>数据：{dataset.assetSymbol || "-"} {dataset.assetName || ""}</p>
                          <p>
                            绑定：
                            {bindingsByDataset.get(dataset.datasetId)?.assetSymbol ||
                              dataset.assetId ||
                              "待配置"}
                          </p>
                          <p>时间：{formatDateRange(dataset)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">数据资产详情</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {selectedDataset ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Dataset</p>
                      <p className="mt-1 font-medium">{selectedDataset.name}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{selectedDataset.datasetId}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md border p-2">
                        <p className="text-muted-foreground">资产范围</p>
                        <p className="mt-1 font-medium">{selectedBinding ? "默认绑定" : "待配置"}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <p className="text-muted-foreground">资产类型</p>
                        <p className="mt-1 font-medium">{selectedDataset.assetType ?? "-"}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <p className="text-muted-foreground">时间范围</p>
                        <p className="mt-1 font-medium">{formatDateRange(selectedDataset)}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <p className="text-muted-foreground">存储</p>
                        <p className="mt-1 font-medium">ClickHouse</p>
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Link2 className="h-3.5 w-3.5" />
                        Dataset 绑定
                      </div>
                      <div className="space-y-2">
                        <Select
                          value={bindingAssetId || "UNBOUND"}
                          onValueChange={(value) => setBindingAssetId(value === "UNBOUND" ? "" : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择资产" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UNBOUND">选择资产</SelectItem>
                            {assets.map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.symbol} {asset.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={isSavingBinding || !selectedDataset}
                          onClick={() => void saveSelectedDatasetBinding()}
                        >
                          {isSavingBinding ? "保存中..." : "保存为默认 Dataset"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {selectedBinding
                            ? `当前默认：${selectedBinding.assetSymbol || selectedBinding.assetId} -> ${selectedBinding.dataSymbol || selectedDataset.assetSymbol}`
                            : "保存后 Agent Lab 会优先使用这个 Dataset。"}
                        </p>
                        {bindingStatus ? <p className="text-xs text-muted-foreground">{bindingStatus}</p> : null}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Agent 可访问
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedDataset.agentPolicies.map((policy) => (
                          <Badge key={policy} variant="outline">{policy}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button className="w-full gap-2" onClick={() => openAgentLabWithDataset(selectedDataset)}>
                      用于 Agent Lab
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground">请选择一个数据集。</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bindings" className="mt-3">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {datasets.map((dataset) => (
                  <div key={dataset.datasetId} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_260px_180px] md:items-center">
                    <div>
                      <p className="font-medium">{dataset.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{dataset.datasetId}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {bindingsByDataset.get(dataset.datasetId)?.assetSymbol ||
                          bindingsByDataset.get(dataset.datasetId)?.assetId ||
                          dataset.assetId ||
                          "待绑定资产"}
                      </span>
                    </div>
                    <Badge variant={bindingsByDataset.has(dataset.datasetId) ? "default" : "outline"} className="w-fit">
                      {bindingsByDataset.has(dataset.datasetId) ? "默认绑定" : "未绑定"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clickhouse" className="mt-3">
          <ClickHouseDataPage embedded />
        </TabsContent>

        <TabsContent value="policy" className="mt-3">
          <div className="grid gap-3 md:grid-cols-3">
            {AGENT_POLICIES.map((policy) => (
              <Card key={policy}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{policy}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    可访问绑定资产的市场数据、估值指标和由导入批次生成的 Evidence。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">dataset.lookup</Badge>
                    <Badge variant="outline">valuation.snapshot.query</Badge>
                    <Badge variant="outline">market.context.load</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="lineage" className="mt-3">
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Network className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold tracking-tight">理杏仁接口血缘图谱</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      基于 H:\git0412\data_lixingren\data\理杏仁接口(1).md 与接口目录解析结果，串联 API、ClickHouse staging 表、主题表和下游使用场景。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(LINEAGE_FILTER_LABEL) as LineageFilter[]).map((filter) => (
                      <Button
                        key={filter}
                        size="sm"
                        variant={lineageFilter === filter ? "default" : "outline"}
                        onClick={() => setLineageFilter(filter)}
                      >
                        {LINEAGE_FILTER_LABEL[filter]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">已建模 API</p>
                    <p className="mt-1 text-2xl font-semibold">{lineageStats.total}</p>
                    <p className="mt-1 text-xs text-muted-foreground">从目录中抽取核心链路</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">P0 接口</p>
                    <p className="mt-1 text-2xl font-semibold">{lineageStats.p0}</p>
                    <p className="mt-1 text-xs text-muted-foreground">优先进入生产血缘</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">主题表</p>
                    <p className="mt-1 text-2xl font-semibold">{lineageStats.tables}</p>
                    <p className="mt-1 text-xs text-muted-foreground">monitor / alpha_trace 目标表</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">资产域</p>
                    <p className="mt-1 text-2xl font-semibold">{lineageStats.index}/{lineageStats.fund}</p>
                    <p className="mt-1 text-xs text-muted-foreground">指数 / 基金</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">接口节点</CardTitle>
                  <p className="text-xs text-muted-foreground">点击 API 查看右侧血缘链路。</p>
                </CardHeader>
                <CardContent className="max-h-[680px] space-y-2 overflow-auto pr-3">
                  {lineageItems.map((item) => (
                    <button
                      key={item.apiId}
                      type="button"
                      className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/35 ${
                        selectedLineageApi.apiId === item.apiId ? "border-primary bg-primary/5" : "bg-background"
                      }`}
                      onClick={() => setSelectedLineageApiId(item.apiId)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold">{item.apiName}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{item.apiId}</p>
                        </div>
                        <Badge variant={item.priority === "P0" ? "default" : "outline"}>{item.priority}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{LINEAGE_FILTER_LABEL[item.assetType]}</Badge>
                        <Badge variant="outline">{getEndpointLabel(item.endpointType)}</Badge>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">主链路</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedLineageApi.categoryPath}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto pb-2">
                      <div className="flex min-w-[1180px] items-stretch">
                        <LineageStep
                          icon={BookOpen}
                          label="源文档"
                          title="理杏仁接口(1).md"
                          description="人工接口说明与字段语义来源"
                        />
                        <LineageArrow />
                        <LineageStep
                          icon={FileCode2}
                          label="接口目录"
                          title="lixinger_all_api_catalog"
                          description="解析后的 API、参数、返回字段目录"
                        />
                        <LineageArrow />
                        <LineageStep
                          icon={Braces}
                          label="OpenAPI"
                          title={selectedLineageApi.apiId}
                          description={selectedLineageApi.apiName}
                        />
                        <LineageArrow />
                        <LineageStep
                          icon={Database}
                          label="ClickHouse Staging"
                          title={selectedLineageApi.stagingTable}
                          description="原始响应落库与批次追踪"
                        />
                        <LineageArrow />
                        <LineageStep
                          icon={TableProperties}
                          label="主题表"
                          title={selectedLineageApi.businessTables.join(" / ")}
                          description="规范化字段、日期、资产代码和指标口径"
                        />
                        <LineageArrow />
                        <LineageStep
                          icon={ShieldCheck}
                          label="下游"
                          title={selectedLineageApi.downstream.join(" / ")}
                          description="数据中心、Dashboard、Agent Evidence"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">表映射</CardTitle>
                      <p className="text-xs text-muted-foreground">从接口响应到 ClickHouse 可查询表。</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Staging 表</p>
                        <p className="mt-1 break-all text-sm font-semibold">{selectedLineageApi.stagingTable}</p>
                        <p className="mt-1 text-xs text-muted-foreground">保存 request_hash、source_job_name、raw_row_json 等原始追踪字段。</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">主题表</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedLineageApi.businessTables.map((table) => (
                            <Badge key={table} variant="outline" className="break-all">
                              {table}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">下游使用</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          {selectedLineageApi.downstream.map((target) => (
                            <div key={target} className="rounded-md bg-muted/45 px-2 py-2 text-xs font-medium">
                              {target}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">API 明细</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">中文名称</p>
                        <p className="mt-1 font-semibold">{selectedLineageApi.apiName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">说明</p>
                        <p className="mt-1 text-muted-foreground">{selectedLineageApi.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border p-2">
                          <p className="text-muted-foreground">资产域</p>
                          <p className="mt-1 font-medium">{LINEAGE_FILTER_LABEL[selectedLineageApi.assetType]}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <p className="text-muted-foreground">优先级</p>
                          <p className="mt-1 font-medium">{selectedLineageApi.priority}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <p className="text-muted-foreground">类型</p>
                          <p className="mt-1 font-medium">{getEndpointLabel(selectedLineageApi.endpointType)}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <p className="text-muted-foreground">来源</p>
                          <p className="mt-1 font-medium">理杏仁</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Request URL</p>
                        <p className="mt-1 break-all rounded-md bg-muted/45 p-2 text-xs">{selectedLineageApi.requestUrl}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
