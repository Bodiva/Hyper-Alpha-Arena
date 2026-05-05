from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Mapping

from sqlalchemy.orm import Session

from services.runtime_config import get_runtime_config_facade


@dataclass(frozen=True)
class ModelProviderDescriptor:
    """Product-owned model provider boundary descriptor.

    Runner adapters may consume model providers, but providers are not runners.
    This catalog keeps model configuration diagnostics separate from agent
    orchestration and prevents external framework settings from leaking into
    frontend product state.
    """

    provider_id: str
    display_name: str
    provider_type: str
    status: str
    source: str
    production_ready: bool
    supports_streaming: bool = False
    supports_json_output: bool = False
    used_by_runners: tuple[str, ...] = ()
    configuration_keys: tuple[str, ...] = ()
    notes: str = ""
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _provider_status(available: bool, default_when_missing: str = "missing_config") -> str:
    return "ready" if available else default_when_missing


def list_model_provider_descriptors(db: Session | None = None) -> dict[str, Any]:
    """Return sanitized model-provider diagnostics for AlphaTrace.

    The response is deliberately descriptive rather than executable. It is safe
    for frontend diagnostics because it contains no credential values.
    """

    runtime_config = get_runtime_config_facade().snapshot(db)
    qwen = runtime_config.get("qwen") or {}
    tradingagents = runtime_config.get("tradingagents") or {}
    langalpha = runtime_config.get("langalpha") or {}

    qwen_available = bool(qwen.get("available"))
    tradingagents_available = bool(tradingagents.get("available"))
    langalpha_available = bool(langalpha.get("available"))

    providers = [
        ModelProviderDescriptor(
            provider_id="qwen_openai_compatible",
            display_name="Qwen / DashScope OpenAI-Compatible API",
            provider_type="direct_model_provider",
            status=_provider_status(qwen_available),
            source=str(qwen.get("source") or "missing"),
            production_ready=True,
            supports_streaming=True,
            supports_json_output=True,
            used_by_runners=("qwen", "alphatrace_native", "tradingagents_poc"),
            configuration_keys=("DASHSCOPE_API_KEY", "QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_MODEL"),
            notes="Primary backend model provider for AlphaTrace MVP. Credentials stay server-side.",
            metadata={"message": qwen.get("message", "")},
        ),
        ModelProviderDescriptor(
            provider_id="custom_openai_compatible",
            display_name="Custom OpenAI-Compatible Provider",
            provider_type="planned_direct_model_provider",
            status="planned",
            source="not_configured",
            production_ready=False,
            supports_streaming=True,
            supports_json_output=True,
            used_by_runners=("future_custom_runner",),
            configuration_keys=("CUSTOM_OPENAI_BASE_URL", "CUSTOM_OPENAI_API_KEY", "CUSTOM_OPENAI_MODEL"),
            notes="Design placeholder for commercial BYOK providers. Not wired in this MVP.",
        ),
        ModelProviderDescriptor(
            provider_id="tradingagents_model_bridge",
            display_name="TradingAgents Model Bridge",
            provider_type="runner_owned_bridge",
            status=_provider_status(tradingagents_available, "disabled_or_not_importable"),
            source=str(tradingagents.get("source") or "disabled"),
            production_ready=False,
            supports_streaming=False,
            supports_json_output=False,
            used_by_runners=("tradingagents",),
            configuration_keys=("ALPHATRACE_TRADINGAGENTS_ENABLED", "TRADINGAGENTS_REPO_PATH", "DASHSCOPE_API_KEY"),
            notes=(
                "TradingAgents owns its internal LangGraph/model configuration during PoC. "
                "AlphaTrace only maps outputs back to product schema."
            ),
            metadata={"message": tradingagents.get("message", "")},
        ),
        ModelProviderDescriptor(
            provider_id="langalpha_byok_bridge",
            display_name="LangAlpha BYOK / Workbench Bridge",
            provider_type="external_workbench_bridge",
            status=_provider_status(langalpha_available, "design_only"),
            source=str(langalpha.get("source") or "design_only"),
            production_ready=False,
            supports_streaming=True,
            supports_json_output=False,
            used_by_runners=("future_langalpha_external_adapter",),
            configuration_keys=("ALPHATRACE_LANGALPHA_ENABLED", "LANGALPHA_BASE_URL", "LANGALPHA_API_KEY"),
            notes="Design-only external workbench adapter candidate. Not imported or executed by AlphaTrace backend.",
            metadata={"message": langalpha.get("message", "")},
        ),
        ModelProviderDescriptor(
            provider_id="local_ollama",
            display_name="Local Ollama / Open Model Provider",
            provider_type="planned_local_model_provider",
            status="planned",
            source="not_configured",
            production_ready=False,
            supports_streaming=True,
            supports_json_output=False,
            used_by_runners=("future_local_runner",),
            configuration_keys=("OLLAMA_BASE_URL", "OLLAMA_MODEL"),
            notes="Planned local model integration for offline/private deployments.",
        ),
    ]

    return {
        "version": 1,
        "providers": [provider.to_dict() for provider in providers],
        "summary": {
            "total": len(providers),
            "ready": sum(1 for provider in providers if provider.status == "ready"),
            "planned": sum(1 for provider in providers if provider.status == "planned"),
            "productionReady": sum(1 for provider in providers if provider.production_ready),
        },
    }


__all__ = ["ModelProviderDescriptor", "list_model_provider_descriptors"]
