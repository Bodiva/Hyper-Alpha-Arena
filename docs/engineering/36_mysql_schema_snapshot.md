# AlphaTrace MySQL Schema Snapshot

Date: 2026-05-04

Database: `alpha_trace`

This snapshot records table and column structure only. It intentionally does not include raw or encrypted secrets.

## Store Boundary Map

| Store / Domain | Tables | Notes |
| --- | --- | --- |
| AgentRunStore | `alpha_trace_agent_runs`, `alpha_trace_runtime_events`, `alpha_trace_agent_reports`, `alpha_trace_evidence_refs`, `alpha_trace_decisions` | Runtime persistence for AgentRun, events, reports, evidence refs, and decisions. |
| Domain stores | `alpha_trace_assets`, `alpha_trace_evidence_items`, `alpha_trace_strategies`, `alpha_trace_portfolios`, `alpha_trace_data_sources` | Static/domain store data persisted in MySQL. |
| System config | `alpha_trace_system_configs` | Runtime credential/config metadata. Secret values are encrypted and must not be printed in logs/docs. |

## `alpha_trace_agent_reports`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| report_id | varchar(160) | NO | PRI | NULL |  |
| run_id | varchar(128) | NO | MUL | NULL |  |
| title | varchar(255) | YES |  | NULL |  |
| created_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_agent_runs`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| run_id | varchar(128) | NO | PRI | NULL |  |
| status | varchar(32) | NO | MUL | NULL |  |
| mode | varchar(64) | YES | MUL | NULL |  |
| asset_id | varchar(128) | YES | MUL | NULL |  |
| portfolio_id | varchar(128) | YES | MUL | NULL |  |
| strategy_id | varchar(128) | YES | MUL | NULL |  |
| task_type | varchar(128) | YES | MUL | NULL |  |
| created_at | varchar(64) | YES | MUL | NULL |  |
| updated_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_assets`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| asset_id | varchar(128) | NO | PRI | NULL |  |
| symbol | varchar(64) | YES | MUL | NULL |  |
| name | varchar(255) | YES |  | NULL |  |
| asset_type | varchar(64) | YES | MUL | NULL |  |
| market | varchar(64) | YES | MUL | NULL |  |
| updated_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_data_sources`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| data_source_id | varchar(160) | NO | PRI | NULL |  |
| source_type | varchar(96) | YES | MUL | NULL |  |
| status | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_decisions`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| decision_id | varchar(160) | NO | PRI | NULL |  |
| run_id | varchar(128) | NO | UNI | NULL |  |
| action | varchar(64) | YES | MUL | NULL |  |
| confidence | varchar(32) | YES |  | NULL |  |
| horizon | varchar(64) | YES |  | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_evidence_items`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| evidence_id | varchar(160) | NO | PRI | NULL |  |
| source_type | varchar(96) | YES | MUL | NULL |  |
| evidence_type | varchar(96) | YES | MUL | NULL |  |
| quality_score | int | YES | MUL | NULL |  |
| published_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_evidence_refs`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| id | varchar(320) | NO | PRI | NULL |  |
| run_id | varchar(128) | NO | MUL | NULL |  |
| evidence_id | varchar(160) | NO | MUL | NULL |  |
| evidence_type | varchar(96) | YES | MUL | NULL |  |
| source | varchar(255) | YES |  | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_portfolios`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| portfolio_id | varchar(160) | NO | PRI | NULL |  |
| risk_level | varchar(64) | YES | MUL | NULL |  |
| objective | varchar(255) | YES |  | NULL |  |
| status | varchar(64) | YES | MUL | NULL |  |
| updated_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_runtime_events`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| event_id | varchar(160) | NO | PRI | NULL |  |
| run_id | varchar(128) | NO | MUL | NULL |  |
| sequence | int | NO | MUL | NULL |  |
| type | varchar(96) | NO | MUL | NULL |  |
| timestamp | varchar(64) | YES | MUL | NULL |  |
| agent_name | varchar(160) | YES |  | NULL |  |
| team | varchar(96) | YES |  | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_strategies`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| strategy_id | varchar(160) | NO | PRI | NULL |  |
| strategy_type | varchar(96) | YES | MUL | NULL |  |
| style | varchar(96) | YES | MUL | NULL |  |
| status | varchar(64) | YES | MUL | NULL |  |
| updated_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## `alpha_trace_system_configs`

| Field | Type | Null | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| config_key | varchar(160) | NO | PRI | NULL |  |
| config_type | varchar(64) | NO | MUL | NULL |  |
| provider | varchar(128) | YES | MUL | NULL |  |
| model | varchar(160) | YES |  | NULL |  |
| base_url | varchar(512) | YES |  | NULL |  |
| enabled | varchar(16) | YES | MUL | NULL |  |
| secret_encrypted | text | YES |  | NULL |  |
| updated_at | varchar(64) | YES | MUL | NULL |  |
| payload_json | json | NO |  | NULL |  |

## Hardening Notes

1. Add formal migrations before production use; current schema is MVP-oriented.
2. Keep JSON payload columns for flexible runner/domain metadata, but add generated/indexed columns for frequent filters.
3. Keep JSON fallback path available during migration windows, but MySQL is the canonical persistence direction.
4. Never log raw API keys or encrypted secret payloads in validation output.