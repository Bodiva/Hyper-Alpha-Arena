from __future__ import annotations

from services.agent_runners.qwen_runner import QwenRunnerAdapter


class AlphaTraceNativeRunnerAdapter(QwenRunnerAdapter):
    """AlphaTrace-owned native multi-agent runner.

    The first production-facing version deliberately reuses the proven Qwen
    execution path: evidence retrieval, Bocha/static evidence, market context,
    Bull/Bear parallel calls, risk review, final decision, SSE, and MySQL/JSON
    persistence. This gives AlphaTrace a stable product runner type without
    exposing TradingAgents internals or duplicating orchestration logic.
    """

    runner_type = "alphatrace_native"
    run_id_prefix = "run_native"
    triggered_by = "alphatrace_native"
    adapter_display_name = "AlphaTraceNativeRunner"
    run_name = "AlphaTrace Native Multi-Agent Task"
    portfolio_run_name = "AlphaTrace Native Portfolio Diagnosis"
    initial_agent_name = "AlphaTrace Native Orchestrator"
    initial_reasoning_content = (
        "Preparing AlphaTrace native multi-agent DAG: Evidence Retrieval, "
        "Market View, Bull/Bear Review, Risk Review, and Final Decision."
    )
    worker_name_prefix = "alpha-trace-native"
    response_message = (
        "Agent run submitted. AlphaTraceNativeRunner is executing the native "
        "multi-agent DAG with Qwen, Evidence Retrieval, Bocha/static evidence, "
        "Bull/Bear parallel calls, Risk Review, and Final Decision."
    )
