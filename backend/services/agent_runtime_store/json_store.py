from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
)
from services.agent_runtime_store.memory_store import MemoryAgentRunStore


class JsonAgentRunStore(MemoryAgentRunStore):
    def __init__(self, path: Path):
        super().__init__()
        self.path = path
        self._last_stream_persist_at: Dict[str, float] = {}
        self._stream_persist_interval_seconds = self._float_env(
            "AGENT_RUN_STREAM_PERSIST_SECONDS",
            default=2.0,
            minimum=0.25,
            maximum=30.0,
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._load()

    def save_run(self, run: AgentRun) -> None:
        super().save_run(run)
        self._persist()

    def update_run_status(self, run_id: str, status: str, timestamp: Optional[str] = None) -> None:
        super().update_run_status(run_id, status, timestamp)
        self._persist()

    def append_event(self, run_id: str, event: AgentRuntimeEvent) -> None:
        super().append_event(run_id, event)
        if self._should_defer_stream_persist(run_id, event):
            return
        self._persist()

    def save_reports(self, run_id: str, reports: List[AgentReport], llm_calls: Optional[int] = None) -> None:
        super().save_reports(run_id, reports, llm_calls)
        self._persist()

    def save_evidence(self, run_id: str, evidence: List[EvidenceReference]) -> None:
        super().save_evidence(run_id, evidence)
        self._persist()

    def save_decision(self, run_id: str, decision: AgentDecision) -> None:
        super().save_decision(run_id, decision)
        self._persist()

    def _should_defer_stream_persist(self, run_id: str, event: AgentRuntimeEvent) -> bool:
        if event.type not in {"reasoning.chunk", "debate.message"}:
            return False
        payload = event.payload or {}
        if payload.get("streaming") is not True:
            return False

        now = time.monotonic()
        last_persist_at = self._last_stream_persist_at.get(run_id, 0.0)
        if now - last_persist_at >= self._stream_persist_interval_seconds:
            self._last_stream_persist_at[run_id] = now
            return False
        return True

    @staticmethod
    def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
        raw = os.getenv(name)
        if raw is None or raw == "":
            return default
        try:
            value = float(raw)
        except ValueError:
            return default
        return min(max(value, minimum), maximum)

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return

        runs = raw.get("runs", {})
        evidence = raw.get("evidence", {})
        with self._lock:
            self._runs = {
                run_id: AgentRun.model_validate(item)
                for run_id, item in runs.items()
                if isinstance(item, dict)
            }
            self._evidence = {
                evidence_id: EvidenceReference.model_validate(item)
                for evidence_id, item in evidence.items()
                if isinstance(item, dict)
            }

    def _persist(self) -> None:
        with self._lock:
            payload: Dict[str, Any] = {
                "runs": {run_id: run.model_dump() for run_id, run in self._runs.items()},
                "evidence": {item_id: item.model_dump() for item_id, item in self._evidence.items()},
            }
            payload_text = json.dumps(payload, ensure_ascii=False, indent=2)
            tmp_path = self.path.with_suffix(f"{self.path.suffix}.{os.getpid()}.{time.time_ns()}.tmp")
            tmp_path.write_text(payload_text, encoding="utf-8")
            last_error: OSError | None = None
            for attempt in range(20):
                try:
                    os.replace(tmp_path, self.path)
                    return
                except OSError as exc:
                    last_error = exc
                    time.sleep(min(0.05 * (attempt + 1), 0.75))

            try:
                self.path.write_text(payload_text, encoding="utf-8")
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass
                return
            except OSError as exc:
                if last_error:
                    raise last_error from exc
                raise
            if last_error:
                raise last_error
