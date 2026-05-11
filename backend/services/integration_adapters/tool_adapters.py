from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.evidence_retrieval.retriever import EvidenceRetriever, to_evidence_reference
from services.evidence_retrieval.external_search import ExternalEvidenceSearch
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


def _evidence_item_payload(item: Any) -> dict[str, Any]:
    return {
        "evidenceId": str(getattr(item, "evidenceId", "") or ""),
        "title": str(getattr(item, "title", "") or "Evidence"),
        "sourceName": str(getattr(item, "sourceName", "") or "AlphaTrace Evidence"),
        "sourceType": str(getattr(item, "sourceType", "") or getattr(item, "evidenceType", "") or "evidence"),
        "evidenceType": str(getattr(item, "evidenceType", "") or "evidence"),
        "relatedAssetIds": list(getattr(item, "relatedAssetIds", None) or []),
        "publishedAt": str(getattr(item, "publishedAt", "") or ""),
        "qualityScore": int(getattr(item, "qualityScore", 50) or 50),
        "reliabilityScore": int(getattr(item, "reliabilityScore", 50) or 50),
        "summary": str(getattr(item, "summary", "") or ""),
        "url": getattr(item, "url", None),
        "extractedFields": dict(getattr(item, "extractedFields", None) or {}),
        "sourceApiName": getattr(item, "sourceApiName", None),
        "snapshotId": getattr(item, "snapshotId", None),
        "snapshotCapturedAt": getattr(item, "snapshotCapturedAt", None),
    }


class PreparedDataQueryToolAdapter:
    adapter_id = "tool.prepared_data.query"
    tool_id = "prepared_data.query"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="tool_adapter",
            display_name="Prepared Data Query Tool",
            supported_operations=("prepared_data.query",),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Loads AlphaTrace prepared market data and ClickHouse catalog data as model-ready context and evidence.",
        )

    def health(self) -> IntegrationHealth:
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready",
            source="alphatrace_prepared_data",
            message="Prepared data query uses local static stores and optional ClickHouse catalog lookups.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def invoke(self, request: ToolInvocationRequest) -> ToolInvocationResult:
        from schemas.alpha_trace_agent_runtime import AgentRunnerConfig, SubmitAgentRunRequest
        from services.clickhouse_agent_context import (
            ClickHouseAgentContextError,
            build_clickhouse_monitor_context,
            is_clickhouse_monitor_asset_id,
        )
        from services.market_data_store.market_data_store import get_static_market_data_store
        from services.research_context_service import (
            CatalogContextError,
            build_research_context,
            build_research_evidence_items,
        )

        args = request.args or {}
        asset_id = args.get("assetId") or args.get("asset_id")
        task_type = str(args.get("taskType") or args.get("task_type") or request.context.get("taskType") or "single_asset_analysis")
        question = str(args.get("question") or request.context.get("question") or "")
        data_context = args.get("dataContext") if isinstance(args.get("dataContext"), dict) else {}
        submit_request = SubmitAgentRunRequest(
            assetId=str(asset_id) if asset_id else None,
            portfolioId=args.get("portfolioId") or request.context.get("portfolioId"),
            strategyId=args.get("strategyId") or request.context.get("strategyId"),
            taskType=task_type,
            question=question or "Prepared data query",
            runnerConfig=AgentRunnerConfig(
                runnerType="qwen",
                modelProvider="qwen",
                modelName="qwen-plus",
                extraParams={"dataContext": data_context} if data_context else {},
            ),
        )

        market_context: dict[str, Any] | None = None
        context_error = ""
        if asset_id:
            market_context = get_static_market_data_store().get_prompt_context(str(asset_id))
            if not market_context and is_clickhouse_monitor_asset_id(str(asset_id)):
                try:
                    market_context = build_clickhouse_monitor_context(str(asset_id), kline_limit=900)
                except ClickHouseAgentContextError as exc:
                    context_error = str(exc)

        catalog_context: dict[str, Any] | None = None
        research_context: dict[str, Any] | None = None
        catalog_error = ""
        has_explicit_catalog_context = bool(data_context.get("datasetId") or data_context.get("importId"))
        should_load_catalog_context = has_explicit_catalog_context or (
            bool(asset_id) and not is_clickhouse_monitor_asset_id(str(asset_id))
        )
        if should_load_catalog_context:
            try:
                research_context = build_research_context(submit_request, market_context=market_context)
                catalog_context = research_context.get("catalogContext") if isinstance(research_context, dict) else None
                market_context = research_context.get("marketContext") if isinstance(research_context, dict) else market_context
            except CatalogContextError as exc:
                catalog_error = str(exc)
        else:
            research_context = {"marketContext": market_context, "catalogContext": None}

        evidence_items = []
        if should_load_catalog_context:
            try:
                evidence_items = build_research_evidence_items(submit_request)
            except CatalogContextError as exc:
                catalog_error = catalog_error or str(exc)

        evidence_payload = [_evidence_item_payload(item) for item in evidence_items]
        status = "completed" if market_context or evidence_payload else "skipped"
        summary_parts = []
        if market_context:
            summary_parts.append("已加载结构化行情与基金上下文")
        if catalog_context and catalog_context.get("status") == "available":
            summary_parts.append(f"已加载导入数据 {catalog_context.get('datasetId')}")
        if evidence_payload:
            summary_parts.append(f"已构建 {len(evidence_payload)} 条准备数据证据")
        if not summary_parts and (catalog_error or context_error):
            summary_parts.append(f"准备数据不可用：{catalog_error or context_error}")

        return ToolInvocationResult(
            status=status,
            tool_id=self.tool_id,
            content="；".join(summary_parts) if summary_parts else "未找到额外导入数据；已继续使用基础证据。",
            evidence_ids=tuple(item["evidenceId"] for item in evidence_payload if item.get("evidenceId")),
            payload={
                "marketContext": market_context,
                "researchContext": research_context,
                "catalogContext": catalog_context,
                "evidence": evidence_payload,
                "assetId": asset_id,
                "taskType": task_type,
                "dataContext": data_context,
                "error": catalog_error or context_error or None,
            },
        )


class BochaSearchToolAdapter:
    adapter_id = "tool.bocha.search"
    tool_id = "bocha.search"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="tool_adapter",
            display_name="Bocha Search Tool",
            supported_operations=("bocha.search",),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Calls backend-side Bocha web search and maps external results into AlphaTrace evidence.",
        )

    def health(self) -> IntegrationHealth:
        api_key = ExternalEvidenceSearch._read_bocha_api_key()  # noqa: SLF001 - existing helper centralizes env/MySQL fallback.
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready" if api_key else "missing_config",
            source="environment_or_mysql_system_config",
            message="Bocha API key is configured." if api_key else "Bocha API key is not configured.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def invoke(self, request: ToolInvocationRequest) -> ToolInvocationResult:
        args = request.args or {}
        asset_id = args.get("assetId") or args.get("asset_id")
        question = str(args.get("query") or args.get("question") or request.context.get("question") or "")
        task_type = str(args.get("taskType") or args.get("task_type") or request.context.get("taskType") or "single_asset_analysis")
        limit = int(args.get("limit") or 5)
        result = ExternalEvidenceSearch().search(
            asset_id=str(asset_id) if asset_id else None,
            question=question,
            task_type=task_type,
            limit=limit,
        )
        evidence_payload = [_evidence_item_payload(item) for item in result.items]
        status = "completed" if result.status == "completed" else "skipped" if result.status == "disabled" else "failed"
        return ToolInvocationResult(
            status=status,
            tool_id=self.tool_id,
            content=result.message or f"Bocha search {result.status}.",
            evidence_ids=tuple(item["evidenceId"] for item in evidence_payload if item.get("evidenceId")),
            payload={
                "query": result.query,
                "source": result.source,
                "status": result.status,
                "evidence": evidence_payload,
                "assetId": asset_id,
                "taskType": task_type,
            },
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


__all__ = ["EvidenceRetrieveToolAdapter", "PreparedDataQueryToolAdapter", "BochaSearchToolAdapter", "MarketContextToolAdapter"]
