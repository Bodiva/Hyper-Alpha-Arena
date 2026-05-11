from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from services.clickhouse_agent_run_projection import AgentRunClickHouseProjection
from services.clickhouse_business_store import (
    ClickHouseBusinessStore,
    get_agent_runtime_clickhouse_database,
    get_clickhouse_business_store,
)


def _json_default(value: Any) -> str:
    return str(value)


@dataclass(frozen=True)
class AgentRunClickHouseWriteResult:
    run_id: str
    database: str
    replace_existing: bool
    tables_written: dict[str, int]

    @property
    def total_rows_written(self) -> int:
        return sum(self.tables_written.values())

    def to_response(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "database": self.database,
            "replaceExisting": self.replace_existing,
            "tablesWritten": self.tables_written,
            "totalRowsWritten": self.total_rows_written,
            "message": (
                "AgentRun analytical projection was written to ClickHouse. "
                "MySQL/JSON remain the control-plane stores; ClickHouse is the analytical projection target."
            ),
        }


def _json_each_row(rows: list[dict[str, Any]]) -> str:
    return "\n".join(json.dumps(row, ensure_ascii=False, default=_json_default, separators=(",", ":")) for row in rows)


def write_agent_run_clickhouse_projection(
    projection: AgentRunClickHouseProjection,
    *,
    replace_existing: bool = True,
    database: str | None = None,
    store: ClickHouseBusinessStore | None = None,
) -> AgentRunClickHouseWriteResult:
    """Write a side-effect-free AgentRun projection into ClickHouse.

    The projection is built from AlphaTrace product schemas. This writer does
    not change the AgentRun control-plane store and does not make ClickHouse a
    task queue. Re-running with ``replace_existing=True`` removes rows for the
    same run id before inserting the fresh projection.
    """

    clickhouse_store = store or get_clickhouse_business_store()
    target_database = database or get_agent_runtime_clickhouse_database()
    table_names = clickhouse_store.ensure_agent_runtime_projection_tables(target_database)

    tables_written: dict[str, int] = {}
    for table in projection.tables:
        target_table = table_names.get(table.table_name, f"{target_database}.{table.table_name}")
        if replace_existing:
            clickhouse_store.delete_run_projection_rows(target_table, projection.run_id)
        if table.rows:
            clickhouse_store.insert_json_each_row(target_table, _json_each_row(table.rows))
        tables_written[target_table] = len(table.rows)

    return AgentRunClickHouseWriteResult(
        run_id=projection.run_id,
        database=target_database,
        replace_existing=replace_existing,
        tables_written=tables_written,
    )


__all__ = [
    "AgentRunClickHouseWriteResult",
    "write_agent_run_clickhouse_projection",
]
