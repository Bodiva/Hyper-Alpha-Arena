import { useEffect, useMemo, useState } from "react";
import type { EvidenceType } from "@/entities/evidence/model";
import type { Asset, AssetType } from "@/entities/asset/model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getEvidenceByIdAsync, listEvidenceAsync } from "@/entities/evidence/api";
import { listAssetsAsync } from "@/entities/asset/api";
import { listAgentRuns } from "@/entities/agent/api";
import { listDecisions } from "@/entities/decision/api";
import type { Evidence } from "@/entities/evidence/model";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

type EvidenceTypeFilter = "ALL" | EvidenceType;
type AssetTypeFilter = "ALL" | AssetType;
type QualityFilter = "ALL" | "GE_90" | "GE_80" | "GE_70" | "LT_70";
type UsageFilter = "ALL" | "USED_BY_AGENT_RUN" | "USED_BY_DECISION" | "UNUSED";

const EVIDENCE_TYPE_FILTERS: EvidenceTypeFilter[] = [
  "ALL",
  "news",
  "announcement",
  "research_report",
  "fund_quarterly_report",
  "macro_data",
  "market_snapshot",
  "industry_data",
  "user_upload",
  "external_search",
  "runtime_context",
];

const EVIDENCE_TYPE_LABEL: Record<EvidenceTypeFilter, string> = {
  ALL: "全部",
  news: "新闻",
  announcement: "公告",
  research_report: "研报",
  fund_quarterly_report: "基金季报",
  macro_data: "宏观数据",
  market_snapshot: "行情快照",
  industry_data: "产业数据",
  user_upload: "用户上传",
  external_search: "外部搜索",
  runtime_context: "运行上下文",
};

const ASSET_TYPE_FILTERS: AssetTypeFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "INDEX"];

const QUALITY_FILTERS: QualityFilter[] = ["ALL", "GE_90", "GE_80", "GE_70", "LT_70"];
const QUALITY_FILTER_LABEL: Record<QualityFilter, string> = {
  ALL: "全部",
  GE_90: ">= 90",
  GE_80: ">= 80",
  GE_70: ">= 70",
  LT_70: "< 70",
};

const USAGE_FILTERS: UsageFilter[] = ["ALL", "USED_BY_AGENT_RUN", "USED_BY_DECISION", "UNUSED"];
const USAGE_FILTER_LABEL: Record<UsageFilter, string> = {
  ALL: "全部",
  USED_BY_AGENT_RUN: "已被 Agent Run 使用",
  USED_BY_DECISION: "已被 Decision 使用",
  UNUSED: "未使用",
};

const formatDateTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const scoreVariant = (score: number): "default" | "secondary" | "destructive" => {
  if (score >= 85) return "default";
  if (score >= 70) return "secondary";
  return "destructive";
};

const hasSourceUrl = (url?: string): url is string => {
  return Boolean(url && /^https?:\/\//i.test(url));
};

const metadataText = (metadata: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const metadataNumber = (metadata: Record<string, unknown> | undefined, key: string): number | undefined => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const sourceTypeLabel = (sourceType?: string): string => {
  if (!sourceType) return "unknown source";
  if (sourceType === "bocha_search") return "Bocha Search";
  if (sourceType === "agent_run") return "Agent Run";
  if (sourceType === "static_seed") return "Static Seed";
  return sourceType;
};

const supportStatusLabel = (status?: string): string => {
  if (!status) return "support not scored";
  return status.replace(/_/g, " ");
};

const qualityPass = (score: number, filter: QualityFilter): boolean => {
  if (filter === "ALL") return true;
  if (filter === "GE_90") return score >= 90;
  if (filter === "GE_80") return score >= 80;
  if (filter === "GE_70") return score >= 70;
  return score < 70;
};

export default function EvidenceCenterPage() {
  const apiMode = getApiMode();
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState<boolean>(true);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const agentRuns = useMemo(() => {
    try {
      return listAgentRuns();
    } catch {
      return [];
    }
  }, []);
  const decisions = useMemo(() => {
    try {
      return listDecisions();
    } catch {
      return [];
    }
  }, []);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedAssetId = initialRouteParams.get("assetId") ?? undefined;
  const linkedEvidenceId = initialRouteParams.get("evidenceId") ?? undefined;
  const linkedSource = initialRouteParams.get("source") ?? undefined;

  const [typeFilter, setTypeFilter] = useState<EvidenceTypeFilter>("ALL");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>(linkedSource ?? "ALL");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("ALL");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>(linkedSource ?? "");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(linkedEvidenceId ?? null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingEvidence(true);
    setEvidenceError(null);

    Promise.all([
      listEvidenceAsync({
        assetId: linkedAssetId,
        keyword: linkedSource,
        limit: 100,
      }),
      listAssetsAsync({ limit: 100 }),
      linkedEvidenceId ? getEvidenceByIdAsync(linkedEvidenceId).catch(() => undefined) : Promise.resolve(undefined),
    ])
      .then(([items, assetItems, linkedEvidence]) => {
        if (cancelled) return;
        const mergedItems = linkedEvidence && !items.some((item) => item.id === linkedEvidence.id)
          ? [linkedEvidence, ...items]
          : items;
        setEvidenceItems(mergedItems);
        setAssets(assetItems);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load evidence.";
        setEvidenceError(message);
        setEvidenceItems([]);
        setAssets([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingEvidence(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [linkedAssetId, linkedEvidenceId, linkedSource]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const decisionIdsByEvidence = useMemo(() => {
    const map = new Map<string, string[]>();
    evidenceItems.forEach((item) => {
      if (item.usedByDecisionIds?.length) {
        map.set(item.id, [...item.usedByDecisionIds]);
      }
    });
    decisions.forEach((decision) => {
      decision.evidenceIds.forEach((evidenceId) => {
        const current = map.get(evidenceId) ?? [];
        if (!current.includes(decision.decisionId)) {
          map.set(evidenceId, [...current, decision.decisionId]);
        }
      });
    });
    return map;
  }, [decisions, evidenceItems]);

  const runIdsByEvidence = useMemo(() => {
    const map = new Map<string, string[]>();
    evidenceItems.forEach((item) => {
      map.set(item.id, [...item.usedByAgentRunIds]);
    });
    agentRuns.forEach((run) => {
      run.evidenceIds.forEach((evidenceId) => {
        const current = map.get(evidenceId) ?? [];
        if (!current.includes(run.runId)) {
          map.set(evidenceId, [...current, run.runId]);
        }
      });
    });
    return map;
  }, [agentRuns, evidenceItems]);

  const sourceOptions = useMemo(() => {
    return ["ALL", ...Array.from(new Set(evidenceItems.map((item) => item.sourceName))).sort((a, b) => a.localeCompare(b))];
  }, [evidenceItems]);

  const stats = useMemo(() => {
    const usedByRunCount = evidenceItems.filter((item) => (runIdsByEvidence.get(item.id) ?? []).length > 0).length;
    const usedByDecisionCount = evidenceItems.filter((item) => (decisionIdsByEvidence.get(item.id) ?? []).length > 0).length;

    return {
      total: evidenceItems.length,
      news: evidenceItems.filter((item) => item.evidenceType === "news").length,
      announcement: evidenceItems.filter((item) => item.evidenceType === "announcement").length,
      research: evidenceItems.filter((item) => item.evidenceType === "research_report").length,
      fundQuarterly: evidenceItems.filter((item) => item.evidenceType === "fund_quarterly_report").length,
      macro: evidenceItems.filter((item) => item.evidenceType === "macro_data").length,
      avgQuality: average(evidenceItems.map((item) => item.qualityScore)),
      avgReliability: average(evidenceItems.map((item) => item.reliabilityScore)),
      usedByRunCount,
      usedByDecisionCount,
    };
  }, [decisionIdsByEvidence, evidenceItems, runIdsByEvidence]);

  const filteredEvidence = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return evidenceItems
      .filter((item) => {
        const evidenceTypePass = typeFilter === "ALL" || item.evidenceType === typeFilter;
        const linkedEvidencePass = !linkedEvidenceId || item.id === linkedEvidenceId;
        const linkedSourcePass = !linkedSource || item.sourceName === linkedSource;

        const relatedAssetTypes = new Set(
          item.relatedAssetIds
            .map((assetId) => assetById.get(assetId)?.assetType)
            .filter((assetType): assetType is AssetType => Boolean(assetType)),
        );
        const assetTypePass = assetTypeFilter === "ALL" || relatedAssetTypes.has(assetTypeFilter);
        const linkedAssetPass = !linkedAssetId || item.relatedAssetIds.includes(linkedAssetId);

        const sourcePass = sourceFilter === "ALL" || item.sourceName === sourceFilter;
        const qualityPassResult = qualityPass(item.qualityScore, qualityFilter);

        const runIds = runIdsByEvidence.get(item.id) ?? [];
        const decisionIds = decisionIdsByEvidence.get(item.id) ?? [];
        const usagePass =
          usageFilter === "ALL" ||
          (usageFilter === "USED_BY_AGENT_RUN" && runIds.length > 0) ||
          (usageFilter === "USED_BY_DECISION" && decisionIds.length > 0) ||
          (usageFilter === "UNUSED" && runIds.length === 0 && decisionIds.length === 0);

        const searchPass =
          keyword.length === 0 ||
          item.title.toLowerCase().includes(keyword) ||
          item.summary.toLowerCase().includes(keyword) ||
          item.sourceName.toLowerCase().includes(keyword);

        return (
          evidenceTypePass &&
          linkedEvidencePass &&
          linkedSourcePass &&
          assetTypePass &&
          linkedAssetPass &&
          sourcePass &&
          qualityPassResult &&
          usagePass &&
          searchPass
        );
      })
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }, [
    assetById,
    assetTypeFilter,
    decisionIdsByEvidence,
    evidenceItems,
    linkedAssetId,
    linkedEvidenceId,
    linkedSource,
    qualityFilter,
    runIdsByEvidence,
    searchKeyword,
    sourceFilter,
    typeFilter,
    usageFilter,
  ]);

  useEffect(() => {
    if (filteredEvidence.length === 0) {
      setSelectedEvidenceId(null);
      return;
    }
    const exists = selectedEvidenceId && filteredEvidence.some((item) => item.id === selectedEvidenceId);
    if (!exists) {
      setSelectedEvidenceId(filteredEvidence[0].id);
    }
  }, [filteredEvidence, selectedEvidenceId]);

  const selectedEvidence = useMemo(() => {
    if (filteredEvidence.length === 0) return null;
    return filteredEvidence.find((item) => item.id === selectedEvidenceId) ?? filteredEvidence[0];
  }, [filteredEvidence, selectedEvidenceId]);

  const selectedTrace = useMemo(() => {
    if (!selectedEvidence) return null;
    const relatedAssets = selectedEvidence.relatedAssetIds
      .map((assetId) => assetById.get(assetId))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

    const runIds = runIdsByEvidence.get(selectedEvidence.id) ?? [];
    const relatedRuns = runIds
      .map((runId) => agentRuns.find((run) => run.runId === runId))
      .filter((run): run is NonNullable<typeof run> => Boolean(run));

    const decisionIds = decisionIdsByEvidence.get(selectedEvidence.id) ?? [];
    const relatedDecisions = decisionIds
      .map((decisionId) => decisions.find((decision) => decision.decisionId === decisionId))
      .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision));

    return { relatedAssets, relatedRuns, relatedDecisions, runIds, decisionIds };
  }, [agentRuns, assetById, decisionIdsByEvidence, decisions, runIdsByEvidence, selectedEvidence]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Evidence Center 证据中心</CardTitle>
          <CardDescription>统一管理外部信息、原始证据、数据快照与 Agent 决策引用链路</CardDescription>
          <p className="text-xs text-muted-foreground">
            每个投资判断都应能追溯到数据来源、发布时间、采集时间、质量评分和使用记录。
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant={apiMode === "real" ? "default" : "secondary"}>
              Data Mode: {apiMode === "real" ? "Real API" : "Mock"}
            </Badge>
            {apiMode === "real" && (
              <Badge variant="outline">Static Evidence Store</Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {isLoadingEvidence && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">Loading evidence...</CardContent>
        </Card>
      )}

      {evidenceError && (
        <Card className="border-red-300/70">
          <CardContent className="py-4 text-sm text-red-600">Evidence API error: {evidenceError}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>证据总数</CardDescription><CardTitle className="text-lg">{stats.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>新闻数量</CardDescription><CardTitle className="text-lg">{stats.news}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>公告数量</CardDescription><CardTitle className="text-lg">{stats.announcement}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>研报数量</CardDescription><CardTitle className="text-lg">{stats.research}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>基金季报数量</CardDescription><CardTitle className="text-lg">{stats.fundQuarterly}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>宏观数据数量</CardDescription><CardTitle className="text-lg">{stats.macro}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均质量评分</CardDescription><CardTitle className="text-lg">{stats.avgQuality.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均可信度评分</CardDescription><CardTitle className="text-lg">{stats.avgReliability.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>被 Agent Run 使用</CardDescription><CardTitle className="text-lg">{stats.usedByRunCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>被 Decision 使用</CardDescription><CardTitle className="text-lg">{stats.usedByDecisionCount}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">证据类型</p>
            <div className="flex flex-wrap gap-2">
              {EVIDENCE_TYPE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={typeFilter === filter ? "default" : "outline"} onClick={() => setTypeFilter(filter)}>
                  {EVIDENCE_TYPE_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">资产类型</p>
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
              {QUALITY_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={qualityFilter === filter ? "default" : "outline"} onClick={() => setQualityFilter(filter)}>
                  {QUALITY_FILTER_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">使用状态</p>
            <div className="flex flex-wrap gap-2">
              {USAGE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={usageFilter === filter ? "default" : "outline"} onClick={() => setUsageFilter(filter)}>
                  {USAGE_FILTER_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">搜索</p>
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索 title / summary / sourceName"
              className="w-full md:max-w-md h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {filteredEvidence.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配证据</p>
            <p className="text-xs text-muted-foreground">请调整证据类型、来源、质量评分或使用状态筛选。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-3 space-y-3">
            {filteredEvidence.map((item) => {
              const runIds = runIdsByEvidence.get(item.id) ?? [];
              const decisionIds = decisionIdsByEvidence.get(item.id) ?? [];
              const relatedAssets = item.relatedAssetIds
                .map((assetId) => assetById.get(assetId))
                .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
              const lowSignal = item.qualityScore < 70 || item.reliabilityScore < 70;
              const supportScore = metadataNumber(item.metadata, "evidenceSupportScore");
              const supportStatus = metadataText(item.metadata, "evidenceSupportStatus");

              return (
                <Card key={item.id} className={lowSignal ? "border-red-300/70" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <CardDescription>{item.sourceName}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{EVIDENCE_TYPE_LABEL[item.evidenceType]}</Badge>
                        <Badge variant="outline">{sourceTypeLabel(item.sourceType)}</Badge>
                        <Badge variant={scoreVariant(item.qualityScore)}>质量 {item.qualityScore}</Badge>
                        <Badge variant={scoreVariant(item.reliabilityScore)}>可信度 {item.reliabilityScore}</Badge>
                        {supportScore !== undefined && (
                          <Badge variant={supportScore >= 0.6 ? "secondary" : "destructive"}>
                            支撑度 {(supportScore * 100).toFixed(0)}% · {supportStatusLabel(supportStatus)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-muted-foreground">
                      <p>PublishedAt: {formatDateTime(item.publishedAt)}</p>
                      <p>CollectedAt: {formatDateTime(item.collectedAt)}</p>
                    </div>

                    <p className="text-muted-foreground">{item.summary}</p>

                    <div className="space-y-1">
                      <p className="text-muted-foreground">Related Assets</p>
                      <div className="flex flex-wrap gap-1">
                        {relatedAssets.length ? (
                          relatedAssets.map((asset) => (
                            <Button
                              key={`${item.id}-${asset.id}`}
                              size="sm"
                              variant="outline"
                              onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}
                            >
                              {asset.symbol} · {asset.assetType}
                            </Button>
                          ))
                        ) : (
                          <Badge variant="outline">无关联资产</Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-muted-foreground">usedByAgentRunIds / usedByDecisionIds</p>
                      <div className="flex flex-wrap gap-1">
                        {runIds.length ? runIds.map((id) => (
                          <Button key={`${item.id}-run-${id}`} size="sm" variant="outline" onClick={() => navigateTo(`/agent-lab/runs/${encodeURIComponent(id)}`)}>
                            {id}
                          </Button>
                        )) : <Badge variant="outline">无 Agent Run</Badge>}
                        {decisionIds.length ? decisionIds.map((id) => (
                          <Button key={`${item.id}-decision-${id}`} size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { decisionId: id })}>
                            {id}
                          </Button>
                        )) : <Badge variant="outline">无 Decision</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant={selectedEvidenceId === item.id ? "default" : "outline"} onClick={() => setSelectedEvidenceId(item.id)}>
                        查看详情
                      </Button>
                      {hasSourceUrl(item.url) ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            打开来源网页
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedEvidenceId(item.id);
                          document.getElementById("traceability-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        追溯链路
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigateTo("/data-sources", { source: item.sourceName })}>
                        查看相关数据源
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="xl:col-span-2 space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">证据详情面板</CardTitle>
                <CardDescription>{selectedEvidence ? `Evidence ID: ${selectedEvidence.id}` : "当前无选中证据"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {!selectedEvidence ? (
                  <p className="text-muted-foreground">请选择证据查看详情。</p>
                ) : (
                  <>
                    <p className="font-medium">{selectedEvidence.title}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{EVIDENCE_TYPE_LABEL[selectedEvidence.evidenceType]}</Badge>
                      <Badge variant="outline">{sourceTypeLabel(selectedEvidence.sourceType)}</Badge>
                      <Badge variant={scoreVariant(selectedEvidence.qualityScore)}>质量 {selectedEvidence.qualityScore}</Badge>
                      <Badge variant={scoreVariant(selectedEvidence.reliabilityScore)}>可信度 {selectedEvidence.reliabilityScore}</Badge>
                      {metadataNumber(selectedEvidence.metadata, "evidenceSupportScore") !== undefined && (
                        <Badge variant={(metadataNumber(selectedEvidence.metadata, "evidenceSupportScore") ?? 0) >= 0.6 ? "secondary" : "destructive"}>
                          支撑度 {((metadataNumber(selectedEvidence.metadata, "evidenceSupportScore") ?? 0) * 100).toFixed(0)}% · {supportStatusLabel(metadataText(selectedEvidence.metadata, "evidenceSupportStatus"))}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">来源：{selectedEvidence.sourceName}</p>
                    <div className="rounded border bg-muted/30 p-2">
                      <p className="font-medium">Governance / Provenance</p>
                      <p className="text-muted-foreground">Source type: {sourceTypeLabel(selectedEvidence.sourceType)}</p>
                      <p className="text-muted-foreground">
                        Provenance: {metadataText(selectedEvidence.metadata, "provenanceStatus") ?? "unknown"}
                      </p>
                      <p className="text-muted-foreground">
                        {metadataText(selectedEvidence.metadata, "governanceNote") ?? "No additional governance note recorded."}
                      </p>
                      {metadataText(selectedEvidence.metadata, "lastGovernanceEventType") && (
                        <p className="text-muted-foreground">
                          Last governance event: {metadataText(selectedEvidence.metadata, "lastGovernanceEventType")}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-muted-foreground">Canonical Source URL</p>
                        {selectedEvidence.sourceType === "bocha_search" ? (
                          <Badge variant="outline">Bocha external search result</Badge>
                        ) : null}
                      </div>
                      {hasSourceUrl(selectedEvidence.url) ? (
                        <div className="rounded border bg-background p-2">
                          <a
                            href={selectedEvidence.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block break-all text-blue-600 hover:underline"
                          >
                            {selectedEvidence.url}
                          </a>
                          <p className="mt-1 text-muted-foreground">
                            该 URL 是证据的 canonical source。内嵌预览只是 best-effort，若为空请以原网页为准。
                          </p>
                        </div>
                      ) : (
                        <p className="break-all text-muted-foreground">{selectedEvidence.url || "无来源 URL"}</p>
                      )}
                    </div>
                    <p className="text-muted-foreground">发布时间：{formatDateTime(selectedEvidence.publishedAt)}</p>
                    <p className="text-muted-foreground">采集时间：{formatDateTime(selectedEvidence.collectedAt)}</p>
                    <p className="text-muted-foreground">摘要：{selectedEvidence.summary}</p>

                    {hasSourceUrl(selectedEvidence.url) ? (
                      <details className="rounded border p-2">
                        <summary className="cursor-pointer font-medium">内嵌网页预览</summary>
                        <p className="mt-2 text-muted-foreground">
                          若目标站点设置了 X-Frame-Options 或 CSP，预览可能为空；此时请使用上方来源链接打开原网页。
                        </p>
                        <iframe
                          title={`Evidence source preview ${selectedEvidence.id}`}
                          src={selectedEvidence.url}
                          className="mt-2 h-[420px] w-full rounded border bg-white"
                          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                          referrerPolicy="no-referrer"
                        />
                      </details>
                    ) : null}

                    <div className="space-y-1">
                      <p className="font-medium">相关资产</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedTrace?.relatedAssets.length ? (
                          selectedTrace.relatedAssets.map((asset) => (
                            <Button
                              key={`detail-asset-${asset.id}`}
                              size="sm"
                              variant="outline"
                              onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}
                            >
                              {asset.symbol} · {asset.name}
                            </Button>
                          ))
                        ) : (
                          <Badge variant="outline">无</Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="font-medium">抽取字段 extractedFields</p>
                      {selectedEvidence.extractedFields.length ? (
                        selectedEvidence.extractedFields.map((field) => (
                          <div key={`${selectedEvidence.id}-${field.field}`} className="rounded border p-2 text-muted-foreground">
                            <p>{field.field}: {field.value}</p>
                            <p>confidence: {(field.confidence * 100).toFixed(0)}%</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">无抽取字段</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="font-medium">usedByAgentRunIds</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedTrace?.runIds.length ? selectedTrace.runIds.map((id) => (
                          <Button key={`detail-run-${id}`} size="sm" variant="outline" onClick={() => navigateTo(`/agent-lab/runs/${encodeURIComponent(id)}`)}>
                            {id}
                          </Button>
                        )) : <Badge variant="outline">无</Badge>}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">usedByDecisionIds</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedTrace?.decisionIds.length ? selectedTrace.decisionIds.map((id) => (
                          <Button key={`detail-decision-${id}`} size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { decisionId: id })}>
                            {id}
                          </Button>
                        )) : <Badge variant="outline">无</Badge>}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card id="traceability-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Traceability Panel 追溯链路</CardTitle>
          <CardDescription>外部信息源 → Evidence Item → Related Assets → Agent Runs → Decisions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {!selectedEvidence || !selectedTrace ? (
            <p className="text-muted-foreground">当前无可追溯证据。</p>
          ) : (
            <>
              <div className="rounded border p-2">
                <p className="font-medium">外部信息源</p>
                <p className="text-muted-foreground">{selectedEvidence.sourceName}</p>
                <p className="text-muted-foreground">Published: {formatDateTime(selectedEvidence.publishedAt)}</p>
                <p className="text-muted-foreground">Collected: {formatDateTime(selectedEvidence.collectedAt)}</p>
              </div>

              <div className="text-center text-muted-foreground">↓</div>

              <div className="rounded border p-2">
                <p className="font-medium">Evidence Item</p>
                <p className="text-muted-foreground">{selectedEvidence.id} · {selectedEvidence.title}</p>
                <p className="text-muted-foreground">
                  质量 {selectedEvidence.qualityScore} / 可信度 {selectedEvidence.reliabilityScore}
                </p>
              </div>

              <div className="text-center text-muted-foreground">↓</div>

              <div className="rounded border p-2">
                <p className="font-medium">Related Assets</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedTrace.relatedAssets.length ? (
                    selectedTrace.relatedAssets.map((asset) => (
                      <Button
                        key={`trace-asset-${asset.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}
                      >
                        {asset.symbol} · {asset.assetType}
                      </Button>
                    ))
                  ) : (
                    <Badge variant="outline">无关联资产</Badge>
                  )}
                </div>
              </div>

              <div className="text-center text-muted-foreground">↓</div>

              <div className="rounded border p-2">
                <p className="font-medium">Agent Runs</p>
                <div className="space-y-1 mt-1">
                  {selectedTrace.relatedRuns.length ? (
                    selectedTrace.relatedRuns.map((run) => (
                      <div key={`trace-run-${run.runId}`} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <Button size="sm" variant="outline" onClick={() => navigateTo(`/agent-lab/runs/${encodeURIComponent(run.runId)}`)}>
                          {run.runId}
                        </Button>
                        <span>{run.status}</span>
                        <span>{run.taskType}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">无关联 Agent Run</p>
                  )}
                </div>
              </div>

              <div className="text-center text-muted-foreground">↓</div>

              <div className="rounded border p-2">
                <p className="font-medium">Decisions</p>
                <div className="space-y-1 mt-1">
                  {selectedTrace.relatedDecisions.length ? (
                    selectedTrace.relatedDecisions.map((decision) => (
                      <div key={`trace-decision-${decision.decisionId}`} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/decision-attribution", { decisionId: decision.decisionId })}>
                          {decision.decisionId}
                        </Button>
                        <span>{decision.action}</span>
                        <span>confidence {(decision.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">无关联 Decision</p>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
