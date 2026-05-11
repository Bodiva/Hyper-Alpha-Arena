# Local Startup Scripts

Use `start-dev.ps1` to start the local development stack with configurable ports and runtime logs.

```powershell
.\scripts\start-dev.ps1 -StartDockerDeps
```

Common variants:

```powershell
.\scripts\start-dev.ps1 -SkipFrontend
.\scripts\start-dev.ps1 -BackendPort 20082 -FrontendPort 20080
.\scripts\start-dev.ps1 -StartDockerDeps -RecreateDockerDeps
.\scripts\start-dev.ps1 -UseStaticFrontend -StartDockerDeps
.\scripts\stop-dev.ps1
```

Defaults:

- Backend: `http://127.0.0.1:20082`
- Frontend: `http://localhost:20080/dashboard#research/assistant-lab`
- Runtime logs and pid files: `.codex-run/`

The script loads `.env` when present, keeps shell environment variables higher priority, accepts `BACKEND_PORT` / `FRONTEND_PORT`, and rewrites the repository's Docker service-host defaults to localhost values for local development.
The default host ports for local dependencies are also moved above `20000`: Postgres `25532`, MySQL `23307`, ClickHouse HTTP `28123`, ClickHouse native `29000`.

For container images, `start-backend.sh` is the backend entrypoint used by the Dockerfile:

```sh
BACKEND_PORT=8802 RUN_DB_INIT=true /app/scripts/start-backend.sh
```

Useful container variables: `BACKEND_HOST`, `BACKEND_PORT`, `RUN_DB_INIT`, `UVICORN_RELOAD`, `UVICORN_WORKERS`, `APP_DATA_DIR`, `APP_LOG_DIR`, `DATABASE_URL`, `SNAPSHOT_DATABASE_URL`, `ALPHA_TRACE_MYSQL_DATABASE_URL`, `ALPHA_TRACE_CLICKHOUSE_URL`.

OpenClaw bridge adapter:

```powershell
cd backend
uv run python ../scripts/openclaw_hyperalpha_bridge.py
```

See `docs/openclaw-hyperalpha-bridge.md` for ECS testing and reverse tunnel setup.

ClickHouse tunnel smoke scripts:

```powershell
pnpm clickhouse:tunnel
pnpm clickhouse:init
pnpm clickhouse:insert-test
pnpm clickhouse:query-test
```

They read `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, and `CLICKHOUSE_DATABASE` from the shell or `.env`. Start the SSH tunnel first when validating the remote ECS ClickHouse instance.
