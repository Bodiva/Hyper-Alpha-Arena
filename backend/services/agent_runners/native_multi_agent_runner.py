from __future__ import annotations

from services.agent_runners.qwen_runner import QwenRunnerAdapter


class AlphaTraceNativeRunnerAdapter(QwenRunnerAdapter):
    """AlphaTrace-owned native multi-agent runner.

    The first production-facing version deliberately reuses the proven Qwen
    execution path: evidence retrieval, market context, multi-round Bull/Bear
    agentic loop, risk review, final decision, SSE, and MySQL/JSON persistence.
    This gives AlphaTrace a stable product runner type without exposing
    TradingAgents internals or duplicating orchestration logic.
    """

    runner_type = "alphatrace_native"
    run_id_prefix = "run_native"
    triggered_by = "alphatrace_native"
    adapter_display_name = "AlphaTraceNativeRunner"
    run_name = "AlphaTrace Native Multi-Agent Task"
    portfolio_run_name = "AlphaTrace Native Portfolio Diagnosis"
    initial_agent_name = "AlphaTrace Native Orchestrator"
    initial_reasoning_content = (
        "正在准备 AlphaTrace 多智能体投研流程：证据检索、市场观点、"
        "多轮正反交锋、研究汇总、风险复核和最终决策。"
    )
    worker_name_prefix = "alpha-trace-native"
    response_message = (
        "投研任务已提交，AlphaTraceNativeRunner 正在执行多智能体投研流程："
        "证据检索、市场观点、多轮正反交锋、风险复核和最终决策。"
    )
