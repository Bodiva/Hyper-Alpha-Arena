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
  "backend/services/async_tasks/mysql_store.py",
  "backend/services/agent_orchestrator/base.py",
  "backend/services/agent_orchestrator/native_plan.py",
  "backend/services/agent_orchestrator/tool_executor.py",
  "backend/services/agent_artifacts/base.py",
  "backend/services/agent_artifacts/__init__.py"
)

Write-Host "[AlphaTrace] py_compile backend abstraction files"
python -m py_compile @files

Write-Host "[AlphaTrace] local registry/tool adapter smoke"
$pythonSmoke = @(
  "from services.integration_adapters import EvidenceRetrieveToolAdapter, MarketContextToolAdapter, ToolInvocationRequest, build_default_integration_registry",
  "from services.agent_orchestrator.tool_executor import ToolExecutor",
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
  "assert record.result.status == 'completed', 'market adapter smoke failed'"
) -join "`n"
$pythonSmoke | python -

Write-Host "[AlphaTrace] backend abstraction smoke passed"
