from __future__ import annotations

from typing import Dict, List, Optional

from schemas.alpha_trace_leaderboard import AlphaTraceLeaderboardItem
from services.agent_runtime_store.registry import get_agent_run_store
from services.strategy_store.strategy_store import get_static_strategy_store


def _clamp_score(value: float) -> float:
    return max(0, min(100, round(value, 2)))


def _runtime_metrics(related_runs: list) -> Dict[str, float | int | list]:
    completed = [run for run in related_runs if run.status == "completed"]
    failed = [run for run in related_runs if run.status == "failed"]
    decisions = [run.finalDecision for run in related_runs if run.finalDecision]
    confidence_values = [decision.confidence for decision in decisions if decision.confidence is not None]
    avg_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0
    evidence_count = sum(len(run.evidenceIds) for run in related_runs)
    report_count = sum(len(run.reports) for run in related_runs)
    risk_warning_count = sum(len([event for event in run.events if event.type == "risk.warning"]) for run in related_runs)

    if not related_runs:
        return {
            "completed": completed,
            "failed": failed,
            "decisions": decisions,
            "avg_confidence": 0,
            "evidence_count": 0,
            "report_count": 0,
            "risk_warning_count": 0,
            "evidence_score": 0,
            "risk_score": 0,
            "runtime_quality": 0,
        }

    evidence_score = _clamp_score(evidence_count * 10 + avg_confidence * 20)
    risk_score = _clamp_score(70 - len(failed) * 20 - risk_warning_count * 2 + len(completed) * 5)
    runtime_quality = _clamp_score(
        min(30, len(completed) * 10)
        - min(35, len(failed) * 15)
        + avg_confidence * 20
        + min(20, evidence_count * 2)
        + min(15, report_count * 2)
        - min(20, risk_warning_count * 2)
    )

    return {
        "completed": completed,
        "failed": failed,
        "decisions": decisions,
        "avg_confidence": avg_confidence,
        "evidence_count": evidence_count,
        "report_count": report_count,
        "risk_warning_count": risk_warning_count,
        "evidence_score": evidence_score,
        "risk_score": risk_score,
        "runtime_quality": runtime_quality,
    }


class RuntimeQualityLeaderboardStore:
    """Leaderboard derived from AgentRun runtime quality, not realized investment returns."""

    def __init__(self) -> None:
        self._run_store = get_agent_run_store()
        self._strategy_store = get_static_strategy_store()

    def list_leaderboard(
        self,
        strategy_id: Optional[str] = None,
        asset_type: Optional[str] = None,
        style: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AlphaTraceLeaderboardItem]:
        strategies = self._strategy_store.list_strategies(limit=10_000)
        runs = self._run_store.list_runs()
        items: List[AlphaTraceLeaderboardItem] = []

        for strategy in strategies:
            if strategy_id and strategy.strategyId != strategy_id:
                continue
            if asset_type and asset_type not in strategy.assetTypes:
                continue
            if style and style not in {strategy.style, strategy.styleLabel}:
                continue

            related_runs = [run for run in runs if run.strategyId == strategy.strategyId]
            metrics = _runtime_metrics(related_runs)
            completed = metrics["completed"]
            failed = metrics["failed"]
            decisions = metrics["decisions"]
            avg_confidence = metrics["avg_confidence"]
            evidence_count = metrics["evidence_count"]
            report_count = metrics["report_count"]
            risk_warning_count = metrics["risk_warning_count"]

            items.append(
                AlphaTraceLeaderboardItem(
                    rank=0,
                    traderId=f"runtime_trader_{strategy.strategyId}",
                    traderName=f"{strategy.styleLabel} Runtime Agent",
                    strategyId=strategy.strategyId,
                    strategyName=strategy.strategyName or strategy.name,
                    style=strategy.style,
                    styleLabel=strategy.styleLabel,
                    assetTypes=strategy.assetTypes,
                    runMode="PAPER",
                    timeRange="ALL",
                    totalReturn=0,
                    annualizedReturn=0,
                    maxDrawdown=0,
                    volatility=0,
                    sharpe=0,
                    sortino=0,
                    calmar=0,
                    winRate=0,
                    turnover=0,
                    evidenceScore=metrics["evidence_score"],
                    riskScore=metrics["risk_score"],
                    summary=(
                        f"Runtime quality score based on {len(completed)} completed run(s), "
                        f"{len(failed)} failed run(s), {evidence_count} evidence reference(s), "
                        f"and {report_count} report(s). No realized return is computed in MVP."
                    ),
                    strengths=[
                        f"Completed runs: {len(completed)}",
                        f"Evidence references: {evidence_count}",
                        f"Average confidence: {avg_confidence:.2f}",
                    ],
                    risks=[
                        "No real backtest or live trading return is used.",
                        f"Failed runs: {len(failed)}",
                        f"Risk warnings: {risk_warning_count}",
                    ],
                    completedRuns=len(completed),
                    failedRuns=len(failed),
                    averageConfidence=avg_confidence,
                    evidenceCount=evidence_count,
                    reportCount=report_count,
                    riskWarnings=risk_warning_count,
                    decisionCount=len(decisions),
                    runtimeQualityScore=metrics["runtime_quality"],
                )
            )

        task_runs: Dict[str, list] = {}
        for run in runs:
            if run.strategyId:
                continue
            task_runs.setdefault(run.taskType, []).append(run)

        for task_type, related_runs in task_runs.items():
            if strategy_id:
                continue

            metrics = _runtime_metrics(related_runs)
            completed = metrics["completed"]
            failed = metrics["failed"]
            decisions = metrics["decisions"]
            avg_confidence = metrics["avg_confidence"]
            evidence_count = metrics["evidence_count"]
            report_count = metrics["report_count"]
            risk_warning_count = metrics["risk_warning_count"]

            items.append(
                AlphaTraceLeaderboardItem(
                    rank=0,
                    traderId=f"runtime_task_{task_type}",
                    traderName=f"{task_type} Runtime Agent",
                    strategyId=f"runtime_task_{task_type}",
                    strategyName=f"{task_type} Runtime Task",
                    style="MACRO_ALLOCATION",
                    styleLabel="宏观配置",
                    assetTypes=["ETF", "FUND", "FUTURE", "INDEX"],
                    runMode="PAPER",
                    timeRange="ALL",
                    totalReturn=0,
                    annualizedReturn=0,
                    maxDrawdown=0,
                    volatility=0,
                    sharpe=0,
                    sortino=0,
                    calmar=0,
                    winRate=0,
                    turnover=0,
                    evidenceScore=metrics["evidence_score"],
                    riskScore=metrics["risk_score"],
                    summary=(
                        f"Runtime quality score for taskType={task_type}, based on "
                        f"{len(completed)} completed run(s), {len(failed)} failed run(s), "
                        f"{evidence_count} evidence reference(s), and {report_count} report(s). "
                        "No realized return is computed in MVP."
                    ),
                    strengths=[
                        f"Completed runs: {len(completed)}",
                        f"Evidence references: {evidence_count}",
                        f"Average confidence: {avg_confidence:.2f}",
                    ],
                    risks=[
                        "No real backtest or live trading return is used.",
                        f"Failed runs: {len(failed)}",
                        f"Risk warnings: {risk_warning_count}",
                    ],
                    completedRuns=len(completed),
                    failedRuns=len(failed),
                    averageConfidence=avg_confidence,
                    evidenceCount=evidence_count,
                    reportCount=report_count,
                    riskWarnings=risk_warning_count,
                    decisionCount=len(decisions),
                    runtimeQualityScore=metrics["runtime_quality"],
                )
            )

        items.sort(key=lambda item: item.runtimeQualityScore, reverse=True)
        for index, item in enumerate(items, start=1):
            item.rank = index
        return items[offset : offset + limit]


def get_runtime_quality_leaderboard_store() -> RuntimeQualityLeaderboardStore:
    return RuntimeQualityLeaderboardStore()
