from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


AgentRuntimeEventType = Literal[
    "agent.run.started",
    "agent.run.completed",
    "agent.run.failed",
    "agent.started",
    "agent.completed",
    "agent.failed",
    "tool.called",
    "tool.result",
    "reasoning.chunk",
    "report.generated",
    "debate.message",
    "risk.warning",
    "decision.updated",
    "evidence.linked",
    "metric.updated",
    "checkpoint.created",
]

AgentRuntimeStatus = Literal["idle", "running", "completed", "failed", "cancelled"]
AgentRunStatus = Literal["queued", "running", "completed", "partially_completed", "failed", "cancelled"]
AgentStatus = Literal["idle", "running", "completed", "failed"]
ToolCallStatus = Literal["running", "completed", "failed"]
AgentDecisionAction = Literal["overweight", "underweight", "hold", "watch", "no_action"]
AgentDecisionHorizon = Literal["short_term", "medium_term", "long_term"]
AgentTaskType = Literal[
    "single_asset_analysis",
    "multi_asset_comparison",
    "portfolio_diagnostic",
    "portfolio_diagnosis",
    "event_impact_analysis",
    "rebalance_suggestion",
]
InvestmentHorizon = Literal["short_term", "medium_term", "long_term"]
RiskPreference = Literal["conservative", "balanced", "aggressive"]
AgentRunnerMode = Literal["stub", "qwen", "tradingagents", "custom_runner"]


class ToolCall(BaseModel):
    callId: str
    runId: str
    agentName: str
    toolName: str
    args: Dict[str, Any] = Field(default_factory=dict)
    status: ToolCallStatus
    startedAt: str
    completedAt: Optional[str] = None
    summary: Optional[str] = None
    evidenceIds: List[str] = Field(default_factory=list)


class AgentReport(BaseModel):
    reportId: str
    runId: str
    agentName: str
    title: str
    summary: str
    createdAt: str


class AgentDecision(BaseModel):
    action: AgentDecisionAction
    horizon: AgentDecisionHorizon
    confidence: float
    thesis: str
    risks: List[str] = Field(default_factory=list)
    evidenceIds: List[str] = Field(default_factory=list)
    summary: Optional[str] = None
    triggerConditions: List[str] = Field(default_factory=list)
    invalidationConditions: List[str] = Field(default_factory=list)
    observationIndicators: List[str] = Field(default_factory=list)


class RuntimeMetrics(BaseModel):
    llmCalls: int = 0
    toolCalls: int = 0
    generatedReports: int = 0
    durationSeconds: int = 0
    estimatedCostUsd: Optional[float] = None


class AgentParticipant(BaseModel):
    agentId: str
    name: str
    role: str
    team: str
    status: AgentStatus


class EvidenceReference(BaseModel):
    evidenceId: str
    title: str
    evidenceType: str
    sourceName: str
    qualityScore: int
    summary: str
    reliabilityScore: Optional[int] = None
    url: Optional[str] = None
    publishedAt: Optional[str] = None
    collectedAt: Optional[str] = None
    relatedAssetIds: List[str] = Field(default_factory=list)
    extractedFields: Dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeEvent(BaseModel):
    eventId: str
    runId: str
    type: AgentRuntimeEventType
    timestamp: str
    sequence: int
    agentName: Optional[str] = None
    team: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeSnapshot(BaseModel):
    runId: str
    status: AgentRuntimeStatus
    sequence: int
    agents: List[AgentParticipant] = Field(default_factory=list)
    toolCalls: List[ToolCall] = Field(default_factory=list)
    reports: List[AgentReport] = Field(default_factory=list)
    evidenceIds: List[str] = Field(default_factory=list)
    finalDecision: Optional[AgentDecision] = None
    metrics: RuntimeMetrics = Field(default_factory=RuntimeMetrics)
    events: List[AgentRuntimeEvent] = Field(default_factory=list)


class AgentRun(BaseModel):
    runId: str
    name: str
    target: str
    taskType: str
    riskLevel: Literal["low", "medium", "high"]
    status: AgentRunStatus
    assetIds: List[str] = Field(default_factory=list)
    portfolioId: Optional[str] = None
    strategyId: Optional[str] = None
    triggeredBy: str
    modelName: Optional[str] = None
    startedAt: str
    updatedAt: Optional[str] = None
    completedAt: Optional[str] = None
    agents: List[AgentParticipant] = Field(default_factory=list)
    toolCalls: List[ToolCall] = Field(default_factory=list)
    reports: List[AgentReport] = Field(default_factory=list)
    events: List[AgentRuntimeEvent] = Field(default_factory=list)
    evidenceIds: List[str] = Field(default_factory=list)
    finalDecision: AgentDecision
    metrics: RuntimeMetrics = Field(default_factory=RuntimeMetrics)


class AgentRunListResponse(BaseModel):
    items: List[AgentRun]
    total: int
    limit: int
    offset: int


class CreateDemoAgentRunRequest(BaseModel):
    assetId: str
    taskType: str = "single_asset_analysis"
    question: str


class EvidenceScope(BaseModel):
    includeNews: bool = True
    includeReports: bool = True
    includeMacro: bool = True
    includeMarketSnapshot: bool = True


class AgentRunnerConfig(BaseModel):
    runnerType: AgentRunnerMode = "stub"
    modelProvider: str = "none"
    modelName: str = "none"
    enableStreaming: bool = True


class SubmitAgentRunRequest(BaseModel):
    assetId: Optional[str] = None
    portfolioId: Optional[str] = None
    strategyId: Optional[str] = None
    taskType: AgentTaskType = "single_asset_analysis"
    question: str
    horizon: InvestmentHorizon = "medium_term"
    riskPreference: RiskPreference = "balanced"
    evidenceScope: EvidenceScope = Field(default_factory=EvidenceScope)
    runnerConfig: AgentRunnerConfig = Field(default_factory=AgentRunnerConfig)


class SubmitAgentRunResponse(BaseModel):
    runId: str
    status: AgentRunStatus
    mode: AgentRunnerMode = "stub"
    message: str
    run: AgentRun
