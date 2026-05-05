# AlphaTrace Security and Secret Handling Review

Date: 2026-05-05

Scope: M89 review of API key handling, API responses, frontend payloads, logs, and validation artifacts. This is a review pass, not a security audit certification.

## Checked Runtime APIs

| API | Result |
| --- | --- |
| `GET /api/hyper-ai/profile` | No raw `sk-*` or `Bearer ...` token pattern found in response. |
| `GET /api/hyper-ai/tools` | Returns secret field descriptors and key availability booleans. Does not return raw key values. |
| `GET /api/alpha-trace/agent-runs/runners/status` | Returns readiness/source booleans such as `qwenKeyConfigured` and `qwenConfigSource`. No raw key pattern found. |

Expected public fields:

- `configured`
- `api_key_available`
- `qwenKeyConfigured`
- `qwenConfigSource`
- `bochaConfigured`
- `config_source`
- `enabled`

These are status fields, not secret values.

## Static Scan Method

Used a local scan that prints only file path, line number, and rule name. It intentionally does not print matching line content.

Rules:

- `sk-[A-Za-z0-9]{16,}`
- `Bearer <long token>`
- obvious `api_key = "..."` style assignments

Excluded:

- `.git`
- `node_modules`
- `dist`
- virtualenv directories
- cache directories

## Findings

The scan reported six path/line/rule hits. Manual classification:

| Area | Classification |
| --- | --- |
| `frontend/app/components/layout/SettingsDialog.tsx` | False positive: UI state/field names for API key input. No hardcoded key. |
| `backend/static/assets/index-*.js` | False positive: built frontend/static asset contains API key field names/placeholders. No hardcoded key confirmed by runtime API checks. |
| `docs/engineering/22_tradingagents_poc_runtime_validation.md` | Documentation example/placeholder. Should continue using placeholders only. |

No raw production API key was intentionally printed into this document or validation log.

## Current Secret Flow

1. User enters Qwen/DashScope and Bocha keys in Settings.
2. Frontend sends keys to backend save/validate endpoint.
3. Backend stores config through system config store.
4. Runtime status endpoints expose only readiness/source metadata.
5. Runner code reads secrets server-side.
6. Frontend never receives plaintext saved secrets.

## Required Ongoing Rules

1. Do not print raw keys in `IMPLEMENTATION_LOG.md`, validation docs, shell output, screenshots, or frontend error messages.
2. Do not return saved secrets from `/hyper-ai/profile`, `/hyper-ai/tools`, or runner status APIs.
3. Do not place Bocha/Qwen/DashScope keys in frontend env variables.
4. Error messages may say `missing`, `invalid`, `cannot decrypt`, or `configured`, but must not include token values.
5. If adding new providers, reuse backend-only secret handling and expose only masked/configured status.

## Risks

1. `backend/static/assets/index-*.js` is a generated legacy static bundle and can contain stale UI field names. It should not be treated as canonical AlphaTrace frontend source.
2. Docs can accidentally preserve copied command lines with real secrets. Future validation entries must use `<redacted>` or environment variable names only.
3. Backend logs should continue avoiding request bodies for Settings save endpoints.

## Follow-up Recommendations

1. Add a CI/local validation helper that scans for secret-like patterns and prints path/line/rule only.
2. Consider a `scripts/alphatrace/check_secret_leaks.ps1` helper if secret scan becomes frequent.
3. Keep Settings validation server-side and never expose decrypted key material to the browser.
