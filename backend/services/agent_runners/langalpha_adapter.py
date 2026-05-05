from __future__ import annotations

import os

from schemas.alpha_trace_agent_runtime import SubmitAgentRunRequest, SubmitAgentRunResponse
from services.agent_runners.base import AgentRunnerContext
from services.agent_runners.registry import AgentRunnerConfigurationError


class LangAlphaRunnerAdapter:
    """Design-only placeholder for a future LangAlpha external runner.

    LangAlpha is intentionally not imported here. The first integration phase
    keeps AlphaTrace as the product backend and treats LangAlpha as a possible
    external workbench/service adapter after API and event mapping are finalized.
    """

    runner_type = "langalpha"

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        if os.getenv("ALPHATRACE_LANGALPHA_ENABLED", "").strip().lower() != "true":
            raise AgentRunnerConfigurationError("LangAlpha runner is not enabled.")

        raise AgentRunnerConfigurationError(
            "LangAlpha runner is design-only in this phase. "
            "Use it as an external service adapter after API/event mapping is finalized."
        )


LangAlphaAdapter = LangAlphaRunnerAdapter
