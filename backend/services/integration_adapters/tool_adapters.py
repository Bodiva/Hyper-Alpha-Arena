from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.evidence_retrieval.retriever import EvidenceRetriever, to_evidence_reference
from services.integration_adapters.base import IntegrationCapability, IntegrationHealth, ToolInvocationRequest, ToolInvocationResult


class EvidenceRetrieveToolAdapter:
    adapter_id = "tool.evidence.retrieve"
    tool_id = "evidence.retrieve"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="tool_adapter",
            display_name="Evidence Retrieve Tool",
            supported_operations=("evidence.retrieve",),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Retrieves AlphaTrace static/MySQL/run-scoped and optional external evidence for agent context.",
        )

    def health(self) -> IntegrationHealth:
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready",
            source="alphatrace_evidence_retriever",
            message="Evidence retriever is available. External search may still be disabled or degraded independently.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def invoke(self, request: ToolInvocationRequest) -> ToolInvocationResult:
        args = request.args or {}
        asset_id = args.get("assetId") or args.get("asset_id")
        question = str(args.get("question") or request.context.get("question") or "")
        task_type = str(args.get("taskType") or args.get("task_type") or request.context.get("taskType") or "single_asset_analysis")
        limit = int(args.get("limit") or 5)
        include_external = bool(args.get("includeExternal", args.get("include_external", True)))
        items = EvidenceRetriever().retrieve(
            asset_id=str(asset_id) if asset_id else None,
            question=question,
            task_type=task_type,
            limit=limit,
            include_external=include_external,
        )
        evidence_refs = [to_evidence_reference(item).model_dump(mode="json") for item in items]
        return ToolInvocationResult(
            status="completed",
            tool_id=self.tool_id,
            content=f"Retrieved {len(evidence_refs)} evidence item(s).",
            evidence_ids=tuple(str(item.get("evidenceId")) for item in evidence_refs if item.get("evidenceId")),
            payload={"evidence": evidence_refs, "assetId": asset_id, "taskType": task_type, "includeExternal": include_external},
        )


class MarketContextToolAdapter:
    adapter_id = "tool.market.context.load"
    tool_id = "market.context.load"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="tool_adapter",
            display_name="Market Context Load Tool",
            supported_operations=("market.context.load",),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Loads AlphaTrace market quote/snapshot/indicator prompt context for an asset.",
        )

    def health(self) -> IntegrationHealth:
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready",
            source="alphatrace_market_data_store",
            message="Static market context loader is available.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def invoke(self, request: ToolInvocationRequest) -> ToolInvocationResult:
        from services.market_data_store.market_data_store import get_static_market_data_store

        args = request.args or {}
        asset_id = args.get("assetId") or args.get("asset_id")
        if not asset_id:
            return ToolInvocationResult(status="failed", tool_id=self.tool_id, message="assetId is required.")
        context = get_static_market_data_store().get_prompt_context(str(asset_id))
        if not context:
            return ToolInvocationResult(status="failed", tool_id=self.tool_id, message=f"No market context found for {asset_id}.")
        return ToolInvocationResult(
            status="completed",
            tool_id=self.tool_id,
            content=f"Loaded market context for {asset_id}.",
            payload={"marketContext": context},
        )


__all__ = ["EvidenceRetrieveToolAdapter", "MarketContextToolAdapter"]
