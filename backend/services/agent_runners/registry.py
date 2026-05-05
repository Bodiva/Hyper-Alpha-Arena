from __future__ import annotations

from typing import Dict

from schemas.alpha_trace_agent_runtime import SubmitAgentRunRequest, SubmitAgentRunResponse
from services.agent_runners.base import AgentRunnerAdapter, AgentRunnerContext


class AgentRunnerNotImplementedError(Exception):
    def __init__(self, runner_type: str, message: str | None = None):
        super().__init__(message or f"Agent runner '{runner_type}' is not implemented yet.")
        self.runner_type = runner_type


class AgentRunnerConfigurationError(Exception):
    pass


class AgentRunnerExecutionError(Exception):
    pass


class AgentRunnerRegistry:
    def __init__(self):
        self._runners: Dict[str, AgentRunnerAdapter] = {}

    def register_runner(self, adapter: AgentRunnerAdapter) -> None:
        self._runners[adapter.runner_type] = adapter

    def get_runner(self, runner_type: str) -> AgentRunnerAdapter:
        runner = self._runners.get(runner_type)
        if not runner:
            raise AgentRunnerNotImplementedError(runner_type)
        return runner

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        runner_type = request.runnerConfig.runnerType or "stub"
        return self.get_runner(runner_type).submit(request, context)
