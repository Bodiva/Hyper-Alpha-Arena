from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from services.agent_orchestrator.native_plan import build_alphatrace_native_plan


@dataclass(frozen=True)
class AgentFlowNode:
    node_id: str
    label: str
    team: str
    role: str
    depends_on: tuple[str, ...]
    status: str
    description: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AgentFlowDescriptor:
    runner_type: str
    flow_id: str
    display_name: str
    status: str
    nodes: tuple[AgentFlowNode, ...]
    notes: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "runnerType": self.runner_type,
            "flowId": self.flow_id,
            "displayName": self.display_name,
            "status": self.status,
            "nodes": [node.to_dict() for node in self.nodes],
            "notes": list(self.notes),
        }


class AgentFlowCatalog:
    """Runner flow descriptors for UI/diagnostics without exposing external state."""

    def get_flow(self, runner_type: str, task_type: str = "single_asset_analysis") -> AgentFlowDescriptor:
        normalized = (runner_type or "alphatrace_native").strip().lower()
        if normalized in {"qwen", "alphatrace_native"}:
            return self._native_like_flow(normalized, task_type)
        if normalized == "tradingagents":
            return self._tradingagents_flow()
        if normalized == "langalpha":
            return self._langalpha_flow()
        if normalized == "stub":
            return self._stub_flow()
        return AgentFlowDescriptor(
            runner_type=normalized,
            flow_id=f"{normalized}_unknown_flow",
            display_name=f"Unknown runner flow: {normalized}",
            status="unknown",
            nodes=(),
            notes=("No flow descriptor is registered for this runner type.",),
        )

    def list_flows(self) -> list[AgentFlowDescriptor]:
        return [self.get_flow(item) for item in ("stub", "qwen", "alphatrace_native", "tradingagents", "langalpha")]

    def _native_like_flow(self, runner_type: str, task_type: str) -> AgentFlowDescriptor:
        plan = build_alphatrace_native_plan(task_type=task_type)
        nodes = tuple(
            AgentFlowNode(
                node_id=step.step_id,
                label=step.display_name,
                team=step.team,
                role=step.agent_name,
                depends_on=tuple(step.depends_on),
                status="implemented",
                description=f"Tools: {', '.join(step.tool_ids) if step.tool_ids else 'none'}; outputs: {', '.join(step.expected_outputs) if step.expected_outputs else 'none'}",
            )
            for step in plan.steps
        )
        return AgentFlowDescriptor(
            runner_type=runner_type,
            flow_id=f"{runner_type}_{task_type}_flow",
            display_name="AlphaTrace Native Logical Agent Flow" if runner_type == "alphatrace_native" else "Qwen Multi-Step Agent Flow",
            status="implemented",
            nodes=nodes,
            notes=(
                "This is the AlphaTrace product DAG exposed through AgentRuntimeEvent and reports.",
                "Qwen currently implements this flow directly; alphatrace_native is the preferred product-facing name.",
            ),
        )

    @staticmethod
    def _tradingagents_flow() -> AgentFlowDescriptor:
        return AgentFlowDescriptor(
            runner_type="tradingagents",
            flow_id="tradingagents_poc_langgraph_flow",
            display_name="TradingAgents PoC LangGraph Flow",
            status="poc_opt_in",
            nodes=(
                AgentFlowNode("market_analyst", "Market Analyst", "Analyst Team", "market_analyst", (), "external_poc", "TradingAgents market analyst node when available."),
                AgentFlowNode("fundamentals_analyst", "Fundamentals Analyst", "Analyst Team", "fundamentals_analyst", (), "external_poc", "Optional TradingAgents fundamentals analyst."),
                AgentFlowNode("news_sentiment", "News / Sentiment Analyst", "Analyst Team", "news_sentiment", (), "external_poc", "Optional TradingAgents news/sentiment analysis."),
                AgentFlowNode("bull_researcher", "Bull Researcher", "Research Team", "bull_researcher", ("market_analyst",), "external_poc", "Bull debate participant."),
                AgentFlowNode("bear_researcher", "Bear Researcher", "Research Team", "bear_researcher", ("market_analyst",), "external_poc", "Bear debate participant."),
                AgentFlowNode("research_manager", "Research Manager", "Research Team", "research_manager", ("bull_researcher", "bear_researcher"), "external_poc", "Debate summarizer / research manager."),
                AgentFlowNode("risk_management", "Risk Management", "Risk Team", "risk_management", ("research_manager",), "external_poc", "Risk management team."),
                AgentFlowNode("portfolio_manager", "Portfolio Manager", "Portfolio Team", "portfolio_manager", ("risk_management",), "external_poc", "Final decision mapping into AlphaTrace AgentDecision."),
            ),
            notes=(
                "This describes expected TradingAgents flow, not raw internal state.",
                "AlphaTrace maps any available TradingAgents output into AgentRuntimeEvent/AgentReport/AgentDecision.",
            ),
        )

    @staticmethod
    def _langalpha_flow() -> AgentFlowDescriptor:
        return AgentFlowDescriptor(
            runner_type="langalpha",
            flow_id="langalpha_external_service_flow",
            display_name="LangAlpha External Workbench Flow",
            status="design_only",
            nodes=(
                AgentFlowNode("workspace", "Workspace", "External Service", "workspace", (), "design_only", "Create or reuse external workspace."),
                AgentFlowNode("thread", "Thread / Task", "External Service", "thread_task", ("workspace",), "design_only", "Submit research task to external workbench."),
                AgentFlowNode("tools", "Tools / MCP", "External Service", "tool_layer", ("thread",), "design_only", "External tool/MCP execution, mapped back to AlphaTrace events."),
                AgentFlowNode("artifacts", "Artifacts", "External Service", "artifact_mapper", ("tools",), "design_only", "Files/tables/charts mapped into AgentArtifact."),
                AgentFlowNode("decision", "Decision Mapping", "AlphaTrace", "decision_mapper", ("artifacts",), "design_only", "Map external results into AlphaTrace AgentDecision."),
            ),
            notes=("LangAlpha is not imported or executed in this phase.",),
        )

    @staticmethod
    def _stub_flow() -> AgentFlowDescriptor:
        return AgentFlowDescriptor(
            runner_type="stub",
            flow_id="stub_contract_flow",
            display_name="Stub Contract Flow",
            status="implemented",
            nodes=(AgentFlowNode("stub", "Stub Runtime", "Smoke Test", "stub", (), "implemented", "Deterministic contract validation."),),
            notes=("No model or external data source is called.",),
        )


def get_agent_flow_catalog() -> AgentFlowCatalog:
    return AgentFlowCatalog()


__all__ = ["AgentFlowCatalog", "AgentFlowDescriptor", "AgentFlowNode", "get_agent_flow_catalog"]
