# AlphaTrace MySQL Schema Hardening Review

Date: 2026-05-05

Scope: M88 schema-only review. This document records non-destructive observations and a migration plan. No `ALTER TABLE`, data rewrite, or destructive migration was executed.

## Current Table Set

The active MySQL database contains the following AlphaTrace tables:

| Table | Row count observed | Primary use |
| --- | ---: | --- |
| `alpha_trace_agent_runs` | 67 | AgentRun product records |
| `alpha_trace_runtime_events` | 9525 | Runtime event audit trail |
| `alpha_trace_agent_reports` | 197 | Generated report payloads |
| `alpha_trace_evidence_refs` | 238 | Run-scoped evidence references |
| `alpha_trace_decisions` | 67 | Final AgentDecision records |
| `alpha_trace_evidence_items` | 10 | Domain evidence seed/items |
| `alpha_trace_data_sources` | 4 | Data source registry |
| `alpha_trace_system_configs` | 2 | Runtime config and encrypted secrets |

`alpha_trace_assets`, `alpha_trace_strategies`, and `alpha_trace_portfolios` are also present as domain-store tables.

## Current Index Coverage

Existing single-column indexes cover most MVP access patterns:

| Table | Existing useful indexes |
| --- | --- |
| `alpha_trace_agent_runs` | `run_id`, `created_at`, `updated_at`, `status`, `mode`, `asset_id`, `portfolio_id`, `strategy_id`, `task_type` |
| `alpha_trace_runtime_events` | `event_id`, `run_id`, `sequence`, `type`, `timestamp` |
| `alpha_trace_agent_reports` | `report_id`, `run_id`, `created_at` |
| `alpha_trace_evidence_refs` | `id`, `run_id`, `evidence_id`, `evidence_type` |
| `alpha_trace_decisions` | `decision_id`, unique `run_id`, `action` |
| `alpha_trace_evidence_items` | `evidence_id`, `source_type`, `evidence_type`, `quality_score`, `published_at` |
| `alpha_trace_system_configs` | `config_key`, `config_type`, `provider`, `enabled`, `updated_at` |
| `alpha_trace_data_sources` | `data_source_id`, `source_type`, `status` |

## Query Patterns Reviewed

Reviewed code paths:

- `MysqlAgentRunStore.get_run(run_id)`
- `MysqlAgentRunStore.list_runs()`
- `MysqlAgentRunStore.get_events(run_id)`
- `MysqlAgentRunStore.get_reports(run_id)`
- `MysqlAgentRunStore.get_evidence(run_id)`
- `MysqlAgentRunStore.get_decision(run_id)`
- `MysqlDomainStore.list_payloads()`
- `MysqlDomainStore.get_payload_by(column_name, value)`
- `MysqlSystemConfigStore.get_config(config_key)`
- `MysqlSystemConfigStore.list_external_tools()`

Most expensive expected growth path is runtime events:

```sql
SELECT payload_json
FROM alpha_trace_runtime_events
WHERE run_id = ?
ORDER BY sequence ASC;
```

The current schema has separate indexes on `run_id` and `sequence`. MySQL may still use filesort for `WHERE run_id = ? ORDER BY sequence`. A composite index is the main future hardening item.

## Recommended Non-Destructive Migration Plan

Do not run these automatically in the current milestone. They should become a reviewed migration in a later milestone.

### P0: Runtime Event Read Path

```sql
CREATE INDEX ix_alpha_trace_runtime_events_run_sequence
ON alpha_trace_runtime_events (run_id, sequence);
```

Reason: all event stream/detail queries read events by run ordered by sequence. This is the highest-growth table.

### P1: Reports By Run Ordered By Creation

```sql
CREATE INDEX ix_alpha_trace_agent_reports_run_created
ON alpha_trace_agent_reports (run_id, created_at);
```

Reason: report detail queries read reports by run ordered by creation time.

### P1: Evidence References By Run And Evidence

```sql
CREATE INDEX ix_alpha_trace_evidence_refs_run_evidence
ON alpha_trace_evidence_refs (run_id, evidence_id);
```

Reason: run evidence pages and evidence attribution often filter by run and then map evidence IDs.

### P2: AgentRun List Filters

```sql
CREATE INDEX ix_alpha_trace_agent_runs_status_updated
ON alpha_trace_agent_runs (status, updated_at);

CREATE INDEX ix_alpha_trace_agent_runs_task_created
ON alpha_trace_agent_runs (task_type, created_at);
```

Reason: future run lists will likely filter by status/task type and sort by recency.

### P2: Decision List Recency

Current `alpha_trace_decisions` does not have a first-class `created_at` column; creation time is inside `payload_json`. For product-grade Decision Attribution, add a denormalized `created_at` column and index it in a reviewed migration:

```sql
ALTER TABLE alpha_trace_decisions ADD COLUMN created_at varchar(64) NULL;
CREATE INDEX ix_alpha_trace_decisions_created_at
ON alpha_trace_decisions (created_at);
```

This is not urgent for MVP because the row count is small and DecisionStore can derive timestamps from payloads.

## JSON Payload Boundary

The current MySQL design intentionally keeps stable query keys as columns and preserves product payloads in `payload_json`.

Keep as columns:

- IDs and foreign keys: `run_id`, `asset_id`, `portfolio_id`, `strategy_id`, `evidence_id`.
- Query and filter fields: `status`, `task_type`, `type`, `source_type`, `evidence_type`, `created_at`, `updated_at`.

Keep in JSON:

- Full report body.
- Raw runtime event payload.
- Evidence metadata and provenance details.
- Runner-specific details that should not leak into schema churn.

If a JSON field becomes a frequent filter/sort key, promote it to a column in a reviewed migration.

## Validation Performed

Commands performed were schema-only and count-only:

```powershell
docker exec hyper-arena-mysql mysql -u<user> -p<redacted> alpha_trace -e "SHOW TABLES LIKE 'alpha_trace_%';"
docker exec hyper-arena-mysql mysql -u<user> -p<redacted> alpha_trace -e "SHOW INDEX FROM <table>;"
docker exec hyper-arena-mysql mysql -u<user> -p<redacted> alpha_trace -e "SELECT COUNT(*) ..."
```

No raw secret values were printed or copied into this document.

## Risks

1. Runtime event table will grow fastest; without `(run_id, sequence)`, detail/SSE fallback reads can degrade.
2. Decision Attribution will eventually need denormalized decision timestamps and workspace/user scope.
3. Domain-store list endpoints currently load all payloads because seed/domain table sizes are small. Add pagination/indexed filters before moving to large evidence corpora.
4. MySQL schema is currently initialized by application code, not a formal migration system. A later milestone should introduce an explicit migration review path before production use.

## Next Step

Convert the P0/P1 index recommendations into a reviewed, reversible migration milestone after current demo stability work is complete.
