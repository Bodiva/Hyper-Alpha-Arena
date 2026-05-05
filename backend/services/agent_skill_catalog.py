from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class AgentSkillDescriptor:
    skill_id: str
    display_name: str
    skill_type: str
    status: str
    allowed_agents: tuple[str, ...]
    tool_ids: tuple[str, ...]
    data_domains: tuple[str, ...]
    model_requirements: tuple[str, ...]
    output_contracts: tuple[str, ...]
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AgentSkillCatalog:
    version: int
    skills: tuple[AgentSkillDescriptor, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        by_type: dict[str, int] = {}
        for skill in self.skills:
            by_type[skill.skill_type] = by_type.get(skill.skill_type, 0) + 1
        return {
            "version": self.version,
            "skills": [skill.to_dict() for skill in self.skills],
            "total": len(self.skills),
            "summary": {"byType": by_type},
            "policies": self.policies,
        }


def get_agent_skill_catalog() -> AgentSkillCatalog:
    """Return configurable skill descriptors for logical agents.

    Skills are product-level capabilities that can bind tools, data domains and
    model requirements to agent roles. This is the control-plane contract before
    implementing per-agent runtime configuration.
    """

    return AgentSkillCatalog(
        version=1,
        skills=(
            AgentSkillDescriptor(
                skill_id="market_context_skill",
                display_name="Market Context Skill",
                skill_type="data_context",
                status="active",
                allowed_agents=("Market Analyst", "Risk Analyst", "Portfolio Manager"),
                tool_ids=("market.context.load",),
                data_domains=("quote", "snapshot", "indicator", "market_data"),
                model_requirements=("none_for_load", "qwen_optional_for_summary"),
                output_contracts=("market_context", "AgentRuntimeEvent", "AgentReport"),
                notes="Loads normalized market context; future professional data must enter through Data Center connectors.",
            ),
            AgentSkillDescriptor(
                skill_id="evidence_retrieval_skill",
                display_name="Evidence Retrieval Skill",
                skill_type="tool_augmented_retrieval",
                status="active",
                allowed_agents=("Market Analyst", "Bull Researcher", "Bear Researcher", "Risk Analyst", "Portfolio Manager"),
                tool_ids=("evidence.retrieve", "bocha.search"),
                data_domains=("evidence", "external_web", "research_report", "news"),
                model_requirements=("none_for_search", "qwen_optional_for_synthesis"),
                output_contracts=("EvidenceReference", "AgentArtifact", "AgentRuntimeEvent"),
                notes="Bocha is one optional tool inside this skill, not the data center itself.",
            ),
            AgentSkillDescriptor(
                skill_id="bull_bear_debate_skill",
                display_name="Bull / Bear Debate Skill",
                skill_type="multi_agent_reasoning",
                status="active",
                allowed_agents=("Bull Researcher", "Bear Researcher", "Research Manager"),
                tool_ids=("qwen.bull_view", "qwen.bear_view", "qwen.research_manager"),
                data_domains=("evidence", "market_data", "portfolio_context"),
                model_requirements=("qwen_or_future_model_provider",),
                output_contracts=("AgentReport", "debate.message", "AgentRuntimeEvent"),
                notes="Core AlphaTrace multi-agent collaboration capability; future TradingAgents node mapping should preserve this contract.",
            ),
            AgentSkillDescriptor(
                skill_id="risk_review_skill",
                display_name="Risk Review Skill",
                skill_type="risk_analysis",
                status="active",
                allowed_agents=("Risk Analyst", "Portfolio Manager"),
                tool_ids=("qwen.risk_review",),
                data_domains=("portfolio", "market_data", "evidence", "decision"),
                model_requirements=("qwen_or_future_model_provider",),
                output_contracts=("AgentReport", "risk.warning", "AgentDecision"),
                notes="Separates risk checks from final portfolio decision.",
            ),
            AgentSkillDescriptor(
                skill_id="final_decision_skill",
                display_name="Final Decision Skill",
                skill_type="decision_synthesis",
                status="active",
                allowed_agents=("Portfolio Manager",),
                tool_ids=("qwen.final_decision",),
                data_domains=("report", "evidence", "risk", "portfolio"),
                model_requirements=("qwen_or_future_model_provider", "structured_json_output_preferred"),
                output_contracts=("AgentDecision", "AgentReport", "AgentRuntimeEvent"),
                notes="Normalizes action/confidence/thesis/risks/watch indicators/evidenceIds.",
            ),
            AgentSkillDescriptor(
                skill_id="external_workbench_skill",
                display_name="External Workbench Skill",
                skill_type="external_runtime_bridge",
                status="design_only",
                allowed_agents=("External Workbench Adapter",),
                tool_ids=("future.langalpha.submit_task", "future.langalpha.fetch_artifacts"),
                data_domains=("workspace", "artifact", "file", "tool_event"),
                model_requirements=("external_service_byok_future",),
                output_contracts=("AgentRuntimeEvent", "AgentArtifact", "AgentReport", "AgentDecision"),
                notes="Future LangAlpha-style service bridge; not an in-process backend replacement.",
            ),
        ),
        policies={
            "agent_binding": "Agent roles may bind one or more skills; skills bind tools, data domains, and output contracts.",
            "tool_policy": "Tools are invoked behind backend adapters and their outputs must map into AlphaTrace schemas.",
            "model_policy": "Model requirements are resolved server-side through runtime config/model provider catalog.",
            "persistence_policy": "Skill outputs become product data only after AgentRuntimeEvent/Report/Evidence/Artifact/Decision mapping and ClickHouse projection when implemented.",
        },
    )


__all__ = ["AgentSkillDescriptor", "AgentSkillCatalog", "get_agent_skill_catalog"]
