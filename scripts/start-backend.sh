#!/usr/bin/env sh
set -eu

APP_ROOT="${APP_ROOT:-/app}"
BACKEND_DIR="${BACKEND_DIR:-$APP_ROOT/backend}"
APP_DATA_DIR="${APP_DATA_DIR:-$APP_ROOT/data}"
APP_LOG_DIR="${APP_LOG_DIR:-$APP_ROOT/logs}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8802}"
UVICORN_RELOAD="${UVICORN_RELOAD:-false}"
UVICORN_WORKERS="${UVICORN_WORKERS:-}"
LOG_PATH="${ALPHATRACE_BACKEND_LOG_PATH:-$APP_LOG_DIR/backend-runtime.log}"

export ALPHA_TRACE_MYSQL_DATABASE_URL="${ALPHA_TRACE_MYSQL_DATABASE_URL:-mysql+pymysql://alpha_user:alpha_pass@mysql:3306/alpha_trace?charset=utf8mb4}"
export ALPHA_TRACE_CLICKHOUSE_URL="${ALPHA_TRACE_CLICKHOUSE_URL:-http://clickhouse:8123}"
export ALPHA_TRACE_CLICKHOUSE_USER="${ALPHA_TRACE_CLICKHOUSE_USER:-alpha_user}"
export ALPHA_TRACE_CLICKHOUSE_PASSWORD="${ALPHA_TRACE_CLICKHOUSE_PASSWORD:-alpha_pass}"
export ALPHATRACE_BACKEND_LOG_PATH="$LOG_PATH"

ALPHATRACE_PROFILE="$(printf '%s' "${ALPHATRACE_BACKEND_PROFILE:-}" | tr '[:upper:]' '[:lower:]')"
DOMAIN_STORE="$(printf '%s' "${ALPHA_TRACE_DOMAIN_STORE:-}" | tr '[:upper:]' '[:lower:]')"
if [ "$ALPHATRACE_PROFILE" = "alphatrace" ] || [ "$ALPHATRACE_PROFILE" = "alphatrace-only" ] || [ "$DOMAIN_STORE" = "mysql" ]; then
  RUN_DB_INIT="${RUN_DB_INIT:-false}"
  export DATABASE_URL="${DATABASE_URL:-$ALPHA_TRACE_MYSQL_DATABASE_URL}"
  if [ -z "${SNAPSHOT_DATABASE_URL+x}" ]; then
    unset SNAPSHOT_DATABASE_URL
  fi
else
  RUN_DB_INIT="${RUN_DB_INIT:-true}"
  export DATABASE_URL="${DATABASE_URL:-postgresql://alpha_user:alpha_pass@postgres:5432/alpha_arena}"
  export SNAPSHOT_DATABASE_URL="${SNAPSHOT_DATABASE_URL:-postgresql://alpha_user:alpha_pass@postgres:5432/alpha_snapshots}"
fi

mkdir -p "$APP_DATA_DIR" "$APP_LOG_DIR"
: > "$LOG_PATH"

if [ -z "${HYPERLIQUID_ENCRYPTION_KEY:-}" ]; then
  if [ ! -f "$APP_DATA_DIR/.encryption_key" ]; then
    python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())' > "$APP_DATA_DIR/.encryption_key"
  fi
  export HYPERLIQUID_ENCRYPTION_KEY="$(cat "$APP_DATA_DIR/.encryption_key")"
fi

cd "$BACKEND_DIR"

if [ "$RUN_DB_INIT" != "false" ]; then
  python -m database.init_postgresql || true
  python database/init_hyperliquid_tables.py || true
  python database/init_snapshot_db.py || true
  python database/migration_manager.py || true
fi

set -- python -m uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
if [ "$UVICORN_RELOAD" = "true" ]; then
  set -- "$@" --reload
fi
if [ -n "$UVICORN_WORKERS" ]; then
  set -- "$@" --workers "$UVICORN_WORKERS"
fi

"$@" 2>&1 | tee -a "$LOG_PATH"
