from __future__ import annotations

from dataclasses import asdict
from typing import Any, Iterable

from services.integration_adapters.base import IntegrationAdapter
from services.integration_adapters.bocha_adapter import BochaDataProviderAdapter
from services.integration_adapters.langalpha_workbench_adapter import LangAlphaExternalWorkbenchAdapter
from services.integration_adapters.market_data_adapter import ProfessionalMarketDataProviderAdapter, StaticMarketDataProviderAdapter
from services.integration_adapters.qwen_model_adapter import QwenModelProviderAdapter
from services.integration_adapters.tool_adapters import EvidenceRetrieveToolAdapter, MarketContextToolAdapter


class IntegrationAdapterRegistry:
    """Small in-process registry for AlphaTrace integration adapters.

    This is intentionally lightweight. It is a catalog/diagnostics boundary, not
    a dependency injection framework and not a runtime scheduler.
    """

    def __init__(self, adapters: Iterable[IntegrationAdapter] | None = None) -> None:
        self._adapters = {adapter.adapter_id: adapter for adapter in (adapters or [])}

    def register(self, adapter: IntegrationAdapter) -> None:
        self._adapters[adapter.adapter_id] = adapter

    def get(self, adapter_id: str) -> IntegrationAdapter | None:
        return self._adapters.get(adapter_id)

    def list(self) -> list[IntegrationAdapter]:
        return list(self._adapters.values())

    def diagnostics(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for adapter in self.list():
            try:
                items.append({"capability": asdict(adapter.capability()), "health": asdict(adapter.health())})
            except Exception as exc:  # noqa: BLE001 - diagnostics must not fail the whole endpoint.
                items.append(
                    {
                        "capability": {"adapter_id": getattr(adapter, "adapter_id", "unknown")},
                        "health": {
                            "adapter_id": getattr(adapter, "adapter_id", "unknown"),
                            "status": "error",
                            "source": "diagnostics",
                            "message": f"Failed to inspect adapter: {exc}",
                        },
                    }
                )
        return items


def build_default_integration_registry() -> IntegrationAdapterRegistry:
    registry = IntegrationAdapterRegistry()
    registry.register(BochaDataProviderAdapter())
    registry.register(StaticMarketDataProviderAdapter())
    registry.register(ProfessionalMarketDataProviderAdapter())
    registry.register(QwenModelProviderAdapter())
    registry.register(EvidenceRetrieveToolAdapter())
    registry.register(MarketContextToolAdapter())
    registry.register(LangAlphaExternalWorkbenchAdapter())
    return registry


__all__ = ["IntegrationAdapterRegistry", "build_default_integration_registry"]
