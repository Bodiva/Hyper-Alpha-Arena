# AlphaTrace Architecture Overview

This document is the compact architecture map for the current AlphaTrace refactor line. It complements `docs/ARCHITECTURE.md` with an implementation-oriented directory structure and data-flow diagrams.

## 1. Current Directory Structure

```text
Hyper-Alpha-Arena/
  backend/
    api/
      alpha_trace_*_routes.py              # AlphaTrace REST/SSE product APIs
      config_routes.py                     # Runtime/key configuration facade used by Settings
    schemas/
      alpha_trace_*.py                     # Frontend-safe AlphaTrace schemas
    services/
      alpha_trace_agent_runtime_service.py # AgentRun submit/detail/events/reports/evidence/decision orchestration
      agent_runners/                       # Runner adapters: stub, qwen, alphatrace_native, tradingagents, langalpha stub
      agent_orchestrator/                  # Runner-neutral plans, flows, task specs, adapter matrix
      agent_runtime_store/                 # AgentRun persistence abstraction: MySQL config/task target + JSON fallback
      async_tasks/                         # Scheduler-neutral async task abstraction and task snapshots
      agent_artifacts/                     # AgentArtifact store, catalog, URL/tool result mappers
      agent_runtime_metrics.py             # Single-run metrics snapshot read model
      agent_runtime_timeline.py            # Compacted timeline summary read model
      runtime_config/                      # Sanitized Qwen/Bocha/TradingAgents/LangAlpha config facade
      runtime_readiness.py                 # Consolidated runtime readiness summary
      model_providers/                     # Model provider catalog and runtime descriptors
      integration_adapters/                # Qwen/Bocha/tool/professional-data/LangAlpha adapter boundary
      data_api/                            # AlphaTrace data API resource/provider catalog
      evidence_retrieval/                  # Static + Bocha evidence retrieval and mapping
      asset_store/                         # Asset domain store, static seed today + ClickHouse target
      strategy_store/                      # Strategy domain store
      portfolio_store/                     # Portfolio domain store
      decision_store/                      # Decision extraction/store from AgentRun + static fallback
      leaderboard_store/                   # Runtime quality leaderboard
      backend_module_boundaries.py         # AlphaTrace-owned vs legacy vs external boundaries
      external_component_catalog.py        # TradingAgents/LangAlpha/Bocha/provider component catalog
      integration_decision_guide.py        # Proceed/stop gates for external integrations
      architecture_index.py                # Product-owned architecture read model
      architecture_review_bundle.py        # One-call architecture review bundle
    integrations/
      bocha/                               # Bocha client/schema/mapper, backend-only key usage
    database/                              # Existing DB/session/model infrastructure; MySQL config/task direction
    runtime_data/                          # Local fallback JSON/runtime artifacts; not production persistence
  frontend/
    app/
      entities/
        runtime/api.ts                     # Typed runtime/architecture/readiness/artifact contracts
        data-source/api.ts                 # Data source + Data API catalog contracts
        agent/                             # AgentRun submit/detail/events domain client
      shared/ui/
        RuntimeReadinessPanel.tsx
        DataApiCatalogPanel.tsx
        ModuleBoundaryPanel.tsx
        ExternalComponentPanel.tsx
        IntegrationDecisionPanel.tsx
        ArchitectureReviewPanel.tsx
        AgentArtifactPreviewCard.tsx
      pages/                               # AlphaTrace and legacy app pages; current refactor avoids page wiring unless scoped
      shared/api/endpoints.ts              # Frontend endpoint constants
  docs/
    PROJECT_SPEC.md
    EXECUTION_PLAN.md
    IMPLEMENTATION_LOG.md
    VALIDATION.md
    ARCHITECTURE.md
    ARCHITECTURE_OVERVIEW.md               # This file
  scripts/alphatrace/
    smoke_backend_abstractions.ps1
    smoke_abstraction_endpoints.ps1
```

## 2. Module Boundary Summary

| Boundary | Current Role | Refactor Rule |
|---|---|---|
| AlphaTrace API Layer | Owns frontend-facing REST/SSE product contracts. | Frontend consumes AlphaTrace schemas only. |
| Domain Stores | Asset/Evidence/Strategy/Portfolio/Decision/Leaderboard product data. | Static seed is fallback; ClickHouse is target structured business persistence. |
| Agent Runtime | Submit, background execution, events, SSE, reports, evidence, decision, artifacts. | Product persistence remains AlphaTrace-owned. |
| Runner Adapters | Stub/Qwen/Native/TradingAgents/LangAlpha runner boundary. | Runners execute and map back to AlphaTrace schema; they do not own product models. |
| Integration Adapters | Qwen/Bocha/tools/professional data/LangAlpha external bridge. | Secrets are backend-only; diagnostics are sanitized. |
| Async Task Layer | Scheduler-neutral task specs/snapshots. | Future worker/subprocess/distributed scheduling plugs in here. |
| Legacy Crypto/Trading | Existing BTC/Hyperliquid/Binance/trading semantics. | Keep available for old pages; do not use as AlphaTrace ETF/fund/index data base. |
| TradingAgents | Optional LangGraph runner PoC. | Adapter only; no internal state exposed. |
| LangAlpha | Architecture reference / future external workbench bridge. | External service bridge only; no server embedding in AlphaTrace. |

## 3. Overall Architecture

```mermaid
flowchart LR
  subgraph Frontend["Frontend: AlphaTrace UI"]
    Pages["Pages: Agent Lab, Run Detail, Asset, Evidence, Portfolio, Decision, Leaderboard, Settings"]
    RuntimeUI["Reusable Runtime UI Panels"]
    APIClient["Typed API Clients"]
  end

  subgraph AlphaBackend["AlphaTrace Backend: Product API"]
    APILayer["FastAPI AlphaTrace Routes"]
    Runtime["Agent Runtime Service"]
    Domains["Domain Services / Stores"]
    Config["Runtime Config Facade"]
    Review["Architecture Review Read Models"]
  end

  subgraph RuntimeLayer["Execution & Orchestration"]
    Scheduler["Async Task Scheduler Boundary"]
    Orchestrator["Agent Orchestrator / Task Specs / Flow Catalog"]
    Runners["Runner Adapter Registry"]
    Artifacts["AgentArtifact Store"]
  end

  subgraph RunnersExternal["Runners and External Components"]
    Qwen["Qwen Runner"]
    Native["AlphaTrace Native Runner"]
    TG["TradingAgents Adapter (opt-in PoC)"]
    LangAlpha["LangAlpha External Workbench (design)"]
    Bocha["Bocha Search Tool"]
    ProData["Future Professional Market Data"]
    Skills["Agent Skill Catalog"]
    DataCenter["Data Center Connectors"]
  end

  subgraph Persistence["Persistence"]
    MySQL[("MySQL config/task target")]
    ClickHouse[("ClickHouse business analytics target")]
    JSON[("JSON fallback")]
  end

  Pages --> APIClient
  RuntimeUI --> APIClient
  APIClient --> APILayer
  APILayer --> Runtime
  APILayer --> Domains
  APILayer --> Config
  APILayer --> Review
  Runtime --> Scheduler
  Runtime --> Orchestrator
  Runtime --> Runners
  Runtime --> Artifacts
  Runners --> Qwen
  Runners --> Native
  Runners --> TG
  Runners --> LangAlpha
  Orchestrator --> Bocha
  Domains --> Bocha
  Domains --> ProData
  DataCenter --> Bocha
  DataCenter --> ProData
  Skills --> Orchestrator
  Orchestrator --> Skills
  Runtime --> MySQL
  Domains --> ClickHouse
  Config --> MySQL
  Runtime --> JSON
```

## 4. Agent Runtime Data Flow

```mermaid
sequenceDiagram
  participant UI as Frontend Agent Lab
  participant API as AlphaTrace Submit API
  participant Runtime as AgentRuntimeService
  participant Store as AgentRunStore
  participant Runner as RunnerAdapter
  participant Tools as Tool/Integration Adapters
  participant SSE as Events SSE
  participant Detail as AgentRunDetailPage

  UI->>API: POST /agent-runs/submit
  API->>Runtime: submit_agent_run(request)
  Runtime->>Store: create run RUNNING
  Runtime-->>UI: runId + RUNNING immediately
  Runtime->>Runner: background execute(task spec)
  Detail->>SSE: GET /events/stream
  Runner->>Tools: evidence.retrieve / bocha.search / market.context.load
  Tools-->>Runner: tool results + evidence refs
  Runner->>Store: append runtime events
  Store-->>SSE: new events polled and streamed
  SSE-->>Detail: agent/tool/reasoning/metric events
  Runner->>Store: save reports/evidence/decision/artifacts
  Runner->>Store: update run COMPLETED or FAILED
  Detail->>API: GET reports/evidence/decision/metrics/timeline-summary
  API->>Store: read persisted run outputs
  Store-->>Detail: AlphaTrace schema only
```

## 5. External Component Decision Flow

```mermaid
flowchart TD
  Candidate["Candidate component: TradingAgents / LangAlpha / Bocha / Data Provider"]
  Catalog["/runtime/external-components"]
  Decision["/runtime/integration-decisions"]
  Boundary["/runtime/module-boundaries"]
  Adapter["Adapter or External Service Bridge"]
  Smoke["Disabled / failure / success smoke tests"]
  Product["AlphaTrace Product Schema"]
  Stop["Stop / document blocker"]

  Candidate --> Catalog
  Catalog --> Decision
  Decision -->|Proceed gates pass| Boundary
  Decision -->|Stop condition hit| Stop
  Boundary --> Adapter
  Adapter --> Smoke
  Smoke -->|Pass| Product
  Smoke -->|Fail and cannot fix locally| Stop
```

## 6. Data API and Evidence Flow

```mermaid
flowchart LR
  Asset["Asset / Portfolio / Strategy Context"]
  DataCatalog["Data API Catalog"]
  Static["Static Seed"]
  MySQL["MySQL System Config Store"]
  ClickHouse["ClickHouse Business Analytics Store"]
  Bocha["Bocha Search Tool"]
  Pro["Future Professional Data"]
  Evidence["EvidenceReference"]
  Artifact["AgentArtifact: web_url/json/text/table"]
  Prompt["Runner Prompt Context"]
  Report["AgentReport / AgentDecision"]

  Asset --> DataCatalog
  DataCatalog --> Static
  DataCatalog --> MySQL
  DataCatalog --> Bocha
  DataCatalog --> Pro
  Static --> Evidence
  Bocha --> Evidence
  Pro --> Evidence
  Evidence --> Artifact
  Evidence --> Prompt
  Prompt --> Report
  Report --> Artifact
  Evidence --> ClickHouse
  Report --> ClickHouse
```

## 7. Current Review Endpoints

| Endpoint | Purpose |
|---|---|
| `/api/alpha-trace/agent-runs/runtime/architecture` | High-level architecture index. |
| `/api/alpha-trace/agent-runs/runtime/architecture-review` | One-call architecture review bundle. |
| `/api/alpha-trace/agent-runs/runtime/module-boundaries` | Backend module boundary catalog. |
| `/api/alpha-trace/agent-runs/runtime/external-components` | External component catalog. |
| `/api/alpha-trace/agent-runs/runtime/integration-decisions` | Proceed/stop decision guide. |
| `/api/alpha-trace/agent-runs/runtime/data-center` | Data Center connector/governance/store-routing catalog. |
| `/api/alpha-trace/agent-runs/runtime/skills` | Agent skill catalog for agent-configurable tool/data/model/output bindings. |
| `/api/alpha-trace/agent-runs/runtime/readiness` | Runtime readiness summary. |
| `/api/alpha-trace/data-sources/api-catalog` | Data API resource/provider catalog. |
| `/api/alpha-trace/agent-runs/runtime/artifacts/catalog` | AgentArtifact preview/source policy catalog. |

## 8. Refactor Priorities After This Baseline

1. Wire the reusable architecture panels into a dedicated diagnostics/settings page after isolating current dirty frontend page work.
2. Harden async task status machine and reduce write amplification from metric events.
3. Promote task-level metrics snapshots over raw metric timelines for UI status.
4. Stabilize AlphaTrace Native runner as product path.
5. Continue TradingAgents PoC only through `TradingAgentsRunnerAdapter` and with clear disabled/import/failure states.
6. Treat LangAlpha as external service/design reference until worker/artifact contracts are stable.
7. Move system config/task control to MySQL and structured runtime/domain analytics to ClickHouse, with JSON/static fallback preserved for local development.



## 9. Data Center, Tool, Skill, and Multi-Agent Control Planes

```mermaid
flowchart TD
  DataCenter["Data Center\nconnectors + governance + store routing"]
  Tools["Tool Registry\nBocha, market context, evidence retrieve, model calls"]
  Skills["Skill Catalog\nagent-configurable capabilities"]
  Orchestrator["Agent Orchestrator\nDAG + roles + task specs"]
  Agents["Agents\nMarket / Bull / Bear / Risk / PM"]
  Stores["Stores\nMySQL config/task + ClickHouse business analytics"]

  DataCenter --> Tools
  Tools --> Skills
  Skills --> Agents
  Orchestrator --> Agents
  Orchestrator --> Skills
  Agents --> Stores
  DataCenter --> Stores
```

Rule: Bocha is a tool input to Evidence Retrieval. It is not the durable business data layer. Structured business outputs go to ClickHouse after mapping into AlphaTrace schemas; runtime/config/control state goes to MySQL.
