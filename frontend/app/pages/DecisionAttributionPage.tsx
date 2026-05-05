import { useEffect, useMemo, useState } from "react";
import type { AssetType } from "@/entities/asset/model";
import type { Decision, DecisionAction, DecisionHorizon } from "@/entities/decision/model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDecisionsAsync } from "@/entities/decision/api";
import { listAssetsAsync } from "@/entities/asset/api";
import { listEvidenceAsync } from "@/entities/evidence/api";
import { listAgentRunsAsync } from "@/entities/agent/api";
import { getApiMode } from "@/shared/api/api-mode";
import { getCurrentHashQueryParams, navigateTo } from "@/shared/lib/navigation";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

type ActionFilter = "ALL" | DecisionAction;
type HorizonFilter = "ALL" | DecisionHorizon;
type ResultFilter = "ALL" | "VERIFIED" | "PENDING" | "POSITIVE" | "NEGATIVE" | "NEUTRAL";
type AssetTypeFilter = "ALL" | AssetType | "MULTI_ASSET";
type ConfidenceFilter = "ALL" | "GE_90" | "GE_80" | "GE_70" | "LT_70";

type DecisionOutcomeCategory = "PENDING" | "POSITIVE" | "NEGATIVE" | "NEUTRAL";

const ACTION_FILTERS: ActionFilter[] = ["ALL", "OVERWEIGHT", "UNDERWEIGHT", "HOLD", "WATCH", "NO_ACTION"];
const ACTION_LABEL: Record<ActionFilter, string> = {
  ALL: "全部",
  OVERWEIGHT: "增配",
  UNDERWEIGHT: "减配",
  HOLD: "持有",
  WATCH: "观察",
  NO_ACTION: "暂不配置",
};

const HORIZON_FILTERS: HorizonFilter[] = ["ALL", "SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"];
const HORIZON_LABEL: Record<HorizonFilter, string> = {
  ALL: "全部",
  SHORT_TERM: "短期",
  MEDIUM_TERM: "中期",
  LONG_TERM: "长期",
};

const RESULT_FILTERS: ResultFilter[] = ["ALL", "VERIFIED", "PENDING", "POSITIVE", "NEGATIVE", "NEUTRAL"];
const RESULT_FILTER_LABEL: Record<ResultFilter, string> = {
  ALL: "全部",
  VERIFIED: "已验证",
  PENDING: "待验证",
  POSITIVE: "正向",
  NEGATIVE: "负向",
  NEUTRAL: "中性",
};

const ASSET_TYPE_FILTERS: AssetTypeFilter[] = ["ALL", "ETF", "FUND", "FUTURE", "INDEX", "MULTI_ASSET"];

const CONFIDENCE_FILTERS: ConfidenceFilter[] = ["ALL", "GE_90", "GE_80", "GE_70", "LT_70"];
const CONFIDENCE_FILTER_LABEL: Record<ConfidenceFilter, string> = {
  ALL: "全部",
  GE_90: ">= 90",
  GE_80: ">= 80",
  GE_70: ">= 70",
  LT_70: "< 70",
};

const formatPercent = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

const formatDateTime = (timestamp?: string): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const confidencePass = (confidence: number, filter: ConfidenceFilter): boolean => {
  const score = confidence * 100;
  if (filter === "ALL") return true;
  if (filter === "GE_90") return score >= 90;
  if (filter === "GE_80") return score >= 80;
  if (filter === "GE_70") return score >= 70;
  return score < 70;
};

const classifyDecisionOutcome = (decision: Decision): DecisionOutcomeCategory => {
  if (!decision.actualOutcome || decision.actualOutcome.status === "PENDING") return "PENDING";
  if (decision.actualOutcome.status === "MISSED" || decision.actualOutcome.realizedReturn < 0) return "NEGATIVE";
  if (decision.actualOutcome.status === "ACHIEVED" || decision.actualOutcome.realizedReturn > 1) return "POSITIVE";
  return "NEUTRAL";
};

const outcomeBadgeVariant = (category: DecisionOutcomeCategory): "default" | "secondary" | "outline" | "destructive" => {
  if (category === "POSITIVE") return "default";
  if (category === "NEGATIVE") return "destructive";
  if (category === "PENDING") return "outline";
  return "secondary";
};

const outcomeLabel: Record<DecisionOutcomeCategory, string> = {
  PENDING: "待验证",
  POSITIVE: "正向",
  NEGATIVE: "负向",
  NEUTRAL: "中性",
};

const goToRunDetail = (runId: string) => {
  navigateTo(`/agent-lab/runs/${encodeURIComponent(runId)}`);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
};

export default function DecisionAttributionPage() {
  const apiMode = getApiMode();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof listAssetsAsync>>>([]);
  const [evidenceItems, setEvidenceItems] = useState<Awaited<ReturnType<typeof listEvidenceAsync>>>([]);
  const [agentRuns, setAgentRuns] = useState<Awaited<ReturnType<typeof listAgentRunsAsync>>>([]);
  const [isLoadingDecisions, setIsLoadingDecisions] = useState(true);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const initialRouteParams = useMemo(() => getCurrentHashQueryParams(), []);
  const linkedAssetId = initialRouteParams.get("assetId") ?? undefined;
  const linkedEvidenceId = initialRouteParams.get("evidenceId") ?? undefined;
  const linkedRunId = initialRouteParams.get("runId") ?? undefined;
  const linkedPortfolioId = initialRouteParams.get("portfolioId") ?? undefined;
  const linkedDecisionId = initialRouteParams.get("decisionId") ?? undefined;

  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [horizonFilter, setHorizonFilter] = useState<HorizonFilter>("ALL");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("ALL");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("ALL");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(linkedDecisionId ?? null);

  useEffect(() => {
    let cancelled = false;

    const loadDecisionContext = async () => {
      setIsLoadingDecisions(true);
      setDecisionError(null);
      try {
        const [nextDecisions, nextAssets, nextEvidence, nextRuns] = await Promise.all([
          listDecisionsAsync({
            assetId: linkedAssetId,
            runId: linkedRunId,
            portfolioId: linkedPortfolioId,
            limit: 200,
          }),
          listAssetsAsync({ limit: 200 }),
          listEvidenceAsync({ limit: 200 }),
          listAgentRunsAsync({}),
        ]);
        if (cancelled) return;
        setDecisions(nextDecisions);
        setAssets(nextAssets);
        setEvidenceItems(nextEvidence);
        setAgentRuns(nextRuns);
      } catch (error) {
        if (cancelled) return;
        setDecisionError(getErrorMessage(error));
        setDecisions([]);
        setAssets([]);
        setEvidenceItems([]);
        setAgentRuns([]);
      } finally {
        if (!cancelled) {
          setIsLoadingDecisions(false);
        }
      }
    };

    loadDecisionContext();

    return () => {
      cancelled = true;
    };
  }, [linkedAssetId, linkedPortfolioId, linkedRunId]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const evidenceById = useMemo(() => new Map(evidenceItems.map((item) => [item.id, item])), [evidenceItems]);
  const runById = useMemo(() => new Map(agentRuns.map((run) => [run.runId, run])), [agentRuns]);

  const decisionsView = useMemo(() => {
    return decisions.map((decision) => {
      const relatedAssets = decision.assetIds
        .map((assetId) => assetById.get(assetId))
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
      const relatedAssetNames = relatedAssets.map((asset) => `${asset.symbol} ${asset.name}`);
      const relatedAssetTypes = Array.from(new Set(relatedAssets.map((asset) => asset.assetType)));
      const assetTypeBucket: AssetTypeFilter =
        relatedAssetTypes.length === 0 ? "MULTI_ASSET" : relatedAssetTypes.length === 1 ? relatedAssetTypes[0] : "MULTI_ASSET";

      const relatedEvidence = decision.evidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const avgEvidenceQuality =
        relatedEvidence.length === 0
          ? 0
          : relatedEvidence.reduce((sum, item) => sum + item.qualityScore, 0) / relatedEvidence.length;
      const avgEvidenceReliability =
        relatedEvidence.length === 0
          ? 0
          : relatedEvidence.reduce((sum, item) => sum + item.reliabilityScore, 0) / relatedEvidence.length;

      const run = runById.get(decision.runId);
      const outcomeCategory = classifyDecisionOutcome(decision);
      const verified = outcomeCategory !== "PENDING";
      const highQuality = decision.confidence >= 0.75 && avgEvidenceQuality >= 85 && outcomeCategory !== "NEGATIVE";

      return {
        decision,
        relatedAssets,
        relatedAssetNames,
        assetTypeBucket,
        relatedEvidence,
        avgEvidenceQuality,
        avgEvidenceReliability,
        run,
        outcomeCategory,
        verified,
        highQuality,
      };
    });
  }, [assetById, evidenceById, runById, decisions]);

  const stats = useMemo(() => {
    const verified = decisionsView.filter((item) => item.verified);
    const withActualReturn = verified.filter((item) => Boolean(item.decision.actualOutcome));
    const avgActualReturn =
      withActualReturn.length === 0
        ? 0
        : withActualReturn.reduce((sum, item) => sum + (item.decision.actualOutcome?.realizedReturn ?? 0), 0) /
          withActualReturn.length;
    const avgEvidenceCount =
      decisionsView.length === 0 ? 0 : decisionsView.reduce((sum, item) => sum + item.decision.evidenceIds.length, 0) / decisionsView.length;

    return {
      total: decisionsView.length,
      verifiedCount: verified.length,
      positiveCount: decisionsView.filter((item) => item.outcomeCategory === "POSITIVE").length,
      negativeCount: decisionsView.filter((item) => item.outcomeCategory === "NEGATIVE").length,
      avgConfidence:
        decisionsView.length === 0 ? 0 : decisionsView.reduce((sum, item) => sum + item.decision.confidence, 0) / decisionsView.length,
      avgActualReturn,
      avgEvidenceCount,
      runCount: new Set(decisionsView.map((item) => item.decision.runId)).size,
      highQualityCount: decisionsView.filter((item) => item.highQuality).length,
    };
  }, [decisionsView]);

  const filteredDecisions = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return decisionsView
      .filter((item) => {
        const actionPass = actionFilter === "ALL" || item.decision.action === actionFilter;
        const horizonPass = horizonFilter === "ALL" || item.decision.horizon === horizonFilter;

        const resultPass =
          resultFilter === "ALL" ||
          (resultFilter === "VERIFIED" && item.verified) ||
          (resultFilter === "PENDING" && item.outcomeCategory === "PENDING") ||
          (resultFilter === "POSITIVE" && item.outcomeCategory === "POSITIVE") ||
          (resultFilter === "NEGATIVE" && item.outcomeCategory === "NEGATIVE") ||
          (resultFilter === "NEUTRAL" && item.outcomeCategory === "NEUTRAL");

        const assetPass = assetTypeFilter === "ALL" || item.assetTypeBucket === assetTypeFilter;
        const confidencePassResult = confidencePass(item.decision.confidence, confidenceFilter);
        const linkedAssetPass = !linkedAssetId || item.decision.assetIds.includes(linkedAssetId);
        const linkedEvidencePass = !linkedEvidenceId || item.decision.evidenceIds.includes(linkedEvidenceId);
        const linkedRunPass = !linkedRunId || item.decision.runId === linkedRunId;
        const linkedPortfolioPass = !linkedPortfolioId || item.decision.portfolioId === linkedPortfolioId;
        const linkedDecisionPass = !linkedDecisionId || item.decision.decisionId === linkedDecisionId;

        const searchable = [
          item.decision.thesis,
          item.decision.risks.join(" "),
          item.relatedAssetNames.join(" "),
          item.decision.action,
          ACTION_LABEL[item.decision.action],
        ]
          .join(" ")
          .toLowerCase();
        const searchPass = keyword.length === 0 || searchable.includes(keyword);

        return (
          actionPass &&
          horizonPass &&
          resultPass &&
          assetPass &&
          confidencePassResult &&
          linkedAssetPass &&
          linkedEvidencePass &&
          linkedRunPass &&
          linkedPortfolioPass &&
          linkedDecisionPass &&
          searchPass
        );
      })
      .sort((a, b) => b.decision.createdAt.localeCompare(a.decision.createdAt));
  }, [
    actionFilter,
    assetTypeFilter,
    confidenceFilter,
    decisionsView,
    horizonFilter,
    linkedAssetId,
    linkedDecisionId,
    linkedEvidenceId,
    linkedPortfolioId,
    linkedRunId,
    resultFilter,
    searchKeyword,
  ]);

  useEffect(() => {
    if (filteredDecisions.length === 0) {
      setSelectedDecisionId(null);
      return;
    }
    const exists = selectedDecisionId && filteredDecisions.some((item) => item.decision.decisionId === selectedDecisionId);
    if (!exists) {
      setSelectedDecisionId(filteredDecisions[0].decision.decisionId);
    }
  }, [filteredDecisions, selectedDecisionId]);

  const selected = useMemo(() => {
    if (filteredDecisions.length === 0) return null;
    return filteredDecisions.find((item) => item.decision.decisionId === selectedDecisionId) ?? filteredDecisions[0];
  }, [filteredDecisions, selectedDecisionId]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <ResearchWorkspaceNav />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl">Decision Attribution 决策归因</CardTitle>
            <Badge variant={apiMode === "real" ? "default" : "secondary"}>
              Data Mode: {apiMode === "real" ? "Real API / AgentRun Decision Store" : "Mock"}
            </Badge>
          </div>
          <CardDescription>连接投资建议、证据链、Agent Run、实际结果与复盘结论</CardDescription>
          <p className="text-xs text-muted-foreground">让每一次投资判断都能被追踪、解释、复盘和持续改进。</p>
        </CardHeader>
      </Card>

      {isLoadingDecisions ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">正在加载决策归因数据...</CardContent>
        </Card>
      ) : null}

      {decisionError ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Decision API 加载失败：{decisionError}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>决策总数</CardDescription><CardTitle className="text-lg">{stats.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>已验证决策数</CardDescription><CardTitle className="text-lg">{stats.verifiedCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>正向结果数量</CardDescription><CardTitle className="text-lg">{stats.positiveCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>负向结果数量</CardDescription><CardTitle className="text-lg">{stats.negativeCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均置信度</CardDescription><CardTitle className="text-lg">{(stats.avgConfidence * 100).toFixed(1)}%</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均实际收益</CardDescription><CardTitle className="text-lg">{formatPercent(stats.avgActualReturn, 1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>平均证据数量</CardDescription><CardTitle className="text-lg">{stats.avgEvidenceCount.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>关联 Agent Run 数</CardDescription><CardTitle className="text-lg">{stats.runCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>高质量决策数量</CardDescription><CardTitle className="text-lg">{stats.highQualityCount}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">决策动作</p>
            <div className="flex flex-wrap gap-2">
              {ACTION_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={actionFilter === filter ? "default" : "outline"} onClick={() => setActionFilter(filter)}>
                  {ACTION_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">时间周期</p>
            <div className="flex flex-wrap gap-2">
              {HORIZON_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={horizonFilter === filter ? "default" : "outline"} onClick={() => setHorizonFilter(filter)}>
                  {HORIZON_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">结果状态</p>
            <div className="flex flex-wrap gap-2">
              {RESULT_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={resultFilter === filter ? "default" : "outline"} onClick={() => setResultFilter(filter)}>
                  {RESULT_FILTER_LABEL[filter]}
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
            <p className="text-xs font-medium">置信度</p>
            <div className="flex flex-wrap gap-2">
              {CONFIDENCE_FILTERS.map((filter) => (
                <Button key={filter} size="sm" variant={confidenceFilter === filter ? "default" : "outline"} onClick={() => setConfidenceFilter(filter)}>
                  {CONFIDENCE_FILTER_LABEL[filter]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">搜索</p>
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索 thesis / risk / asset name / action"
              className="w-full md:max-w-md h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {filteredDecisions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-base font-medium">暂无匹配决策</p>
            <p className="text-xs text-muted-foreground">请调整筛选条件或搜索关键词。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-3 space-y-3">
            {filteredDecisions.map((item) => {
              const decision = item.decision;
              const actualOutcome = decision.actualOutcome;
              return (
                <Card key={decision.decisionId}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{decision.decisionId}</CardTitle>
                        <CardDescription>{formatDateTime(decision.createdAt)}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{ACTION_LABEL[decision.action]}</Badge>
                        <Badge variant="outline">{HORIZON_LABEL[decision.horizon]}</Badge>
                        <Badge variant={outcomeBadgeVariant(item.outcomeCategory)}>{outcomeLabel[item.outcomeCategory]}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-muted-foreground">
                      <p>confidence: {(decision.confidence * 100).toFixed(0)}%</p>
                      <p>runId: {decision.runId}</p>
                      <p>assetIds / assetNames: {item.relatedAssetNames.join(" / ") || decision.assetIds.join(", ")}</p>
                      <p>evidence count: {decision.evidenceIds.length}</p>
                    </div>
                    <p className="text-muted-foreground">thesis: {decision.thesis}</p>
                    <p className="text-muted-foreground">
                      expectedOutcome: return {formatPercent(decision.expectedOutcome.targetReturn, 1)} · maxDD{" "}
                      {formatPercent(decision.expectedOutcome.expectedMaxDrawdown, 1)}
                    </p>
                    <p className="text-muted-foreground">
                      actualOutcome:{" "}
                      {actualOutcome
                        ? `${actualOutcome.status} · return ${formatPercent(actualOutcome.realizedReturn, 1)} · maxDD ${formatPercent(actualOutcome.realizedMaxDrawdown, 1)}`
                        : "pending"}
                    </p>
                    <p className="text-muted-foreground">attribution summary: {decision.attribution.summary}</p>
                    <div className="pt-1">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={selectedDecisionId === decision.decisionId ? "default" : "outline"}
                          onClick={() => setSelectedDecisionId(decision.decisionId)}
                        >
                          查看详情
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => goToRunDetail(decision.runId)}>
                          查看 Agent Run
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { portfolioId: decision.portfolioId, decisionId: decision.decisionId })}>
                          查看组合影响
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigateTo("/leaderboard", { decisionId: decision.decisionId })}>
                          查看策略表现
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="xl:col-span-2 space-y-3">
            {!selected ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">请选择一条决策查看详情。</CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">决策详情面板</CardTitle>
                    <CardDescription>{selected.decision.decisionId}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">1. 原始建议</p>
                      <p className="text-muted-foreground">
                        {ACTION_LABEL[selected.decision.action]} · {HORIZON_LABEL[selected.decision.horizon]} · confidence{" "}
                        {(selected.decision.confidence * 100).toFixed(0)}%
                      </p>
                      <p className="text-muted-foreground">{selected.decision.thesis}</p>
                      <p className="text-muted-foreground">risks: {selected.decision.risks.join(" / ")}</p>
                      <p className="text-muted-foreground">
                        expected: return {formatPercent(selected.decision.expectedOutcome.targetReturn, 1)} · maxDD{" "}
                        {formatPercent(selected.decision.expectedOutcome.expectedMaxDrawdown, 1)}
                      </p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">2. 实际结果</p>
                      {selected.decision.actualOutcome ? (
                        <>
                          <p className="text-muted-foreground">
                            status: {selected.decision.actualOutcome.status} · asOf {selected.decision.actualOutcome.asOf}
                          </p>
                          <p className="text-muted-foreground">
                            return {formatPercent(selected.decision.actualOutcome.realizedReturn, 1)} · maxDD{" "}
                            {formatPercent(selected.decision.actualOutcome.realizedMaxDrawdown, 1)}
                          </p>
                          <p className="text-muted-foreground">{selected.decision.actualOutcome.note}</p>
                          <p className="text-muted-foreground">
                            是否符合预期：
                            {selected.outcomeCategory === "POSITIVE"
                              ? "符合"
                              : selected.outcomeCategory === "NEGATIVE"
                                ? "不符合"
                                : selected.outcomeCategory === "NEUTRAL"
                                  ? "部分符合"
                                  : "待验证"}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">待验证</p>
                      )}
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">3. 决策链路</p>
                      <p className="text-muted-foreground">runId: {selected.decision.runId}</p>
                      {selected.run ? (
                        <>
                          <p className="text-muted-foreground">
                            参与 Agent Teams: {Array.from(new Set(selected.run.agents.map((agent) => agent.team))).join(" / ")}
                          </p>
                          <p className="text-muted-foreground">
                            Final Decision 来源: {selected.run.finalDecision.summary ?? selected.run.finalDecision.thesis}
                          </p>
                          <Button size="sm" variant="outline" onClick={() => goToRunDetail(selected.run!.runId)}>
                            查看关联 Agent Run
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => navigateTo("/portfolio", { portfolioId: selected.decision.portfolioId, runId: selected.run?.runId })}>
                            查看关联组合
                          </Button>
                        </>
                      ) : (
                        <p className="text-muted-foreground">未找到关联 Agent Run</p>
                      )}
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">4. 证据链</p>
                      {selected.relatedEvidence.length ? (
                        selected.relatedEvidence.map((evidence) => (
                          <div key={evidence.id} className="rounded border p-2 text-muted-foreground">
                            <p>{evidence.title}</p>
                            <p>
                              {evidence.evidenceType} · {evidence.sourceName}
                            </p>
                            <p>quality {evidence.qualityScore} · reliability {evidence.reliabilityScore}</p>
                            <p>{evidence.summary}</p>
                            <div className="pt-1">
                              <Button size="sm" variant="outline" onClick={() => navigateTo("/evidence", { evidenceId: evidence.id })}>
                                查看证据详情
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">无关联证据</p>
                      )}
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">5. 资产关联</p>
                      <div className="flex flex-wrap gap-1">
                        {selected.relatedAssets.length ? (
                          selected.relatedAssets.map((asset) => (
                            <Button
                              key={asset.id}
                              size="sm"
                              variant="outline"
                              onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}
                            >
                              {asset.symbol} · {asset.name} · {asset.assetType}
                            </Button>
                          ))
                        ) : (
                          <Badge variant="outline">无关联资产</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">归因分析区</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">1. 收益归因</p>
                      {selected.decision.attribution.factors.map((factor) => (
                        <div key={`${selected.decision.decisionId}-${factor.factor}`} className="text-muted-foreground">
                          <p>
                            {factor.factor}: {factor.contribution >= 0 ? "+" : ""}
                            {factor.contribution.toFixed(2)}
                          </p>
                          <p>{factor.explanation}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">2. 风险归因</p>
                      <p className="text-muted-foreground">
                        正确识别：
                        {selected.decision.attribution.riskReview?.correctlyIdentified.length
                          ? selected.decision.attribution.riskReview.correctlyIdentified.join(" / ")
                          : selected.decision.risks.join(" / ")}
                      </p>
                      <p className="text-muted-foreground">
                        低估风险：
                        {selected.decision.attribution.riskReview?.underestimated.length
                          ? selected.decision.attribution.riskReview.underestimated.join(" / ")
                          : "暂无明确记录"}
                      </p>
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">3. 错误复盘</p>
                      {selected.decision.attribution.mistakeReview ? (
                        <>
                          <p className="text-muted-foreground">错误来源：{selected.decision.attribution.mistakeReview.errorSource}</p>
                          <p className="text-muted-foreground">
                            误判证据：{selected.decision.attribution.mistakeReview.misleadingEvidenceIds.join(" / ") || "无"}
                          </p>
                          <p className="text-muted-foreground">
                            失效假设：{selected.decision.attribution.mistakeReview.invalidatedAssumptions.join(" / ")}
                          </p>
                          <p className="text-muted-foreground">
                            改进建议：{selected.decision.attribution.mistakeReview.improvementActions.join(" / ")}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">暂无明显错误复盘项，继续跟踪验证。</p>
                      )}
                    </div>

                    <div className="rounded border p-2 space-y-1">
                      <p className="font-medium">4. Agent 贡献归因</p>
                      {selected.decision.attribution.agentContributions?.length ? (
                        selected.decision.attribution.agentContributions.map((contribution, index) => (
                          <div key={`${selected.decision.decisionId}-${index}`} className="text-muted-foreground border-b pb-1">
                            <p>
                              {contribution.team} · score {contribution.score}
                            </p>
                            <p>采纳观点：{contribution.adoptedInsight}</p>
                            <p>待优化：{contribution.needsOptimization ?? "无"}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">暂无明确 Agent 贡献评分，后续可接入自动评分规则。</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Traceability Panel 追溯链路</CardTitle>
          <CardDescription>Asset → Evidence → Agent Run → Decision → Actual Outcome → Attribution / Learning</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {!selected ? (
            <p className="text-muted-foreground">当前无可追溯决策。</p>
          ) : (
            <>
              <div className="rounded border p-2">
                <p className="font-medium">Asset</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selected.relatedAssets.map((asset) => (
                    <Button
                      key={`trace-asset-${asset.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => navigateTo(`/assets/${encodeURIComponent(asset.id)}`)}
                    >
                      {asset.symbol} · {asset.assetType}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="text-center text-muted-foreground">↓</div>
              <div className="rounded border p-2">
                <p className="font-medium">Evidence</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selected.relatedEvidence.map((evidence) => (
                    <Button
                      key={`trace-evidence-${evidence.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => navigateTo("/evidence", { evidenceId: evidence.id })}
                    >
                      {evidence.id} · {evidence.evidenceType}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="text-center text-muted-foreground">↓</div>
              <div className="rounded border p-2">
                <p className="font-medium">Agent Run</p>
                <Button size="sm" variant="outline" onClick={() => goToRunDetail(selected.decision.runId)}>
                  {selected.decision.runId}
                </Button>
                <p className="text-muted-foreground">{selected.run ? selected.run.name : "未找到关联 run"}</p>
              </div>
              <div className="text-center text-muted-foreground">↓</div>
              <div className="rounded border p-2">
                <p className="font-medium">Decision</p>
                <p className="text-muted-foreground">
                  {selected.decision.decisionId} · {ACTION_LABEL[selected.decision.action]} ·{" "}
                  {(selected.decision.confidence * 100).toFixed(0)}%
                </p>
              </div>
              <div className="text-center text-muted-foreground">↓</div>
              <div className="rounded border p-2">
                <p className="font-medium">Actual Outcome</p>
                <p className="text-muted-foreground">
                  {selected.decision.actualOutcome
                    ? `${selected.decision.actualOutcome.status} · return ${formatPercent(selected.decision.actualOutcome.realizedReturn, 1)}`
                    : "PENDING"}
                </p>
              </div>
              <div className="text-center text-muted-foreground">↓</div>
              <div className="rounded border p-2">
                <p className="font-medium">Attribution / Learning</p>
                <p className="text-muted-foreground">{selected.decision.attribution.summary}</p>
                <p className="text-muted-foreground">
                  {(selected.decision.attribution.learningPoints ?? []).length
                    ? selected.decision.attribution.learningPoints?.join(" / ")
                    : "持续跟踪与迭代归因规则"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
