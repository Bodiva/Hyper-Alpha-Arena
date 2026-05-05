from __future__ import annotations

from typing import Any, Mapping

from services.agent_orchestrator.base import OrchestrationPlan, OrchestrationStep


ALPHATRACE_NATIVE_PLAN_ID = "alphatrace_native_research_v1"


def build_alphatrace_native_plan(task_type: str = "single_asset_analysis", context: Mapping[str, Any] | None = None) -> OrchestrationPlan:
    """Build the product-level AlphaTrace Native logical DAG.

    This does not execute the run. It gives frontend diagnostics, validators,
    and future schedulers a stable DAG vocabulary independent of QwenRunner
    implementation details.
    """

    context = context or {}
    is_portfolio = task_type in {"portfolio_diagnosis", "portfolio_diagnostic"}
    steps = (
        OrchestrationStep(
            step_id="evidence_retrieval",
            display_name="Evidence Retrieval",
            agent_name="Evidence Retriever",
            team="analyst_team",
            tool_ids=("market.context.load", "portfolio.context.load", "evidence.retrieve", "bocha.search") if is_portfolio else ("market.context.load", "evidence.retrieve", "bocha.search"),
            expected_outputs=("evidence_references", "market_context", "portfolio_context") if is_portfolio else ("evidence_references", "market_context"),
            metadata={"parallelizable": False},
        ),
        OrchestrationStep(
            step_id="market_view",
            display_name="Market View" if not is_portfolio else "Portfolio Overview",
            agent_name="Market Analyst",
            team="analyst_team",
            depends_on=("evidence_retrieval",),
            tool_ids=("qwen.market_view",),
            model_task="market_view",
            expected_outputs=("market_view_report",),
            metadata={"parallelizable": False},
        ),
        OrchestrationStep(
            step_id="bull_view",
            display_name="Bull View",
            agent_name="Bull Researcher",
            team="research_team",
            depends_on=("market_view",),
            tool_ids=("qwen.bull_view",),
            model_task="bull_view",
            expected_outputs=("bull_view_report",),
            metadata={"parallelizable": True, "parallelGroup": "bull_bear_review"},
        ),
        OrchestrationStep(
            step_id="bear_view",
            display_name="Bear View",
            agent_name="Bear Researcher",
            team="research_team",
            depends_on=("market_view",),
            tool_ids=("qwen.bear_view",),
            model_task="bear_view",
            expected_outputs=("bear_view_report",),
            metadata={"parallelizable": True, "parallelGroup": "bull_bear_review"},
        ),
        OrchestrationStep(
            step_id="research_manager",
            display_name="Research Manager Summary",
            agent_name="Research Manager",
            team="research_team",
            depends_on=("bull_view", "bear_view"),
            tool_ids=("qwen.research_manager",),
            model_task="research_manager",
            expected_outputs=("research_manager_summary",),
            metadata={"parallelizable": False},
        ),
        OrchestrationStep(
            step_id="risk_review",
            display_name="Risk Review" if not is_portfolio else "Risk Review / Rebalance Suggestions",
            agent_name="Risk Analyst",
            team="risk_team",
            depends_on=("research_manager",),
            tool_ids=("qwen.risk_review",),
            model_task="risk_review",
            expected_outputs=("risk_review_report", "risk_perspectives"),
            metadata={"riskPerspectives": ("conservative", "neutral", "aggressive")},
        ),
        OrchestrationStep(
            step_id="final_decision",
            display_name="Final Decision" if not is_portfolio else "Final Diagnosis",
            agent_name="Portfolio Manager",
            team="portfolio_team",
            depends_on=("risk_review",),
            tool_ids=("qwen.final_decision",),
            model_task="final_decision",
            expected_outputs=("agent_decision",),
            metadata={"terminal": True},
        ),
    )
    return OrchestrationPlan(
        plan_id=ALPHATRACE_NATIVE_PLAN_ID,
        runner_type="alphatrace_native",
        task_type=task_type,
        steps=steps,
        metadata={"contextKeys": tuple(sorted(context.keys()))},
    )


__all__ = ["ALPHATRACE_NATIVE_PLAN_ID", "build_alphatrace_native_plan"]
