# AlphaTrace MVP Quickstart

## Start Backend + Docker Frontend

```powershell
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena
docker compose up -d
```

Open:

```text
http://127.0.0.1:8802/dashboard#dashboard
```

## Start Vite Frontend in Real Mode

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="http://127.0.0.1:8802/api"
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\frontend
pnpm dev
```

Open the printed Vite URL, for example:

```text
http://127.0.0.1:8804/dashboard#agent-lab
```

## Demo Path

Use `docs/demo/alphatrace_demo_script.md` and `docs/demo/alphatrace_demo_checklist.md`.

## Boundaries

- No TradingAgents execution.
- No external search or live market data.
- No real trading.
- JSON store persistence only.
