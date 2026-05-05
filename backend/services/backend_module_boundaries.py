from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class BackendModuleBoundary:
    module_id: str
    display_name: str
    boundary_type: str
    ownership: str
    status: str
    directories: tuple[str, ...]
    api_prefixes: tuple[str, ...] = ()
    depends_on: tuple[str, ...] = ()
    extension_points: tuple[str, ...] = ()
    notes: str = ""
    allowed_to_import: tuple[str, ...] = ()
    must_not_import: tuple[str, ...] = ()
    migration_target: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class BackendModuleBoundaryCatalog:
    version: int
    modules: tuple[BackendModuleBoundary, ...] = field(default_factory=tuple)
    policies: dict[str, str] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        grouped: dict[str, int] = {}
        for module in self.modules:
            grouped[module.boundary_type] = grouped.get(module.boundary_type, 0) + 1
        return {
            "version": self.version,
            "modules": [module.to_dict() for module in self.modules],
            "total": len(self.modules),
            "summary": grouped,
            "policies": self.policies,
        }


def get_backend_module_boundary_catalog() -> BackendModuleBoundaryCatalog:
    """Return product-owned module boundaries for the backend refactor.

    This catalog is intentionally descriptive, not a runtime dependency graph.
    It gives future refactors a single source of truth for what belongs to
    AlphaTrace, what remains legacy, and where external open-source runtimes can
    be adapted without leaking their internal state into product APIs.
    """

    return BackendModuleBoundaryCatalog(
        version=1,
        modules=(
            BackendModuleBoundary(
                module_id="alphatrace_api_layer",
                display_name="AlphaTrace REST/SSE API Layer",
                boundary_type="alphatrace_owned",
                ownership="product_backend",
                status="active",
                directories=("backend/api/alpha_trace_*", "backend/schemas/alpha_trace_*"),
                api_prefixes=("/api/alpha-trace",),
                depends_on=("alphatrace_domain_services", "agent_runtime"),
                extension_points=("FastAPI routers", "frontend-safe schema contracts"),
                notes="Frontend should consume AlphaTrace schemas only, not runner internal state.",
                must_not_import=("TradingAgents internal graph state", "LangAlpha server internals"),
                migration_target="Keep as product-owned API facade.",
            ),
            BackendModuleBoundary(
                module_id="alphatrace_domain_services",
                display_name="Asset / Evidence / Strategy / Portfolio / Decision Domains",
                boundary_type="alphatrace_owned",
                ownership="product_backend",
                status="active",
                directories=(
                    "backend/services/asset_store",
                    "backend/services/evidence_retrieval",
                    "backend/services/strategy_store",
                    "backend/services/portfolio_store",
                    "backend/services/decision_store",
                    "backend/services/leaderboard_store",
                ),
                api_prefixes=(
                    "/api/alpha-trace/assets",
                    "/api/alpha-trace/evidence",
                    "/api/alpha-trace/strategies",
                    "/api/alpha-trace/portfolios",
                    "/api/alpha-trace/decisions",
                    "/api/alpha-trace/leaderboard",
                ),
                depends_on=("data_api_catalog", "clickhouse_business_store"),
                extension_points=("professional market data providers", "external evidence providers", "file ingestion"),
                notes="Static seed remains a development fallback; ClickHouse is the target for structured business/domain data.",
                migration_target="Migrate static/domain stores to ClickHouse-backed stores with deterministic static fallback.",
            ),
            BackendModuleBoundary(
                module_id="agent_runtime",
                display_name="Agent Runtime and SSE Execution Layer",
                boundary_type="alphatrace_owned",
                ownership="product_backend",
                status="active",
                directories=(
                    "backend/services/alpha_trace_agent_runtime_service.py",
                    "backend/services/agent_runtime_store",
                    "backend/services/agent_runtime_metrics.py",
                    "backend/services/agent_runtime_timeline.py",
                    "backend/services/agent_artifacts",
                ),
                api_prefixes=("/api/alpha-trace/agent-runs",),
                depends_on=("runner_adapters", "async_task_management", "mysql_system_config_store", "clickhouse_business_store"),
                extension_points=("AgentRunStore", "RuntimeEvent stream", "AgentArtifactStore", "metrics snapshots"),
                notes="This layer owns product run state. MySQL covers control/config; ClickHouse is the target for structured events/reports/decisions/metrics.",
                migration_target="Keep as canonical runtime store and event contract.",
            ),
            BackendModuleBoundary(
                module_id="runner_adapters",
                display_name="Runner Adapter Boundary",
                boundary_type="alphatrace_owned",
                ownership="runtime_backend",
                status="active",
                directories=("backend/services/agent_runners", "backend/services/agent_orchestrator"),
                api_prefixes=("/api/alpha-trace/agent-runs/runners",),
                depends_on=("model_provider_catalog", "integration_adapters", "agent_runtime"),
                extension_points=("StubRunner", "QwenRunner", "AlphaTraceNativeRunner", "TradingAgentsRunnerAdapter", "LangAlphaRunnerAdapter"),
                notes="Adapters execute work and map outputs back to AlphaTrace schemas; they do not define product data models.",
                must_not_import=("frontend page models", "legacy trading services"),
                migration_target="Harden scheduler-neutral task spec and worker orchestration.",
            ),
            BackendModuleBoundary(
                module_id="integration_adapters",
                display_name="External Provider and Tool Adapter Boundary",
                boundary_type="alphatrace_owned",
                ownership="integration_backend",
                status="active",
                directories=("backend/services/integration_adapters", "backend/integrations/bocha"),
                api_prefixes=("/api/alpha-trace/agent-runs/runtime/integrations",),
                depends_on=("runtime_config", "data_api_catalog"),
                extension_points=("Bocha search", "Qwen OpenAI-compatible client", "professional market data", "LangAlpha external workbench"),
                notes="All secrets stay backend-side and diagnostics must be sanitized.",
                migration_target="Add provider capability negotiation before live professional data integration.",
            ),
            BackendModuleBoundary(
                module_id="data_api_catalog",
                display_name="Data API Catalog and Provider Registry",
                boundary_type="alphatrace_owned",
                ownership="data_backend",
                status="active",
                directories=("backend/services/data_api",),
                api_prefixes=("/api/alpha-trace/data-sources/api-catalog",),
                depends_on=("alphatrace_domain_services",),
                extension_points=("domain resources", "provider descriptors", "credential policy"),
                notes="Keeps legacy BTC/Hyperliquid market streams out of AlphaTrace ETF/fund/index data contracts.",
                migration_target="Use as control plane for future data source management.",
            ),
            BackendModuleBoundary(
                module_id="runtime_config",
                display_name="Runtime Config and System Config Stores",
                boundary_type="alphatrace_owned",
                ownership="platform_backend",
                status="active",
                directories=("backend/services/runtime_config", "backend/services/system_config_store.py", "backend/api/config_routes.py"),
                api_prefixes=("/api/hyper-ai/profile", "/api/hyper-ai/tools", "/api/alpha-trace/agent-runs/runtime/config"),
                depends_on=("mysql_persistence",),
                extension_points=("Qwen key", "DASHSCOPE key", "Bocha key", "TradingAgents enablement", "LangAlpha endpoint"),
                notes="Settings writes and runner diagnostics must resolve the same sanitized source state.",
                migration_target="Keep secrets encrypted/opaque in MySQL or environment; never return raw values.",
            ),
            BackendModuleBoundary(
                module_id="async_task_management",
                display_name="Async Task Scheduler and Worker Boundary",
                boundary_type="alphatrace_owned",
                ownership="runtime_backend",
                status="active",
                directories=("backend/services/async_tasks",),
                api_prefixes=("/api/alpha-trace/agent-runs/runtime/tasks",),
                depends_on=("mysql_persistence", "agent_runtime"),
                extension_points=("in-process scheduler", "future subprocess worker", "future distributed worker"),
                notes="No Celery/Redis in current scope; scheduler-neutral task specs keep future worker migration possible.",
                migration_target="Add status machine, cancel/retry policy, and bounded concurrency before production.",
            ),
            BackendModuleBoundary(
                module_id="mysql_system_config_store",
                display_name="MySQL System Config and Task Control Store",
                boundary_type="infrastructure_target",
                ownership="platform_backend",
                status="active",
                directories=("backend/database", "backend/services/system_config_store.py", "backend/services/async_tasks/mysql_store.py"),
                depends_on=("runtime_config", "async_task_management", "agent_runtime"),
                extension_points=("system config", "credential metadata", "async task snapshots", "lightweight run control state"),
                notes="MySQL stores settings, credential metadata, runtime config, and task/run control state. It is not the target analytical store for structured business data.",
                migration_target="Keep MySQL focused on transactional configuration/control data.",
            ),
            BackendModuleBoundary(
                module_id="clickhouse_business_store",
                display_name="ClickHouse Structured Business and Analytics Store",
                boundary_type="infrastructure_target",
                ownership="data_backend",
                status="planned",
                directories=("backend/services/*_store", "backend/services/agent_runtime_store", "backend/services/data_api"),
                depends_on=("alphatrace_domain_services", "agent_runtime", "data_api_catalog"),
                extension_points=("asset/evidence/strategy/portfolio/decision stores", "runtime event/report/decision projections", "leaderboard analytics", "market data facts"),
                notes="ClickHouse is the target for structured business data, analytical facts, runtime events, reports, evidence references, decisions, and leaderboard projections.",
                migration_target="Introduce ClickHouse store interfaces and dual-write/read-model migration after schemas are approved.",
            ),
            BackendModuleBoundary(
                module_id="legacy_crypto_trading",
                display_name="Legacy Crypto / Exchange / Hyperliquid Modules",
                boundary_type="legacy_boundary",
                ownership="legacy_backend",
                status="quarantined_for_alphatrace",
                directories=("backend/services/exchange*", "backend/services/*trading*", "backend/api/*hyper*"),
                api_prefixes=("/api/exchange", "/api/hyperliquid", "/api/trading"),
                notes="Do not reuse BTC/Hyperliquid runtime streams as AlphaTrace ETF/fund/index market data. Keep available for legacy product pages only.",
                allowed_to_import=("legacy pages/services only",),
                must_not_import=("AlphaTrace market data v1", "AlphaTrace agent runner prompt context"),
                migration_target="Document and isolate; build new AlphaTrace market data domain instead.",
            ),
            BackendModuleBoundary(
                module_id="tradingagents_external_runtime",
                display_name="TradingAgents LangGraph Runtime",
                boundary_type="external_runner_adapter",
                ownership="optional_external_runtime",
                status="opt_in_poc",
                directories=("../TradingAgents", "backend/services/agent_runners/tradingagents_adapter.py"),
                api_prefixes=("/api/alpha-trace/agent-runs/submit runnerType=tradingagents",),
                depends_on=("runner_adapters", "runtime_config"),
                extension_points=("TradingAgentsRunnerAdapter", "event/report/decision mapper"),
                notes="TradingAgents is a runner engine, not AlphaTrace main backend; no internal state is exposed to frontend.",
                must_not_import=("TradingAgents modules at FastAPI startup",),
                migration_target="Deep PoC only after dependency/runtime/key readiness is stable.",
            ),
            BackendModuleBoundary(
                module_id="langalpha_external_workbench",
                display_name="LangAlpha External Workbench Boundary",
                boundary_type="external_workbench_adapter",
                ownership="optional_external_service",
                status="design_only",
                directories=("../LangAlpha", "backend/services/integration_adapters/langalpha_workbench_adapter.py"),
                depends_on=("integration_adapters", "agent_runtime"),
                extension_points=("external research service adapter", "workspace/thread/task event bridge"),
                notes="Use LangAlpha as architecture reference or external service bridge; do not embed its backend into AlphaTrace.",
                must_not_import=("LangAlpha app/server internals",),
                migration_target="Design external adapter after product worker and artifact contracts stabilize.",
            ),
        ),
        policies={
            "frontend_contract": "Frontend consumes AlphaTrace-owned schemas and read models only.",
            "external_runtime_policy": "Open-source runtimes integrate through adapters; internal state remains private execution state.",
            "legacy_policy": "Legacy crypto/trading modules stay available for old pages but are not AlphaTrace market data foundations.",
            "persistence_policy": "MySQL is for system config/task control; ClickHouse is the target for structured business analytics data; JSON/static seed remain local/MVP fallbacks.",
            "secrets_policy": "No raw API key or bearer token may appear in diagnostics, logs, events, or frontend responses.",
        },
    )


__all__ = ["BackendModuleBoundary", "BackendModuleBoundaryCatalog", "get_backend_module_boundary_catalog"]
