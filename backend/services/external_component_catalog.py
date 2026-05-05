from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class ExternalComponentDescriptor:
    component_id: str
    display_name: str
    source_type: str
    integration_mode: str
    status: str
    product_role: str
    viable_capabilities: tuple[str, ...]
    non_goals: tuple[str, ...]
    adapter_boundary: str
    license_policy: str
    runtime_requirements: tuple[str, ...] = ()
    risk_notes: tuple[str, ...] = ()
    next_steps: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ExternalComponentCatalog:
    version: int
    components: tuple[ExternalComponentDescriptor, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        by_mode: dict[str, int] = {}
        by_status: dict[str, int] = {}
        for component in self.components:
            by_mode[component.integration_mode] = by_mode.get(component.integration_mode, 0) + 1
            by_status[component.status] = by_status.get(component.status, 0) + 1
        return {
            "version": self.version,
            "components": [component.to_dict() for component in self.components],
            "total": len(self.components),
            "summary": {"byIntegrationMode": by_mode, "byStatus": by_status},
            "policies": self.policies,
        }


def get_external_component_catalog() -> ExternalComponentCatalog:
    """Return external OSS/provider component integration boundaries.

    The catalog is a planning/control-plane contract. It does not import or run
    external projects, and it must not be treated as permission to copy code.
    """

    return ExternalComponentCatalog(
        version=1,
        components=(
            ExternalComponentDescriptor(
                component_id="tradingagents_langgraph",
                display_name="TradingAgents LangGraph Runtime",
                source_type="sibling_open_source_project",
                integration_mode="in_process_runner_adapter_poc",
                status="opt_in_poc",
                product_role="Research runtime engine for single-asset multi-agent analysis experiments.",
                viable_capabilities=(
                    "LangGraph-style analyst/research/risk/portfolio flow",
                    "Bull/Bear debate structure",
                    "Final decision mapping into AlphaTrace AgentDecision",
                    "Runner-side checkpoint/memory as execution detail only",
                ),
                non_goals=(
                    "Do not replace AlphaTrace backend APIs",
                    "Do not expose TradingAgents internal state to frontend",
                    "Do not reuse TradingAgents as product persistence",
                    "Do not run real trading flows",
                ),
                adapter_boundary="backend/services/agent_runners/tradingagents_adapter.py",
                license_policy="Reference and adapter integration only; do not copy source code into AlphaTrace without license review and attribution plan.",
                runtime_requirements=(
                    "ALPHATRACE_TRADINGAGENTS_ENABLED=true",
                    "TRADINGAGENTS_REPO_PATH or installed package",
                    "Compatible LangGraph/checkpoint dependencies",
                    "Provider key such as DASHSCOPE_API_KEY when using Qwen/DashScope",
                ),
                risk_notes=(
                    "TradingAgents is stock/ticker-oriented and may not natively fit China ETF/fund/futures IDs.",
                    "Dependency graph is heavier than Qwen/AlphaTrace Native runner.",
                    "Streaming progress may require graph-level event mapping rather than final propagate output only.",
                ),
                next_steps=(
                    "Stabilize SPY PoC with valid model key.",
                    "Map LangGraph node events to AgentRuntimeEvent.",
                    "Keep AlphaTrace AgentRunStore as product persistence.",
                ),
            ),
            ExternalComponentDescriptor(
                component_id="langalpha_workbench",
                display_name="LangAlpha Agent Workbench",
                source_type="sibling_or_remote_open_source_project",
                integration_mode="external_service_adapter_design",
                status="design_only",
                product_role="Architecture reference and possible external research workbench service bridge.",
                viable_capabilities=(
                    "FastAPI product backend patterns",
                    "workspace/thread/task abstraction",
                    "SSE/event buffering patterns",
                    "MCP/tool layer and BYOK ideas",
                    "sandbox/artifact management patterns",
                ),
                non_goals=(
                    "Do not embed LangAlpha server into AlphaTrace process",
                    "Do not expose LangAlpha workspace/thread internals as frontend schema",
                    "Do not copy LangAlpha implementation code without license/compliance review",
                    "Do not introduce Redis/Postgres/sandbox dependencies into AlphaTrace MVP just for parity",
                ),
                adapter_boundary="backend/services/integration_adapters/langalpha_workbench_adapter.py",
                license_policy="Architecture reference first; external-service adapter only after explicit scope. No code copy in current phase.",
                runtime_requirements=(
                    "Future LANGALPHA_BASE_URL",
                    "Future LANGALPHA_API_KEY or service auth",
                    "Event/file mapping into AlphaTrace AgentRun/Artifact schemas",
                ),
                risk_notes=(
                    "LangAlpha is closer to a complete workbench backend than a lightweight runner library.",
                    "Direct embedding would duplicate AlphaTrace product backend responsibilities.",
                    "DB/Redis/workspace/sandbox dependencies require product architecture decision.",
                ),
                next_steps=(
                    "Keep as external adapter design until AlphaTrace worker/artifact contracts stabilize.",
                    "Reuse concepts, not code, for workspace and event-buffer design.",
                ),
            ),
            ExternalComponentDescriptor(
                component_id="bocha_web_search",
                display_name="Bocha Web Search",
                source_type="external_tool_provider",
                integration_mode="tool_adapter_evidence_retrieval",
                status="active_optional",
                product_role="Backend-only web search tool for AlphaTrace Evidence Retrieval.",
                viable_capabilities=(
                    "Web evidence retrieval",
                    "URL-backed EvidenceReference",
                    "Tool events for evidence search",
                ),
                non_goals=(
                    "Do not call from frontend",
                    "Do not treat as professional market data",
                    "Do not treat Bocha itself as a business data store",
                    "Do not let failures fail the whole run when static fallback exists",
                ),
                adapter_boundary="backend/integrations/bocha + backend/services/integration_adapters/bocha_adapter.py",
                license_policy="Provider API usage follows Bocha terms; no frontend key exposure.",
                runtime_requirements=("BOCHA_API_KEY or MySQL system config", "BOCHA_BASE_URL", "BOCHA_SEARCH_ENDPOINT"),
                risk_notes=("Evidence semantic support is not guaranteed by URL retrieval alone.",),
                next_steps=("Improve evidence preview/artifact handling.", "Persist mapped evidence/artifact records into ClickHouse after schemas stabilize.", "Add support scoring after structured claims stabilize."),
            ),
            ExternalComponentDescriptor(
                component_id="professional_market_data_provider",
                display_name="Future Professional Market Data Provider",
                source_type="external_data_provider",
                integration_mode="disabled_adapter_boundary",
                status="design_only",
                product_role="Future ETF/fund/index/futures quote, snapshot, kline, indicator, and fundamentals data source.",
                viable_capabilities=("quotes", "snapshots", "klines", "indicators", "fund reports", "macro/fundamental data"),
                non_goals=("Do not reuse legacy BTC/Hyperliquid streams", "Do not fake real-time market data"),
                adapter_boundary="backend/services/integration_adapters/market_data_adapter.py",
                license_policy="Provider-specific license and commercial terms required before live integration.",
                runtime_requirements=("ALPHATRACE_PRO_MARKET_DATA_ENABLED", "provider-specific API key"),
                risk_notes=("Data rights and redistribution terms matter for commercial productization.",),
                next_steps=("Choose provider", "Define normalized ETF/fund/index/futures schemas", "Add ClickHouse persistence and cache policy"),
            ),
        ),
        policies={
            "copy_policy": "Do not copy open-source project code into AlphaTrace without explicit license/compliance review.",
            "frontend_policy": "Frontend consumes AlphaTrace schemas, not external framework state.",
            "adapter_policy": "External projects integrate through adapters or external service bridges with explicit failure behavior.",
            "secrets_policy": "External provider keys remain backend-only and are never returned in diagnostics.",
            "persistence_policy": "External runtime checkpoints are not product persistence; AlphaTrace stores config/control data in MySQL and structured business analytics in ClickHouse.",
        },
    )


__all__ = ["ExternalComponentDescriptor", "ExternalComponentCatalog", "get_external_component_catalog"]
