from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class AdapterCompositionItem:
    runner_type: str
    role: str
    execution_mode: str
    status: str
    orchestration: str
    model_provider: str
    data_providers: tuple[str, ...]
    tool_layer: tuple[str, ...]
    persistence: str
    streaming: str
    artifacts: str
    recommended_use: str
    limitations: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AdapterCompositionMatrix:
    """Product-facing runner/component composition map."""

    matrix_id = "alphatrace_adapter_composition_matrix"

    def list_items(self) -> list[AdapterCompositionItem]:
        return [
            AdapterCompositionItem(
                runner_type="stub",
                role="smoke_test_runner",
                execution_mode="in_process",
                status="implemented",
                orchestration="deterministic_stub_flow",
                model_provider="none",
                data_providers=("static_demo_payload",),
                tool_layer=("none",),
                persistence="AgentRunStore",
                streaming="synthetic_events_only",
                artifacts="none",
                recommended_use="Regression and contract smoke tests.",
                limitations=("No real model", "No real evidence retrieval"),
            ),
            AdapterCompositionItem(
                runner_type="qwen",
                role="direct_model_runner",
                execution_mode="in_process_background_thread",
                status="implemented",
                orchestration="AlphaTrace multi-step DAG implemented inside QwenRunner",
                model_provider="qwen_openai_compatible",
                data_providers=("alphatrace_evidence_store", "bocha_web_search", "alphatrace_static_market_data"),
                tool_layer=("legacy_runner_calls", "feature_flagged_tool_adapters"),
                persistence="AgentRunStore + Evidence/Decision projections",
                streaming="Qwen chunk events through AgentRuntimeEvent/SSE",
                artifacts="reports/evidence/decision only",
                recommended_use="Current reliable LLM-backed AlphaTrace analysis path.",
                limitations=("Orchestration still partly lives in runner", "ToolAdapter path is feature-flagged"),
            ),
            AdapterCompositionItem(
                runner_type="alphatrace_native",
                role="product_native_agent_dag",
                execution_mode="in_process_background_thread",
                status="implemented_v1",
                orchestration="AlphaTrace-owned logical DAG; currently reuses QwenRunner execution path",
                model_provider="qwen_openai_compatible",
                data_providers=("alphatrace_evidence_store", "bocha_web_search", "alphatrace_market_data"),
                tool_layer=("planned_tool_executor", "feature_flagged_tool_adapters"),
                persistence="AgentRunStore + AsyncTaskStore diagnostics optional",
                streaming="AgentRuntimeEvent/SSE live output",
                artifacts="reports/evidence/decision; AgentArtifact planned",
                recommended_use="Preferred product runner path for ETF/fund/index research.",
                limitations=("Needs deeper extraction from QwenRunner", "Not a LangGraph implementation yet"),
            ),
            AdapterCompositionItem(
                runner_type="tradingagents",
                role="optional_langgraph_poc_runner",
                execution_mode="opt_in_external_process_or_import",
                status="poc_opt_in",
                orchestration="TradingAgents LangGraph when enabled; mapped back to AlphaTrace schema",
                model_provider="TradingAgents provider config, typically Qwen/DashScope for local PoC",
                data_providers=("TradingAgents internal tools", "AlphaTrace offline context for PoC"),
                tool_layer=("tradingagents.graph.run", "tradingagents.subprocess_worker"),
                persistence="AlphaTrace AgentRunStore only; TradingAgents checkpoint is internal",
                streaming="Best effort logs/events; no product dependency on internal graph state",
                artifacts="PoC report/evidence context/decision mapping",
                recommended_use="Reference implementation and selective component learning, not production main path.",
                limitations=("Stock ticker bias", "Optional dependencies", "Not product data model", "No internal state exposure"),
            ),
            AdapterCompositionItem(
                runner_type="langalpha",
                role="external_workbench_adapter_candidate",
                execution_mode="design_only_external_service",
                status="design_only",
                orchestration="LangAlpha workspace/thread/task model as external service candidate",
                model_provider="LangAlpha BYOK/provider layer if adopted later",
                data_providers=("LangAlpha MCP/tools/files as mapped artifacts"),
                tool_layer=("external_service_adapter_planned",),
                persistence="AlphaTrace AgentRunStore plus future AgentArtifact mapping",
                streaming="Future external SSE/WebSocket bridge mapped into AgentRuntimeEvent",
                artifacts="AgentArtifact contract planned for files/tables/charts/web previews",
                recommended_use="Architecture reference for workbench, sandbox, artifacts, and background tasks.",
                limitations=("Too heavy for in-process runner", "Requires service boundary", "No code copied"),
            ),
        ]

    def to_response(self) -> dict[str, Any]:
        items = [item.to_dict() for item in self.list_items()]
        return {
            "matrixId": self.matrix_id,
            "items": items,
            "total": len(items),
            "message": "Adapter composition matrix documents how AlphaTrace, TradingAgents, and LangAlpha components may be combined without exposing external internal state.",
        }


def get_adapter_composition_matrix() -> AdapterCompositionMatrix:
    return AdapterCompositionMatrix()


__all__ = ["AdapterCompositionItem", "AdapterCompositionMatrix", "get_adapter_composition_matrix"]
