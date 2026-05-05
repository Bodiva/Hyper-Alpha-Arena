# MySQL Store Health Endpoint

Date: 2026-05-05

## Endpoint

```http
GET /api/alpha-trace/agent-runs/runtime/store-health
```

## Purpose

M107 adds a safe runtime/config health endpoint for AlphaTrace persistence and backend credential configuration. It is intended for diagnostics in Settings / Agent Lab and for smoke tests.

## Response Scope

Returned:

- AgentRunStore configured type
- AgentRunStore class name
- availability
- run count
- latest run id
- MySQL ping result when the runtime store is MySQL-backed
- System config store availability
- LLM provider/model/base-url/key availability flags
- external tool config availability flags, such as Bocha
- overall status

Never returned:

- raw API keys
- encrypted secret values
- database passwords
- Authorization headers

## Validation Result

Against `http://127.0.0.1:8805/api`:

```json
{
  "agentRunStore": {
    "configuredType": "mysql",
    "className": "MysqlAgentRunStore",
    "available": true,
    "runCount": 73,
    "latestRunId": "run_native_20260505_021040_004774",
    "mysqlPing": "ok"
  },
  "systemConfigStore": {
    "configuredType": "mysql",
    "available": true,
    "llmConfigured": true,
    "llmProvider": "qwen",
    "llmModel": "qwen-plus",
    "llmBaseUrlConfigured": true,
    "llmApiKeyAvailable": true,
    "toolConfigs": {
      "bocha": {
        "enabled": true,
        "apiKeyAvailable": true,
        "source": "mysql_system_config"
      }
    }
  },
  "overallStatus": "ok"
}
```

Secret scan:

- no raw secret-like pattern found in the endpoint response.

Runtime smoke:

- `store_health` added to `scripts/alphatrace/run_runtime_smoke.ps1`.
- runtime smoke passed with 15/15 checks.
