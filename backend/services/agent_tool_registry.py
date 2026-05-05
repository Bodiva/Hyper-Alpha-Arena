from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class AgentToolContract:
    tool_name: str
    display_name: str
    category: str
    source: str
    auth_mode: str
    timeout_policy: str
    output_class: str
    description: str

    def to_payload(self) -> Dict[str, str]:
        return {
            "toolName": self.tool_name,
            "displayName": self.display_name,
            "category": self.category,
            "source": self.source,
            "authMode": self.auth_mode,
            "timeoutPolicy": self.timeout_policy,
            "outputClass": self.output_class,
            "description": self.description,
        }


_TOOL_CONTRACTS: Dict[str, AgentToolContract] = {
    "market.context.load": AgentToolContract(
        tool_name="market.context.load",
        display_name="Market Context Loader",
        category="market_data",
        source="alphatrace_static_market_seed",
        auth_mode="none",
        timeout_policy="local_read",
        output_class="market_context",
        description="Loads AlphaTrace static market snapshot, quote, indicators, and context for an asset.",
    ),
    "portfolio.context.load": AgentToolContract(
        tool_name="portfolio.context.load",
        display_name="Portfolio Context Loader",
        category="portfolio_context",
        source="alphatrace_portfolio_store",
        auth_mode="none",
        timeout_policy="local_read",
        output_class="portfolio_context",
        description="Loads AlphaTrace portfolio detail, holdings, recommendations, strategies, and evidence links.",
    ),
    "evidence.retrieve": AgentToolContract(
        tool_name="evidence.retrieve",
        display_name="Evidence Retriever",
        category="evidence",
        source="alphatrace_evidence_store",
        auth_mode="none_or_server_side_external",
        timeout_policy="bounded_with_fallback",
        output_class="evidence_items",
        description="Retrieves static, run-scoped, and optional external evidence mapped into AlphaTrace EvidenceItem.",
    ),
    "bocha.search": AgentToolContract(
        tool_name="bocha.search",
        display_name="Bocha Web Search",
        category="external_search",
        source="bocha_web_search",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_optional_fallback",
        output_class="external_evidence_items",
        description="Calls Bocha Web Search on the backend and maps results into AlphaTrace EvidenceItem.",
    ),
    "qwen.market_view": AgentToolContract(
        tool_name="qwen.market_view",
        display_name="Qwen Market View",
        category="model_call",
        source="qwen_openai_compatible_api",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_step_timeout",
        output_class="agent_report_section",
        description="Generates market or portfolio overview text from AlphaTrace context and evidence.",
    ),
    "qwen.bull_view": AgentToolContract(
        tool_name="qwen.bull_view",
        display_name="Qwen Bull View",
        category="model_call",
        source="qwen_openai_compatible_api",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_step_timeout",
        output_class="agent_report_section",
        description="Generates constructive thesis arguments with evidence references.",
    ),
    "qwen.bear_view": AgentToolContract(
        tool_name="qwen.bear_view",
        display_name="Qwen Bear View",
        category="model_call",
        source="qwen_openai_compatible_api",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_step_timeout",
        output_class="agent_report_section",
        description="Generates risk, downside, and invalidation arguments with evidence references.",
    ),
    "qwen.research_manager": AgentToolContract(
        tool_name="qwen.research_manager",
        display_name="Qwen Research Manager",
        category="model_call",
        source="qwen_openai_compatible_api",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_step_timeout",
        output_class="agent_report_section",
        description="Aggregates Market, Bull, and Bear outputs into consensus, disagreements, and open validation questions.",
    ),
    "qwen.risk_review": AgentToolContract(
        tool_name="qwen.risk_review",
        display_name="Qwen Risk Review",
        category="model_call",
        source="qwen_openai_compatible_api",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_step_timeout",
        output_class="agent_report_section",
        description="Generates risk review across bull/bear outputs, market context, and evidence.",
    ),
    "qwen.final_decision": AgentToolContract(
        tool_name="qwen.final_decision",
        display_name="Qwen Final Decision",
        category="model_call",
        source="qwen_openai_compatible_api",
        auth_mode="server_side_api_key",
        timeout_policy="bounded_step_timeout",
        output_class="agent_decision",
        description="Generates normalized final action, confidence, thesis, risks, watch indicators, and evidence IDs.",
    ),
}


def get_agent_tool_contract(tool_name: str | None) -> Optional[AgentToolContract]:
    if not tool_name:
        return None
    return _TOOL_CONTRACTS.get(tool_name)


def list_agent_tool_contracts() -> list[AgentToolContract]:
    return list(_TOOL_CONTRACTS.values())
