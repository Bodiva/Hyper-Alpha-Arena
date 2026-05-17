from __future__ import annotations

from typing import List, Optional

from schemas.alpha_trace_agent_runtime import AgentRun, EvidenceReference
from schemas.alpha_trace_decision import (
    AlphaTraceDecisionItem,
    DecisionAttribution,
    DecisionAttributionFactor,
    DecisionExpectedOutcome,
)
from services.agent_runtime_store.registry import get_agent_run_store
from services.evidence_retrieval.static_evidence_seed import is_static_seed_evidence_id, static_evidence_seed_enabled


def _normalize_token(value: str | None) -> str:
    return (value or "").replace("-", "_").upper()


def _visible_evidence_ids(evidence_ids: List[str]) -> List[str]:
    if static_evidence_seed_enabled():
        return evidence_ids
    return [evidence_id for evidence_id in evidence_ids if not is_static_seed_evidence_id(evidence_id)]


class AgentRunDecisionStore:
    """Decision Store derived from persisted AlphaTrace Agent Runs."""

    def __init__(self) -> None:
        self._store = get_agent_run_store()

    def list_decisions(
        self,
        asset_id: Optional[str] = None,
        portfolio_id: Optional[str] = None,
        run_id: Optional[str] = None,
        action: Optional[str] = None,
        horizon: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AlphaTraceDecisionItem]:
        page_loader = getattr(self._store, "list_runs_with_decisions_page", None)
        if callable(page_loader):
            runs, _ = page_loader(
                asset_id=asset_id,
                portfolio_id=portfolio_id,
                run_id=run_id,
                action=action,
                horizon=horizon,
                limit=limit,
                offset=offset,
            )
            return [self._map_run_to_decision(run) for run in runs if run.finalDecision]

        decisions: List[AlphaTraceDecisionItem] = []
        for run in self._store.list_runs():
            if run_id and run.runId != run_id:
                continue
            if asset_id and asset_id not in run.assetIds:
                continue
            if portfolio_id and run.portfolioId != portfolio_id:
                continue
            if not run.finalDecision:
                continue
            item = self._map_run_to_decision(run)
            if action and item.action != _normalize_token(action):
                continue
            if horizon and item.horizon != _normalize_token(horizon):
                continue
            decisions.append(item)

        decisions.sort(key=lambda item: item.createdAt, reverse=True)
        return decisions[offset : offset + limit]

    def count_decisions(
        self,
        asset_id: Optional[str] = None,
        portfolio_id: Optional[str] = None,
        run_id: Optional[str] = None,
        action: Optional[str] = None,
        horizon: Optional[str] = None,
    ) -> int:
        page_loader = getattr(self._store, "list_runs_with_decisions_page", None)
        if callable(page_loader):
            _, total = page_loader(
                asset_id=asset_id,
                portfolio_id=portfolio_id,
                run_id=run_id,
                action=action,
                horizon=horizon,
                limit=1,
                offset=0,
            )
            return total

        return len(
            self.list_decisions(
                asset_id=asset_id,
                portfolio_id=portfolio_id,
                run_id=run_id,
                action=action,
                horizon=horizon,
                limit=100_000,
                offset=0,
            )
        )

    def get_decision(self, decision_id: str) -> Optional[AlphaTraceDecisionItem]:
        run_id = self._run_id_from_decision_id(decision_id)
        run = self._store.get_run(run_id)
        if run and run.finalDecision:
            return self._map_run_to_decision(run)
        return None

    def get_decision_evidence(self, decision_id: str, limit: int = 100) -> List[EvidenceReference]:
        run_id = self._run_id_from_decision_id(decision_id)
        decision = self.get_decision(decision_id)
        if not decision:
            return []
        allowed = set(_visible_evidence_ids(decision.evidenceIds))
        items = [item for item in self._store.get_evidence(run_id) if item.evidenceId in allowed]
        return items[:limit]

    def get_decision_agent_run(self, decision_id: str) -> Optional[AgentRun]:
        return self._store.get_run(self._run_id_from_decision_id(decision_id))

    @staticmethod
    def _decision_id_for_run(run_id: str) -> str:
        return f"decision_{run_id}"

    @staticmethod
    def _run_id_from_decision_id(decision_id: str) -> str:
        return decision_id.removeprefix("decision_")

    def _map_run_to_decision(self, run: AgentRun) -> AlphaTraceDecisionItem:
        decision = run.finalDecision
        action = _normalize_token(decision.action)
        if action == "AVOID":
            action = "NO_ACTION"
        horizon = _normalize_token(decision.horizon)
        created_at = run.completedAt or run.updatedAt or run.startedAt
        risks = decision.risks or ["No explicit risk summary was generated."]
        visible_evidence_ids = _visible_evidence_ids(decision.evidenceIds)
        evidence_count = len(visible_evidence_ids)
        report_count = len(run.reports)
        risk_event_count = len([event for event in run.events if event.type == "risk.warning"])

        attribution = DecisionAttribution(
            summary=(
                f"Derived from AgentRun {run.runId}. "
                f"The decision used {evidence_count} evidence reference(s), {report_count} report(s), "
                f"and {risk_event_count} risk warning event(s)."
            ),
            factors=[
                DecisionAttributionFactor(
                    factor="Evidence support",
                    contribution=min(1.0, evidence_count / 5),
                    explanation=f"{evidence_count} evidence reference(s) linked to the final decision.",
                ),
                DecisionAttributionFactor(
                    factor="Agent reports",
                    contribution=min(1.0, report_count / 4),
                    explanation=f"{report_count} generated report(s) are available for review.",
                ),
                DecisionAttributionFactor(
                    factor="Risk review",
                    contribution=-0.2 if risk_event_count else 0,
                    explanation=(
                        f"{risk_event_count} risk warning event(s) were emitted."
                        if risk_event_count
                        else "No explicit risk warning event was emitted."
                    ),
                ),
            ],
            riskReview={
                "correctlyIdentified": risks[:5],
                "underestimated": [],
            },
            agentContributions=[
                {"team": "analyst_team", "score": 0.8, "adoptedInsight": "Market and evidence context"},
                {"team": "research_team", "score": 0.8, "adoptedInsight": "Bull / Bear research perspectives"},
                {"team": "risk_team", "score": 0.75, "adoptedInsight": "Risk warnings and constraints"},
                {"team": "portfolio_team", "score": 0.85, "adoptedInsight": "Final decision synthesis"},
            ],
            learningPoints=[
                "Validate decision outcome after the review date.",
                "Compare evidence quality against later realized risk and return.",
            ],
        )

        return AlphaTraceDecisionItem(
            decisionId=self._decision_id_for_run(run.runId),
            runId=run.runId,
            assetIds=run.assetIds,
            portfolioId=run.portfolioId,
            action=action,
            horizon=horizon,
            confidence=decision.confidence,
            thesis=decision.thesis,
            risks=risks,
            evidenceIds=visible_evidence_ids,
            expectedOutcome=DecisionExpectedOutcome(
                targetReturn=0,
                expectedMaxDrawdown=0,
                reviewDate=created_at,
                note="Expected outcome is not backtested in MVP; this is an Agent Runtime decision trace.",
            ),
            actualOutcome=None,
            attribution=attribution,
            createdAt=created_at,
        )


def get_agent_run_decision_store() -> AgentRunDecisionStore:
    return AgentRunDecisionStore()
