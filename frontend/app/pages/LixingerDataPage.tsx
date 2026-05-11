import { useEffect, useMemo, useState } from "react";
import { BookOpen, Database, FileText, RefreshCw, Search, ShieldCheck, TableProperties } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getLixingerLlmContextAsync,
  type LixingerLlmContextResponse,
  type LixingerLlmTableCatalogItem,
} from "@/entities/data-source/api";
import { navigateTo } from "@/shared/lib/navigation";

type CatalogFilter = "all" | "business" | "wide" | "view";

const FILTER_OPTIONS: Array<{ value: CatalogFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "business", label: "业务表" },
  { value: "wide", label: "宽表" },
  { value: "view", label: "LLM 视图" },
];

const formatNumber = (value?: number) => new Intl.NumberFormat("zh-CN").format(value ?? 0);

const getQueryLayerLabel = (item: LixingerLlmTableCatalogItem) => {
  if (item.query_table?.startsWith("v_llm_")) return "LLM 视图";
  if (item.query_layer === "wide") return "宽表";
  if (item.query_layer === "business") return "业务表";
  return item.query_layer || "-";
};

const getQueryLayerClassName = (item: LixingerLlmTableCatalogItem) => {
  if (item.query_table?.startsWith("v_llm_")) return "border-blue-200 bg-blue-50 text-blue-700";
  if (item.query_layer === "wide") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (item.query_layer === "business") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const getRecommendedSql = (item?: LixingerLlmTableCatalogItem): string => {
  if (!item) return "";
  const table = item.query_table;
  const keyField = item.key_fields?.split(",")[0]?.trim();
  const timeField = item.time_fields?.split(",")[0]?.trim();
  if (item.api_id === "cn_fund") {
    return "SELECT *\nFROM v_llm_fund_latest_overview\nWHERE fund_code = '000001'\nLIMIT 1;";
  }
  if (item.api_id === "cn_index_fundamental") {
    return "SELECT index_code, index_name, latest_date, close_point, pe_ttm_mcw, pb_mcw, dyr_mcw\nFROM v_llm_index_latest_valuation\nWHERE index_code = '000300'\nLIMIT 1;";
  }
  if (item.api_id?.includes("hot") || item.query_layer === "wide") {
    return `SELECT *\nFROM ${table}\nORDER BY ${timeField || "ingested_at"} DESC\nLIMIT 100;`;
  }
  if (timeField && keyField) {
    return `SELECT *\nFROM ${table}\nWHERE ${keyField} = '示例代码'\nORDER BY ${timeField} DESC\nLIMIT 100;`;
  }
  if (keyField) {
    return `SELECT *\nFROM ${table}\nWHERE ${keyField} = '示例代码'\nLIMIT 100;`;
  }
  return `SELECT *\nFROM ${table}\nLIMIT 100;`;
};

const getContextSummary = (context?: LixingerLlmContextResponse) => {
  const items = context?.tableCatalog ?? [];
  return {
    total: items.length,
    business: items.filter((item) => item.query_layer === "business").length,
    wide: items.filter((item) => item.query_layer === "wide").length,
    rows: items.reduce((sum, item) => sum + (item.row_count ?? 0), 0),
  };
};

export default function LixingerDataPage() {
  const [context, setContext] = useState<LixingerLlmContextResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);

  const loadContext = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getLixingerLlmContextAsync();
      setContext(payload);
      setSelectedApiId((current) => current ?? payload.tableCatalog[0]?.api_id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "理杏仁查询知识库加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return (context?.tableCatalog ?? []).filter((item) => {
      const layerPass =
        filter === "all" ||
        (filter === "view" && item.query_table?.startsWith("v_llm_")) ||
        (filter !== "view" && item.query_layer === filter);
      const keywordPass =
        !normalizedKeyword ||
        item.api_id.toLowerCase().includes(normalizedKeyword) ||
        item.api_name.toLowerCase().includes(normalizedKeyword) ||
        item.query_table.toLowerCase().includes(normalizedKeyword) ||
        item.asset_type.toLowerCase().includes(normalizedKeyword) ||
        item.endpoint_type.toLowerCase().includes(normalizedKeyword);
      return layerPass && keywordPass;
    });
  }, [context?.tableCatalog, filter, keyword]);

  const selectedItem = useMemo(
    () =>
      filteredItems.find((item) => item.api_id === selectedApiId) ??
      context?.tableCatalog.find((item) => item.api_id === selectedApiId) ??
      filteredItems[0],
    [context?.tableCatalog, filteredItems, selectedApiId],
  );

  const summary = getContextSummary(context);

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              <h1 className="text-xl font-semibold tracking-tight">理杏仁 CK 查询知识库</h1>
              <Badge variant="secondary">LLM Data Dictionary</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              基于已同步完成的理杏仁 OpenAPI + ClickHouse 数据字典生成查询路径，不直接调用理杏仁 OpenAPI。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => navigateTo("/data-catalog", { tab: "clickhouse" })}>
              <TableProperties className="h-4 w-4" />
              打开 ClickHouse
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => void loadContext()} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-[1680px] space-y-4">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>API 映射</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(summary.total)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>业务结构化表</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(summary.business)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>wide_lixinger 宽表</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(summary.wide)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>字典行数合计</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(summary.rows)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-base">API 到 ClickHouse 查询表映射</CardTitle>
                    <CardDescription>
                      先按 api_id / asset_type / endpoint_type 选择 query_table，再生成 SQL。
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FILTER_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={filter === option.value ? "default" : "outline"}
                        onClick={() => setFilter(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="搜索 api_id、中文名、query_table、asset_type"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[680px] overflow-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>API</TableHead>
                        <TableHead>查询表</TableHead>
                        <TableHead>粒度</TableHead>
                        <TableHead className="text-right">行数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => {
                        const selected = selectedItem?.api_id === item.api_id;
                        return (
                          <TableRow
                            key={item.api_id}
                            className={`cursor-pointer ${selected ? "[&>td]:bg-blue-50" : ""}`}
                            onClick={() => setSelectedApiId(item.api_id)}
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold">{item.api_id}</span>
                                  <Badge variant="outline">{item.asset_type}</Badge>
                                  <Badge variant="outline">{item.endpoint_type}</Badge>
                                </div>
                                <p className="line-clamp-1 text-xs text-muted-foreground">{item.api_name}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant="outline" className={getQueryLayerClassName(item)}>
                                  {getQueryLayerLabel(item)}
                                </Badge>
                                <p className="break-all font-mono text-xs">{item.query_table}</p>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                              <p className="line-clamp-2">{item.grain || "-"}</p>
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatNumber(item.row_count)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">选中表查询策略</CardTitle>
                  <CardDescription>{selectedItem?.api_name || "选择左侧 API"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {selectedItem ? (
                    <>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">优先查询表</p>
                        <p className="mt-1 break-all font-mono font-semibold">{selectedItem.query_table}</p>
                        <p className="mt-2 text-xs text-muted-foreground">stage: {selectedItem.stage_table || "-"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border p-2">
                          <p className="text-muted-foreground">主键字段</p>
                          <p className="mt-1 font-medium">{selectedItem.key_fields || "-"}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <p className="text-muted-foreground">时间字段</p>
                          <p className="mt-1 font-medium">{selectedItem.time_fields || "-"}</p>
                        </div>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">适合回答</p>
                        <p className="mt-1">{selectedItem.best_for || selectedItem.description || "-"}</p>
                        {selectedItem.caution ? <p className="mt-2 text-xs text-amber-700">{selectedItem.caution}</p> : null}
                      </div>
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <p className="font-semibold">推荐 SQL 起点</p>
                        </div>
                        <pre className="max-h-[260px] overflow-auto rounded-md bg-muted p-3 text-xs">
                          {getRecommendedSql(selectedItem)}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">暂无 API 映射。</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <CardTitle className="text-base">LLM 查询规则</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {(context?.usageRules ?? []).map((rule) => (
                      <li key={rule} className="rounded-md border bg-background px-3 py-2">
                        {rule}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">查询模板</CardTitle>
                </div>
                <CardDescription>{context?.sourcePaths.queryTemplates}</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[360px] rounded-md border bg-muted p-3">
                  <pre className="whitespace-pre-wrap text-xs">{context?.queryTemplatesMarkdown || "暂无模板。"}</pre>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">同步审计 / LLM 视图</CardTitle>
                <CardDescription>确认数据同步状态和 v_llm_* 视图定义。</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[360px] rounded-md border bg-muted p-3">
                  <pre className="whitespace-pre-wrap text-xs">
                    {`# Sync Audit\n${context?.syncAuditPreview || ""}\n\n# LLM Views SQL\n${context?.llmViewsSqlPreview || ""}`}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
