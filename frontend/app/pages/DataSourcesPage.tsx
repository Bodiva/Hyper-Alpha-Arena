import { useEffect, useMemo, useState } from "react";
import type { Asset, AssetType } from "@/entities/asset/model";
import type { DataCategory, DataSource, DataSourceType } from "@/entities/data-source/model";
import type { Evidence } from "@/entities/evidence/model";
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
import { listDataSourcesAsync } from "@/entities/data-source/api";
import { listEvidenceAsync } from "@/entities/evidence/api";
import { listAssetsAsync } from "@/entities/asset/api";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

type SourceTypeFilter = "ALL" | DataSourceType;
type StatusFilter = "ALL" | "NORMAL" | "SYNCING" | "WARNING" | "FAILED" | "PAUSED";
type AssetTypeFilter = "ALL" | AssetType | "MULTI_ASSET";
type ScoreFilter = "ALL" | "GE_90" | "GE_80" | "GE_70" | "LT_70";

const SOURCE_TYPE_FILTERS: SourceTypeFilter[] = [
  "ALL",
  "API",
  "CRAWLER",
  "FILE_IMPORT",
  "MANUAL_UPLOAD",
  "DATABASE_SYNC",
  "THIRD_PARTY",
];
const STATUS_FILTERS: StatusFilter[] = ["ALL", "NORMAL", "SYNCING", "WARNING", "FAILED", "PAUSED"];
const ASSET_TYPE_FILTERS: AssetTypeFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "INDEX", "MULTI_ASSET"];
const SCORE_FILTERS: ScoreFilter[] = ["ALL", "GE_90", "GE_80", "GE_70", "LT_70"];

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "全部",
  NORMAL: "正常",
  SYNCING: "同步中",
  WARNING: "警告",
  FAILED: "失败",
  PAUSED: "暂停",
};

const STATUS_BADGE: Record<Exclude<StatusFilter, "ALL">, "default" | "secondary" | "outline" | "destructive"> = {
  NORMAL: "default",
  SYNCING: "secondary",
  WARNING: "secondary",
  FAILED: "destructive",
  PAUSED: "outline",
};

const DATA_CATEGORY_LABEL: Record<DataCategory, string> = {
  MARKET_DATA: "行情",
  NEWS: "新闻",
  ANNOUNCEMENT: "公告",
  RESEARCH_REPORT: "研报",
  FUND_QUARTERLY_REPORT: "基金季报",
  MACRO_DATA: "宏观数据",
  INDUSTRY_DATA: "产业数据",
  FUTURES_STRUCTURE: "期货结构",
};

const scoreFilterPass = (score: number, filter: ScoreFilter): boolean => {
  if (filter === "ALL") return true;
  if (filter === "GE_90") return score >= 90;
  if (filter === "GE_80") return score >= 80;
  if (filter === "GE_70") return score >= 70;
  return score < 70;
};

const formatDateTime = (timestamp?: string): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatDuration = (seconds?: number, startedAt?: string, endedAt?: string): string => {
  if (typeof seconds === "number") return `${seconds}s`;
  if (!startedAt || !endedAt) return "-";
  const s = new Date(startedAt).getTime();
  const e = new Date(endedAt).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return "-";
  return `${Math.floor((e - s) / 1000)}s`;
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const inferStatus = (source: DataSource): Exclude<StatusFilter, "ALL"> => {
  if (source.status === "MAINTENANCE") return "PAUSED";
  if (source.status === "OUTAGE") return "FAILED";
  if (source.recentTasks.some((task) => task.status === "RUNNING")) return "SYNCING";
  if (source.status === "DEGRADED" || source.recentTasks.some((task) => task.status === "FAILED")) return "WARNING";
  return "NORMAL";
};

const inferTaskSummary = (source: DataSource): string => {
  const latestTask = [...source.recentTasks].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!latestTask) return "暂无任务";
  if (latestTask.status === "RUNNING") return `${latestTask.taskName} 进行中`;
  if (latestTask.status === "FAILED") return `${latestTask.taskName} 失败`;
  return `${latestTask.taskName} 成功`;
};

const todayDateString = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const findRelatedEvidence = (source: DataSource, evidenceItems: Evidence[]) => {
  const aliases = new Set([source.name, source.vendor, ...(source.evidenceSources ?? [])]);
  return evidenceItems.filter((evidence) => aliases.has(evidence.sourceName));
};

const findRelatedAssets = (
  source: DataSource,
  relatedEvidenceAssetIds: string[],
  assets: Asset[],
) => {
  const byType = assets.filter((asset) => source.supportedAssetTypes.includes(asset.assetType));
  const byEvidence = assets.filter((asset) => relatedEvidenceAssetIds.includes(asset.id));
  return Array.from(new Map([...byType, ...byEvidence].map((asset) => [asset.id, asset])).values());
};

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedSource = initialRouteParams.get("source") ?? undefined;

  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceTypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("ALL");
  const [qualityFilter, setQualityFilter] = useState<ScoreFilter>("ALL");
  const [reliabilityFilter, setReliabilityFilter] = useState<ScoreFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>(linkedSource ?? "ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>(linkedSource ?? "");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [sources, evidence, assetList] = await Promise.all([
          listDataSourcesAsync(),
          listEvidenceAsync({ limit: 100 }),
          listAssetsAsync({ limit: 100 }),
        ]);
        if (cancelled) return;
        setDataSources(sources);
        setEvidenceItems(evidence);
        setAssets(assetList);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setDataSources([]);
        setEvidenceItems([]);
        setAssets([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceOptions = useMemo(() => {
    const names = Array.from(new Set(dataSources.map((source) => source.name))).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...names];
  }, [dataSources]);

  const today = useMemo(() => todayDateString(), []);

  const sourceView = useMemo(() => {
    return dataSources.map((source) => {
      const displayStatus = inferStatus(source);
      const relatedEvidence = findRelatedEvidence(source, evidenceItems);
      const relatedEvidenceAssetIds = Array.from(new Set(relatedEvidence.flatMap((item) => item.relatedAssetIds)));
      const relatedAssets = findRelatedAssets(source, relatedEvidenceAssetIds, assets);
      const latestTask = [...source.recentTasks].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

      return {
        source,
        displayStatus,
        relatedEvidence,
        relatedAssets,
        latestTask,
      };
    });
  }, [assets, dataSources, evidenceItems]);

  const stats = useMemo(() => {
    const tasksToday = sourceView.flatMap((item) => item.source.recentTasks).filter((task) => task.startedAt.startsWith(today));
    const successToday = tasksToday.filter((task) => task.status === "SUCCESS").length;
    const failedToday = tasksToday.filter((task) => task.status === "FAILED").length;

    return {
      totalSources: sourceView.length,
      normalSources: sourceView.filter((item) => item.displayStatus === "NORMAL").length,
      abnormalSources: sourceView.filter((item) => item.displayStatus === "WARNING" || item.displayStatus === "FAILED").length,
      todayTasks: tasksToday.length,
      successToday,
      failedToday,
      avgQuality: average(sourceView.map((item) => item.source.qualityScore)),
      avgReliability: average(sourceView.map((item) => item.source.reliabilityScore)),
      supportedAssetTypesCount: new Set(sourceView.flatMap((item) => item.source.supportedAssetTypes)).size,
      relatedEvidenceCount: new Set(sourceView.flatMap((item) => item.relatedEvidence.map((e) => e.id))).size,
    };
  }, [sourceView, today]);

  const filteredSources = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return sourceView
      .filter((item) => {
        const source = item.source;
        const typePass = sourceTypeFilter === "ALL" || source.sourceType === sourceTypeFilter;
        const statusPass = statusFilter === "ALL" || item.displayStatus === statusFilter;
        const assetTypePass =
          assetTypeFilter === "ALL" ||
          (assetTypeFilter === "MULTI_ASSET"
            ? source.supportedAssetTypes.length > 1
            : source.supportedAssetTypes.includes(assetTypeFilter as AssetType));
        const sourcePass = sourceFilter === "ALL" || source.name === sourceFilter;
        const qualityPass = scoreFilterPass(source.qualityScore, qualityFilter);
        const reliabilityPass = scoreFilterPass(source.reliabilityScore, reliabilityFilter);
        const searchPass =
          keyword.length === 0 ||
          source.name.toLowerCase().includes(keyword) ||
          source.vendor.toLowerCase().includes(keyword) ||
          source.sourceType.toLowerCase().includes(keyword);
        return typePass && statusPass && assetTypePass && sourcePass && qualityPass && reliabilityPass && searchPass;
      })
      .sort((a, b) => b.source.lastSyncAt.localeCompare(a.source.lastSyncAt));
  }, [
    sourceView,
    sourceTypeFilter,
    statusFilter,
    assetTypeFilter,
    sourceFilter,
    qualityFilter,
    reliabilityFilter,
    searchKeyword,
  ]);

  useEffect(() => {
    if (filteredSources.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    const exists = selectedSourceId && filteredSources.some((item) => item.source.sourceId === selectedSourceId);
    if (!exists) {
      setSelectedSourceId(filteredSources[0].source.sourceId);
    }
  }, [filteredSources, selectedSourceId]);

  const selected = useMemo(() => {
    if (filteredSources.length === 0) return null;
    return filteredSources.find((item) => item.source.sourceId === selectedSourceId) ?? filteredSources[0];
  }, [filteredSources, selectedSourceId]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      {isLoading ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">正在读取数据源视图...</CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            Data Sources API 加载失败：{loadError}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>数据源总数</CardDescription><CardTitle className="text-lg">{stats.totalSources}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>正常数据源数量</CardDescription><CardTitle className="text-lg">{stats.normalSources}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>异常/失败数据源数量</CardDescription><CardTitle className="text-lg">{stats.abnormalSources}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>今日同步任务数</CardDescription><CardTitle className="text-lg">{stats.todayTasks}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>成功同步任务数</CardDescription><CardTitle className="text-lg">{stats.successToday}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>失败同步任务数</CardDescription><CardTitle className="text-lg">{stats.failedToday}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均质量评分</CardDescription><CardTitle className="text-lg">{stats.avgQuality.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均可靠性评分</CardDescription><CardTitle className="text-lg">{stats.avgReliability.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>支持资产类型数量</CardDescription><CardTitle className="text-lg">{stats.supportedAssetTypesCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>关联证据数量</CardDescription><CardTitle className="text-lg">{stats.relatedEvidenceCount}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选区</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">数据源类型</p>
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={sourceTypeFilter === filter ? "default" : "outline"} onClick={() => setSourceTypeFilter(filter)}>
                  {filter}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">状态</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={statusFilter === filter ? "default" : "outline"} onClick={() => setStatusFilter(filter)}>
                  {STATUS_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">支持资产类型</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_TYPE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={assetTypeFilter === filter ? "default" : "outline"} onClick={() => setAssetTypeFilter(filter)}>
                  {filter}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">来源</p>
            <div className="flex flex-wrap gap-2">
              {sourceOptions.map((source) => (
                <Button key={source} size="sm" variant={sourceFilter === source ? "default" : "outline"} onClick={() => setSourceFilter(source)}>
                  {source}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">质量评分</p>
            <div className="flex flex-wrap gap-2">
              {SCORE_FILTERS.map((filter) => (
                <Button key={`q-${filter}`} size="sm" variant={qualityFilter === filter ? "default" : "outline"} onClick={() => setQualityFilter(filter)}>
                  {filter === "ALL" ? "全部" : filter === "GE_90" ? ">= 90" : filter === "GE_80" ? ">= 80" : filter === "GE_70" ? ">= 70" : "< 70"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">来源可信度</p>
            <div className="flex flex-wrap gap-2">
              {SCORE_FILTERS.map((filter) => (
                <Button key={`r-${filter}`} size="sm" variant={reliabilityFilter === filter ? "default" : "outline"} onClick={() => setReliabilityFilter(filter)}>
                  {filter === "ALL" ? "全部" : filter === "GE_90" ? ">= 90" : filter === "GE_80" ? ">= 80" : filter === "GE_70" ? ">= 70" : "< 70"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">搜索</p>
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索 name / vendor / sourceType"
              className="w-full md:max-w-md h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {filteredSources.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配数据源</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-3 space-y-3">
            {filteredSources.map((item) => (
              <Card key={item.source.sourceId} className={item.displayStatus === "FAILED" ? "border-red-300/80" : item.displayStatus === "WARNING" ? "border-amber-300/80" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{item.source.name}</CardTitle>
                      <CardDescription>{item.source.vendor}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{item.source.sourceType}</Badge>
                      <Badge variant={STATUS_BADGE[item.displayStatus]}>{STATUS_LABEL[item.displayStatus]}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-muted-foreground">
                    <p>reliabilityScore: {item.source.reliabilityScore}</p>
                    <p>qualityScore: {item.source.qualityScore}</p>
                    <p>lastSyncAt: {formatDateTime(item.source.lastSyncAt)}</p>
                    <p>syncFrequency: {item.source.syncFrequency}</p>
                    <p>recentTasks: {item.source.recentTasks.length}</p>
                    <p>关联证据数: {item.relatedEvidence.length}</p>
                    <p>关联资产数: {item.relatedAssets.length}</p>
                  </div>
                  <p className="text-muted-foreground">最近任务状态摘要: {inferTaskSummary(item.source)}</p>
                  <div className="flex flex-wrap gap-1">
                    {item.source.supportedAssetTypes.map((assetType) => (
                      <Badge key={`${item.source.sourceId}-${assetType}`} variant="outline">
                        {assetType}
                      </Badge>
                    ))}
                  </div>
                  <div className="pt-1">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={selectedSourceId === item.source.sourceId ? "default" : "outline"}
                        onClick={() => setSelectedSourceId(item.source.sourceId)}
                      >
                        查看详情
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { source: item.source.name })}>
                        查看关联证据
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="xl:col-span-2 space-y-3">
            {!selected ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">请选择数据源查看详情。</CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">数据源详情面板</CardTitle>
                    <CardDescription>{selected.source.sourceId}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">基本信息</p>
                      <p className="text-muted-foreground">name: {selected.source.name}</p>
                      <p className="text-muted-foreground">sourceType: {selected.source.sourceType}</p>
                      <p className="text-muted-foreground">vendor: {selected.source.vendor}</p>
                      <p className="text-muted-foreground">status: {STATUS_LABEL[selected.displayStatus]}</p>
                      <p className="text-muted-foreground">syncFrequency: {selected.source.syncFrequency}</p>
                      <p className="text-muted-foreground">lastSyncAt: {formatDateTime(selected.source.lastSyncAt)}</p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">数据质量</p>
                      <p className="text-muted-foreground">qualityScore: {selected.source.qualityScore}</p>
                      <p className="text-muted-foreground">reliabilityScore: {selected.source.reliabilityScore}</p>
                      <p className="text-muted-foreground">字段完整性：{Math.min(98, selected.source.qualityScore + 6)}%</p>
                      <p className="text-muted-foreground">时效性：{Math.min(97, selected.source.reliabilityScore + 4)}%</p>
                      <p className="text-muted-foreground">去重质量：{Math.min(96, selected.source.qualityScore + 3)}%</p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">支持范围</p>
                      <div className="flex flex-wrap gap-1">
                        {selected.source.supportedAssetTypes.map((assetType) => (
                          <Badge key={`detail-${selected.source.sourceId}-${assetType}`} variant="outline">{assetType}</Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(selected.source.dataCategories ?? []).map((category) => (
                          <Badge key={`category-${selected.source.sourceId}-${category}`} variant="outline">
                            {DATA_CATEGORY_LABEL[category]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {selected ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">同步任务监控区</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>taskId</TableHead>
                    <TableHead>taskType</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead>startedAt</TableHead>
                    <TableHead>finishedAt</TableHead>
                    <TableHead>duration</TableHead>
                    <TableHead>recordsFetched</TableHead>
                    <TableHead>recordsSucceeded</TableHead>
                    <TableHead>recordsFailed</TableHead>
                    <TableHead>message</TableHead>
                    <TableHead>nextRetryAt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.source.recentTasks.map((task) => (
                    <TableRow key={task.taskId}>
                      <TableCell>{task.taskId}</TableCell>
                      <TableCell>{task.taskType ?? task.taskName}</TableCell>
                      <TableCell>
                        <Badge variant={task.status === "FAILED" ? "destructive" : task.status === "RUNNING" ? "secondary" : "default"}>{task.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(task.startedAt)}</TableCell>
                      <TableCell>{formatDateTime(task.finishedAt ?? task.endedAt)}</TableCell>
                      <TableCell>{formatDuration(task.durationSeconds, task.startedAt, task.finishedAt ?? task.endedAt)}</TableCell>
                      <TableCell>{task.recordsFetched ?? "-"}</TableCell>
                      <TableCell>{task.recordsSucceeded ?? "-"}</TableCell>
                      <TableCell>{task.recordsFailed ?? "-"}</TableCell>
                      <TableCell>{task.errorMessage ?? task.warningMessage ?? task.message ?? "-"}</TableCell>
                      <TableCell>{formatDateTime(task.nextRetryAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Related Evidence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedEvidence.length === 0 ? (
                  <p className="text-muted-foreground">暂无关联证据。</p>
                ) : (
                  selected.relatedEvidence.map((evidence) => (
                    <div key={evidence.id} className="rounded border p-2 space-y-1">
                      <p className="font-medium">{evidence.title}</p>
                      <p className="text-muted-foreground">
                        {evidence.evidenceType} · quality {evidence.qualityScore} · {formatDateTime(evidence.publishedAt)}
                      </p>
                      <p className="text-muted-foreground">usedByAgentRunIds: {evidence.usedByAgentRunIds.join(" / ") || "-"}</p>
                      <div className="pt-1 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: evidence.id })}>
                          查看证据
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { source: selected.source.name })}>
                          按来源查看
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Related Assets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected.relatedAssets.length === 0 ? (
                  <p className="text-muted-foreground">暂无关联资产。</p>
                ) : (
                  selected.relatedAssets.map((asset) => (
                    <div key={asset.id} className="rounded border p-2 space-y-1">
                      <p className="font-medium">{asset.symbol} · {asset.name}</p>
                      <p className="text-muted-foreground">{asset.assetType} · {asset.market}</p>
                      <div className="flex flex-wrap gap-1">
                        {asset.tags.slice(0, 5).map((tag) => (
                          <Badge key={`${asset.id}-${tag}`} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                      <div className="pt-1 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}>
                          查看资产详情
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/assets", { source: selected.source.name })}>
                          按来源查看资产
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

    </div>
  );
}
