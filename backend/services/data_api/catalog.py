from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class DataApiResource:
    resource_id: str
    domain: str
    display_name: str
    path: str
    operations: tuple[str, ...]
    provider_id: str
    store_type: str
    status: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DataApiProvider:
    provider_id: str
    display_name: str
    provider_type: str
    status: str
    domains: tuple[str, ...]
    requires_secret: bool
    credential_source: str
    operations: tuple[str, ...]
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AlphaTraceDataApiCatalog:
    """Catalog of AlphaTrace-owned data APIs and their backing provider/store boundary."""

    catalog_id = "alphatrace_data_api_catalog"

    def list_resources(self) -> list[DataApiResource]:
        return [
            DataApiResource(
                resource_id="asset.list_detail",
                domain="asset",
                display_name="Asset Store API",
                path="/api/alpha-trace/assets",
                operations=("list", "detail", "asset_evidence"),
                provider_id="alphatrace_asset_store",
                store_type="mysql_or_static_seed",
                status="ready",
                notes="Product asset boundary for ETF/fund/future/index metadata.",
            ),
            DataApiResource(
                resource_id="evidence.search_detail",
                domain="evidence",
                display_name="Evidence Store API",
                path="/api/alpha-trace/evidence",
                operations=("list", "detail", "search"),
                provider_id="alphatrace_evidence_store",
                store_type="mysql_static_seed_run_scoped",
                status="ready",
                notes="Canonical evidence detail/URL/usage boundary. Bocha/static items must map here before UI display.",
            ),
            DataApiResource(
                resource_id="market_data.static_v1",
                domain="market_data",
                display_name="AlphaTrace Market Data API",
                path="/api/alpha-trace/market-data",
                operations=("quote", "snapshot", "klines", "indicators"),
                provider_id="alphatrace_static_market_data",
                store_type="static_seed_v1",
                status="ready",
                notes="ETF/fund/index/future demo market data. Legacy BTC/Hyperliquid APIs are not this boundary.",
            ),
            DataApiResource(
                resource_id="strategy.list_detail",
                domain="strategy",
                display_name="Strategy Store API",
                path="/api/alpha-trace/strategies",
                operations=("list", "detail", "assets", "evidence"),
                provider_id="alphatrace_strategy_store",
                store_type="mysql_or_static_seed",
                status="ready",
            ),
            DataApiResource(
                resource_id="portfolio.list_detail",
                domain="portfolio",
                display_name="Portfolio Store API",
                path="/api/alpha-trace/portfolios",
                operations=("list", "detail", "holdings", "recommendations", "assets", "strategies", "decisions"),
                provider_id="alphatrace_portfolio_store",
                store_type="mysql_or_static_seed",
                status="ready",
            ),
            DataApiResource(
                resource_id="decision.attribution",
                domain="decision",
                display_name="Decision Store API",
                path="/api/alpha-trace/decisions",
                operations=("list", "detail", "evidence", "agent_run"),
                provider_id="alphatrace_decision_store",
                store_type="mysql_agent_run_projection_static_seed",
                status="ready",
            ),
            DataApiResource(
                resource_id="agent_runtime",
                domain="agent_runtime",
                display_name="Agent Runtime API",
                path="/api/alpha-trace/agent-runs",
                operations=("submit", "detail", "events", "sse", "reports", "evidence", "decision", "diagnostics"),
                provider_id="alphatrace_agent_run_store",
                store_type="mysql_or_json_fallback",
                status="ready",
                notes="Product execution record boundary for all runners and external adapters.",
            ),
            DataApiResource(
                resource_id="data_sources.catalog",
                domain="data_source",
                display_name="Data Source Store API",
                path="/api/alpha-trace/data-sources",
                operations=("list", "detail", "tasks", "api_catalog"),
                provider_id="alphatrace_data_source_store",
                store_type="mysql_or_static_seed",
                status="ready",
            ),
        ]

    def list_providers(self) -> list[DataApiProvider]:
        return [
            DataApiProvider(
                provider_id="alphatrace_static_seed",
                display_name="AlphaTrace Static Seed Provider",
                provider_type="static_seed",
                status="ready",
                domains=("asset", "evidence", "strategy", "portfolio", "market_data", "data_source"),
                requires_secret=False,
                credential_source="none",
                operations=("list", "detail", "demo_snapshot"),
                notes="MVP fallback and deterministic demo source. Not a production data provider.",
            ),
            DataApiProvider(
                provider_id="mysql_domain_store",
                display_name="AlphaTrace MySQL Domain Store",
                provider_type="mysql_store",
                status="ready_or_fallback",
                domains=("agent_runtime", "asset", "evidence", "strategy", "portfolio", "decision", "config"),
                requires_secret=False,
                credential_source="backend_database_url",
                operations=("persist", "query", "project"),
                notes="Formal persistence direction. JSON fallback remains for local/MVP paths.",
            ),
            DataApiProvider(
                provider_id="bocha_web_search",
                display_name="Bocha Web Search",
                provider_type="external_search",
                status="optional",
                domains=("evidence", "external_web"),
                requires_secret=True,
                credential_source="mysql_system_config_or_environment",
                operations=("search", "map_to_evidence", "map_to_artifact"),
                notes="Current external evidence source. Search failure must fallback to static evidence.",
            ),
            DataApiProvider(
                provider_id="future_professional_market_data",
                display_name="Future Professional Market Data Provider",
                provider_type="planned_external_market_data",
                status="planned",
                domains=("quote", "kline", "fund_nav", "index_constituents", "macro", "announcement"),
                requires_secret=True,
                credential_source="mysql_system_config_or_environment",
                operations=("quote", "snapshot", "klines", "indicators", "reference_data"),
                notes="Reserved boundary for ETF/fund/index/futures professional data. Do not reuse legacy BTC/Hyperliquid endpoints.",
            ),
            DataApiProvider(
                provider_id="langalpha_external_workbench",
                display_name="LangAlpha External Workbench",
                provider_type="planned_external_workbench",
                status="design_only",
                domains=("workspace", "files", "mcp_tools", "artifacts"),
                requires_secret=True,
                credential_source="external_service_boundary",
                operations=("submit_task", "stream_events", "fetch_artifacts"),
                notes="Architecture reference or future external service adapter. Not imported into AlphaTrace backend.",
            ),
        ]

    def to_response(self) -> dict[str, Any]:
        resources = [resource.to_dict() for resource in self.list_resources()]
        providers = [provider.to_dict() for provider in self.list_providers()]
        return {
            "catalogId": self.catalog_id,
            "resources": resources,
            "providers": providers,
            "total": len(resources),
            "providerTotal": len(providers),
            "policies": {
                "legacyBoundary": "Legacy BTC/Hyperliquid APIs are not AlphaTrace market data boundaries.",
                "credentialPolicy": "Provider credentials are resolved backend-side from MySQL system config or environment; no raw keys are returned.",
                "fallbackPolicy": "Static seed fallback remains available for MVP/demo continuity.",
                "professionalDataPolicy": "ETF/fund/index/futures provider integrations must enter through the AlphaTrace data API/provider boundary.",
            },
            "message": "AlphaTrace data API catalog describes product-owned data boundaries. It does not expose provider credentials or legacy trading internals.",
        }


def get_data_api_catalog() -> AlphaTraceDataApiCatalog:
    return AlphaTraceDataApiCatalog()


__all__ = ["AlphaTraceDataApiCatalog", "DataApiProvider", "DataApiResource", "get_data_api_catalog"]
