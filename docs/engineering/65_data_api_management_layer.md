# Data API Management Layer Design

Status: M121 design baseline.  
Date: 2026-05-05.

## Goal

AlphaTrace needs a governed data API layer that supports Bocha search today and professional ETF/fund/index/news/macro/document providers later.

## Current Inputs

1. Static asset/evidence/strategy/portfolio/market data seeds.
2. MySQL domain store payloads.
3. Bocha Web Search evidence.
4. Qwen-generated analysis using injected evidence and market context.

## Target Provider Types

| Provider Type | Examples | Output |
|---|---|---|
| Web search | Bocha | EvidenceItem with URL/source/summary. |
| Market quote | future ETF/index provider | Quote/snapshot/kline/indicator. |
| Fund data | future NAV/holdings/quarterly reports | EvidenceItem + fund facts. |
| News/macro | future licensed provider | EvidenceItem + event metadata. |
| Document/file corpus | uploads, reports, PDFs | EvidenceItem + extracted claims/artifacts. |
| MCP/tool bridge | future LangAlpha-style tools | ToolInvocationResult + artifacts. |

## Provider Governance Fields

Each provider should be represented in DataSource catalog with:

1. `dataSourceId`.
2. `sourceType`.
3. `providerName`.
4. `authMode`: none, server_env, mysql_secret, workspace_secret.
5. `status`: configured, missing_key, disabled, degraded, error.
6. `rateLimit` metadata.
7. `timeoutSeconds`.
8. `retryPolicy`.
9. `allowedAssetTypes`.
10. `payloadJson` for provider-specific fields.

## Evidence Mapping Rules

1. Every external search result must preserve canonical URL when available.
2. `evidenceId` must resolve through Evidence API.
3. `sourceName`, `sourceType`, `summary`, `publishedAt`, `collectedAt`, `qualityScore`, and `reliabilityScore` are required for UI traceability.
4. Raw provider payload is metadata, not report text.
5. Invalid or unsupported citations are warnings, not fatal run failures.

## Tool Boundary Rules

A runtime `tool.called` event is allowed only when backend code actually calls a backend tool/provider.

Model-only claims must be emitted as:

1. `reasoning.chunk`.
2. `debate.message`.
3. `report.generated`.
4. `risk.warning`.

This prevents the UI from implying a model hallucination was an external tool result.

## Near-Term Refactor Queue

1. Wrap Bocha search with `DataProviderAdapter` or `ToolAdapter` shape.
2. Wrap static market context load as a `ToolAdapter`.
3. Add provider health output to runner status/capabilities.
4. Persist run-scoped external evidence with URL and usage metadata.
5. Add future `AgentArtifact` for tables/charts/web previews.
