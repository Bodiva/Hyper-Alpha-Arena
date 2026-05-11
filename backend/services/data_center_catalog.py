from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class DataCenterConnector:
    connector_id: str
    display_name: str
    connector_type: str
    status: str
    data_domains: tuple[str, ...]
    ingestion_mode: str
    target_store: str
    credential_policy: str
    freshness_policy: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DataCenterCatalog:
    version: int
    connectors: tuple[DataCenterConnector, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        by_type: dict[str, int] = {}
        by_store: dict[str, int] = {}
        for connector in self.connectors:
            by_type[connector.connector_type] = by_type.get(connector.connector_type, 0) + 1
            by_store[connector.target_store] = by_store.get(connector.target_store, 0) + 1
        return {
            "version": self.version,
            "connectors": [connector.to_dict() for connector in self.connectors],
            "total": len(self.connectors),
            "summary": {"byType": by_type, "byTargetStore": by_store},
            "policies": self.policies,
        }


def get_data_center_catalog() -> DataCenterCatalog:
    """Return the AlphaTrace Data Center control-plane contract.

    The Data Center owns data onboarding/governance boundaries. Tool providers
    such as Bocha can feed it, but they are not themselves the durable business
    store.
    """

    return DataCenterCatalog(
        version=1,
        connectors=(
            DataCenterConnector(
                connector_id="development_fixture_connector",
                display_name="Development Fixture Connector",
                connector_type="development_fixture",
                status="development_only",
                data_domains=("asset", "evidence", "strategy", "portfolio", "market_data"),
                ingestion_mode="local_read",
                target_store="local_fixture_only",
                credential_policy="none",
                freshness_policy="deterministic_development_fixture",
                notes="Explicit local development fixture; not production truth and not a product fallback.",
            ),
            DataCenterConnector(
                connector_id="bocha_search_tool_ingestion",
                display_name="Bocha Search Tool Ingestion",
                connector_type="tool_result_ingestion",
                status="active_optional",
                data_domains=("external_web_evidence", "news", "research_links"),
                ingestion_mode="on_demand_tool_call",
                target_store="clickhouse_business_store_after_mapping",
                credential_policy="server_side_mysql_config_or_environment",
                freshness_policy="request_time_search_results",
                notes="Bocha is a tool. Results become AlphaTrace business data only after EvidenceReference/AgentArtifact mapping.",
            ),
            DataCenterConnector(
                connector_id="professional_market_data_connector",
                display_name="Professional Market Data Connector",
                connector_type="external_data_provider",
                status="planned",
                data_domains=("quote", "snapshot", "kline", "indicator", "fund_nav", "index_constituents", "macro"),
                ingestion_mode="scheduled_or_on_demand_provider_api",
                target_store="clickhouse_business_store",
                credential_policy="server_side_mysql_config_or_environment",
                freshness_policy="provider_sla_required",
                notes="Future ETF/fund/index/futures data connector. Must not reuse legacy BTC/Hyperliquid streams.",
            ),
            DataCenterConnector(
                connector_id="lixinger_cn_market_data_connector",
                display_name="Lixinger CN Market Data Connector",
                connector_type="external_data_provider",
                status="adapter_ready",
                data_domains=("index", "fund", "fund_manager", "market_data"),
                ingestion_mode="on_demand_provider_api",
                target_store="read_only_adapter_before_clickhouse_ingestion",
                credential_policy="server_side_environment_token",
                freshness_policy="provider_response_time",
                notes="Validated Lixinger Open API connector for CN index, fund, and fund manager data. Durable platform ingestion is intentionally deferred.",
            ),
            DataCenterConnector(
                connector_id="file_upload_connector",
                display_name="File / Report Upload Connector",
                connector_type="internal_file_ingestion",
                status="planned",
                data_domains=("research_report", "fund_report", "announcement", "user_upload"),
                ingestion_mode="manual_upload_or_batch_import",
                target_store="clickhouse_business_store_plus_object_storage",
                credential_policy="workspace_permission_required_future",
                freshness_policy="user_supplied_timestamp",
                notes="Future ingestion path for PDFs, spreadsheets, fund reports, and announcements.",
            ),
            DataCenterConnector(
                connector_id="mysql_system_config_connector",
                display_name="MySQL System Config Connector",
                connector_type="internal_config_store",
                status="active",
                data_domains=("system_config", "credential_metadata", "task_control", "runtime_control"),
                ingestion_mode="settings_api_write",
                target_store="mysql_system_config_store",
                credential_policy="encrypted_or_environment_reference",
                freshness_policy="transactional_current_state",
                notes="Stores settings and task control metadata. Structured business analytics belong in ClickHouse.",
            ),
        ),
        policies={
            "ownership": "Data Center owns data onboarding, mapping, governance, and store routing for AlphaTrace.",
            "tool_boundary": "Tools can produce candidate data, but mapped AlphaTrace schemas are the durable business contract.",
            "storage_policy": "MySQL stores system config/task control; ClickHouse stores structured business analytics; object storage is reserved for large files.",
            "legacy_policy": "Legacy BTC/Hyperliquid streams are outside the AlphaTrace Data Center unless wrapped by an explicit new connector.",
        },
    )


__all__ = ["DataCenterConnector", "DataCenterCatalog", "get_data_center_catalog"]
