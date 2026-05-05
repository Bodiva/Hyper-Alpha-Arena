from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from services.external_component_catalog import get_external_component_catalog


@dataclass(frozen=True)
class IntegrationDecision:
    component_id: str
    recommended_path: str
    current_gate: str
    proceed_when: tuple[str, ...]
    stop_if: tuple[str, ...]
    alpha_trace_contracts: tuple[str, ...]
    validation_required: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class IntegrationDecisionGuide:
    version: int
    decisions: tuple[IntegrationDecision, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "decisions": [decision.to_dict() for decision in self.decisions],
            "total": len(self.decisions),
            "policies": self.policies,
        }


def get_integration_decision_guide() -> IntegrationDecisionGuide:
    component_ids = {item.component_id for item in get_external_component_catalog().components}

    decisions: list[IntegrationDecision] = []
    if "tradingagents_langgraph" in component_ids:
        decisions.append(
            IntegrationDecision(
                component_id="tradingagents_langgraph",
                recommended_path="Keep as opt-in AgentRunnerAdapter; deepen node-event mapping only after SPY PoC is repeatable.",
                current_gate="requires_local_dependency_and_model_key_readiness",
                proceed_when=(
                    "TradingAgentsGraph import passes in the target runtime environment",
                    "A valid model key is available through backend runtime config or environment",
                    "SPY single_asset_analysis produces completed or product-mapped failed AgentRun repeatedly",
                    "LangGraph node events can be mapped without exposing internal state",
                ),
                stop_if=(
                    "Import failure breaks FastAPI startup",
                    "Adapter requires modifying TradingAgents source",
                    "Runner output cannot be mapped to AgentReport/AgentDecision",
                    "Costs/latency exceed AlphaTrace Native runner without clear value",
                ),
                alpha_trace_contracts=(
                    "SubmitAgentRunRequest",
                    "AgentRuntimeEvent",
                    "AgentReport",
                    "EvidenceReference",
                    "AgentDecision",
                    "AgentArtifact",
                ),
                validation_required=(
                    "runnerType=tradingagents disabled smoke",
                    "import failure smoke",
                    "enabled SPY PoC smoke",
                    "qwen/stub/native regression",
                ),
            )
        )

    if "langalpha_workbench" in component_ids:
        decisions.append(
            IntegrationDecision(
                component_id="langalpha_workbench",
                recommended_path="Use as architecture reference first; later integrate as external research service bridge, not in-process backend.",
                current_gate="design_only_until_worker_and_artifact_contracts_stabilize",
                proceed_when=(
                    "AlphaTrace worker/task/artifact contracts are stable",
                    "LangAlpha service can run independently with explicit auth and endpoint contract",
                    "Workspace/thread/task events can be mapped to AlphaTrace AgentRun events",
                    "File/artifact outputs can be normalized into AgentArtifact",
                ),
                stop_if=(
                    "Integration requires embedding LangAlpha server internals into AlphaTrace",
                    "LangAlpha DB/Redis/sandbox dependencies become implicit AlphaTrace runtime dependencies",
                    "Frontend needs to understand LangAlpha internal workspace/thread state",
                ),
                alpha_trace_contracts=(
                    "AgentRun",
                    "AgentRuntimeEvent",
                    "AgentArtifact",
                    "ExternalWorkbenchAdapter diagnostics",
                ),
                validation_required=(
                    "disabled adapter smoke",
                    "external endpoint health smoke when configured",
                    "event/artifact mapping smoke with fixture payload",
                ),
            )
        )

    if "bocha_web_search" in component_ids:
        decisions.append(
            IntegrationDecision(
                component_id="bocha_web_search",
                recommended_path="Keep as backend-only evidence retrieval tool with static fallback and URL-backed artifacts.",
                current_gate="active_optional_provider",
                proceed_when=(
                    "BOCHA key is configured in backend runtime config",
                    "Search failures fallback to static evidence without failing runs",
                    "Returned URL/title/summary/source are mapped into EvidenceReference/AgentArtifact and visible in evidence detail/artifacts",
                ),
                stop_if=(
                    "API key would need frontend exposure",
                    "Bocha result is treated as professional market data",
                    "Bocha is treated as a durable business data store instead of a tool provider",
                    "Evidence claims cannot cite a persisted evidenceId",
                ),
                alpha_trace_contracts=("EvidenceReference", "AgentRuntimeEvent", "AgentArtifact", "ToolInvocationResult", "ClickHouseEvidenceProjection"),
                validation_required=("bocha disabled smoke", "bocha configured smoke", "evidence URL/artifact smoke"),
            )
        )

    if "professional_market_data_provider" in component_ids:
        decisions.append(
            IntegrationDecision(
                component_id="professional_market_data_provider",
                recommended_path="Select provider and implement a normalized AlphaTrace market data adapter; do not reuse legacy BTC streams.",
                current_gate="provider_selection_required",
                proceed_when=(
                    "Commercial data rights and redistribution terms are understood",
                    "Normalized quote/snapshot/kline/indicator/fundamental schemas are approved",
                    "ClickHouse persistence/cache strategy is defined",
                ),
                stop_if=(
                    "Provider terms prohibit product use or citation",
                    "Implementation couples AlphaTrace ETF/fund/index data to legacy crypto services",
                    "No fallback/static seed path exists for demos",
                ),
                alpha_trace_contracts=("MarketQuote", "MarketSnapshot", "Kline", "Indicator", "DataSource", "EvidenceReference", "ClickHouseMarketDataProjection"),
                validation_required=("provider disabled smoke", "static fallback smoke", "schema fixture smoke"),
            )
        )

    return IntegrationDecisionGuide(
        version=1,
        decisions=tuple(decisions),
        policies={
            "default_path": "Prefer adapter or external service bridge over embedding third-party backend internals.",
            "schema_policy": "All outputs must normalize into AlphaTrace-owned product schemas before ClickHouse business persistence.",
            "validation_policy": "No component can move beyond PoC without disabled/failure/success smoke tests and Qwen/Stub/Native regression.",
        },
    )


__all__ = ["IntegrationDecision", "IntegrationDecisionGuide", "get_integration_decision_guide"]
