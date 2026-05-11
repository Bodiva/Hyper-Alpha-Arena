from __future__ import annotations

from typing import Literal, Optional


ResearchRunType = Literal[
    "market_scan",
    "asset_research",
    "etf_screening",
    "fund_screening",
    "strategy_generation",
    "portfolio_analysis",
    "risk_review",
    "trade_plan_generation",
    "post_trade_review",
]

ResearchArtifactType = Literal[
    "market_brief",
    "asset_research_report",
    "etf_comparison_table",
    "fund_comparison_table",
    "strategy_card",
    "portfolio_exposure_report",
    "risk_review_report",
    "trade_plan",
    "post_trade_review",
    "evidence_bundle",
]

RuntimeAgentRole = Literal[
    "market_analyst",
    "asset_screener",
    "bull_researcher",
    "bear_researcher",
    "quant_analyst",
    "liquidity_analyst",
    "portfolio_analyst",
    "risk_manager",
    "strategy_composer",
    "review_agent",
]

RESEARCH_RUN_TYPES: tuple[ResearchRunType, ...] = (
    "market_scan",
    "asset_research",
    "etf_screening",
    "fund_screening",
    "strategy_generation",
    "portfolio_analysis",
    "risk_review",
    "trade_plan_generation",
    "post_trade_review",
)

RESEARCH_ARTIFACT_TYPES: tuple[ResearchArtifactType, ...] = (
    "market_brief",
    "asset_research_report",
    "etf_comparison_table",
    "fund_comparison_table",
    "strategy_card",
    "portfolio_exposure_report",
    "risk_review_report",
    "trade_plan",
    "post_trade_review",
    "evidence_bundle",
)

RUNTIME_AGENT_ROLES: tuple[RuntimeAgentRole, ...] = (
    "market_analyst",
    "asset_screener",
    "bull_researcher",
    "bear_researcher",
    "quant_analyst",
    "liquidity_analyst",
    "portfolio_analyst",
    "risk_manager",
    "strategy_composer",
    "review_agent",
)

LEGACY_TASK_TYPE_TO_RESEARCH_RUN_TYPE: dict[str, ResearchRunType] = {
    "single_asset_analysis": "asset_research",
    "multi_asset_comparison": "asset_research",
    "portfolio_diagnostic": "portfolio_analysis",
    "portfolio_diagnosis": "portfolio_analysis",
    "event_impact_analysis": "market_scan",
    "rebalance_suggestion": "portfolio_analysis",
}

REPORT_SLUG_TO_RESEARCH_ARTIFACT_TYPE: dict[str, ResearchArtifactType] = {
    "market": "market_brief",
    "market_view": "market_brief",
    "portfolio_overview": "portfolio_exposure_report",
    "bull": "asset_research_report",
    "bull_view": "asset_research_report",
    "bear": "risk_review_report",
    "bear_view": "risk_review_report",
    "research_manager": "asset_research_report",
    "risk": "risk_review_report",
    "risk_review": "risk_review_report",
    "risk_rebalance": "risk_review_report",
}


def resolve_research_run_type(task_type: str, explicit: Optional[ResearchRunType] = None) -> ResearchRunType:
    if explicit:
        return explicit
    return LEGACY_TASK_TYPE_TO_RESEARCH_RUN_TYPE.get(task_type, "asset_research")


def resolve_research_artifact_type(
    *,
    report_slug: Optional[str] = None,
    title: str = "",
    research_run_type: Optional[ResearchRunType] = None,
) -> ResearchArtifactType:
    slug = (report_slug or "").strip().lower()
    if slug in REPORT_SLUG_TO_RESEARCH_ARTIFACT_TYPE:
        return REPORT_SLUG_TO_RESEARCH_ARTIFACT_TYPE[slug]

    normalized_title = title.strip().lower()
    if "组合" in title or "portfolio" in normalized_title:
        return "portfolio_exposure_report"
    if "风险" in title or "risk" in normalized_title or "反方" in title:
        return "risk_review_report"
    if "策略" in title or research_run_type == "strategy_generation":
        return "strategy_card"
    if "基金" in title or research_run_type == "fund_screening":
        return "fund_comparison_table"
    if "etf" in normalized_title or research_run_type == "etf_screening":
        return "etf_comparison_table"
    if "市场" in title or "market" in normalized_title:
        return "market_brief"
    return "asset_research_report"


__all__ = [
    "ResearchRunType",
    "ResearchArtifactType",
    "RuntimeAgentRole",
    "RESEARCH_RUN_TYPES",
    "RESEARCH_ARTIFACT_TYPES",
    "RUNTIME_AGENT_ROLES",
    "LEGACY_TASK_TYPE_TO_RESEARCH_RUN_TYPE",
    "REPORT_SLUG_TO_RESEARCH_ARTIFACT_TYPE",
    "resolve_research_run_type",
    "resolve_research_artifact_type",
]
