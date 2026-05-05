# Agent Artifact Model Design

Status: M102 design baseline.

## Problem

AlphaTrace currently represents run outputs mainly as:

- `AgentRuntimeEvent`
- `AgentReport`
- `EvidenceReference`
- `AgentDecision`

This is sufficient for text-first Agent Runs, but it does not cleanly represent generated charts, tables, downloaded web pages, uploaded files, rendered previews, raw tool outputs, or future workspace files. If these are forced into Reports or Evidence, the product model becomes ambiguous:

- Evidence should mean source material used to support claims.
- Report should mean human-readable agent analysis.
- Tool result should mean runtime activity/result summary.
- Artifact should mean a generated or attached object that can be opened, previewed, downloaded, or reused.

## Proposed Object

`AgentArtifact`

Candidate fields:

| Field | Type | Meaning |
|---|---|---|
| `artifactId` | string | Stable artifact ID, e.g. `artifact_<runId>_<kind>_<seq>`. |
| `runId` | string | Owning AgentRun. |
| `stepId` | string optional | DAG step that produced or attached the artifact. |
| `toolName` | string optional | Tool that produced the artifact. |
| `artifactType` | enum | `web_page`, `table`, `chart`, `file`, `image`, `json`, `markdown`, `html`, `pdf`, `csv`, `log`, `dataset`, `other`. |
| `title` | string | Display title. |
| `summary` | string optional | Bounded human-readable description. |
| `uri` | string optional | Local/object-store/external URI. |
| `sourceUrl` | string optional | Canonical external source URL if applicable. |
| `mimeType` | string optional | `text/html`, `application/pdf`, `text/csv`, etc. |
| `sizeBytes` | int optional | Optional size metadata. |
| `checksum` | string optional | Optional integrity/hash field. |
| `previewMode` | enum | `inline`, `iframe`, `download`, `external_link`, `none`. |
| `relatedEvidenceIds` | string[] | Evidence items this artifact came from or supports. |
| `relatedReportIds` | string[] | Reports that reference this artifact. |
| `relatedDecisionIds` | string[] | Decisions that reference this artifact. |
| `payload` | dict optional | Bounded structured metadata; no secrets. |
| `createdAt` | datetime | Creation timestamp. |

## Relationship To Existing Objects

### EvidenceReference

EvidenceReference is a source/citation. It should not be used as a generic file attachment.

Examples that remain Evidence:

- Bocha search result URL.
- Static research report summary.
- Fund quarterly report citation.
- Market snapshot evidence.

Examples that should become Artifact:

- Cached HTML snapshot of a Bocha result.
- Extracted table from a PDF.
- Generated CSV of holdings diagnostics.
- Rendered chart image.

### AgentReport

AgentReport is agent-authored analysis. It can link to artifacts but should not embed large raw JSON, screenshots, or files.

### AgentRuntimeEvent

Runtime events should point to artifacts when a tool produces an artifact:

```json
{
  "type": "tool.result",
  "payload": {
    "toolName": "bocha.search",
    "artifactIds": ["artifact_run_001_bocha_results_001"],
    "summary": "Bocha returned 5 results."
  }
}
```

### AgentDecision

Decision can reference artifacts only when they directly support a decision or scenario analysis. `evidenceIds` remains the primary support chain.

## MySQL Table Sketch

Future table: `alpha_trace_agent_artifacts`

Suggested fields:

- `artifact_id VARCHAR(128) PRIMARY KEY`
- `run_id VARCHAR(128) NOT NULL`
- `step_id VARCHAR(64) NULL`
- `tool_name VARCHAR(128) NULL`
- `artifact_type VARCHAR(64) NOT NULL`
- `title VARCHAR(512) NOT NULL`
- `summary TEXT NULL`
- `uri TEXT NULL`
- `source_url TEXT NULL`
- `mime_type VARCHAR(128) NULL`
- `size_bytes BIGINT NULL`
- `checksum VARCHAR(128) NULL`
- `preview_mode VARCHAR(64) NOT NULL DEFAULT 'none'`
- `payload_json JSON NULL`
- `created_at DATETIME NOT NULL`
- `updated_at DATETIME NOT NULL`

Indexes:

- `idx_agent_artifacts_run_id (run_id)`
- `idx_agent_artifacts_step_id (run_id, step_id)`
- `idx_agent_artifacts_tool_name (tool_name)`
- `idx_agent_artifacts_type (artifact_type)`

Relationship tables can be deferred initially by storing bounded ID arrays in `payload_json`, but production should use link tables if artifact reuse becomes important.

## Frontend UX

Future AgentRunDetail sections:

1. Tool Calls Timeline: show artifact badges under tool results.
2. Evidence Used: keep canonical source URL and evidence metadata.
3. Artifacts Panel: show generated/downloadable objects grouped by step/tool.
4. Report Viewer: inline links to artifacts by title.
5. Decision Card: optional supporting artifacts, separate from evidence IDs.

Preview policy:

- External web pages: direct link is canonical; iframe preview best-effort only.
- Tables/JSON: inline preview with size cap.
- CSV/PDF/image: downloadable or previewable if supported.
- Logs: folded by default with line limit.

## Tool Registry Integration

Tools can declare `outputClass` in `AgentToolContract`:

- `evidence_items`
- `external_evidence_items`
- `market_context`
- `portfolio_context`
- `agent_report_section`
- `agent_decision`
- future `artifact_table`, `artifact_chart`, `artifact_file`

When a tool produces durable output, the tool result should include `artifactIds` and the artifact should be persisted separately.

## Non-Goals For Current MVP

- No object storage implementation yet.
- No file upload pipeline changes.
- No artifact DB migration in this milestone.
- No frontend artifact panel yet.
- No cached external webpage storage yet.

## Implementation Plan

Phase A: schema and docs

- Define `AgentArtifact` schema.
- Add store interface methods.
- Do not require all runners to produce artifacts.

Phase B: tool result linkage

- Add `artifactIds` to `tool.result` payload convention.
- Add artifact panel in AgentRunDetail.

Phase C: persistence

- Add MySQL table and store.
- Keep JSON fallback optional for local runs.

Phase D: rich preview

- Add table/json/html/csv/PDF preview policies.
- Keep source URL canonical for external evidence.

## Decision

Artifact is a separate first-class concept, but it should be implemented after event validation and store health endpoints. Current Evidence/Report/Decision flows should not be destabilized for artifact storage until the schema is accepted.
