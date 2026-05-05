# AlphaTrace Startup Guide

Date: 2026-05-04

## Docker Mode

```powershell
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena
docker compose up -d
curl http://127.0.0.1:8802/api/health
```

Open:

```text
http://127.0.0.1:8802/dashboard#dashboard
```

## Vite Real Mode

Backend remains Docker at `8802`; frontend runs on Vite.

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="/api"
$env:VITE_ALPHA_TRACE_API_PROXY_TARGET="http://127.0.0.1:8802/api"
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena
pnpm --dir frontend dev --host 127.0.0.1 --port 8805
```

Open:

```text
http://127.0.0.1:8805/dashboard#dashboard
```

Current port map:

| Port | Role | Current use |
| --- | --- | --- |
| `8802` | Docker FastAPI backend and Docker-served dashboard | Canonical backend API at `http://127.0.0.1:8802/api`. |
| `8805` | Vite real-mode frontend | Current preferred local UI. It proxies same-origin `/api` to `8802`. |
| `8804` | Older Vite real-mode frontend | Historical/manual dev port. Do not assume it is current unless started explicitly. |

The `VITE_ALPHA_TRACE_API_PROXY_TARGET` value is required when using same-origin `/api` on Vite. Without it, the dashboard can load while `/api/*` requests return Vite proxy `500` errors.

## Configure Qwen

Preferred:
- Open `/dashboard#settings`.
- Use Runtime Credentials.
- Save provider/model/base URL/API key.

Fallback environment:

```powershell
$env:DASHSCOPE_API_KEY="..."
$env:QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:QWEN_MODEL="qwen-plus"
```

## Configure Bocha

Preferred:
- Open `/dashboard#settings`.
- Use Runtime Credentials.
- Save Bocha API key.

Fallback environment:

```powershell
$env:BOCHA_API_KEY="..."
$env:BOCHA_BASE_URL="https://api.bocha.cn"
$env:BOCHA_SEARCH_ENDPOINT="/v1/web-search"
```

## Common Issues

### Docker daemon is not running

Symptom:
- `docker compose up` fails before starting containers.

Fix:
- Start Docker Desktop.
- Re-run `docker compose up -d`.

### Vite page does not open on 8805

Symptom:
- Browser cannot access `http://127.0.0.1:8805/dashboard#...`.

Fix:
- Confirm `pnpm --dir frontend dev --host 127.0.0.1 --port 8805` is running.
- Confirm backend `http://127.0.0.1:8802/api/health` returns HTTP 200.
- Confirm `VITE_ALPHA_TRACE_API_BASE_URL=/api`.
- Confirm `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`.

### Vite page opens but API returns 500

Symptom:
- `http://127.0.0.1:8805/dashboard#settings` opens.
- `http://127.0.0.1:8805/api/health` returns HTTP 500.

Cause:
- Vite was started without the correct proxy target.

Fix:
- Stop the current `8805` Vite process.
- Restart with:

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="/api"
$env:VITE_ALPHA_TRACE_API_PROXY_TARGET="http://127.0.0.1:8802/api"
pnpm --dir frontend dev --host 127.0.0.1 --port 8805
```

### Splash / startup progress appears

The original Hyper-Alpha-Arena app has a global startup gate for legacy pages. AlphaTrace dashboard routes bypass the blocking splash where safe, but legacy pages may still show it. This is intentional for compatibility.

### Qwen key missing

Symptom:
- Submit Qwen Agent Task fails with missing Qwen config.

Fix:
- Save Qwen config in `/dashboard#settings`.
- Or set backend `DASHSCOPE_API_KEY` and restart app.

### Bocha disabled

Symptom:
- Run completes but evidence only comes from static seed.

Fix:
- Save Bocha key in `/dashboard#settings`.
- Or set backend `BOCHA_API_KEY` and restart app.

### Clear JSON store

Docker volume path:

```text
/app/data/alpha_trace_agent_runs.json
```

To clear everything in Docker volumes:

```powershell
docker compose down -v
```

Warning: this deletes persisted AlphaTrace runs and other named volume data.
