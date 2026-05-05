# Bocha Search Adapter

Date: 2026-05-01

## Status

Task 39.5 is implemented using the Bocha Web Search API contract supplied by the user after the Feishu documentation could not be fetched from the current environment.

The adapter is optional and fail-open:

- If `BOCHA_API_KEY` is missing, Bocha search is marked `disabled` and AlphaTrace falls back to static evidence seed.
- If Bocha returns an error or times out, the Agent Run continues with static evidence seed.
- Bocha results never replace static evidence; they are merged and ranked together.
- The frontend never receives or stores Bocha API keys.

## API Contract

Base URL:

- `https://api.bocha.cn`

Endpoint:

- `POST /v1/web-search`
- Full URL: `https://api.bocha.cn/v1/web-search`

Headers:

- `Authorization: Bearer {API KEY}`
- `Content-Type: application/json`

Request body:

```json
{
  "query": "阿里巴巴2024年的esg报告",
  "freshness": "noLimit",
  "summary": true,
  "count": 10
}
```

Supported request fields:

- `query`: required string.
- `freshness`: optional string; `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, date range, or date.
- `summary`: optional boolean.
- `include`: optional domain include list.
- `exclude`: optional domain exclude list.
- `count`: optional integer, 1-50.

Response fields used by AlphaTrace:

- `code`
- `log_id`
- `msg` / `message`
- `data.queryContext.originalQuery`
- `data.webPages.value[].name`
- `data.webPages.value[].url`
- `data.webPages.value[].displayUrl`
- `data.webPages.value[].snippet`
- `data.webPages.value[].summary`
- `data.webPages.value[].siteName`
- `data.webPages.value[].siteIcon`
- `data.webPages.value[].datePublished`
- `data.webPages.value[].dateLastCrawled`

Error behavior handled:

- `400`: missing query or missing authorization.
- `401`: invalid API key.
- `403`: insufficient balance.
- `429`: rate limit.
- `500`: provider error.
- timeout / network failure.

## Environment Variables

- `BOCHA_API_KEY`: API key. Required only for live Bocha search.
- `BOCHA_BASE_URL`: optional, defaults to `https://api.bocha.cn`.
- `BOCHA_SEARCH_ENDPOINT`: optional, defaults to `/v1/web-search`.
- `BOCHA_TIMEOUT_SECONDS`: optional, defaults to `10` seconds, clamped to 3-60.

## Backend Files

Primary runtime path:

- `backend/services/evidence_retrieval/external_search.py`
- `backend/services/evidence_retrieval/retriever.py`
- `backend/services/agent_runners/qwen_runner.py`

Source-structured Bocha integration files were also added for future cleanup:

- `backend/integrations/bocha/client.py`
- `backend/integrations/bocha/schemas.py`
- `backend/integrations/bocha/mapper.py`

The active runtime implementation remains under `backend/services` so Docker dev mounts can load it without rebuilding the image.

## Mapping to AlphaTrace Evidence

Each Bocha web result maps to an `EvidenceItem`:

- `evidenceId`: `ev_bocha_<sha1>`.
- `title`: web page title.
- `sourceName`: Bocha `siteName` or `Bocha Web Search`.
- `sourceType`: `bocha_search`.
- `evidenceType`: `external_search`.
- `publishedAt`: `datePublished` or normalized `dateLastCrawled`.
- `summary`: `summary`, `snippet`, or title fallback.
- `url`: page URL.
- `qualityScore` / `reliabilityScore`: conservative rank-based scores.
- `extractedFields`: query, displayUrl, siteIcon, collectedAt, taskType, sourceType.

## Evidence Retrieval Flow

1. `QwenRunnerAdapter` emits `tool.called` for `evidence.retrieve`.
2. `EvidenceRetriever` queries static seed.
3. `EvidenceRetriever` optionally calls `ExternalEvidenceSearch`.
4. `ExternalEvidenceSearch` calls Bocha only when `BOCHA_API_KEY` is configured.
5. Static and Bocha evidence are merged, de-duplicated, scored, and sorted.
6. Qwen prompt receives all selected evidence summaries and URLs.
7. Runtime events include `tool.called: bocha.search`, `tool.result: bocha.search`, and `evidence.linked`.
8. Evidence references are persisted to JSON store with the Agent Run.

## Validation

Validated without `BOCHA_API_KEY`:

- Evidence retrieval returned static seed evidence.
- External status was `disabled`.
- Message was `BOCHA_API_KEY is not configured.`
- Qwen run can continue with static evidence fallback.

Live Bocha provider validation requires setting `BOCHA_API_KEY` in the backend environment. The current local shell did not have that key configured, so no live Bocha request was executed.

## Current Limits

- Bocha evidence is used as web-search evidence, not as real-time market data.
- No external search result persistence outside Agent Run JSON store yet.
- No URL content fetching beyond Bocha summary/snippet.
- No citation validation yet.
- Rate limit handling is fail-open only; no retry/backoff queue.
- No TradingAgents integration.

## Runtime Credential Settings

AlphaTrace Settings now exposes a `Runtime Credentials` section for backend-side API key configuration:

- Qwen Runner config reuses existing Hyper AI LLM config storage: `POST /api/hyper-ai/profile/llm`.
- Bocha Web Search config reuses existing Hyper AI external tool storage: `PUT /api/hyper-ai/tools/bocha/config`.
- API keys are submitted to the backend and encrypted through existing Hyper AI storage helpers.
- The frontend only displays configured/not configured status and never receives decrypted keys.
- QwenRunner continues to read Hyper AI Qwen config before falling back to `DASHSCOPE_API_KEY`.
- Evidence retrieval now reads Bocha key from backend tool config before falling back to `BOCHA_API_KEY` env.

Validation on 2026-05-01:

- `python -m py_compile backend/services/hyper_ai_tool_registry.py backend/services/evidence_retrieval/external_search.py backend/services/evidence_retrieval/retriever.py backend/services/agent_runners/qwen_runner.py` passed.
- `cd frontend && pnpm build` passed.
- Docker app health check passed after restart.
- `GET /api/hyper-ai/tools` returned `bocha,tavily`.
- `GET /api/hyper-ai/profile` returned qwen configured status.
- `/dashboard#settings` returned frontend shell successfully.
