from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, Mapping, Optional, Protocol


IntegrationStatus = Literal["ready", "disabled", "missing_config", "degraded", "error"]
InvocationStatus = Literal["completed", "failed", "skipped", "timeout"]


@dataclass(frozen=True)
class IntegrationCapability:
    """Static capability metadata for a provider/tool/workbench adapter."""

    adapter_id: str
    adapter_type: str
    display_name: str
    supported_operations: tuple[str, ...] = ()
    supports_streaming: bool = False
    supports_artifacts: bool = False
    production_ready: bool = False
    notes: str = ""


@dataclass(frozen=True)
class IntegrationHealth:
    """Runtime health for an integration without exposing credentials."""

    adapter_id: str
    status: IntegrationStatus
    source: str = "unknown"
    message: str = ""
    checked_at: Optional[str] = None
    details: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DataQueryRequest:
    query: str
    task_type: str = "single_asset_analysis"
    asset_id: Optional[str] = None
    portfolio_id: Optional[str] = None
    limit: int = 5
    filters: Mapping[str, Any] = field(default_factory=dict)
    context: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DataQueryResult:
    status: InvocationStatus
    provider_id: str
    items: tuple[Mapping[str, Any], ...] = ()
    message: str = ""
    raw_metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelInvocationRequest:
    provider_id: str
    model_name: str
    messages: tuple[Mapping[str, Any], ...]
    stream: bool = False
    temperature: Optional[float] = None
    response_format: Optional[str] = None
    timeout_seconds: Optional[int] = None
    context: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelInvocationResult:
    status: InvocationStatus
    provider_id: str
    model_name: str
    content: str = ""
    usage: Mapping[str, Any] = field(default_factory=dict)
    message: str = ""
    raw_metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolInvocationRequest:
    tool_id: str
    run_id: str
    step_id: Optional[str] = None
    agent_name: Optional[str] = None
    args: Mapping[str, Any] = field(default_factory=dict)
    context: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolInvocationResult:
    status: InvocationStatus
    tool_id: str
    content: str = ""
    evidence_ids: tuple[str, ...] = ()
    artifact_ids: tuple[str, ...] = ()
    payload: Mapping[str, Any] = field(default_factory=dict)
    message: str = ""


@dataclass(frozen=True)
class ExternalWorkbenchTaskRequest:
    workbench_id: str
    run_id: str
    task_type: str
    question: str
    asset_id: Optional[str] = None
    portfolio_id: Optional[str] = None
    context: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExternalWorkbenchTaskResult:
    status: InvocationStatus
    workbench_id: str
    external_task_id: Optional[str] = None
    reports: tuple[Mapping[str, Any], ...] = ()
    events: tuple[Mapping[str, Any], ...] = ()
    artifacts: tuple[Mapping[str, Any], ...] = ()
    decision: Optional[Mapping[str, Any]] = None
    message: str = ""


class IntegrationAdapter(Protocol):
    adapter_id: str

    def capability(self) -> IntegrationCapability:
        ...

    def health(self) -> IntegrationHealth:
        ...


class DataProviderAdapter(IntegrationAdapter, Protocol):
    def query(self, request: DataQueryRequest) -> DataQueryResult:
        ...


class ModelProviderAdapter(IntegrationAdapter, Protocol):
    def invoke(self, request: ModelInvocationRequest) -> ModelInvocationResult:
        ...

    def stream(self, request: ModelInvocationRequest) -> Iterable[ModelInvocationResult]:
        ...


class ToolAdapter(IntegrationAdapter, Protocol):
    def invoke(self, request: ToolInvocationRequest) -> ToolInvocationResult:
        ...


class ExternalWorkbenchAdapter(IntegrationAdapter, Protocol):
    def submit_task(self, request: ExternalWorkbenchTaskRequest) -> ExternalWorkbenchTaskResult:
        ...

    def fetch_task(self, external_task_id: str) -> ExternalWorkbenchTaskResult:
        ...
