# AgentArtifact Contract Design

Status: M133 baseline.  
Date: 2026-05-05.

## Goal

Prepare AlphaTrace for tool-generated and external-workbench-generated artifacts without mixing them into raw report text.

Examples:

1. Bocha web URL previews.
2. Market data tables.
3. Chart images or JSON chart specs.
4. LangAlpha PTC-generated files/tables/dashboards.
5. TradingAgents debug reports or logs.
6. Evidence extraction artifacts from PDFs or uploaded files.

## Contract

`AgentArtifact` is a product-facing object linked to `runId`.

Minimum fields:

1. `artifactId`.
2. `runId`.
3. `artifactType`: table, chart, file, html_preview, web_url, json, image, text.
4. `title`.
5. `status`.
6. `summary`.
7. `sourceTool`.
8. `sourceUrl`.
9. `contentType`.
10. `storageUri`.
11. `previewPayload`.
12. `metadata`.

## Why This Matters

Reports should remain narrative and decision-oriented. Artifacts hold large or structured outputs that are too big or too specialized for report text:

1. Tables and charts can be rendered by frontend components.
2. Web URLs can be previewed best-effort while canonical source remains direct link.
3. PTC/LangAlpha files can be stored and referenced without exposing external filesystem IDs as product IDs.
4. Evidence traceability improves because evidence can link to artifacts.

## Store Direction

Future MySQL table: `alpha_trace_agent_artifacts`.

Suggested columns:

1. `artifact_id` primary key.
2. `run_id` index.
3. `artifact_type` index.
4. `status` index.
5. `source_tool` index.
6. `source_url` text.
7. `content_type` varchar.
8. `storage_uri` text.
9. `created_at` datetime/string.
10. `payload_json` JSON.

## Non-Goals

1. Do not implement object storage in this milestone.
2. Do not iframe arbitrary web pages as the canonical evidence source.
3. Do not expose external LangAlpha workspace file IDs as primary AlphaTrace IDs.
4. Do not store secrets in artifacts.
