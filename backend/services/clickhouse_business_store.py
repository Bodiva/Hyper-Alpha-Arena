from __future__ import annotations

import os
import re
import json
from dataclasses import dataclass
from typing import Any, Optional

import requests


_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ClickHouseStoreError(RuntimeError):
    pass


def _validate_identifier(value: str) -> str:
    if not _IDENTIFIER_RE.match(value):
        raise ClickHouseStoreError(f"Invalid ClickHouse identifier: {value}")
    return value


def _split_table_name(table_name: str) -> tuple[str, str]:
    parts = [part.strip() for part in table_name.split(".") if part.strip()]
    if len(parts) == 1:
        return "default", _validate_identifier(parts[0])
    if len(parts) == 2:
        return _validate_identifier(parts[0]), _validate_identifier(parts[1])
    raise ClickHouseStoreError(f"Invalid ClickHouse table name: {table_name}")


def _escape_sql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


@dataclass(frozen=True)
class ClickHouseBusinessStore:
    url: str
    user: Optional[str] = None
    password: Optional[str] = None
    timeout_seconds: int = 30

    def _auth(self) -> Optional[tuple[str, str]]:
        if not self.user:
            return None
        return (self.user, self.password or "")

    def execute(self, query: str) -> str:
        try:
            response = requests.post(
                self.url,
                data=query.encode("utf-8"),
                auth=self._auth(),
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            detail = getattr(exc.response, "text", "") if getattr(exc, "response", None) is not None else ""
            raise ClickHouseStoreError(f"ClickHouse query failed: {exc} {detail}".strip()) from exc

    def query_json(self, query: str) -> dict[str, Any]:
        text = self.execute(query)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ClickHouseStoreError(f"ClickHouse returned invalid JSON: {text[:200]}") from exc
        if not isinstance(payload, dict):
            raise ClickHouseStoreError("ClickHouse returned a non-object JSON payload.")
        return payload

    def insert_json_each_row(self, table_name: str, json_lines: str) -> None:
        database, table = _split_table_name(table_name)
        query = f"INSERT INTO `{database}`.`{table}` FORMAT JSONEachRow"
        try:
            response = requests.post(
                self.url,
                params={"query": query},
                data=json_lines.encode("utf-8"),
                auth=self._auth(),
                timeout=max(self.timeout_seconds, 60),
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            detail = getattr(exc.response, "text", "") if getattr(exc, "response", None) is not None else ""
            raise ClickHouseStoreError(f"ClickHouse insert failed: {exc} {detail}".strip()) from exc

    def ensure_etf_import_table(self, table_name: str) -> str:
        database, table = _split_table_name(table_name)
        self.execute(f"CREATE DATABASE IF NOT EXISTS `{database}`")
        self.execute(
            f"""
            CREATE TABLE IF NOT EXISTS `{database}`.`{table}`
            (
                import_id String,
                source_name LowCardinality(String),
                file_name String,
                file_sha256 FixedString(64),
                row_number UInt64,
                index_code String,
                index_name String,
                trade_date Nullable(Date),
                close_price Nullable(Float64),
                pe_etf_weighted Nullable(Float64),
                pe_market_cap_weighted Nullable(Float64),
                pe_equal_weighted Nullable(Float64),
                pb_etf_weighted Nullable(Float64),
                pb_market_cap_weighted Nullable(Float64),
                pb_equal_weighted Nullable(Float64),
                dividend_yield_pct Nullable(Float64),
                roe_pct Nullable(Float64),
                ps Nullable(Float64),
                constituent_avg_rolling_net_profit_100m Nullable(Float64),
                constituent_avg_market_cap_100m Nullable(Float64),
                index_total_float_market_cap_100m Nullable(Float64),
                index_total_market_cap_100m Nullable(Float64),
                data_category LowCardinality(String),
                imported_at DateTime64(3, 'UTC')
            )
            ENGINE = MergeTree
            ORDER BY (source_name, index_code, coalesce(trade_date, toDate('1970-01-01')), import_id, row_number)
            SETTINGS index_granularity = 8192
            """
        )
        return f"{database}.{table}"

    def ensure_agent_runtime_projection_tables(self, database_name: str = "alpha_trace") -> dict[str, str]:
        database = _validate_identifier(database_name)
        self.execute(f"CREATE DATABASE IF NOT EXISTS `{database}`")
        table_ddls = {
            "alpha_trace_runtime_events": """
                (
                    workspace_id String,
                    run_id String,
                    runner_type LowCardinality(String),
                    task_type LowCardinality(String),
                    event_time DateTime64(3, 'UTC'),
                    sequence UInt64,
                    event_type LowCardinality(String),
                    agent_name LowCardinality(String),
                    step_id LowCardinality(String),
                    payload_json String
                )
                ENGINE = MergeTree
                PARTITION BY toYYYYMM(event_time)
                ORDER BY (workspace_id, run_id, sequence)
            """,
            "alpha_trace_agent_reports": """
                (
                    workspace_id String,
                    run_id String,
                    runner_type LowCardinality(String),
                    task_type LowCardinality(String),
                    event_time DateTime64(3, 'UTC'),
                    report_id String,
                    report_type LowCardinality(String),
                    title String,
                    content String,
                    payload_json String
                )
                ENGINE = MergeTree
                PARTITION BY toYYYYMM(event_time)
                ORDER BY (workspace_id, run_id, report_type, report_id)
            """,
            "alpha_trace_evidence_refs": """
                (
                    workspace_id String,
                    run_id String,
                    runner_type LowCardinality(String),
                    task_type LowCardinality(String),
                    event_time DateTime64(3, 'UTC'),
                    evidence_id String,
                    source_type LowCardinality(String),
                    evidence_type LowCardinality(String),
                    asset_ids Array(String),
                    source_url String,
                    quality_score Float32,
                    summary String,
                    payload_json String
                )
                ENGINE = MergeTree
                PARTITION BY toYYYYMM(event_time)
                ORDER BY (workspace_id, source_type, evidence_id, run_id)
            """,
            "alpha_trace_decisions": """
                (
                    workspace_id String,
                    run_id String,
                    runner_type LowCardinality(String),
                    task_type LowCardinality(String),
                    event_time DateTime64(3, 'UTC'),
                    decision_id String,
                    action LowCardinality(String),
                    confidence Float32,
                    horizon LowCardinality(String),
                    evidence_ids Array(String),
                    payload_json String
                )
                ENGINE = MergeTree
                PARTITION BY toYYYYMM(event_time)
                ORDER BY (workspace_id, run_id, decision_id)
            """,
        }
        for table_name, ddl in table_ddls.items():
            table = _validate_identifier(table_name)
            self.execute(f"CREATE TABLE IF NOT EXISTS `{database}`.`{table}` {ddl}")
        return {table_name: f"{database}.{table_name}" for table_name in table_ddls}

    def delete_run_projection_rows(self, table_name: str, run_id: str) -> None:
        database, table = _split_table_name(table_name)
        safe_run_id = _escape_sql_string(run_id)
        self.execute(f"ALTER TABLE `{database}`.`{table}` DELETE WHERE run_id = '{safe_run_id}'")


def get_clickhouse_business_store() -> ClickHouseBusinessStore:
    configured_url = os.getenv("ALPHA_TRACE_CLICKHOUSE_URL")
    if configured_url:
        url = configured_url.rstrip("/")
    elif os.getenv("CLICKHOUSE_HOST") or os.getenv("CLICKHOUSE_PORT"):
        host = os.getenv("CLICKHOUSE_HOST", "127.0.0.1").strip() or "127.0.0.1"
        port = os.getenv("CLICKHOUSE_PORT", "18123").strip() or "18123"
        url = f"http://{host}:{port}"
    else:
        url = "http://clickhouse:8123"

    return ClickHouseBusinessStore(
        url=url,
        user=(os.getenv("ALPHA_TRACE_CLICKHOUSE_USER") or os.getenv("CLICKHOUSE_USER") or "").strip() or None,
        password=os.getenv("ALPHA_TRACE_CLICKHOUSE_PASSWORD") or os.getenv("CLICKHOUSE_PASSWORD"),
        timeout_seconds=int(os.getenv("ALPHA_TRACE_CLICKHOUSE_TIMEOUT_SECONDS", "30")),
    )


def get_etf_import_table_name() -> str:
    return (
        os.getenv("ALPHA_TRACE_ETF_INDEX_VALUATION_TABLE")
        or os.getenv("ALPHA_TRACE_ETF_IMPORT_TABLE")
        or "alpha_trace.etf_index_valuation_daily"
    )


def get_agent_runtime_clickhouse_database() -> str:
    return os.getenv("ALPHA_TRACE_AGENT_RUNTIME_CLICKHOUSE_DATABASE", "alpha_trace").strip() or "alpha_trace"


__all__ = [
    "ClickHouseBusinessStore",
    "ClickHouseStoreError",
    "get_agent_runtime_clickhouse_database",
    "get_clickhouse_business_store",
    "get_etf_import_table_name",
]
