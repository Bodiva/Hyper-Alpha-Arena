import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Code2, Columns3, Copy, Database, FileText, FunctionSquare, RefreshCw, TableProperties } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getClickHouseOverviewAsync,
  getClickHouseTableRowsAsync,
  type ClickHouseOverviewResponse,
  type ClickHouseTableRowsResponse,
} from "@/entities/data-source/api";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatNumber = (value: number): string => new Intl.NumberFormat("zh-CN").format(value);
const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const isUpdatedToday = (value?: string | null): boolean => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; detail?: unknown; code?: unknown; status?: unknown };
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
    const prefix = [record.code, record.status].filter(Boolean).join(" ");
    return prefix ? `${prefix}: ${JSON.stringify(error)}` : JSON.stringify(error);
  }
  return String(error);
};

interface TableDescription {
  title: string;
  detail: string;
}

const TABLE_DESCRIPTIONS: Record<string, TableDescription> = {
  "alpha_trace.etf_index_valuation_daily": { title: "ETF/指数估值", detail: "ETF / 指数估值日频导入表，用于 AlphaTrace 资产估值观察。" },
  "monitor.etf_index_valuation_daily": { title: "ETF/指数估值", detail: "ETF / 指数估值日频导入表，用于估值、资产研究和数据验证。" },
  "monitor.lixinger_metric_long": { title: "理杏仁指标长表", detail: "统一指标长表，按 stock_code、date、api_id、metric_name 保存估值、行情、财务等指标。" },
  "monitor.raw_lixinger_api_response": { title: "理杏仁原始响应", detail: "保留理杏仁 OpenAPI 原始 JSON，用于审计、排错、重放和字段兼容。" },
  "monitor.etl_job_state": { title: "ETL任务状态", detail: "记录理杏仁采集、回放、结构化任务的批次、状态和执行信息。" },
  "monitor.dim_lixinger_index": { title: "指数维表", detail: "理杏仁指数基础信息，来自“基础信息-指数信息API”。" },
  "monitor.dim_lixinger_fund": { title: "基金维表", detail: "公募基金基础信息，来自“公募基金接口-基础信息-基金信息API”。" },
  "monitor.dim_lixinger_fund_profile": { title: "基金概况", detail: "基金概况信息，来自“公募基金接口-基金经理-基金概况API”。" },
  "monitor.index_constituent": { title: "指数样本成分", detail: "指数成分股表，来自“样本信息-样本信息API”，记录指数下的证券成分关系。" },
  "monitor.index_constituent_weighting": { title: "指数样本权重", detail: "指数成分权重表，来自“样本权重-指数样本权重API”，记录成分股权重变化。" },
  "monitor.index_tracking_fund": { title: "指数跟踪基金", detail: "指数跟踪基金信息，记录指数与相关 ETF / 基金的跟踪关系。" },
  "monitor.factor_index_price_daily": { title: "指数K线日频", detail: "指数 K 线日频表，包含开盘、收盘、最高、最低、成交量、成交金额和涨跌幅。" },
  "monitor.factor_index_valuation_daily": { title: "指数基本面/估值", detail: "指数基本面日频表，包含 PE、PB、PS、股息率、市值、成交等指标。" },
  "monitor.factor_index_drawdown": { title: "指数回撤", detail: "指数回撤历史表，用于观察阶段回撤和风险变化。" },
  "monitor.factor_index_margin_trading": { title: "指数融资融券", detail: "指数融资融券历史表，包含融资余额、融券余额及其占市值比例。" },
  "monitor.factor_index_mutual_market": { title: "指数互联互通", detail: "指数互联互通资金流向表，包含持股金额及占市值比例。" },
  "monitor.factor_fund_nav_daily": { title: "基金净值日频", detail: "基金净值日频表，覆盖单位净值、累计净值、分红再投入净值等口径。" },
  "monitor.factor_fund_price_daily": { title: "基金K线日频", detail: "基金 K 线日频表，包含场内基金或基金行情价格序列。" },
  "monitor.factor_fund_exchange_price": { title: "场内基金价格", detail: "场内基金收盘价表，用于 ETF/LOF 等场内交易基金价格分析。" },
  "monitor.factor_fund_drawdown": { title: "基金回撤", detail: "基金回撤历史表，用于基金风险和最大回撤观察。" },
  "monitor.factor_fund_shares": { title: "基金份额", detail: "基金份额历史表，用于观察基金规模和份额变化。" },
  "monitor.fund_shareholding": { title: "基金持仓", detail: "基金持股明细表，来自“基金持股-基金持仓API”。" },
  "monitor.fund_manager_relation": { title: "基金经理关系", detail: "基金与基金经理管理关系表，来自“基金经理-基金经理API”。" },
  "monitor.url_check_log": { title: "URL检测日志", detail: "URL 检测日志测试表，记录 HTTP 状态、内容 hash 和延迟。" },
  "monitor.lixinger_api_response_field_catalog": { title: "API字段目录", detail: "理杏仁接口响应字段目录，保存字段路径、类型和中文说明。" },
};

const API_TABLE_DESCRIPTIONS: Record<string, TableDescription> = {
  cn_index: { title: "指数信息API", detail: "理杏仁“基础信息-指数信息API”，包含指数名称、代码、市场、调样频率等基础字段。" },
  cn_index_constituents: { title: "指数样本信息", detail: "理杏仁“样本信息-样本信息API”，记录指数成分证券。" },
  cn_index_constituent_weightings: { title: "指数样本权重", detail: "理杏仁“样本权重-指数样本权重API”，记录指数成分股权重。" },
  cn_index_candlestick: { title: "指数K线数据", detail: "理杏仁“K线数据API”，包含开盘、收盘、最高、最低、成交量、成交金额和涨跌幅。" },
  cn_index_fundamental: { title: "指数基本面", detail: "理杏仁“基础面数据-基本面数据API”，包含 PE、PB、PS、股息率、市值、成交等指标。" },
  cn_index_drawdown: { title: "指数回撤", detail: "理杏仁“回撤-指数回撤API”，记录指定区间回撤数据。" },
  cn_index_tracking_fund: { title: "指数跟踪基金", detail: "理杏仁“跟踪基金-指数跟踪基金信息API”，记录跟踪该指数的基金。" },
  cn_index_mutual_market: { title: "指数互联互通", detail: "理杏仁“资金流向-互联互通API”，记录港资持仓金额及占市值比例。" },
  cn_index_margin_trading_and_securities_lending: { title: "指数融资融券", detail: "理杏仁“资金流向-融资融券API”，记录融资余额、融券余额及相关比例。" },
  cn_index_fs_hybrid: { title: "指数财务混合", detail: "理杏仁“财务报表-混合-财报数据API”，保存指数财务指标。" },
  cn_index_fs_non_financial: { title: "指数非金融财务", detail: "理杏仁“财务报告-非金融-财报数据API”，保存非金融口径财务指标。" },
  cn_index_hot_ic: { title: "指数样本快照", detail: "理杏仁“热度数据-样本API”，包含样本数、前十大权重等快照指标。" },
  cn_index_hot_cp: { title: "指数收益率快照", detail: "理杏仁“热度数据-收益率API”，包含近周、近月、近年等收益率。" },
  cn_index_hot_tr_cp: { title: "指数全收益快照", detail: "理杏仁“热度数据-全收益率API”，包含全收益口径涨跌幅。" },
  cn_index_hot_mtasl: { title: "指数融资融券快照", detail: "理杏仁“热度数据-融资融券API”，包含融资融券余额和净买入指标。" },
  cn_index_hot_mm_ha: { title: "指数互联互通快照", detail: "理杏仁“热度数据-互联互通API”，包含陆股通持仓和净买入指标。" },
  cn_index_hot_ifet_sni: { title: "场内基金认购流入", detail: "理杏仁“场内基金认购净流入API”，记录场内基金认购净流入快照。" },
  cn_fund: { title: "基金信息API", detail: "理杏仁“公募基金接口-基础信息-基金信息API”，包含基金名称、代码、类型等基础信息。" },
  cn_fund_profile: { title: "基金概况", detail: "理杏仁“基金概况API”，记录基金经理、规模、成立等概况字段。" },
  cn_fund_manager_relation: { title: "基金经理关系", detail: "理杏仁“基金经理API”，记录基金与基金经理的管理关系。" },
  cn_fund_candlestick: { title: "基金K线数据", detail: "理杏仁“公募基金接口-K线数据API”，记录基金行情 K 线。" },
  cn_fund_net_value: { title: "基金净值", detail: "理杏仁“净值API”，记录基金单位净值。" },
  cn_fund_total_net_value: { title: "基金累计净值", detail: "理杏仁“基金累积净值API”，记录基金累计净值。" },
  cn_fund_net_value_of_dividend_reinvestment: { title: "分红再投入净值", detail: "理杏仁“分红再投入净值API”，记录复权净值口径。" },
  cn_fund_exchange_traded_close_price: { title: "场内基金收盘价", detail: "理杏仁“场内基金收盘价API”，记录场内交易价格。" },
  cn_fund_drawdown: { title: "基金回撤", detail: "理杏仁“基金回撤API”，记录基金回撤历史。" },
  cn_fund_shares: { title: "基金份额", detail: "理杏仁“基金份额API”，记录份额和规模变化。" },
  cn_fund_shareholdings: { title: "基金持仓", detail: "理杏仁“基金持仓API”，记录基金持股明细。" },
  cn_fund_manager_shareholdings: { title: "基金经理持仓", detail: "理杏仁“基金经理持仓API”，记录基金经理维度持仓。" },
  cn_fund_manager_profit_ratio: { title: "基金经理收益率", detail: "理杏仁“基金经理利润率API”，记录基金经理收益表现。" },
  cn_fund_company_shareholdings: { title: "基金公司持股", detail: "理杏仁“基金公司持股API”，记录基金公司维度持股。" },
};

const getTableDescription = (database: string, tableName: string): TableDescription => {
  const fullName = `${database}.${tableName}`;
  const exact = TABLE_DESCRIPTIONS[fullName] ?? TABLE_DESCRIPTIONS[tableName];
  if (exact) return exact;
  if (tableName.startsWith("stg_lixinger_")) {
    const apiId = tableName.replace(/^stg_lixinger_/, "");
    const apiDescription = API_TABLE_DESCRIPTIONS[apiId];
    if (apiDescription) {
      return {
        title: `暂存-${apiDescription.title}`,
        detail: `${apiDescription.detail} 这是 staging 暂存表，通常用于从 raw 重放到结构化业务表。`,
      };
    }
    return { title: "理杏仁暂存表", detail: "理杏仁接口 staging 暂存表，用于原始响应重放、清洗和结构化入库。" };
  }
  if (tableName.startsWith("factor_index_")) return { title: "指数因子", detail: "指数因子表，用于资产研究中的指标分析和横向比较。" };
  if (tableName.startsWith("factor_fund_")) return { title: "基金因子", detail: "基金因子表，用于基金研究中的指标分析和时间序列观察。" };
  if (tableName.startsWith("snapshot_index_")) return { title: "指数快照", detail: "指数热度或快照表，保存每日/当期指标状态。" };
  if (tableName.startsWith("snapshot_fund_")) return { title: "基金快照", detail: "基金热度或快照表，保存每日/当期指标状态。" };
  if (tableName.startsWith("raw_")) return { title: "原始响应", detail: "原始数据落库表，用于保留上游响应、排错和重放解析。" };
  if (tableName.startsWith("etl_")) return { title: "ETL状态", detail: "ETL 运行状态或作业元数据表。" };
  if (tableName.includes("constituent")) return { title: "成分/样本", detail: "指数或组合成分相关表。" };
  return { title: "业务数据表", detail: "ClickHouse 业务数据表，点击后可在右侧查看前 100 行明细。" };
};

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {description ? <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">{children}</div>
      </CardContent>
    </Card>
  );
}

const chartTooltipStyle = {
  borderRadius: 6,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 10px 24px rgb(15 23 42 / 0.10)",
};

interface ClickHouseDataPageProps {
  embedded?: boolean;
}

interface TableApiAction {
  id: string;
  name: string;
  code: string;
  method: "GET" | "POST";
  status: "ready" | "planned";
  path: string;
  description: string;
}

const TABLE_API_ACTIONS: Array<Omit<TableApiAction, "path"> & { path: (database: string, table: string) => string }> = [
  {
    id: "filter",
    name: "筛选列表",
    code: "filter",
    method: "GET",
    status: "ready",
    path: (database, table) => `/api/alpha-trace/data-sources/clickhouse/tables/${database}/${table}/rows?limit=100&offset=0`,
    description: "读取当前表前 100 行，适合作为列表页和明细预览的数据入口。",
  },
  {
    id: "getOne",
    name: "查询详情",
    code: "getOne",
    method: "GET",
    status: "ready",
    path: (database, table) => `/api/alpha-trace/data-sources/clickhouse/tables/${database}/${table}/rows?limit=1&offset=0`,
    description: "读取当前表第一条样例记录，用于生成详情页字段和响应示例。",
  },
  {
    id: "schema",
    name: "字段结构",
    code: "schema",
    method: "GET",
    status: "ready",
    path: (database, table) => `/api/alpha-trace/data-sources/clickhouse/tables/${database}/${table}/rows?limit=1`,
    description: "同一个表读取接口会返回 columns 元数据，可用于字段视图和 API 文档生成。",
  },
  {
    id: "aggregate",
    name: "聚合统计",
    code: "aggregate",
    method: "POST",
    status: "planned",
    path: (database, table) => `/api/alpha-trace/data-sources/clickhouse/tables/${database}/${table}/aggregate`,
    description: "规划中的安全聚合接口，用于 count、avg、sum、group by 等分析型查询。",
  },
  {
    id: "excelExport",
    name: "列表导出Excel",
    code: "excelExport",
    method: "POST",
    status: "planned",
    path: (database, table) => `/api/alpha-trace/data-sources/clickhouse/tables/${database}/${table}/export`,
    description: "规划中的导出接口，用于把筛选后的表数据导出为文件。",
  },
];

const buildTableApiActions = (database?: string, table?: string): TableApiAction[] => {
  const safeDatabase = database || "{database}";
  const safeTable = table || "{table}";
  return TABLE_API_ACTIONS.map((action) => ({
    ...action,
    path: action.path(encodeURIComponent(safeDatabase), encodeURIComponent(safeTable)),
  }));
};

const getApiStatusBadgeClassName = (status: TableApiAction["status"]): string =>
  status === "ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

const copyText = async (text: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  await navigator.clipboard.writeText(text);
};

export default function ClickHouseDataPage({ embedded = false }: ClickHouseDataPageProps = {}) {
  const [overview, setOverview] = useState<ClickHouseOverviewResponse | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedApiActionId, setSelectedApiActionId] = useState("filter");
  const [tableRows, setTableRows] = useState<ClickHouseTableRowsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTableRows, setIsLoadingTableRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSelectedTableId = selectedTableId ?? (
    overview?.tables[0] ? `${overview.tables[0].database}.${overview.tables[0].name}` : null
  );
  const selectedTable = useMemo(
    () => overview?.tables.find((table) => `${table.database}.${table.name}` === effectiveSelectedTableId) ?? overview?.tables[0],
    [overview?.tables, effectiveSelectedTableId],
  );
  const totalRowsAcrossTables = useMemo(
    () => overview?.tables.reduce((sum, table) => sum + table.rows, 0) ?? 0,
    [overview?.tables],
  );
  const largestTable = overview?.tables[0];
  const selectedTableDescription = selectedTable ? getTableDescription(selectedTable.database, selectedTable.name) : null;
  const largestTableDescription = largestTable ? getTableDescription(largestTable.database, largestTable.name) : null;
  const selectedTableDatabase = selectedTable?.database ?? null;
  const selectedTableName = selectedTable?.name ?? null;
  const tableApiActions = useMemo(
    () => buildTableApiActions(selectedTableDatabase ?? undefined, selectedTableName ?? undefined),
    [selectedTableDatabase, selectedTableName],
  );
  const selectedApiAction = useMemo(
    () => tableApiActions.find((action) => action.id === selectedApiActionId) ?? tableApiActions[0],
    [selectedApiActionId, tableApiActions],
  );
  const sampleRequestBody = useMemo(() => {
    const columns = tableRows?.columns ?? [];
    const firstColumn = columns.find((column) => column.name === "id") ?? columns[0];
    if (selectedApiAction?.id === "aggregate") {
      return {
        groupBy: columns[0]?.name ? [columns[0].name] : [],
        metrics: [{ op: "count", as: "total" }],
        limit: 100,
      };
    }
    if (selectedApiAction?.id === "excelExport") {
      return {
        format: "xlsx",
        limit: 10000,
        columns: columns.slice(0, 8).map((column) => column.name),
      };
    }
    return {
      limit: selectedApiAction?.id === "getOne" ? 1 : 100,
      offset: 0,
      where: firstColumn ? { [firstColumn.name]: "示例值" } : {},
    };
  }, [selectedApiAction?.id, tableRows?.columns]);
  const sampleResponseBody = useMemo(() => {
    const firstRow = tableRows?.rows[0] ?? {};
    return {
      tableName: selectedTable ? `${selectedTable.database}.${selectedTable.name}` : "{database}.{table}",
      total: tableRows?.total ?? selectedTable?.rows ?? 0,
      data: selectedApiAction?.id === "getOne" ? firstRow : [firstRow],
      columns: (tableRows?.columns ?? []).slice(0, 8).map((column) => ({
        name: column.name,
        type: column.type,
      })),
    };
  }, [selectedApiAction?.id, selectedTable, tableRows]);
  const topRowsChartData = useMemo(
    () =>
      (overview?.tables ?? []).slice(0, 8).map((table) => ({
        name: getTableDescription(table.database, table.name).title,
        table: table.name,
        rows: table.rows,
      })),
    [overview?.tables],
  );
  const topBytesChartData = useMemo(
    () =>
      [...(overview?.tables ?? [])]
        .sort((left, right) => right.bytes - left.bytes)
        .slice(0, 8)
        .map((table) => ({
          name: getTableDescription(table.database, table.name).title,
          table: table.name,
          bytes: table.bytes,
          mb: Number((table.bytes / 1024 / 1024).toFixed(1)),
        })),
    [overview?.tables],
  );
  const updateStatusChartData = useMemo(() => {
    const tables = overview?.tables ?? [];
    const today = tables.filter((table) => isUpdatedToday(table.modifiedAt)).length;
    return [
      { name: "今日更新", value: today, color: "#10b981" },
      { name: "非今日更新", value: Math.max(tables.length - today, 0), color: "#f59e0b" },
    ].filter((item) => item.value > 0);
  }, [overview?.tables]);

  const selectTable = (tableId: string) => {
    if (tableId === effectiveSelectedTableId) return;
    setSelectedTableId(tableId);
    setTableRows(null);
    setIsLoadingTableRows(true);
    setError(null);
  };

  const loadOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const overviewResponse = await getClickHouseOverviewAsync();
      setOverview(overviewResponse);
      setSelectedTableId((current) => {
        if (current && overviewResponse.tables.some((table) => `${table.database}.${table.name}` === current)) {
          return current;
        }
        const firstTable = overviewResponse.tables[0];
        return firstTable ? `${firstTable.database}.${firstTable.name}` : null;
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!selectedTableDatabase || !selectedTableName) {
      setTableRows(null);
      setIsLoadingTableRows(false);
      return;
    }

    let cancelled = false;
    setIsLoadingTableRows(true);
    setTableRows(null);
    setError(null);
    getClickHouseTableRowsAsync(selectedTableDatabase, selectedTableName)
      .then((response) => {
        if (!cancelled) setTableRows(response);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTableRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTableDatabase, selectedTableName]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className={embedded ? "flex flex-col gap-4" : "flex h-full flex-col gap-4 overflow-auto"}>
      {embedded ? null : <ResearchWorkspaceNav hideImport />}

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">ClickHouse 数据观察台</h2>
                <Badge variant={overview?.status === "OK" ? "default" : "outline"}>
                  {overview?.status ?? (isLoading ? "LOADING" : "UNKNOWN")}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                查看 ClickHouse 非系统表的规模、字段和明细。点击左侧表名查看前 100 行。
              </p>
            </div>
            <Button variant="outline" onClick={() => void loadOverview()} disabled={isLoading}>
              <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} data-icon="inline-start" />
              刷新
            </Button>
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="CK 总行数" value={formatNumber(totalRowsAcrossTables)} description="非系统表合计" />
            <MetricCard label="表数量" value={formatNumber(overview?.tables.length ?? 0)} description="monitor / alpha_trace 等库" />
            <MetricCard
              label="最大表"
              value={largestTable ? formatNumber(largestTable.rows) : "0"}
              description={largestTable ? `${largestTableDescription?.title ?? "业务数据表"} · ${largestTable.name}` : "-"}
            />
            <MetricCard label="字段数" value={formatNumber(tableRows?.columns.length ?? overview?.columns.length ?? 0)} description={`CK ${overview?.version || "-"}`} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="行数 Top" description="按表总行数排序">
          {topRowsChartData.length === 0 ? (
            <EmptyState text={isLoading ? "正在读取图表数据..." : "暂无行数数据。"} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={topRowsChartData} layout="vertical" margin={{ top: 4, right: 18, left: 18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={formatCompactNumber} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={88} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }}
                  contentStyle={chartTooltipStyle}
                  formatter={(value) => [formatNumber(Number(value)), "行数"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.table ?? ""}
                />
                <Bar dataKey="rows" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="存储占用 Top" description="按表大小排序">
          {topBytesChartData.length === 0 ? (
            <EmptyState text={isLoading ? "正在读取图表数据..." : "暂无存储数据。"} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={topBytesChartData} layout="vertical" margin={{ top: 4, right: 18, left: 18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(value) => `${value} MB`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={88} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }}
                  contentStyle={chartTooltipStyle}
                  formatter={(value, name, payload) => [formatBytes(payload?.payload?.bytes ?? Number(value) * 1024 * 1024), "大小"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.table ?? ""}
                />
                <Bar dataKey="mb" fill="#0891b2" radius={[0, 4, 4, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="更新状态" description="按 metadata_modification_time 判断">
          {updateStatusChartData.length === 0 ? (
            <EmptyState text={isLoading ? "正在读取图表数据..." : "暂无更新状态。"} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={updateStatusChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={3}
                  label={({ name, value }) => `${name} ${value}`}
                >
                  {updateStatusChartData.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value) => [`${formatNumber(Number(value))} 张`, "表数量"]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">表清单</CardTitle>
                <CardDescription>点击表名切换右侧明细</CardDescription>
              </div>
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                今日更新
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                非今日更新
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(overview?.tables ?? []).length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState text={isLoading ? "正在读取 ClickHouse 表清单..." : "暂无非系统表。"} />
              </div>
            ) : (
              <div className="max-h-[640px] overflow-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>表</TableHead>
                      <TableHead className="text-right">行数</TableHead>
                      <TableHead className="text-right">大小</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview?.tables.map((table) => {
                      const tableId = `${table.database}.${table.name}`;
                      const tableDescription = getTableDescription(table.database, table.name);
                      const updatedToday = isUpdatedToday(table.modifiedAt);
                      const selected = effectiveSelectedTableId === tableId;
                      const updateLabel = updatedToday ? "今日" : "非今日";
                      const rowClassName = [
                        "cursor-pointer transition-colors",
                        selected ? "ring-1 ring-inset ring-primary/40" : "",
                        updatedToday
                          ? "[&>td]:bg-emerald-50 [&>td]:hover:bg-emerald-100"
                          : "[&>td]:bg-amber-50 [&>td]:hover:bg-amber-100",
                      ].join(" ");
                      const firstCellClassName = [
                        "border-l-4",
                        selected ? "border-l-primary" : updatedToday ? "border-l-emerald-500" : "border-l-amber-500",
                      ].join(" ");
                      const updateBadgeClassName = updatedToday
                        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                        : "border-amber-200 bg-amber-100 text-amber-700";
                      return (
                        <TableRow
                          key={tableId}
                          aria-selected={selected}
                          className={rowClassName}
                          onPointerDown={() => selectTable(tableId)}
                        >
                          <TableCell className={firstCellClassName}>
                            <div className="flex flex-col gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="break-all font-medium underline-offset-2 hover:underline">
                                      {table.name}
                                    </span>
                                    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${updateBadgeClassName}`}>
                                      {updateLabel}
                                    </Badge>
                                    <Badge variant="secondary" className="max-w-full truncate text-[11px]">
                                      {tableDescription.title}
                                    </Badge>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-80 bg-popover text-popover-foreground">
                                  <div className="space-y-1">
                                    <p className="font-medium">{table.database}.{table.name}</p>
                                    <p className="font-medium text-primary">{tableDescription.title}</p>
                                    <p>{tableDescription.detail}</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                              <span className="text-xs text-muted-foreground">
                                {table.database} · {formatDateTime(table.modifiedAt)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatNumber(table.rows)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatBytes(table.bytes)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">表明细</CardTitle>
                <CardDescription>
                  {selectedTable
                    ? `${selectedTableDescription?.title ?? "业务数据表"} · ${selectedTable.database}.${selectedTable.name} · 总 ${formatNumber(tableRows?.total ?? selectedTable.rows)} 行 · 前 100 行`
                    : "选择表后查看"}
                </CardDescription>
              </div>
              <TableProperties className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {!selectedTable ? (
              <EmptyState text="请选择一个 ClickHouse 表。" />
            ) : !tableRows || tableRows.rows.length === 0 ? (
              <EmptyState text={isLoadingTableRows ? "正在读取表明细..." : "这个表暂无明细行。"} />
            ) : (
              <div className="max-h-[640px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableRows.columns.map((column) => (
                        <TableHead key={column.name} className="min-w-[140px] whitespace-nowrap">
                          {column.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRows.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {tableRows.columns.map((column) => (
                          <TableCell key={column.name} className="max-w-[320px] truncate whitespace-nowrap">
                            {formatCellValue(row[column.name])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">表 API 能力</CardTitle>
                <Badge variant="outline">共 {tableApiActions.length} 个接口</Badge>
                {selectedTable ? (
                  <Badge variant="secondary">
                    由数据表生成：{selectedTable.database}.{selectedTable.name}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                每张 ClickHouse 表自动生成标准 API 文档。已接入接口可直接走 20080 的 /api 代理，待接入接口先保留设计位。
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void copyText(selectedApiAction?.path ?? "")}
              disabled={!selectedApiAction}
            >
              <Copy className="h-4 w-4" />
              复制路径
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedTable ? (
            <EmptyState text="请选择一个表后查看 API 能力。" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-md border bg-background">
                <div className="border-b bg-muted/25 px-3 py-2 text-sm font-semibold">API 列表</div>
                <div className="divide-y">
                  {tableApiActions.map((action) => {
                    const selected = selectedApiAction?.id === action.id;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={`grid w-full grid-cols-[64px_minmax(0,1fr)] gap-3 px-3 py-3 text-left transition hover:bg-muted/35 ${
                          selected ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "bg-background"
                        }`}
                        onClick={() => setSelectedApiActionId(action.id)}
                      >
                        <span className="inline-flex h-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700">
                          {action.method}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{action.name}</span>
                          <span className="mt-1 block font-mono text-xs text-muted-foreground">{action.code}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-md border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                          {selectedApiAction?.method}
                        </Badge>
                        <h3 className="font-semibold">{selectedApiAction?.name}</h3>
                        <Badge variant="outline" className={getApiStatusBadgeClassName(selectedApiAction?.status ?? "planned")}>
                          {selectedApiAction?.status === "ready" ? "已接入" : "待接入"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{selectedApiAction?.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => void copyText(`http://127.0.0.1:20080${selectedApiAction?.path ?? ""}`)}
                    >
                      <Copy className="h-4 w-4" />
                      复制完整 URL
                    </Button>
                  </div>

                  <div className="mt-4 rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">20080</span>
                      <span className="break-all font-mono text-sm">http://127.0.0.1:20080{selectedApiAction?.path}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border bg-rose-50/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FunctionSquare className="h-4 w-4 text-fuchsia-600" />
                      <p className="font-semibold">Backend Function 业务逻辑扩展</p>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-2 text-primary">
                      <FileText className="h-4 w-4" />
                      使用文档
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md bg-background/70 p-3">
                      <p className="text-sm font-semibold">先验函数</p>
                      <p className="mt-1 text-xs text-muted-foreground">可用于权限过滤、参数校验、字段白名单。</p>
                      <p className="mt-2 text-xs text-muted-foreground">暂无</p>
                    </div>
                    <div className="rounded-md bg-background/70 p-3">
                      <p className="text-sm font-semibold">接口执行</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedApiAction?.status === "ready" ? "当前接口已接入 ClickHouse 只读查询。" : "当前接口为设计位，后端尚未接入。"}
                      </p>
                    </div>
                    <div className="rounded-md bg-background/70 p-3">
                      <p className="text-sm font-semibold">后验函数</p>
                      <p className="mt-1 text-xs text-muted-foreground">可用于结果格式化、脱敏、补充中文字段说明。</p>
                      <p className="mt-2 text-xs text-muted-foreground">暂无</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-md border bg-background p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold">请求示例</p>
                    </div>
                    <pre className="max-h-[260px] overflow-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(sampleRequestBody, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-md border bg-background p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold">响应示例</p>
                    </div>
                    <pre className="max-h-[260px] overflow-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(sampleResponseBody, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">字段</CardTitle>
              <CardDescription>{selectedTable ? `${selectedTable.database}.${selectedTable.name}` : "选择表后查看字段"}</CardDescription>
            </div>
            <Columns3 className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {!tableRows || tableRows.columns.length === 0 ? (
            <EmptyState text="暂无字段元数据。" />
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>字段</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="text-right">位置</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.columns.map((column) => (
                    <TableRow key={column.name}>
                      <TableCell className="whitespace-nowrap font-medium">{column.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{column.type}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{column.position}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}
