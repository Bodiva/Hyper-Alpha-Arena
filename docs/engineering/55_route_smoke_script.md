# AlphaTrace Route Smoke Script

Date: 2026-05-05

## Purpose

M106 adds a repeatable frontend route smoke script so page shell availability can be checked without manually opening every hash route.

Script:

```powershell
scripts/alphatrace/run_route_smoke.ps1
```

## Usage

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/alphatrace/run_route_smoke.ps1 `
  -BaseUrl http://127.0.0.1:8805 `
  -FailOnError
```

## Covered Routes

- `/dashboard#dashboard`
- `/dashboard#assets`
- `/dashboard#assets/asset_etf_510300`
- `/dashboard#evidence`
- `/dashboard#agent-lab`
- `/dashboard#agent-lab/runs/run_native_20260505_021040_004774` best-effort latest known run
- `/dashboard#portfolio`
- `/dashboard#decision-attribution`
- `/dashboard#decisions` alias
- `/dashboard#leaderboard`
- `/dashboard#data-sources`
- `/dashboard#settings`

## Validation Result

Against `http://127.0.0.1:8805`:

- route smoke: 12/12 checks passed
- runtime API smoke: 14/14 checks passed

## Limitation

The script verifies that the Vite app shell is served for each route. It does not execute browser JavaScript or assert component-level rendering. Browser-level smoke can be added later if needed.
