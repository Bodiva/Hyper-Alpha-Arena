param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
$env:PYTHONPATH = "backend"

$files = @(
  "backend/api/alpha_trace_agent_runtime_routes.py",
  "backend/services/agent_tool_registry.py",
  "backend/services/integration_adapters/base.py",
  "backend/services/integration_adapters/__init__.py",
  "backend/services/integration_adapters/registry.py",
  "backend/services/integration_adapters/bocha_adapter.py",
  "backend/services/integration_adapters/market_data_adapter.py",
  "backend/services/integration_adapters/qwen_model_adapter.py",
  "backend/services/integration_adapters/tool_adapters.py",
  "backend/services/async_tasks/base.py",
  "backend/services/async_tasks/__init__.py",
  "backend/services/async_tasks/memory_store.py",
  "backend/services/async_tasks/mysql_store.py",
  "backend/services/async_tasks/in_process_scheduler.py",
  "backend/services/agent_orchestrator/base.py",
  "backend/services/agent_orchestrator/adapter_matrix.py",
  "backend/services/agent_orchestrator/flow_catalog.py",
  "backend/services/agent_orchestrator/native_plan.py",
  "backend/services/agent_orchestrator/task_spec_factory.py",
  "backend/services/agent_orchestrator/tool_executor.py",
  "backend/services/agent_artifacts/base.py",
  "backend/services/agent_artifacts/__init__.py",
  "backend/services/agent_artifacts/memory_store.py",
  "backend/services/agent_artifacts/mysql_store.py",
  "backend/services/agent_artifacts/registry.py",
  "backend/services/agent_artifacts/evidence_mapper.py",
  "backend/services/data_api/catalog.py",
  "backend/services/data_api/__init__.py",
  "backend/services/runtime_config/facade.py",
  "backend/services/runtime_config/__init__.py"
)

Write-Host "[AlphaTrace] py_compile backend abstraction files"
python -m py_compile @files

Write-Host "[AlphaTrace] local registry/tool adapter smoke"
$pythonSmoke = @(
  "from services.integration_adapters import EvidenceRetrieveToolAdapter, MarketContextToolAdapter, ToolInvocationRequest, build_default_integration_registry",
  "from services.agent_artifacts import AgentArtifact, MemoryAgentArtifactStore, evidence_to_web_artifact",
  "from services.agent_orchestrator.adapter_matrix import get_adapter_composition_matrix",
  "from services.agent_orchestrator.flow_catalog import get_agent_flow_catalog",
  "from services.async_tasks import AsyncTaskSpec, InProcessAsyncTaskScheduler, MemoryAsyncTaskStore",
  "from services.agent_orchestrator.tool_executor import ToolExecutor",
  "from services.data_api import get_data_api_catalog",
  "from services.runtime_config import get_runtime_config_facade",
  "from schemas.alpha_trace_agent_runtime import EvidenceReference",
  "items = build_default_integration_registry().diagnostics()",
  "print('integrations', len(items))",
  "assert len(items) >= 5, 'expected at least 5 integration diagnostics'",
  "text = str(items).lower()",
  "assert 'sk-' not in text and 'bearer ' not in text and 'api_key' not in text, 'secret-like material leaked'",
  "evidence = EvidenceRetrieveToolAdapter().invoke(ToolInvocationRequest(tool_id='evidence.retrieve', run_id='smoke', args={'assetId':'asset_etf_510300','question':'ETF risk allocation','taskType':'single_asset_analysis','limit':2,'includeExternal':False}))",
  "print('evidence', evidence.status, len(evidence.evidence_ids))",
  "assert evidence.status == 'completed' and evidence.evidence_ids, 'evidence adapter smoke failed'",
  "record = ToolExecutor().execute(MarketContextToolAdapter(), ToolInvocationRequest(tool_id='market.context.load', run_id='smoke', step_id='evidence_retrieval', agent_name='Market Context Loader', args={'assetId':'asset_etf_510300'}))",
  "print('market', record.result.status, record.called_payload.get('toolContract', {}).get('toolName'))",
  "assert record.result.status == 'completed', 'market adapter smoke failed'",
  "config = get_runtime_config_facade().snapshot()",
  "assert {'qwen','bocha','tradingagents','langalpha'} <= set(config.keys()), 'runtime config smoke failed'",
  "matrix = get_adapter_composition_matrix().to_response()",
  "assert matrix['total'] >= 5, 'adapter matrix smoke failed'",
  "flows = {flow.runner_type: flow for flow in get_agent_flow_catalog().list_flows()}",
  "assert 'alphatrace_native' in flows and 'tradingagents' in flows, 'flow catalog smoke failed'",
  "catalog = get_data_api_catalog().to_response()",
  "assert catalog['total'] >= 7, 'data api catalog smoke failed'",
  "task_store = MemoryAsyncTaskStore()",
  "scheduler = InProcessAsyncTaskScheduler(store=task_store)",
  "spec = AsyncTaskSpec(task_id='task_smoke_script', run_id='run_smoke_script', runner_type='stub', task_type='smoke')",
  "submit = scheduler.submit_callable(spec, lambda: {'ok': True})",
  "import time",
  "snap = None",
  "for _ in range(40):",
  "    snap = scheduler.get(spec.task_id)",
  "    if snap and snap.status in ('completed','failed','timed_out'): break",
  "    time.sleep(0.05)",
  "assert snap and snap.status == 'completed', 'scheduler smoke failed'",
  "artifact_store = MemoryAgentArtifactStore()",
  "artifact_store.save_artifact(AgentArtifact(artifact_id='art_smoke_script', run_id='run_smoke_script', artifact_type='text', title='Smoke', status='available'))",
  "assert artifact_store.get_artifact('art_smoke_script'), 'artifact memory store smoke failed'",
  "ev = EvidenceReference(evidenceId='ev_bocha_smoke', title='Smoke Evidence', evidenceType='external_search', sourceName='Bocha', qualityScore=80, summary='summary', url='https://example.com')",
  "artifact = evidence_to_web_artifact('run_smoke_script', ev)",
  "assert artifact and artifact.artifact_type == 'web_url', 'evidence artifact mapper smoke failed'"
) -join "`n"
$pythonSmoke | python -

Write-Host "[AlphaTrace] backend abstraction smoke passed"
