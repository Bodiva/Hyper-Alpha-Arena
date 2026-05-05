from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class ClickHouseColumnDescriptor:
    name: str
    type: str
    role: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ClickHouseTableDescriptor:
    table_name: str
    domain: str
    status: str
    source_contracts: tuple[str, ...]
    columns: tuple[ClickHouseColumnDescriptor, ...]
    partition_by: str
    order_by: tuple[str, ...]
    ttl_policy: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["columns"] = [column.to_dict() for column in self.columns]
        return payload


@dataclass(frozen=True)
class ClickHouseSchemaCatalog:
    version: int
    tables: tuple[ClickHouseTableDescriptor, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        by_domain: dict[str, int] = {}
        by_status: dict[str, int] = {}
        for table in self.tables:
            by_domain[table.domain] = by_domain.get(table.domain, 0) + 1
            by_status[table.status] = by_status.get(table.status, 0) + 1
        return {
            "version": self.version,
            "tables": [table.to_dict() for table in self.tables],
            "total": len(self.tables),
            "summary": {"byDomain": by_domain, "byStatus": by_status},
            "policies": self.policies,
        }


def _common_run_columns() -> tuple[ClickHouseColumnDescriptor, ...]:
    return (
        ClickHouseColumnDescriptor("workspace_id", "String", "tenant_key", "Reserved for multi-tenant partitioning."),
        ClickHouseColumnDescriptor("run_id", "String", "foreign_key", "AlphaTrace AgentRun identifier."),
        ClickHouseColumnDescriptor("runner_type", "LowCardinality(String)", "dimension", "stub/qwen/alphatrace_native/tradingagents/langalpha."),
        ClickHouseColumnDescriptor("task_type", "LowCardinality(String)", "dimension", "single_asset_analysis/portfolio_diagnosis/etc."),
        ClickHouseColumnDescriptor("event_time", "DateTime64(3, 'UTC')", "time", "Event or fact timestamp in UTC."),
    )


def get_clickhouse_schema_catalog() -> ClickHouseSchemaCatalog:
    """Return the planned ClickHouse analytical schema catalog.

    This catalog is documentation/execution planning data. It does not connect
    to ClickHouse and does not replace current MySQL/JSON fallback behavior.
    """

    common = _common_run_columns()
    return ClickHouseSchemaCatalog(
        version=1,
        tables=(
            ClickHouseTableDescriptor(
                table_name="alpha_trace_runtime_events",
                domain="agent_runtime",
                status="planned",
                source_contracts=("AgentRuntimeEvent",),
                columns=common
                + (
                    ClickHouseColumnDescriptor("sequence", "UInt64", "ordering", "Monotonic sequence per run."),
                    ClickHouseColumnDescriptor("event_type", "LowCardinality(String)", "dimension", "agent.started/tool.called/reasoning.chunk/etc."),
                    ClickHouseColumnDescriptor("agent_name", "LowCardinality(String)", "dimension", "Logical agent name."),
                    ClickHouseColumnDescriptor("step_id", "LowCardinality(String)", "dimension", "DAG step identifier."),
                    ClickHouseColumnDescriptor("payload_json", "String", "payload", "Serialized normalized event payload."),
                ),
                partition_by="toYYYYMM(event_time)",
                order_by=("workspace_id", "run_id", "sequence"),
                ttl_policy="retain_180_days_default",
                notes="High-volume event analytics should move here before UI timeline queries scale.",
            ),
            ClickHouseTableDescriptor(
                table_name="alpha_trace_agent_reports",
                domain="agent_runtime",
                status="planned",
                source_contracts=("AgentReport",),
                columns=common
                + (
                    ClickHouseColumnDescriptor("report_id", "String", "primary_key", "Report identifier."),
                    ClickHouseColumnDescriptor("report_type", "LowCardinality(String)", "dimension", "market/bull/bear/risk/decision/etc."),
                    ClickHouseColumnDescriptor("title", "String", "search_text", "Report title."),
                    ClickHouseColumnDescriptor("content", "String", "payload", "Report content or markdown."),
                    ClickHouseColumnDescriptor("payload_json", "String", "payload", "Structured report metadata."),
                ),
                partition_by="toYYYYMM(event_time)",
                order_by=("workspace_id", "run_id", "report_type", "report_id"),
                ttl_policy="retain_365_days_default",
            ),
            ClickHouseTableDescriptor(
                table_name="alpha_trace_evidence_refs",
                domain="evidence",
                status="planned",
                source_contracts=("EvidenceReference", "AgentArtifact"),
                columns=common
                + (
                    ClickHouseColumnDescriptor("evidence_id", "String", "primary_key", "Evidence reference id."),
                    ClickHouseColumnDescriptor("source_type", "LowCardinality(String)", "dimension", "static_seed/bocha_search/runtime_context/etc."),
                    ClickHouseColumnDescriptor("evidence_type", "LowCardinality(String)", "dimension", "market_snapshot/news/research_report/external_search/etc."),
                    ClickHouseColumnDescriptor("asset_ids", "Array(String)", "dimension", "Related AlphaTrace assets."),
                    ClickHouseColumnDescriptor("source_url", "String", "source", "Canonical source URL when available."),
                    ClickHouseColumnDescriptor("quality_score", "Float32", "metric", "Source quality score."),
                    ClickHouseColumnDescriptor("summary", "String", "payload", "Evidence summary."),
                    ClickHouseColumnDescriptor("payload_json", "String", "payload", "Structured evidence metadata."),
                ),
                partition_by="toYYYYMM(event_time)",
                order_by=("workspace_id", "source_type", "evidence_id", "run_id"),
                ttl_policy="retain_365_days_default",
                notes="Bocha URLs are preserved here after mapping. Bocha itself remains a tool provider.",
            ),
            ClickHouseTableDescriptor(
                table_name="alpha_trace_decisions",
                domain="decision",
                status="planned",
                source_contracts=("AgentDecision",),
                columns=common
                + (
                    ClickHouseColumnDescriptor("decision_id", "String", "primary_key", "Decision identifier."),
                    ClickHouseColumnDescriptor("action", "LowCardinality(String)", "dimension", "overweight/underweight/hold/watch/avoid."),
                    ClickHouseColumnDescriptor("confidence", "Float32", "metric", "Normalized 0-1 confidence."),
                    ClickHouseColumnDescriptor("horizon", "LowCardinality(String)", "dimension", "short/medium/long term."),
                    ClickHouseColumnDescriptor("evidence_ids", "Array(String)", "relation", "Evidence ids cited by the decision."),
                    ClickHouseColumnDescriptor("payload_json", "String", "payload", "Thesis, risks, watch indicators, attribution placeholders."),
                ),
                partition_by="toYYYYMM(event_time)",
                order_by=("workspace_id", "run_id", "decision_id"),
                ttl_policy="retain_365_days_default",
            ),
            ClickHouseTableDescriptor(
                table_name="alpha_trace.etf_index_valuation_daily",
                domain="market_data",
                status="implemented",
                source_contracts=("FileImportResponse", "DataCenterConnector", "etf_file_import_service"),
                columns=(
                    ClickHouseColumnDescriptor("import_id", "String", "batch_key", "File import batch identifier."),
                    ClickHouseColumnDescriptor("source_name", "LowCardinality(String)", "source", "Human-readable source/import name."),
                    ClickHouseColumnDescriptor("file_name", "String", "source", "Imported file name."),
                    ClickHouseColumnDescriptor("file_sha256", "FixedString(64)", "lineage", "Source file hash."),
                    ClickHouseColumnDescriptor("row_number", "UInt64", "ordering", "Original row number in imported file."),
                    ClickHouseColumnDescriptor("index_code", "String", "dimension", "ETF/index/fund code from field mapping."),
                    ClickHouseColumnDescriptor("index_name", "String", "dimension", "ETF/index/fund display name from field mapping."),
                    ClickHouseColumnDescriptor("trade_date", "Nullable(Date)", "time", "Trading date."),
                    ClickHouseColumnDescriptor("close_price", "Nullable(Float64)", "metric", "Close price."),
                    ClickHouseColumnDescriptor("pe_etf_weighted", "Nullable(Float64)", "metric", "ETF-weighted PE."),
                    ClickHouseColumnDescriptor("pe_market_cap_weighted", "Nullable(Float64)", "metric", "Market-cap-weighted PE."),
                    ClickHouseColumnDescriptor("pe_equal_weighted", "Nullable(Float64)", "metric", "Equal-weighted PE."),
                    ClickHouseColumnDescriptor("pb_etf_weighted", "Nullable(Float64)", "metric", "ETF-weighted PB."),
                    ClickHouseColumnDescriptor("pb_market_cap_weighted", "Nullable(Float64)", "metric", "Market-cap-weighted PB."),
                    ClickHouseColumnDescriptor("pb_equal_weighted", "Nullable(Float64)", "metric", "Equal-weighted PB."),
                    ClickHouseColumnDescriptor("dividend_yield_pct", "Nullable(Float64)", "metric", "Dividend yield percent."),
                    ClickHouseColumnDescriptor("roe_pct", "Nullable(Float64)", "metric", "ROE percent."),
                    ClickHouseColumnDescriptor("ps", "Nullable(Float64)", "metric", "Price-to-sales ratio."),
                    ClickHouseColumnDescriptor("constituent_avg_rolling_net_profit_100m", "Nullable(Float64)", "metric", "Average constituent rolling net profit in 100m units."),
                    ClickHouseColumnDescriptor("constituent_avg_market_cap_100m", "Nullable(Float64)", "metric", "Average constituent market cap in 100m units."),
                    ClickHouseColumnDescriptor("index_total_float_market_cap_100m", "Nullable(Float64)", "metric", "Index total float market cap in 100m units."),
                    ClickHouseColumnDescriptor("index_total_market_cap_100m", "Nullable(Float64)", "metric", "Index total market cap in 100m units."),
                    ClickHouseColumnDescriptor("data_category", "LowCardinality(String)", "dimension", "MARKET_DATA or other import category."),
                    ClickHouseColumnDescriptor("imported_at", "DateTime64(3, 'UTC')", "time", "Import timestamp."),
                ),
                partition_by="toYYYYMM(coalesce(trade_date, toDate(imported_at)))",
                order_by=("source_name", "index_code", "coalesce(trade_date, toDate('1970-01-01'))", "import_id", "row_number"),
                ttl_policy="provider_dependent",
                notes="Implemented structured wide table for ETF/index valuation CSV/XLSX imports with user-overridable field mapping.",
            ),
            ClickHouseTableDescriptor(
                table_name="alpha_trace_market_facts",
                domain="market_data",
                status="planned",
                source_contracts=("market_context", "DataCenterConnector"),
                columns=(
                    ClickHouseColumnDescriptor("workspace_id", "String", "tenant_key"),
                    ClickHouseColumnDescriptor("asset_id", "String", "dimension"),
                    ClickHouseColumnDescriptor("symbol", "String", "dimension"),
                    ClickHouseColumnDescriptor("market", "LowCardinality(String)", "dimension"),
                    ClickHouseColumnDescriptor("fact_time", "DateTime64(3, 'UTC')", "time"),
                    ClickHouseColumnDescriptor("fact_type", "LowCardinality(String)", "dimension", "quote/snapshot/kline/indicator/nav/macro."),
                    ClickHouseColumnDescriptor("provider_id", "LowCardinality(String)", "source"),
                    ClickHouseColumnDescriptor("payload_json", "String", "payload"),
                ),
                partition_by="toYYYYMM(fact_time)",
                order_by=("workspace_id", "asset_id", "fact_type", "fact_time"),
                ttl_policy="provider_dependent",
            ),
            ClickHouseTableDescriptor(
                table_name="alpha_trace_leaderboard_facts",
                domain="leaderboard",
                status="planned",
                source_contracts=("LeaderboardEntry", "RuntimeMetrics"),
                columns=(
                    ClickHouseColumnDescriptor("workspace_id", "String", "tenant_key"),
                    ClickHouseColumnDescriptor("snapshot_time", "DateTime64(3, 'UTC')", "time"),
                    ClickHouseColumnDescriptor("ranking_key", "String", "dimension", "runner/task/strategy grouping key."),
                    ClickHouseColumnDescriptor("completed_runs", "UInt32", "metric"),
                    ClickHouseColumnDescriptor("failed_runs", "UInt32", "metric"),
                    ClickHouseColumnDescriptor("runtime_quality_score", "Float32", "metric"),
                    ClickHouseColumnDescriptor("evidence_score", "Float32", "metric"),
                    ClickHouseColumnDescriptor("risk_score", "Float32", "metric"),
                    ClickHouseColumnDescriptor("payload_json", "String", "payload"),
                ),
                partition_by="toYYYYMM(snapshot_time)",
                order_by=("workspace_id", "snapshot_time", "ranking_key"),
                ttl_policy="retain_365_days_default",
            ),
        ),
        policies={
            "status": "This is a schema catalog, not an active database connector.",
            "ownership": "AlphaTrace owns normalized ClickHouse projections. External provider schemas are mapped before persistence.",
            "mysql_boundary": "MySQL remains the config/task-control store and should not become the high-volume analytical event store.",
            "fallback": "JSON/static fallback remains available until ClickHouse migration scripts and smoke tests are implemented.",
        },
    )


__all__ = ["ClickHouseColumnDescriptor", "ClickHouseTableDescriptor", "ClickHouseSchemaCatalog", "get_clickhouse_schema_catalog"]
