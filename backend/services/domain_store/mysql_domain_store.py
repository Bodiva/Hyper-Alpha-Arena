from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, create_engine, insert, select, update
from sqlalchemy.engine import Engine

from services.agent_runtime_store.mysql_store import _json_payload


def get_domain_store_type() -> str:
    return os.getenv("ALPHA_TRACE_DOMAIN_STORE", "static").strip().lower()


def get_mysql_domain_database_url() -> str:
    default_host = "mysql" if Path("/.dockerenv").exists() else "localhost"
    default_port = "3306" if default_host == "mysql" else os.getenv("ALPHA_TRACE_MYSQL_PORT", "23307")
    default_url = f"mysql+pymysql://alpha_user:alpha_pass@{default_host}:{default_port}/alpha_trace?charset=utf8mb4"
    return os.getenv(
        "ALPHA_TRACE_MYSQL_DATABASE_URL",
        os.getenv(
            "MYSQL_DATABASE_URL",
            default_url,
        ),
    )


class MysqlDomainStore:
    """Small MySQL JSON store for AlphaTrace domain seed objects.

    The first MySQL milestone keeps domain payloads as JSON while exposing stable
    helper columns for filtering and future generated-column indexing.
    """

    def __init__(self, database_url: Optional[str] = None) -> None:
        self.database_url = database_url or get_mysql_domain_database_url()
        self.engine: Engine = create_engine(self.database_url, pool_pre_ping=True, pool_recycle=1800)
        self.metadata = MetaData()
        self.assets = Table(
            "alpha_trace_assets",
            self.metadata,
            Column("asset_id", String(128), primary_key=True),
            Column("symbol", String(64), nullable=True, index=True),
            Column("name", String(255), nullable=True),
            Column("asset_type", String(64), nullable=True, index=True),
            Column("market", String(64), nullable=True, index=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.evidence_items = Table(
            "alpha_trace_evidence_items",
            self.metadata,
            Column("evidence_id", String(160), primary_key=True),
            Column("source_type", String(96), nullable=True, index=True),
            Column("evidence_type", String(96), nullable=True, index=True),
            Column("quality_score", Integer, nullable=True, index=True),
            Column("published_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.strategies = Table(
            "alpha_trace_strategies",
            self.metadata,
            Column("strategy_id", String(160), primary_key=True),
            Column("strategy_type", String(96), nullable=True, index=True),
            Column("style", String(96), nullable=True, index=True),
            Column("status", String(64), nullable=True, index=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.portfolios = Table(
            "alpha_trace_portfolios",
            self.metadata,
            Column("portfolio_id", String(160), primary_key=True),
            Column("risk_level", String(64), nullable=True, index=True),
            Column("objective", String(255), nullable=True),
            Column("status", String(64), nullable=True, index=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.data_sources = Table(
            "alpha_trace_data_sources",
            self.metadata,
            Column("data_source_id", String(160), primary_key=True),
            Column("source_type", String(96), nullable=True, index=True),
            Column("status", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.metadata.create_all(self.engine)

    def seed_if_empty(
        self,
        table: Table,
        id_column: str,
        items: Iterable[Dict[str, Any]],
        map_columns: Callable[[Dict[str, Any]], Dict[str, Any]],
    ) -> None:
        with self.engine.begin() as conn:
            existing = conn.execute(select(table.c[id_column]).limit(1)).first()
            if existing:
                return
            for item in items:
                conn.execute(insert(table).values(**map_columns(item), payload_json=item))

    def fetch_all(self, table: Table) -> List[Dict[str, Any]]:
        with self.engine.begin() as conn:
            rows = conn.execute(select(table.c.payload_json)).fetchall()
        return [_json_payload(row.payload_json) for row in rows]

    def fetch_one(self, table: Table, column_name: str, value: str) -> Optional[Dict[str, Any]]:
        with self.engine.begin() as conn:
            row = conn.execute(select(table.c.payload_json).where(table.c[column_name] == value)).first()
        return _json_payload(row.payload_json) if row else None

    def upsert_payload(
        self,
        table: Table,
        keys: Dict[str, Any],
        values: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> None:
        where_clause = None
        for column_name, column_value in keys.items():
            clause = table.c[column_name] == column_value
            where_clause = clause if where_clause is None else where_clause & clause
        with self.engine.begin() as conn:
            existing = conn.execute(select(table).where(where_clause)).first()
            if existing:
                conn.execute(update(table).where(where_clause).values(**values, payload_json=payload))
            else:
                conn.execute(insert(table).values(**keys, **values, payload_json=payload))


_DOMAIN_STORE: Optional[MysqlDomainStore] = None


def get_mysql_domain_store() -> MysqlDomainStore:
    global _DOMAIN_STORE
    if _DOMAIN_STORE is None:
        _DOMAIN_STORE = MysqlDomainStore()
    return _DOMAIN_STORE
