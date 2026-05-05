from __future__ import annotations

import os
from datetime import datetime, timezone

from services.integration_adapters.base import (
    ExternalWorkbenchTaskRequest,
    ExternalWorkbenchTaskResult,
    IntegrationCapability,
    IntegrationHealth,
)


class LangAlphaExternalWorkbenchAdapter:
    """Design-only external workbench adapter boundary for LangAlpha.

    This adapter does not import or execute LangAlpha. It fixes the AlphaTrace
    integration boundary: submit a product-owned task request to an external
    workbench and map returned activity back to AgentRuntimeEvent/AgentArtifact
    later.
    """

    adapter_id = "langalpha_external_workbench"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="external_workbench",
            display_name="LangAlpha External Workbench Adapter",
            supported_operations=("submit_task", "fetch_task"),
            supports_streaming=True,
            supports_artifacts=True,
            production_ready=False,
            notes=(
                "Design-only adapter. AlphaTrace remains the product backend; LangAlpha may become an external service later."
            ),
        )

    def health(self) -> IntegrationHealth:
        enabled = os.getenv("ALPHATRACE_LANGALPHA_ENABLED", "").strip().lower() == "true"
        base_url = os.getenv("LANGALPHA_BASE_URL", "").strip()
        if not enabled:
            return IntegrationHealth(
                adapter_id=self.adapter_id,
                status="disabled",
                source="environment",
                message="LangAlpha external workbench adapter is disabled.",
                checked_at=datetime.now(timezone.utc).isoformat(),
                details={"requires": ("ALPHATRACE_LANGALPHA_ENABLED=true", "LANGALPHA_BASE_URL")},
            )
        if not base_url:
            return IntegrationHealth(
                adapter_id=self.adapter_id,
                status="missing_config",
                source="environment",
                message="LANGALPHA_BASE_URL is required when LangAlpha adapter is enabled.",
                checked_at=datetime.now(timezone.utc).isoformat(),
            )
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="degraded",
            source="environment",
            message="LangAlpha adapter is configured but submit/fetch execution is not implemented in this phase.",
            checked_at=datetime.now(timezone.utc).isoformat(),
            details={"baseUrlConfigured": True},
        )

    def submit_task(self, request: ExternalWorkbenchTaskRequest) -> ExternalWorkbenchTaskResult:
        return ExternalWorkbenchTaskResult(
            status="skipped",
            workbench_id=self.adapter_id,
            message="LangAlpha external workbench submit is design-only and not implemented in this phase.",
        )

    def fetch_task(self, external_task_id: str) -> ExternalWorkbenchTaskResult:
        return ExternalWorkbenchTaskResult(
            status="skipped",
            workbench_id=self.adapter_id,
            external_task_id=external_task_id,
            message="LangAlpha external workbench fetch is design-only and not implemented in this phase.",
        )


__all__ = ["LangAlphaExternalWorkbenchAdapter"]
