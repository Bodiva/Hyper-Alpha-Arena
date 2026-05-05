from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

from services.evidence_retrieval.external_search import ExternalEvidenceSearch
from services.integration_adapters.base import (
    DataProviderAdapter,
    DataQueryRequest,
    DataQueryResult,
    IntegrationCapability,
    IntegrationHealth,
)


class BochaDataProviderAdapter:
    """DataProviderAdapter wrapper for Bocha web search.

    This wrapper is additive. Existing EvidenceRetriever behavior continues to
    call ExternalEvidenceSearch directly until a later wiring milestone moves
    provider execution through the adapter registry.
    """

    adapter_id = "bocha_web_search"

    def __init__(self, search_client: ExternalEvidenceSearch | None = None) -> None:
        self._search_client = search_client or ExternalEvidenceSearch()

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="data_provider",
            display_name="Bocha Web Search",
            supported_operations=("web_search", "evidence_retrieval"),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Backend-only web search provider mapped into AlphaTrace evidence items.",
        )

    def health(self) -> IntegrationHealth:
        # Do not read or expose the key; use a dry disabled check through the underlying search object where possible.
        api_key = ExternalEvidenceSearch._read_bocha_api_key()  # noqa: SLF001 - existing helper centralizes env/MySQL fallback.
        if not api_key:
            return IntegrationHealth(
                adapter_id=self.adapter_id,
                status="missing_config",
                source="environment_or_mysql_system_config",
                message="Bocha API key is not configured.",
                checked_at=datetime.now(timezone.utc).isoformat(),
            )
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready",
            source="environment_or_mysql_system_config",
            message="Bocha API key is configured. Network health is checked during invocation.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def query(self, request: DataQueryRequest) -> DataQueryResult:
        result = self._search_client.search(
            asset_id=request.asset_id,
            question=request.query,
            task_type=request.task_type,
            limit=request.limit,
        )
        status = "completed" if result.status == "completed" else "skipped" if result.status == "disabled" else "failed"
        items: tuple[Mapping[str, Any], ...] = tuple(item.__dict__ for item in result.items)
        return DataQueryResult(
            status=status,
            provider_id=self.adapter_id,
            items=items,
            message=result.message or result.status,
            raw_metadata={"query": result.query, "source": result.source, "status": result.status},
        )


__all__ = ["BochaDataProviderAdapter"]
