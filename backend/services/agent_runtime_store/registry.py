from __future__ import annotations

import os
from pathlib import Path

from services.agent_runtime_store.base import AgentRunStore
from services.agent_runtime_store.json_store import JsonAgentRunStore
from services.agent_runtime_store.memory_store import MemoryAgentRunStore
from services.agent_runtime_store.mysql_store import MysqlAgentRunStore


def _default_json_path() -> Path:
    backend_dir = Path(__file__).resolve().parents[2]
    return backend_dir / "runtime_data" / "alpha_trace_agent_runs.json"


def get_agent_run_store() -> AgentRunStore:
    store_type = (os.getenv("ALPHA_TRACE_AGENT_RUN_STORE") or "mysql").strip().lower()
    if store_type == "memory":
        return MemoryAgentRunStore()
    if store_type == "json":
        raw_path = os.getenv("ALPHA_TRACE_AGENT_RUN_STORE_PATH")
        path = Path(raw_path) if raw_path else _default_json_path()
        if not path.is_absolute():
            path = Path.cwd() / path
        return JsonAgentRunStore(path)
    if store_type in {"mysql", "db"}:
        return MysqlAgentRunStore()
    raise ValueError(f"Unsupported ALPHA_TRACE_AGENT_RUN_STORE: {store_type}")
