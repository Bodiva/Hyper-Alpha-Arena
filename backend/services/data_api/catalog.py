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
                store_type="clickhouse_business_store",
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
                store_type="clickhouse_business_store_with_bocha_mapping",
                status="ready",
                notes="Canonical evidence detail/URL/usage boundary. Bocha is a tool source and its results must map here before UI display.",
            ),
            DataApiResource(
                resource_id="market_data.alpha_trace_v1",
                domain="market_data",
                display_name="AlphaTrace Market Data API",
                path="/api/alpha-trace/market-data",
                operations=("quote", "snapshot", "klines", "indicators"),
                provider_id="clickhouse_business_store",
                store_type="clickhouse_or_external_provider_adapter",
                status="requires_configured_provider",
                notes="ETF/fund/index/future market data boundary. Product displays must use ClickHouse or configured provider data, not local fixtures.",
            ),
            DataApiResource(
                resource_id="market_data.lixinger_cn_v1",
                domain="market_data",
                display_name="Lixinger CN Market Data API",
                path="/api/alpha-trace/agent-runs/runtime/integrations",
                operations=("cn_index", "cn_fund", "cn_fund_manager"),
                provider_id="lixinger_cn_market_data",
                store_type="external_provider_read_only",
                status="adapter_ready",
                notes="Live Lixinger Open API client is validated for read-only CN index, fund, and fund manager queries. Platform persistence is deferred.",
            ),
            DataApiResource(
                resource_id="strategy.list_detail",
                domain="strategy",
                display_name="Strategy Store API",
                path="/api/alpha-trace/strategies",
                operations=("list", "detail", "assets", "evidence"),
                provider_id="alphatrace_strategy_store",
                store_type="clickhouse_business_store",
                status="ready",
            ),
            DataApiResource(
                resource_id="portfolio.list_detail",
                domain="portfolio",
                display_name="Portfolio Store API",
                path="/api/alpha-trace/portfolios",
                operations=("list", "detail", "holdings", "recommendations", "assets", "strategies", "decisions"),
                provider_id="alphatrace_portfolio_store",
                store_type="clickhouse_business_store",
                status="ready",
            ),
            DataApiResource(
                resource_id="decision.attribution",
                domain="decision",
                display_name="Decision Store API",
                path="/api/alpha-trace/decisions",
                operations=("list", "detail", "evidence", "agent_run"),
                provider_id="alphatrace_decision_store",
                store_type="clickhouse_agent_run_projection",
                status="ready",
            ),
            DataApiResource(
                resource_id="agent_runtime",
                domain="agent_runtime",
                display_name="Agent Runtime API",
                path="/api/alpha-trace/agent-runs",
                operations=("submit", "detail", "events", "sse", "reports", "evidence", "decision", "diagnostics"),
                provider_id="alphatrace_agent_run_store",
                store_type="mysql_task_control_clickhouse_business_events_json_fallback",
                status="ready",
                notes="MySQL is for run/task control and config; ClickHouse is the target for structured runtime/event/report/decision analytics.",
            ),
            DataApiResource(
                resource_id="data_sources.catalog",
                domain="data_source",
                display_name="Data Source Store API",
                path="/api/alpha-trace/data-sources",
                operations=("list", "detail", "tasks", "api_catalog"),
                provider_id="alphatrace_data_source_store",
                store_type="clickhouse_business_store",
                status="ready",
            ),
        ]

    def list_providers(self) -> list[DataApiProvider]:
        return [
            DataApiProvider(
                provider_id="alphatrace_development_fixture",
                display_name="AlphaTrace Development Fixture",
                provider_type="development_fixture",
                status="development_only",
                domains=("asset", "evidence", "strategy", "portfolio", "market_data", "data_source"),
                requires_secret=False,
                credential_source="none",
                operations=(),
                notes="Local deterministic fixture for explicit development mode only. It is not used as a production fallback.",
            ),
            DataApiProvider(
                provider_id="mysql_system_config_store",
                display_name="AlphaTrace MySQL System Config Store",
                provider_type="mysql_config_task_store",
                status="ready_or_fallback",
                domains=("system_config", "runtime_config", "task_control", "credential_metadata", "lightweight_run_state"),
                requires_secret=False,
                credential_source="backend_database_url",
                operations=("persist_config", "query_config", "task_snapshot", "runtime_control"),
                notes="MySQL stores system configuration, credential metadata, and task/run control state. It is not the target analytical store for structured business data.",
            ),
            DataApiProvider(
                provider_id="clickhouse_business_store",
                display_name="AlphaTrace ClickHouse Business Store",
                provider_type="clickhouse_business_analytics_store",
                status="ready",
                domains=("agent_runtime", "asset", "evidence", "strategy", "portfolio", "decision", "market_data", "leaderboard"),
                requires_secret=False,
                credential_source="backend_clickhouse_dsn",
                operations=("append_events", "persist_structured_business_data", "analytics_query", "runtime_quality_projection"),
                notes="Formal target for structured business and analytical data.",
            ),
            DataApiProvider(
                provider_id="bocha_web_search",
                display_name="Bocha Web Search",
                provider_type="external_tool_provider",
                status="optional",
                domains=("evidence", "external_web"),
                requires_secret=True,
                credential_source="mysql_system_config_or_environment",
                operations=("search", "map_to_evidence", "map_to_artifact"),
                notes="Current backend-only search tool. It is not a business data store; results must be persisted as EvidenceReference/AgentArtifact before UI display.",
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
                provider_id="lixinger_cn_market_data",
                display_name="Lixinger CN Market Data",
                provider_type="external_market_data_provider",
                status="adapter_ready",
                domains=("index", "fund", "fund_manager", "market_data"),
                requires_secret=True,
                credential_source="environment",
                operations=("cn_index", "cn_fund", "cn_fund_manager"),
                notes="Token is resolved server-side from ALPHATRACE_LIXINGER_TOKEN or LIXINGER_TOKEN. Smoke tests validate live read access before platform ingestion.",
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
                "fallbackPolicy": "Product API paths should fail closed or return unavailable status when ClickHouse/provider data is missing; local fixtures are explicit development mode only.",
                "businessStorePolicy": "MySQL is for system config and task control; ClickHouse is the target for structured business and analytics data.",
                "toolPolicy": "Bocha is a backend tool provider. Tool results become product data only after mapping into EvidenceReference or AgentArtifact.",
                "professionalDataPolicy": "ETF/fund/index/futures provider integrations must enter through the AlphaTrace data API/provider boundary and persist structured outputs to ClickHouse when implemented.",
            },
            "message": "AlphaTrace data API catalog describes product-owned data boundaries. It does not expose provider credentials or legacy trading internals.",
        }


def get_data_api_catalog() -> AlphaTraceDataApiCatalog:
    return AlphaTraceDataApiCatalog()


__all__ = ["AlphaTraceDataApiCatalog", "DataApiProvider", "DataApiResource", "get_data_api_catalog"]
