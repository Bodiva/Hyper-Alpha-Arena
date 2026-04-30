from __future__ import annotations

from datetime import datetime

from schemas.alpha_trace_agent_runtime import AgentDecision, AgentRun, RuntimeMetrics, SubmitAgentRunRequest, SubmitAgentRunResponse
from services.agent_runners.base import AgentRunnerContext


class StubAgentRunnerAdapter:
    runner_type = "stub"

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        asset_id = request.assetId or "asset_etf_510300"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        run_id = f"run_stub_{timestamp}"
        tool_calls, reports, events = context.copy_runtime_artifacts(run_id, "stub_runner")

        submitted_run = AgentRun(
            **{
                **context.base_run.model_dump(),
                "runId": run_id,
                "name": "AlphaTrace Stub Runner Agent Task",
                "target": asset_id,
                "taskType": request.taskType,
                "assetIds": [asset_id],
                "portfolioId": request.portfolioId,
                "strategyId": request.strategyId,
                "triggeredBy": "agent_runner_stub",
                "modelName": request.runnerConfig.modelName,
                "toolCalls": tool_calls,
                "reports": reports,
                "events": events,
                "finalDecision": AgentDecision(
                    **{
                        **context.base_decision.model_dump(),
                        "horizon": request.horizon,
                        "summary": "Submitted task accepted by StubAgentRunnerAdapter. No Qwen, TradingAgents, database, or external runner was invoked.",
                        "thesis": request.question,
                        "risks": [
                            "Stub runner only",
                            f"Risk preference: {request.riskPreference}",
                            "No real model or TradingAgents process has been executed",
                        ],
                    }
                ),
                "metrics": RuntimeMetrics(
                    llmCalls=0,
                    toolCalls=len(tool_calls),
                    generatedReports=len(reports),
                    durationSeconds=360,
                    estimatedCostUsd=0.0,
                ),
            }
        )
        context.save_run(submitted_run)
        return SubmitAgentRunResponse(
            runId=run_id,
            status=submitted_run.status,
            mode="stub",
            message="Agent task accepted by StubAgentRunnerAdapter. Real runner integration is not enabled.",
            run=submitted_run,
        )

