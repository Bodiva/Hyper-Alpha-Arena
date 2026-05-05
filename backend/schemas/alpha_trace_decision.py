from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from schemas.alpha_trace_agent_runtime import AgentRun, EvidenceReference


class DecisionExpectedOutcome(BaseModel):
    targetReturn: float = 0
    expectedMaxDrawdown: float = 0
    reviewDate: str = ""
    note: str = "Generated from AlphaTrace Agent Runtime; no realized outcome is available yet."


class DecisionActualOutcome(BaseModel):
    realizedReturn: float = 0
    realizedMaxDrawdown: float = 0
    status: str = "PENDING"
    asOf: str = ""
    note: str = "Pending validation."


class DecisionAttributionFactor(BaseModel):
    factor: str
    contribution: float = 0
    explanation: str


class DecisionAttribution(BaseModel):
    summary: str
    factors: List[DecisionAttributionFactor] = Field(default_factory=list)
    riskReview: Dict[str, List[str]] = Field(default_factory=dict)
    mistakeReview: Optional[Dict[str, List[str] | str]] = None
    agentContributions: List[Dict[str, str | float]] = Field(default_factory=list)
    learningPoints: List[str] = Field(default_factory=list)


class AlphaTraceDecisionItem(BaseModel):
    decisionId: str
    runId: str
    assetIds: List[str] = Field(default_factory=list)
    portfolioId: Optional[str] = None
    action: str
    horizon: str
    confidence: float
    thesis: str
    risks: List[str] = Field(default_factory=list)
    evidenceIds: List[str] = Field(default_factory=list)
    expectedOutcome: DecisionExpectedOutcome = Field(default_factory=DecisionExpectedOutcome)
    actualOutcome: Optional[DecisionActualOutcome] = None
    attribution: DecisionAttribution
    createdAt: str


class DecisionListResponse(BaseModel):
    items: List[AlphaTraceDecisionItem]
    total: int
    limit: int
    offset: int = 0


class DecisionEvidenceResponse(BaseModel):
    decisionId: str
    items: List[EvidenceReference]
    total: int
    limit: int


class DecisionAgentRunResponse(BaseModel):
    decisionId: str
    run: AgentRun
