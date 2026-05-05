from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


_PROCESS_REGISTRY: Dict[str, subprocess.Popen] = {}
_PROCESS_REGISTRY_LOCK = threading.Lock()


@dataclass(frozen=True)
class SubprocessWorkerSpec:
    run_id: str
    command: List[str]
    work_dir: Path
    cwd: Path
    env: Dict[str, str]
    timeout_seconds: int


@dataclass(frozen=True)
class SubprocessWorkerArtifacts:
    work_dir: Path
    events_path: Path
    result_path: Path
    stdout_path: Path
    stderr_path: Path


class SubprocessOrchestrator:
    """Small process boundary for long-running agent runners.

    This is intentionally minimal: it starts one subprocess, tails JSONL runtime
    events, enforces a wall-clock timeout, and returns result.json to callbacks.
    It does not implement a durable queue or a production worker pool yet.
    """

    def start(
        self,
        spec: SubprocessWorkerSpec,
        on_event: Callable[[Dict[str, Any]], None],
        on_result: Callable[[Dict[str, Any], SubprocessWorkerArtifacts], None],
        on_timeout: Callable[[SubprocessWorkerArtifacts], None],
        on_error: Callable[[str, SubprocessWorkerArtifacts], None],
    ) -> SubprocessWorkerArtifacts:
        spec.work_dir.mkdir(parents=True, exist_ok=True)
        artifacts = SubprocessWorkerArtifacts(
            work_dir=spec.work_dir,
            events_path=spec.work_dir / "events.jsonl",
            result_path=spec.work_dir / "result.json",
            stdout_path=spec.work_dir / "stdout.log",
            stderr_path=spec.work_dir / "stderr.log",
        )
        for path in [artifacts.events_path, artifacts.result_path, artifacts.stdout_path, artifacts.stderr_path]:
            if path.exists():
                path.unlink()

        stdout_handle = artifacts.stdout_path.open("ab")
        stderr_handle = artifacts.stderr_path.open("ab")
        try:
            process = subprocess.Popen(
                spec.command,
                cwd=str(spec.cwd),
                env={**os.environ, **spec.env},
                stdout=stdout_handle,
                stderr=stderr_handle,
            )
        except Exception:
            stdout_handle.close()
            stderr_handle.close()
            raise
        with _PROCESS_REGISTRY_LOCK:
            _PROCESS_REGISTRY[spec.run_id] = process

        monitor = threading.Thread(
            target=self._monitor,
            args=(process, spec, artifacts, stdout_handle, stderr_handle, on_event, on_result, on_timeout, on_error),
            name=f"alphatrace-worker-monitor-{spec.run_id}",
            daemon=True,
        )
        monitor.start()
        return artifacts

    def _monitor(
        self,
        process: subprocess.Popen,
        spec: SubprocessWorkerSpec,
        artifacts: SubprocessWorkerArtifacts,
        stdout_handle,
        stderr_handle,
        on_event: Callable[[Dict[str, Any]], None],
        on_result: Callable[[Dict[str, Any], SubprocessWorkerArtifacts], None],
        on_timeout: Callable[[SubprocessWorkerArtifacts], None],
        on_error: Callable[[str, SubprocessWorkerArtifacts], None],
    ) -> None:
        start_time = time.monotonic()
        event_offset = 0
        timed_out = False
        try:
            while True:
                event_offset = self._drain_events(artifacts.events_path, event_offset, on_event)
                if process.poll() is not None:
                    break
                if time.monotonic() - start_time > spec.timeout_seconds:
                    timed_out = True
                    process.kill()
                    break
                time.sleep(0.5)

            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            event_offset = self._drain_events(artifacts.events_path, event_offset, on_event)
        finally:
            with _PROCESS_REGISTRY_LOCK:
                registered = _PROCESS_REGISTRY.get(spec.run_id)
                if registered is process:
                    _PROCESS_REGISTRY.pop(spec.run_id, None)
            stdout_handle.close()
            stderr_handle.close()

        if timed_out:
            on_timeout(artifacts)
            return

        if artifacts.result_path.exists():
            try:
                result = json.loads(artifacts.result_path.read_text(encoding="utf-8"))
            except Exception as exc:
                on_error(f"Worker result.json could not be parsed: {exc}", artifacts)
                return
            on_result(result, artifacts)
            return

        exit_code = process.returncode
        stderr_tail = self._tail_text(artifacts.stderr_path, max_chars=2000)
        on_error(f"Worker exited with code {exit_code} without result.json. {stderr_tail}".strip(), artifacts)

    @staticmethod
    def _drain_events(
        events_path: Path,
        offset: int,
        on_event: Callable[[Dict[str, Any]], None],
    ) -> int:
        if not events_path.exists():
            return offset
        with events_path.open("rb") as handle:
            handle.seek(offset)
            for raw_line in handle:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    on_event(json.loads(line))
                except Exception:
                    # A malformed worker event must not kill the monitor.
                    continue
            return handle.tell()

    @staticmethod
    def _tail_text(path: Path, max_chars: int = 2000) -> str:
        if not path.exists():
            return ""
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[-max_chars:]


def cancel_subprocess_worker(run_id: str) -> Dict[str, Any]:
    """Best-effort cancellation for an active worker process in this backend process."""

    with _PROCESS_REGISTRY_LOCK:
        process = _PROCESS_REGISTRY.get(run_id)

    if process is None:
        return {"found": False, "terminated": False, "message": "No active subprocess worker is registered for this run."}

    if process.poll() is not None:
        with _PROCESS_REGISTRY_LOCK:
            _PROCESS_REGISTRY.pop(run_id, None)
        return {
            "found": True,
            "terminated": False,
            "exitCode": process.returncode,
            "message": "Subprocess worker already exited.",
        }

    try:
        process.kill()
        return {"found": True, "terminated": True, "message": "Subprocess worker kill signal sent."}
    except Exception as exc:
        return {"found": True, "terminated": False, "message": f"Failed to terminate subprocess worker: {exc}"}


def get_subprocess_worker_registry_snapshot() -> Dict[str, Any]:
    """Return current-process worker registry state for diagnostics."""

    with _PROCESS_REGISTRY_LOCK:
        items = list(_PROCESS_REGISTRY.items())

    workers = []
    for run_id, process in items:
        return_code = process.poll()
        workers.append(
            {
                "runId": run_id,
                "pid": process.pid,
                "running": return_code is None,
                "returnCode": return_code,
            }
        )
    return {
        "workerType": "subprocess",
        "activeCount": sum(1 for item in workers if item["running"]),
        "registeredCount": len(workers),
        "workers": workers,
    }
