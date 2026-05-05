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


def get_clickhouse_business_store() -> ClickHouseBusinessStore:
    return ClickHouseBusinessStore(
        url=os.getenv("ALPHA_TRACE_CLICKHOUSE_URL", "http://clickhouse:8123").rstrip("/"),
        user=(os.getenv("ALPHA_TRACE_CLICKHOUSE_USER") or "").strip() or None,
        password=os.getenv("ALPHA_TRACE_CLICKHOUSE_PASSWORD"),
        timeout_seconds=int(os.getenv("ALPHA_TRACE_CLICKHOUSE_TIMEOUT_SECONDS", "30")),
    )


def get_etf_import_table_name() -> str:
    return (
        os.getenv("ALPHA_TRACE_ETF_INDEX_VALUATION_TABLE")
        or os.getenv("ALPHA_TRACE_ETF_IMPORT_TABLE")
        or "alpha_trace.etf_index_valuation_daily"
    )


__all__ = [
    "ClickHouseBusinessStore",
    "ClickHouseStoreError",
    "get_clickhouse_business_store",
    "get_etf_import_table_name",
]
