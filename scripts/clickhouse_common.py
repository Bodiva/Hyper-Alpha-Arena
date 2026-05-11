from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

try:
    import clickhouse_connect
except ImportError as exc:  # pragma: no cover - exercised by local setup, not app runtime
    raise SystemExit(
        "Missing dependency: clickhouse-connect. Run `cd backend && uv sync` first."
    ) from exc


_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class ClickHouseConfig:
    host: str
    port: int
    username: str
    password: str
    database: str


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


def load_local_env() -> None:
    _load_env_file(_REPO_ROOT / ".env")
    _load_env_file(_REPO_ROOT / "backend" / ".env")


def validate_identifier(value: str, label: str) -> str:
    if not _IDENTIFIER_RE.match(value):
        raise SystemExit(f"Invalid ClickHouse {label}: {value}")
    return value


def get_clickhouse_config() -> ClickHouseConfig:
    load_local_env()

    database = validate_identifier(os.getenv("CLICKHOUSE_DATABASE", "monitor"), "database")
    return ClickHouseConfig(
        host=os.getenv("CLICKHOUSE_HOST", "127.0.0.1"),
        port=int(os.getenv("CLICKHOUSE_PORT", "18123")),
        username=os.getenv("CLICKHOUSE_USER", "admin"),
        password=os.getenv("CLICKHOUSE_PASSWORD", ""),
        database=database,
    )


def get_client(config: ClickHouseConfig, database: str | None = None):
    return clickhouse_connect.get_client(
        host=config.host,
        port=config.port,
        username=config.username,
        password=config.password,
        database=database,
    )


def print_connection_target(config: ClickHouseConfig) -> None:
    print(
        f"ClickHouse target: http://{config.host}:{config.port}, "
        f"user={config.username}, database={config.database}"
    )


def exit_with_clickhouse_error(exc: Exception) -> None:
    print(f"ClickHouse command failed: {exc}")
    print(
        "If this is the remote ECS ClickHouse instance, check that the SSH tunnel is running: "
        "ssh -N -L 18123:127.0.0.1:18123 root@120.27.194.30"
    )
    print(
        "If the tunnel port is open but HTTP ends prematurely, verify that ClickHouse listens on "
        "the container network interface instead of only 127.0.0.1 inside the container."
    )
    raise SystemExit(1)
