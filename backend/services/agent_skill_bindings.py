from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class AgentRoleSkillBinding:
    role_id: str
    display_name: str
    team: str
    status: str
    depends_on: tuple[str, ...]
    default_skills: tuple[str, ...]
    optional_skills: tuple[str, ...]
    tool_ids: tuple[str, ...]
    output_contracts: tuple[str, ...]
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AgentSkillBindingCatalog:
    version: int
    bindings: tuple[AgentRoleSkillBinding, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        by_team: dict[str, int] = {}
        skill_usage: dict[str, int] = {}
        tool_usage: dict[str, int] = {}
        for binding in self.bindings:
            by_team[binding.team] = by_team.get(binding.team, 0) + 1
            for skill_id in binding.default_skills + binding.optional_skills:
                skill_usage[skill_id] = skill_usage.get(skill_id, 0) + 1
            for tool_id in binding.tool_ids:
                tool_usage[tool_id] = tool_usage.get(tool_id, 0) + 1
        return {
            "version": self.version,
            "bindings": [binding.to_dict() for binding in self.bindings],
            "total": len(self.bindings),
            "summary": {
                "byTeam": by_team,
                "skillUsage": skill_usage,
                "toolUsage": tool_usage,
            },
            "policies": self.policies,
        }


def get_agent_skill_binding_catalog() -> AgentSkillBindingCatalog:
    """Return the planned agent-role to skill/tool binding matrix.

    This is a product control-plane contract. It intentionally does not execute
    a runner and does not import TradingAgents or LangAlpha.
    """

    return AgentSkillBindingCatalog(
        version=1,
        bindings=(
            AgentRoleSkillBinding(
                role_id="evidence_retriever",
                display_name="Evidence Retriever",
                team="data_center",
                status="active",
                depends_on=(),
                default_skills=("evidence_retrieval_skill",),
                optional_skills=("external_workbench_skill",),
                tool_ids=("prepared_data.query", "evidence.retrieve", "bocha.search"),
                output_contracts=("EvidenceReference", "AgentArtifact", "AgentRuntimeEvent"),
                notes="Retrieves static/run-scoped evidence and optional Bocha web evidence through backend-only tools.",
            ),
            AgentRoleSkillBinding(
                role_id="market_analyst",
                display_name="Market Analyst",
                team="analyst_team",
                status="active",
                depends_on=("evidence_retriever",),
                default_skills=("market_context_skill", "evidence_retrieval_skill"),
                optional_skills=("external_workbench_skill",),
                tool_ids=("prepared_data.query", "market.context.load", "evidence.retrieve", "bocha.search", "qwen.market_view"),
                output_contracts=("AgentReport", "AgentRuntimeEvent", "market_context"),
                notes="Builds market context from AlphaTrace Data Center inputs before debate agents run.",
            ),
            AgentRoleSkillBinding(
                role_id="bull_researcher",
                display_name="Bull Researcher",
                team="research_team",
                status="active",
                depends_on=("market_analyst",),
                default_skills=("bull_bear_debate_skill", "evidence_retrieval_skill"),
                optional_skills=("external_workbench_skill",),
                tool_ids=("qwen.bull_view", "evidence.retrieve"),
                output_contracts=("AgentReport", "debate.message", "AgentRuntimeEvent"),
                notes="Produces constructive thesis and supporting arguments. Can run logically in parallel with Bear Researcher.",
            ),
            AgentRoleSkillBinding(
                role_id="bear_researcher",
                display_name="Bear Researcher",
                team="research_team",
                status="active",
                depends_on=("market_analyst",),
                default_skills=("bull_bear_debate_skill", "evidence_retrieval_skill"),
                optional_skills=("external_workbench_skill",),
                tool_ids=("qwen.bear_view", "evidence.retrieve"),
                output_contracts=("AgentReport", "debate.message", "AgentRuntimeEvent"),
                notes="Produces downside thesis, invalidation conditions, and challenge arguments.",
            ),
            AgentRoleSkillBinding(
                role_id="research_manager",
                display_name="Research Manager",
                team="research_team",
                status="active",
                depends_on=("bull_researcher", "bear_researcher"),
                default_skills=("bull_bear_debate_skill", "final_decision_skill"),
                optional_skills=(),
                tool_ids=("qwen.research_manager",),
                output_contracts=("AgentReport", "AgentRuntimeEvent"),
                notes="Synthesizes Bull/Bear disagreement before risk review.",
            ),
            AgentRoleSkillBinding(
                role_id="risk_analyst",
                display_name="Risk Analyst",
                team="risk_team",
                status="active",
                depends_on=("research_manager",),
                default_skills=("risk_review_skill", "evidence_retrieval_skill"),
                optional_skills=("market_context_skill",),
                tool_ids=("qwen.risk_review", "market.context.load"),
                output_contracts=("AgentReport", "risk.warning", "AgentRuntimeEvent"),
                notes="Performs conservative/neutral/aggressive risk perspective analysis.",
            ),
            AgentRoleSkillBinding(
                role_id="portfolio_manager",
                display_name="Portfolio Manager",
                team="portfolio_team",
                status="active",
                depends_on=("risk_analyst",),
                default_skills=("final_decision_skill", "risk_review_skill"),
                optional_skills=("evidence_retrieval_skill",),
                tool_ids=("qwen.final_decision",),
                output_contracts=("AgentDecision", "AgentReport", "AgentRuntimeEvent"),
                notes="Normalizes final action, confidence, thesis, risks, watch indicators, and evidence IDs.",
            ),
        ),
        policies={
            "binding_scope": "Bindings define product-level defaults. Per-run overrides must be validated before execution.",
            "runner_boundary": "Qwen, AlphaTrace Native, TradingAgents, and LangAlpha adapters must map their internal nodes back to these role/skill contracts when possible.",
            "tool_boundary": "Agent roles bind to tool IDs, not provider implementations. Bocha remains one implementation behind bocha.search.",
            "storage_boundary": "Role outputs become AgentRuntimeEvent/AgentReport/EvidenceReference/AgentDecision before ClickHouse projection.",
        },
    )


__all__ = ["AgentRoleSkillBinding", "AgentSkillBindingCatalog", "get_agent_skill_binding_catalog"]
