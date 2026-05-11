from __future__ import annotations

import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentParticipant,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    DecisionTrace,
    DecisionTraceStep,
    EvidenceReference,
    RuntimeMetrics,
    SubmitAgentRunRequest,
    SubmitAgentRunResponse,
)
from schemas.research_workspace_taxonomy import resolve_research_artifact_type
from services.agent_runners.base import AgentRunnerContext
from services.agent_runners.registry import AgentRunnerConfigurationError, AgentRunnerExecutionError
from services.agent_orchestrator.tool_executor import ToolExecutor
from services.agent_tool_registry import get_agent_tool_contract
from services.catalog_context_service import CatalogContextError, build_catalog_evidence_items, load_catalog_market_context
from services.clickhouse_agent_context import (
    ClickHouseAgentContextError,
    build_clickhouse_monitor_context,
    is_clickhouse_monitor_asset_id,
)
from services.evidence_retrieval.retriever import EvidenceRetriever, to_evidence_reference
from services.evidence_retrieval.static_evidence_seed import EvidenceItem
from services.integration_adapters import (
    BochaSearchToolAdapter,
    EvidenceRetrieveToolAdapter,
    MarketContextToolAdapter,
    PreparedDataQueryToolAdapter,
    ToolInvocationRequest,
)
from services.evidence_retrieval.support_scoring import score_evidence_support
from services.market_data_store.market_data_store import get_static_market_data_store
from services.portfolio_store.portfolio_store import get_static_portfolio_store


QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_DEFAULT_MODEL = "qwen-plus"
QWEN_DEFAULT_TIMEOUT_SECONDS = 120
QWEN_DEFAULT_MAX_TOKENS = 900
QWEN_AGENT_MAX_PARALLEL_CALLS = 2
QWEN_AGENT_STEP_TIMEOUT_SECONDS = 90
QWEN_AGENTIC_LOOP_ROUNDS = 2
QWEN_STREAM_CHUNK_CHARS = 240
QWEN_STREAM_MIN_CHUNK_CHARS = 80
QWEN_STREAM_MAX_WAIT_SECONDS = 1.8
QWEN_STREAM_CHUNK_SECONDS = 0.45
QWEN_TOKEN_METRIC_FLUSH_TOKENS = 1000
QWEN_TOKEN_METRIC_FLUSH_SECONDS = 6.0
ALPHATRACE_RUNTIME_CONTRACT_VERSION = "alphatrace_agent_runtime_v1"

STEP_DEPENDENCIES: Dict[str, List[str]] = {
    "evidence_retrieval": [],
    "market_view": ["evidence_retrieval"],
    "bull_view": ["market_view"],
    "bear_view": ["market_view"],
    "research_manager": ["bull_view", "bear_view"],
    "risk_review": ["research_manager"],
    "final_decision": ["risk_review"],
}


class QwenRunCancelled(Exception):
    """Raised internally when a persisted AgentRun has been cancelled."""


class QwenRunnerAdapter:
    runner_type = "qwen"
    run_id_prefix = "run_qwen"
    triggered_by = "qwen_runner"
    adapter_display_name = "AlphaTrace 投研任务执行器"
    run_name = "AlphaTrace 资产投研任务"
    portfolio_run_name = "AlphaTrace 组合投研复核"
    initial_agent_name = "投研编排器"
    initial_reasoning_content = "正在准备投研流程：证据准备、市场环境、多轮正反交锋、研究汇总、风险复核和决策链路。"
    response_message = "投研任务已提交，AlphaTrace 投研任务执行器正在后台运行。"
    worker_name_prefix = "alpha-trace-qwen"

    def __init__(self) -> None:
        self._event_lock = threading.RLock()
        self._token_metric_state: Dict[str, Dict[str, Any]] = {}
        self._event_sequence_state: Dict[str, int] = {}

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        config = self._resolve_qwen_config(request, context)
        run = self._create_running_run(request, config["model"], config["source"])
        context.save_run(run)

        worker = threading.Thread(
            target=self._execute_qwen_run,
            args=(request, context, run.runId, config),
            name=f"{self.worker_name_prefix}-{run.runId}",
            daemon=True,
        )
        worker.start()

        return SubmitAgentRunResponse(
            runId=run.runId,
            status=run.status,
            mode=self.runner_type,
            message=self.response_message,
            run=run,
        )

    def _execute_qwen_run(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
        config: Dict[str, str],
    ) -> None:
        try:
            self._raise_if_cancelled(context, run_id)
            portfolio_context = self._load_portfolio_context(request, context, run_id)
            self._raise_if_cancelled(context, run_id)
            market_context = self._load_market_context(request, context, run_id)
            self._raise_if_cancelled(context, run_id)
            retrieved_evidence = self._retrieve_evidence(request, context, run_id, portfolio_context)
            self._raise_if_cancelled(context, run_id)
            is_portfolio_task = self._is_portfolio_diagnosis(request)

            market_title = "Market View / Portfolio Overview" if is_portfolio_task else "Market View"
            market_instructions = (
                "基于组合持仓、资产类别暴露、风险指标和调仓建议，输出 Portfolio Overview、Exposure Review 和 Market View。必须引用 evidenceId。"
                if is_portfolio_task
                else "生成市场环境、趋势、流动性、波动和宏观背景。必须引用 evidenceId。"
            )

            market_view = self._run_qwen_agent_step(
                request=request,
                context=context,
                run_id=run_id,
                config=config,
                evidence_items=retrieved_evidence,
                step_id="market_view",
                agent_name="市场环境分析师",
                team="analyst_team",
                tool_name="qwen.market_view",
                title=market_title,
                instructions=market_instructions,
                prior_results={},
                required=True,
                portfolio_context=portfolio_context,
                market_context=market_context,
            )
            self._raise_if_cancelled(context, run_id)

            parallel_workers = self._int_env(
                "QWEN_AGENT_MAX_PARALLEL_CALLS",
                QWEN_AGENT_MAX_PARALLEL_CALLS,
                minimum=1,
                maximum=2,
            )
            with ThreadPoolExecutor(max_workers=parallel_workers, thread_name_prefix=f"qwen-bull-bear-{run_id}") as executor:
                bull_future = executor.submit(
                    self._run_qwen_agent_step,
                    request,
                    context,
                    run_id,
                    config,
                    retrieved_evidence,
                    "bull_view",
                    "正方研究员",
                    "research_team",
                    "qwen.bull_view",
                    "Bull View",
                    (
                        "输入 Portfolio Overview / Market View，生成支持当前组合结构、调仓方向或维持配置的正方观点。必须引用 evidenceId。"
                        if is_portfolio_task
                        else "输入 Market View，生成支持配置/增配/持有的正方观点。必须引用 evidenceId。"
                    ),
                    {"Market View": market_view},
                    False,
                    portfolio_context,
                    market_context,
                )
                bear_future = executor.submit(
                    self._run_qwen_agent_step,
                    request,
                    context,
                    run_id,
                    config,
                    retrieved_evidence,
                    "bear_view",
                    "反方研究员",
                    "research_team",
                    "qwen.bear_view",
                    "Bear View",
                    (
                        "输入 Portfolio Overview / Market View，生成组合集中度、回撤、流动性、相关性和调仓失效条件等反方观点。必须引用 evidenceId。"
                        if is_portfolio_task
                        else "输入 Market View，生成风险、反方观点和失效条件。必须引用 evidenceId。"
                    ),
                    {"Market View": market_view},
                    False,
                    portfolio_context,
                    market_context,
                )
                bull_view = bull_future.result()
                bear_view = bear_future.result()
            self._raise_if_cancelled(context, run_id)

            debate_history = [{"round": 1, "bull": bull_view, "bear": bear_view}]
            agentic_loop_rounds = self._agentic_loop_rounds()
            if agentic_loop_rounds > 1:
                self._append_event(
                    context,
                    run_id,
                    "checkpoint.created",
                    self._step_payload(
                        "research_manager",
                        progress=35,
                        phase="agentic_loop",
                        title="观点交叉质询",
                        summary=f"启动 {agentic_loop_rounds} 轮观点交锋，正反方会基于上一轮互相修正。",
                    ),
                    agent_name="研究经理",
                    team="research_team",
                )
                for round_index in range(2, agentic_loop_rounds + 1):
                    previous_bull = bull_view
                    previous_bear = bear_view
                    loop_prior_results = {
                        "Market View": market_view,
                        "Previous Bull View": previous_bull,
                        "Previous Bear View": previous_bear,
                    }
                    with ThreadPoolExecutor(max_workers=parallel_workers, thread_name_prefix=f"qwen-loop-{round_index}-{run_id}") as executor:
                        bull_future = executor.submit(
                            self._run_qwen_agent_step,
                            request,
                            context,
                            run_id,
                            config,
                            retrieved_evidence,
                            "bull_view",
                            "正方研究员",
                            "research_team",
                            "qwen.bull_view",
                            f"Bull View Round {round_index}",
                            (
                                f"第 {round_index} 轮 agentic loop：先回应上一轮反方观点，明确哪些风险可以被证据缓释，"
                                "哪些正方论据需要降权或补充条件。必须引用 evidenceId，避免重复上一轮原文。"
                            ),
                            loop_prior_results,
                            False,
                            portfolio_context,
                            market_context,
                        )
                        bear_future = executor.submit(
                            self._run_qwen_agent_step,
                            request,
                            context,
                            run_id,
                            config,
                            retrieved_evidence,
                            "bear_view",
                            "反方研究员",
                            "research_team",
                            "qwen.bear_view",
                            f"Bear View Round {round_index}",
                            (
                                f"第 {round_index} 轮 agentic loop：先回应上一轮正方观点，指出仍未被证据解决的风险、"
                                "前提漏洞、估值或流动性约束。必须引用 evidenceId，避免重复上一轮原文。"
                            ),
                            loop_prior_results,
                            False,
                            portfolio_context,
                            market_context,
                        )
                        bull_view = bull_future.result()
                        bear_view = bear_future.result()
                    self._raise_if_cancelled(context, run_id)
                    debate_history.append({"round": round_index, "bull": bull_view, "bear": bear_view})
                    self._append_event(
                        context,
                        run_id,
                        "checkpoint.created",
                        self._step_payload(
                            "research_manager",
                            progress=min(35 + round_index * 15, 75),
                            phase="agentic_loop",
                            round=round_index,
                            title=f"第 {round_index} 轮观点交锋完成",
                            summary="正反方已基于上一轮观点完成交叉修正。",
                        ),
                        agent_name="研究经理",
                        team="research_team",
                    )
            debate_loop_summary = self._format_agentic_loop_history(debate_history)

            research_prior_results = {
                "Market View": market_view,
                "Bull View": bull_view,
                "Bear View": bear_view,
            }
            if debate_loop_summary:
                research_prior_results["Agentic Loop History"] = debate_loop_summary
            research_manager = self._run_qwen_agent_step(
                request=request,
                context=context,
                run_id=run_id,
                config=config,
                evidence_items=retrieved_evidence,
                step_id="research_manager",
                agent_name="研究经理",
                team="research_team",
                tool_name="qwen.research_manager",
                title="Research Manager Summary",
                instructions=(
                    "输入 Portfolio Overview / Market View / 多轮 Bull / Bear 观点交锋，汇总共识、关键分歧、仍需验证的问题，以及组合诊断优先级。必须引用 evidenceId。"
                    if is_portfolio_task
                    else "输入 Market / 多轮 Bull / Bear 观点交锋，汇总正反方共识、关键分歧、仍需验证的问题，以及后续 Risk Review 应重点检查的风险。必须引用 evidenceId。"
                ),
                prior_results=research_prior_results,
                required=False,
                portfolio_context=portfolio_context,
                market_context=market_context,
            )
            self._raise_if_cancelled(context, run_id)

            risk_review = self._run_qwen_agent_step(
                request=request,
                context=context,
                run_id=run_id,
                config=config,
                evidence_items=retrieved_evidence,
                step_id="risk_review",
                agent_name="风险复核员",
                team="risk_team",
                tool_name="qwen.risk_review",
                title="Risk Review / Rebalance Suggestions" if is_portfolio_task else "Risk Review",
                instructions=(
                    "输入 Market / Bull / Bear / Research Manager 和组合上下文，诊断资产配置、风险暴露、调仓建议、最大回撤、波动、集中度、流动性和情景风险。"
                    "必须输出 Conservative Risk Perspective、Neutral Risk Perspective、Aggressive Risk Perspective 三个小节，并引用 evidenceId。"
                    if is_portfolio_task
                    else "输入 Market / Bull / Bear / Research Manager，评估最大回撤、波动、集中度、流动性、情景风险和需要观察的风险指标。"
                    "必须输出 Conservative Risk Perspective、Neutral Risk Perspective、Aggressive Risk Perspective 三个小节，并引用 evidenceId。"
                ),
                prior_results={
                    "Market View": market_view,
                    "Bull View": bull_view,
                    "Bear View": bear_view,
                    "Agentic Loop History": debate_loop_summary,
                    "Research Manager Summary": research_manager,
                },
                required=True,
                portfolio_context=portfolio_context,
                market_context=market_context,
            )
            self._raise_if_cancelled(context, run_id)
            risk_review = self._ensure_risk_perspective_sections(risk_review)
            for perspective, perspective_content in self._extract_risk_perspectives(risk_review).items():
                self._append_event(
                    context,
                    run_id,
                    "risk.warning",
                    self._step_payload(
                        "risk_review",
                        progress=70,
                        level="MEDIUM",
                        riskPerspective=perspective,
                        content=perspective_content[:1000],
                    ),
                    agent_name="风险复核员",
                    team="risk_team",
                )

            final_decision = self._run_qwen_agent_step(
                request=request,
                context=context,
                run_id=run_id,
                config=config,
                evidence_items=retrieved_evidence,
                step_id="final_decision",
                agent_name="配置观察员",
                team="portfolio_team",
                tool_name="qwen.final_decision",
                title="Final Diagnosis" if is_portfolio_task else "Final Decision",
                instructions=(
                    "输入 Portfolio Overview / Bull / Bear / Risk，输出 Final Diagnosis、调仓建议、观察指标，以及 action: overweight / underweight / hold / watch / avoid，confidence: 0-1，thesis，risks，watchIndicators，evidenceIds。"
                    if is_portfolio_task
                    else "输入 Market / Bull / Bear / Risk，输出 action: overweight / underweight / hold / watch / avoid，confidence: 0-1，thesis，risks，watchIndicators，evidenceIds。"
                ),
                prior_results={
                    "Market View": market_view,
                    "Bull View": bull_view,
                    "Bear View": bear_view,
                    "Agentic Loop History": debate_loop_summary,
                    "Research Manager Summary": research_manager,
                    "Risk Review": risk_review,
                },
                required=True,
                portfolio_context=portfolio_context,
                market_context=market_context,
            )
            self._raise_if_cancelled(context, run_id)

            content = (
                f"## Market View\n{market_view}\n\n"
                f"## Bull View\n{bull_view}\n\n"
                f"## Bear View\n{bear_view}\n\n"
                f"## Agentic Loop History\n{debate_loop_summary}\n\n"
                f"## Research Manager Summary\n{research_manager}\n\n"
                f"## Risk Review\n{risk_review}\n\n"
                f"## Final Decision\n{final_decision}\n\n"
                f"## Watch Indicators\n{final_decision}"
            )
            self._map_qwen_response(
                request=request,
                context=context,
                model=config["model"],
                content=content,
                config_source=config["source"],
                run_id=run_id,
                existing_events=self._get_existing_events(context, run_id),
                retrieved_evidence=retrieved_evidence,
            )
        except QwenRunCancelled:
            return
        except Exception as exc:
            self._mark_run_failed(context, run_id, exc)

    @staticmethod
    def _is_portfolio_diagnosis(request: SubmitAgentRunRequest) -> bool:
        return request.taskType in {"portfolio_diagnostic", "portfolio_diagnosis"}

    def _agentic_loop_rounds(self) -> int:
        return self._int_env(
            "QWEN_AGENTIC_LOOP_ROUNDS",
            QWEN_AGENTIC_LOOP_ROUNDS,
            minimum=1,
            maximum=4,
        )

    @staticmethod
    def _format_agentic_loop_history(debate_history: List[Dict[str, str]]) -> str:
        if not debate_history:
            return ""
        sections: list[str] = []
        for item in debate_history:
            round_label = item.get("round", "?")
            bull = str(item.get("bull") or "").strip()
            bear = str(item.get("bear") or "").strip()
            sections.append(
                f"### Round {round_label}\n"
                f"- Bull View: {bull[:1200]}\n"
                f"- Bear View: {bear[:1200]}"
            )
        return "\n\n".join(sections)

    def _load_portfolio_context(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> Optional[Dict[str, Any]]:
        if not request.portfolioId:
            return None

        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress=15,
                toolName="portfolio.context.load",
                args={"portfolioId": request.portfolioId, "source": "static_portfolio_store"},
            ),
            agent_name="Portfolio Context Loader",
            team="analyst_team",
        )
        try:
            store = get_static_portfolio_store()
            portfolio = store.get_portfolio(request.portfolioId)
            if not portfolio:
                self._append_event(
                    context,
                    run_id,
                    "tool.result",
                    self._step_payload(
                        "evidence_retrieval",
                        progress=20,
                        toolName="portfolio.context.load",
                        status="not_found",
                        summary=f"Portfolio {request.portfolioId} was not found in static portfolio store.",
                    ),
                    agent_name="Portfolio Context Loader",
                    team="analyst_team",
                )
                return {"portfolioId": request.portfolioId, "available": False}

            holdings = store.get_portfolio_holdings(request.portfolioId)
            recommendations = store.get_portfolio_recommendations(request.portfolioId)
            related_assets = store.get_portfolio_assets(request.portfolioId)
            related_strategies = store.get_portfolio_strategies(request.portfolioId)
            portfolio_context = {
                "available": True,
                "portfolioId": portfolio.portfolioId,
                "name": portfolio.name,
                "objective": portfolio.objective,
                "riskLevel": portfolio.riskLevel,
                "status": portfolio.status,
                "description": portfolio.description,
                "baseCurrency": portfolio.baseCurrency,
                "totalValue": portfolio.totalValue,
                "cashWeight": portfolio.cashWeight,
                "updatedAt": portfolio.updatedAt,
                "riskMetrics": portfolio.riskMetrics.model_dump(mode="json"),
                "exposures": [item.model_dump(mode="json") for item in portfolio.exposures],
                "holdings": [item.model_dump(mode="json") for item in holdings],
                "rebalanceRecommendations": [item.model_dump(mode="json") for item in recommendations],
                "relatedAssets": [
                    {
                        "assetId": item.assetId,
                        "symbol": item.symbol,
                        "name": item.name,
                        "assetType": item.assetType,
                        "market": item.market,
                        "tags": item.tags,
                    }
                    for item in related_assets
                ],
                "relatedStrategies": [
                    {
                        "strategyId": item.strategyId,
                        "strategyName": item.strategyName,
                        "strategyType": item.strategyType,
                        "style": item.style,
                        "riskLevel": item.riskLevel,
                    }
                    for item in related_strategies
                ],
            }
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=25,
                    toolName="portfolio.context.load",
                    status="completed",
                    summary=(
                        f"Loaded portfolio context with {len(holdings)} holdings, "
                        f"{len(recommendations)} rebalance recommendations, "
                        f"{len(related_assets)} related assets, and {len(related_strategies)} related strategies."
                    ),
                    portfolioId=portfolio.portfolioId,
                ),
                agent_name="Portfolio Context Loader",
                team="analyst_team",
            )
            return portfolio_context
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=20,
                    toolName="portfolio.context.load",
                    status="failed",
                    summary=f"Portfolio context loading failed; the research workflow will continue without portfolio seed context. Error: {exc}",
                ),
                agent_name="Portfolio Context Loader",
                team="analyst_team",
            )
            return {"portfolioId": request.portfolioId, "available": False, "error": str(exc)}

    def _load_market_context(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> Optional[Dict[str, Any]]:
        if os.getenv("ALPHATRACE_USE_TOOL_ADAPTERS", "").strip().lower() == "true":
            monitor_context = self._load_clickhouse_monitor_market_context(request, context, run_id)
            if monitor_context:
                return monitor_context
            return self._load_market_context_with_tool_adapter(request, context, run_id)

        catalog_context = (
            self._load_catalog_market_context(request, context, run_id)
            if self._should_load_catalog_context(request)
            else None
        )

        if not request.assetId:
            return catalog_context

        monitor_context = self._load_clickhouse_monitor_market_context(request, context, run_id)
        if monitor_context:
            return self._merge_catalog_market_context(monitor_context, catalog_context)

        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress=18,
                toolName="market.context.load",
                args={"assetId": request.assetId, "source": "alphatrace_market_context"},
            ),
            agent_name="Market Context Loader",
            team="analyst_team",
        )
        try:
            market_context = get_static_market_data_store().get_prompt_context(request.assetId)
            if not market_context:
                self._append_event(
                    context,
                    run_id,
                    "tool.result",
                    self._step_payload(
                        "evidence_retrieval",
                        progress=20,
                        toolName="market.context.load",
                        status="not_found",
                        summary=f"Market context not found for asset {request.assetId}.",
                    ),
                    agent_name="Market Context Loader",
                    team="analyst_team",
                )
                return catalog_context
            market_context = self._merge_catalog_market_context(market_context, catalog_context)
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=22,
                    toolName="market.context.load",
                    status="completed",
                    summary=f"Loaded AlphaTrace static market context for {request.assetId}.",
                    assetId=request.assetId,
                    source=market_context.get("source"),
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            return market_context
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=20,
                    toolName="market.context.load",
                    status="failed",
                    summary=f"Market context load failed; the research workflow will continue without market seed context. Error: {exc}",
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            return None

    def _load_clickhouse_monitor_market_context(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> Optional[Dict[str, Any]]:
        if not is_clickhouse_monitor_asset_id(request.assetId):
            return None

        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress=18,
                toolName="ck.monitor.context.load",
                args={
                    "assetId": request.assetId,
                    "source": "clickhouse_monitor",
                    "database": "monitor",
                },
            ),
            agent_name="Market Context Loader",
            team="analyst_team",
        )
        try:
            market_context = build_clickhouse_monitor_context(str(request.assetId), kline_limit=900)
        except ClickHouseAgentContextError as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=20,
                    toolName="ck.monitor.context.load",
                    status="failed",
                    source="clickhouse_monitor",
                    summary=f"ClickHouse monitor context load failed; the research workflow will continue with other context. Error: {exc}",
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            return None
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=20,
                    toolName="ck.monitor.context.load",
                    status="failed",
                    source="clickhouse_monitor",
                    summary=f"ClickHouse monitor context load failed unexpectedly; the research workflow will continue with other context. Error: {exc}",
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            return None

        if not market_context:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=20,
                    toolName="ck.monitor.context.load",
                    status="not_found",
                    source="clickhouse_monitor",
                    summary=f"ClickHouse monitor context not found for asset {request.assetId}.",
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            return None

        self._append_event(
            context,
            run_id,
            "tool.result",
            self._step_payload(
                "evidence_retrieval",
                progress=24,
                toolName="ck.monitor.context.load",
                status="completed",
                source="clickhouse_monitor",
                assetId=request.assetId,
                symbol=market_context.get("symbol"),
                klinePoints=(market_context.get("klineSummary") or {}).get("points"),
                managerCount=len(market_context.get("fundManagers") or []),
                sourceRefs=market_context.get("sourceRefs"),
                summary=f"Loaded ClickHouse monitor context for {request.assetId}.",
            ),
            agent_name="Market Context Loader",
            team="analyst_team",
        )
        return market_context

    @staticmethod
    def _data_context_payload(request: SubmitAgentRunRequest) -> Dict[str, Any]:
        extra = request.runnerConfig.extraParams or {}
        data_context = extra.get("dataContext") if isinstance(extra, dict) else None
        return data_context if isinstance(data_context, dict) else {}

    @staticmethod
    def _has_explicit_catalog_context(request: SubmitAgentRunRequest) -> bool:
        data_context = QwenRunnerAdapter._data_context_payload(request)
        return bool(data_context.get("datasetId") or data_context.get("importId"))

    @staticmethod
    def _should_load_catalog_context(request: SubmitAgentRunRequest) -> bool:
        return QwenRunnerAdapter._has_explicit_catalog_context(request) or (
            bool(request.assetId) and not is_clickhouse_monitor_asset_id(request.assetId)
        )

    @staticmethod
    def _research_target_payload(request: SubmitAgentRunRequest) -> Dict[str, Any]:
        extra = request.runnerConfig.extraParams or {}
        research_target = extra.get("researchTarget") if isinstance(extra, dict) else None
        return research_target if isinstance(research_target, dict) else {}

    @staticmethod
    def _resolve_target_id(request: SubmitAgentRunRequest, is_portfolio_task: bool) -> str:
        research_target = QwenRunnerAdapter._research_target_payload(request)
        label = str(research_target.get("label") or "").strip()
        return request.portfolioId or request.assetId or label or ("portfolio_diagnosis" if is_portfolio_task else "agent_task")

    @staticmethod
    def _merge_catalog_market_context(
        market_context: Optional[Dict[str, Any]],
        catalog_context: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not catalog_context:
            return market_context
        merged = dict(market_context or {})
        source = str(merged.get("source") or "alphatrace_static_market_seed")
        merged["source"] = f"{source}+clickhouse_catalog" if source else "clickhouse_catalog"
        merged["catalogContext"] = catalog_context
        return merged

    def _load_catalog_market_context(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> Optional[Dict[str, Any]]:
        data_context = self._data_context_payload(request)
        if not data_context.get("datasetId") and not request.assetId:
            return None

        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress=12,
                toolName="ck.catalog.context.load",
                args={
                    "datasetId": data_context.get("datasetId"),
                    "assetSymbol": data_context.get("assetSymbol"),
                    "source": data_context.get("source") or "catalog",
                    "assetId": request.assetId,
                    "matchMode": "auto" if not data_context.get("datasetId") else "explicit",
                },
            ),
            agent_name="Catalog Context Loader",
            team="analyst_team",
        )
        try:
            catalog_context = load_catalog_market_context(request)
        except CatalogContextError as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=16,
                    toolName="ck.catalog.context.load",
                    status="failed",
                    summary=f"导入数据读取失败，任务将继续使用已配置的行情、证据和外部资料。错误：{exc}",
                ),
                agent_name="Catalog Context Loader",
                team="analyst_team",
            )
            return None

        if not catalog_context or catalog_context.get("status") != "available":
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=16,
                    toolName="ck.catalog.context.load",
                    status="not_found",
                    summary="未找到匹配的导入数据，任务将继续使用已配置的行情、证据和外部资料。",
                ),
                agent_name="Catalog Context Loader",
                team="analyst_team",
            )
            return None

        self._append_event(
            context,
            run_id,
            "tool.result",
            self._step_payload(
                "evidence_retrieval",
                progress=18,
                toolName="ck.catalog.context.load",
                status="completed",
                source="clickhouse_catalog",
                datasetId=catalog_context.get("datasetId"),
                matchMode=catalog_context.get("matchMode"),
                assetSymbol=catalog_context.get("assetSymbol"),
                rowCount=catalog_context.get("rowCount"),
                dateRange=catalog_context.get("dateRange"),
                summary=(
                    f"已加载导入数据 {catalog_context.get('datasetId')}，"
                    f"共 {catalog_context.get('rowCount')} 行。"
                ),
            ),
            agent_name="Catalog Context Loader",
            team="analyst_team",
        )
        return catalog_context

    def _load_market_context_with_tool_adapter(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> Optional[Dict[str, Any]]:
        if not request.assetId:
            return None
        tool_request = ToolInvocationRequest(
            tool_id="market.context.load",
            run_id=run_id,
            step_id="evidence_retrieval",
            agent_name="Market Context Loader",
            args={"assetId": request.assetId},
        )
        try:
            self._append_event(
                context,
                run_id,
                "tool.called",
                self._step_payload(
                    "evidence_retrieval",
                    10,
                    **ToolExecutor.build_called_payload(tool_request),
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            record = ToolExecutor().execute(MarketContextToolAdapter(), tool_request)
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload("evidence_retrieval", 20, **record.result_payload),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            if record.result.status != "completed":
                return None
            market_context = (record.result.payload or {}).get("marketContext")
            return market_context if isinstance(market_context, dict) else None
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    20,
                    toolName="market.context.load",
                    status="failed",
                    summary=f"Market context load failed through ToolAdapter; the research workflow will continue without market seed context. Error: {exc}",
                ),
                agent_name="Market Context Loader",
                team="analyst_team",
            )
            return None

    def _retrieve_evidence(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
        portfolio_context: Optional[Dict[str, Any]] = None,
    ) -> List[EvidenceItem]:
        if self._research_tools_enabled(request):
            return self._retrieve_evidence_with_research_tools(request, context, run_id, portfolio_context)

        if os.getenv("ALPHATRACE_USE_TOOL_ADAPTERS", "").strip().lower() == "true":
            return self._retrieve_evidence_with_tool_adapter(request, context, run_id)

        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress=30,
                toolName="evidence.retrieve",
                source="alphatrace_evidence_context",
                args={
                    "assetId": request.assetId,
                    "taskType": request.taskType,
                    "limit": 5,
                    "source": "alphatrace_evidence_context",
                },
            ),
            agent_name="Evidence Retriever",
            team="analyst_team",
        )
        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress=35,
                toolName="bocha.search",
                source="bocha_web_search",
                query=request.question,
                args={
                    "assetId": request.assetId,
                    "taskType": request.taskType,
                    "limit": 5,
                    "source": "bocha_web_search",
                },
            ),
            agent_name="Evidence Retriever",
            team="analyst_team",
        )
        try:
            retriever = EvidenceRetriever()
            if portfolio_context and portfolio_context.get("available") and not request.assetId:
                related_asset_ids = [
                    str(item.get("assetId"))
                    for item in [
                        *(portfolio_context.get("holdings") or []),
                        *(portfolio_context.get("relatedAssets") or []),
                    ]
                    if item.get("assetId")
                ]
                seen_evidence = set()
                items = []
                for asset_id in related_asset_ids[:8]:
                    for item in retriever.retrieve(
                        asset_id=asset_id,
                        question=request.question,
                        task_type=request.taskType,
                        limit=3,
                        include_external=True,
                    ):
                        if item.evidenceId not in seen_evidence:
                            items.append(item)
                            seen_evidence.add(item.evidenceId)
                        if len(items) >= 5:
                            break
                    if len(items) >= 5:
                        break
            else:
                items = retriever.retrieve(
                    asset_id=request.assetId,
                    question=request.question,
                    task_type=request.taskType,
                    limit=5,
                    include_external=True,
                )
            external_status = retriever.last_external_search
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=100,
                    toolName="evidence.retrieve",
                    status="failed",
                    summary=f"Evidence retrieval failed; the research workflow will continue with a temporary evidence-limited summary. Error: {exc}",
                ),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
            return []

        catalog_items: List[EvidenceItem] = []
        data_context = self._data_context_payload(request)
        if self._should_load_catalog_context(request):
            self._append_event(
                context,
                run_id,
                "tool.called",
                self._step_payload(
                    "evidence_retrieval",
                    progress=58,
                    toolName="ck.catalog.evidence",
                    source="clickhouse_catalog",
                    args={
                        "datasetId": data_context.get("datasetId"),
                        "assetSymbol": data_context.get("assetSymbol"),
                        "assetId": request.assetId,
                        "matchMode": "auto" if not data_context.get("datasetId") else "explicit",
                        "limit": 120,
                    },
                ),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
            try:
                catalog_items = build_catalog_evidence_items(request)
            except CatalogContextError as exc:
                self._append_event(
                    context,
                    run_id,
                    "tool.result",
                    self._step_payload(
                        "evidence_retrieval",
                        progress=62,
                        toolName="ck.catalog.evidence",
                        status="failed",
                        source="clickhouse_catalog",
                        summary=f"导入数据证据构建失败，任务将继续使用其他证据来源。错误：{exc}",
                    ),
                    agent_name="Evidence Retriever",
                    team="analyst_team",
                )
            if catalog_items:
                seen_item_ids = {item.evidenceId for item in catalog_items}
                items = [*catalog_items, *[item for item in items if item.evidenceId not in seen_item_ids]]
                self._append_event(
                    context,
                    run_id,
                    "tool.result",
                    self._step_payload(
                        "evidence_retrieval",
                        progress=65,
                        toolName="ck.catalog.evidence",
                        status="completed",
                        source="clickhouse_catalog",
                        evidenceIds=[item.evidenceId for item in catalog_items],
                        summary=f"已从导入数据构建 {len(catalog_items)} 条证据。",
                    ),
                    agent_name="Evidence Retriever",
                    team="analyst_team",
                )
            else:
                self._append_event(
                    context,
                    run_id,
                    "tool.result",
                    self._step_payload(
                        "evidence_retrieval",
                        progress=65,
                        toolName="ck.catalog.evidence",
                        status="not_found",
                        source="clickhouse_catalog",
                        summary="未从导入数据找到可用证据，任务将继续使用其他证据来源。",
                    ),
                    agent_name="Evidence Retriever",
                    team="analyst_team",
                )

        if external_status:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress=55,
                    toolName="bocha.search",
                    status=external_status.status,
                    source="bocha_web_search",
                    summary=external_status.message or f"Bocha search {external_status.status}.",
                    query=external_status.query,
                    evidenceIds=[item.evidenceId for item in external_status.items],
                ),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )

        evidence_ids = [item.evidenceId for item in items]
        self._append_event(
            context,
            run_id,
            "tool.result",
            self._step_payload(
                "evidence_retrieval",
                progress=85,
                toolName="evidence.retrieve",
                status="completed",
                source="clickhouse_catalog+bocha_web_search" if catalog_items else "bocha_web_search",
                summary=f"Retrieved {len(items)} evidence item(s) from catalog and optional Bocha search.",
                evidenceIds=evidence_ids,
            ),
            agent_name="Evidence Retriever",
            team="analyst_team",
        )
        if items:
            self._append_event(
                context,
                run_id,
                "evidence.linked",
                self._step_payload(
                    "evidence_retrieval",
                    progress=100,
                    evidenceIds=evidence_ids,
                    summary="Retrieved evidence items linked before prompt construction.",
                ),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
        return items

    @staticmethod
    def _research_tools_enabled(request: SubmitAgentRunRequest) -> bool:
        extra = request.runnerConfig.extraParams or {}
        value = extra.get("enableResearchTools", True) if isinstance(extra, dict) else True
        if isinstance(value, str):
            return value.strip().lower() not in {"false", "0", "no", "off"}
        return bool(value)

    @staticmethod
    def _external_search_enabled(request: SubmitAgentRunRequest) -> bool:
        extra = request.runnerConfig.extraParams or {}
        value: Any = request.evidenceScope.includeNews
        if isinstance(extra, dict):
            value = extra.get(
                "enableExternalSearch",
                extra.get("includeExternalEvidence", extra.get("include_external_evidence", value)),
            )
        if isinstance(value, str):
            return value.strip().lower() not in {"false", "0", "no", "off"}
        return bool(value)

    def _retrieve_evidence_with_research_tools(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
        portfolio_context: Optional[Dict[str, Any]] = None,
    ) -> List[EvidenceItem]:
        items: List[EvidenceItem] = []
        seen_ids: set[str] = set()

        def merge_items(next_items: List[EvidenceItem]) -> None:
            for item in next_items:
                if not item.evidenceId or item.evidenceId in seen_ids:
                    continue
                items.append(item)
                seen_ids.add(item.evidenceId)

        prepared_request = ToolInvocationRequest(
            tool_id="prepared_data.query",
            run_id=run_id,
            step_id="evidence_retrieval",
            agent_name="Prepared Data Query",
            args={
                "assetId": request.assetId,
                "portfolioId": request.portfolioId,
                "strategyId": request.strategyId,
                "question": request.question,
                "taskType": request.taskType,
                "dataContext": self._data_context_payload(request),
            },
            context={"question": request.question, "taskType": request.taskType},
        )
        self._execute_evidence_tool(
            adapter=PreparedDataQueryToolAdapter(),
            tool_request=prepared_request,
            context=context,
            run_id=run_id,
            progress_called=25,
            progress_result=38,
            agent_name="Prepared Data Query",
            team="data_center",
            merge_items=merge_items,
        )

        static_request = ToolInvocationRequest(
            tool_id="evidence.retrieve",
            run_id=run_id,
            step_id="evidence_retrieval",
            agent_name="Evidence Retriever",
            args={
                "assetId": request.assetId,
                "question": request.question,
                "taskType": request.taskType,
                "limit": 5,
                "includeExternal": False,
            },
            context={"question": request.question, "taskType": request.taskType},
        )
        self._execute_evidence_tool(
            adapter=EvidenceRetrieveToolAdapter(),
            tool_request=static_request,
            context=context,
            run_id=run_id,
            progress_called=40,
            progress_result=52,
            agent_name="Evidence Retriever",
            team="analyst_team",
            merge_items=merge_items,
        )

        external_search_enabled = self._external_search_enabled(request)
        if external_search_enabled:
            bocha_request = ToolInvocationRequest(
                tool_id="bocha.search",
                run_id=run_id,
                step_id="evidence_retrieval",
                agent_name="Bocha Search",
                args={
                    "assetId": request.assetId,
                    "question": request.question,
                    "taskType": request.taskType,
                    "limit": 5,
                },
                context={"question": request.question, "taskType": request.taskType},
            )
            self._execute_evidence_tool(
                adapter=BochaSearchToolAdapter(),
                tool_request=bocha_request,
                context=context,
                run_id=run_id,
                progress_called=56,
                progress_result=68,
                agent_name="Bocha Search",
                team="data_center",
                merge_items=merge_items,
            )

        if portfolio_context and portfolio_context.get("available") and not request.assetId:
            related_asset_ids = [
                str(item.get("assetId"))
                for item in [
                    *(portfolio_context.get("holdings") or []),
                    *(portfolio_context.get("relatedAssets") or []),
                ]
                if item.get("assetId")
            ]
            retriever = EvidenceRetriever()
            for asset_id in related_asset_ids[:8]:
                merge_items(
                    retriever.retrieve(
                        asset_id=asset_id,
                        question=request.question,
                        task_type=request.taskType,
                        limit=2,
                        include_external=False,
                    )
                )
                if len(items) >= 10:
                    break

        evidence_ids = [item.evidenceId for item in items]
        self._append_event(
            context,
            run_id,
            "tool.result",
            self._step_payload(
                "evidence_retrieval",
                progress=85,
                toolName="evidence.retrieve",
                status="completed",
                source=(
                    "alphatrace_prepared_data+bocha_web_search"
                    if external_search_enabled
                    else "alphatrace_prepared_data"
                ),
                summary=(
                    f"Retrieved {len(items)} evidence item(s) through research tools: "
                    + (
                        "prepared data and optional Bocha search."
                        if external_search_enabled
                        else "prepared data; external search disabled by request."
                    )
                ),
                evidenceIds=evidence_ids,
            ),
            agent_name="Evidence Retriever",
            team="analyst_team",
        )
        if items:
            self._append_event(
                context,
                run_id,
                "evidence.linked",
                self._step_payload(
                    "evidence_retrieval",
                    progress=100,
                    evidenceIds=evidence_ids,
                    summary="Research-tool evidence linked before prompt construction.",
                ),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
        return items

    def _execute_evidence_tool(
        self,
        adapter: Any,
        tool_request: ToolInvocationRequest,
        context: AgentRunnerContext,
        run_id: str,
        progress_called: int,
        progress_result: int,
        agent_name: str,
        team: str,
        merge_items: Any,
    ) -> None:
        self._append_event(
            context,
            run_id,
            "tool.called",
            self._step_payload(
                "evidence_retrieval",
                progress_called,
                **ToolExecutor.build_called_payload(tool_request),
            ),
            agent_name=agent_name,
            team=team,
        )
        try:
            record = ToolExecutor().execute(adapter, tool_request)
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress_result,
                    **record.result_payload,
                ),
                agent_name=agent_name,
                team=team,
            )
            if record.result.status == "completed":
                merge_items(self._evidence_items_from_tool_payload(record.result.payload))
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    progress_result,
                    toolName=tool_request.tool_id,
                    status="failed",
                    summary=f"{tool_request.tool_id} failed; runner will continue with remaining evidence. Error: {exc}",
                ),
                agent_name=agent_name,
                team=team,
            )

    def _retrieve_evidence_with_tool_adapter(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> List[EvidenceItem]:
        tool_request = ToolInvocationRequest(
            tool_id="evidence.retrieve",
            run_id=run_id,
            step_id="evidence_retrieval",
            agent_name="Evidence Retriever",
            args={
                "assetId": request.assetId,
                "question": request.question,
                "taskType": request.taskType,
                "limit": 5,
                "includeExternal": True,
            },
        )
        try:
            self._append_event(
                context,
                run_id,
                "tool.called",
                self._step_payload("evidence_retrieval", 25, **ToolExecutor.build_called_payload(tool_request)),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
            record = ToolExecutor().execute(EvidenceRetrieveToolAdapter(), tool_request)
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload("evidence_retrieval", 45, **record.result_payload),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
            if record.result.status != "completed":
                return []
            items = self._evidence_items_from_tool_payload(record.result.payload)
            if items:
                self._append_event(
                    context,
                    run_id,
                    "evidence.linked",
                    self._step_payload(
                        "evidence_retrieval",
                        progress=100,
                        evidenceIds=[item.evidenceId for item in items],
                        summary="Retrieved evidence through ToolAdapter and linked before prompt construction.",
                    ),
                    agent_name="Evidence Retriever",
                    team="analyst_team",
                )
            return items
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(
                    "evidence_retrieval",
                    45,
                    toolName="evidence.retrieve",
                    status="failed",
                    summary=f"Evidence retrieval failed through ToolAdapter; the research workflow will continue with a temporary evidence-limited summary. Error: {exc}",
                ),
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
            return []

    @staticmethod
    def _evidence_items_from_tool_payload(payload: Dict[str, Any]) -> List[EvidenceItem]:
        items: list[EvidenceItem] = []
        for item in (payload or {}).get("evidence") or []:
            if not isinstance(item, dict):
                continue
            items.append(
                EvidenceItem(
                    evidenceId=str(item.get("evidenceId") or ""),
                    title=str(item.get("title") or "Evidence"),
                    sourceName=str(item.get("sourceName") or "AlphaTrace Evidence"),
                    sourceType=str(item.get("sourceType") or item.get("evidenceType") or "evidence"),
                    evidenceType=str(item.get("evidenceType") or "evidence"),
                    relatedAssetIds=list(item.get("relatedAssetIds") or []),
                    publishedAt=str(item.get("publishedAt") or datetime.now().astimezone().isoformat(timespec="seconds")),
                    qualityScore=int(item.get("qualityScore") or 50),
                    reliabilityScore=int(item.get("reliabilityScore") or 50),
                    summary=str(item.get("summary") or ""),
                    url=item.get("url"),
                    extractedFields=dict(item.get("extractedFields") or {}),
                    sourceApiName=item.get("sourceApiName") or item.get("apiName"),
                    snapshotId=item.get("snapshotId"),
                    snapshotCapturedAt=item.get("snapshotCapturedAt") or item.get("capturedAt"),
                )
            )
        return items

    def _resolve_qwen_config(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> Dict[str, str]:
        hyper_ai_config = self._get_hyper_ai_qwen_config(request, context)
        if hyper_ai_config:
            return hyper_ai_config

        api_key = os.getenv("DASHSCOPE_API_KEY")
        if api_key:
            return {
                "api_key": api_key,
                "base_url": (os.getenv("QWEN_BASE_URL") or QWEN_DEFAULT_BASE_URL).rstrip("/"),
                "model": self._first_config_value(request.runnerConfig.modelName, os.getenv("QWEN_MODEL"), QWEN_DEFAULT_MODEL),
                "api_format": "openai",
                "source": "environment",
            }

        raise AgentRunnerConfigurationError(
            "Research AI model configuration is not available and DASHSCOPE_API_KEY is not configured."
        )

    def _get_hyper_ai_qwen_config(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
    ) -> Dict[str, str] | None:
        if not context.get_llm_config:
            return None

        try:
            config = context.get_llm_config()
        except Exception as exc:
            raise AgentRunnerConfigurationError(f"Failed to read Research AI model configuration: {exc}") from exc

        if not config.get("configured"):
            return None

        provider = str(config.get("provider") or "").lower()
        base_url = str(config.get("base_url") or "").rstrip("/")
        model = self._first_config_value(request.runnerConfig.modelName, str(config.get("model") or ""), QWEN_DEFAULT_MODEL)

        is_qwen_provider = provider == "qwen"
        is_custom_qwen_endpoint = provider == "custom" and (
            "dashscope.aliyuncs.com" in base_url.lower() or model.lower().startswith("qwen")
        )
        if not (is_qwen_provider or is_custom_qwen_endpoint):
            return None

        if not config.get("api_key"):
            if os.getenv("DASHSCOPE_API_KEY"):
                return None
            raise AgentRunnerConfigurationError(
                "Research AI provider/model/base URL are configured, but the API key is missing or could not be decrypted. "
                "Please save the model API key again in Research AI settings, or set DASHSCOPE_API_KEY on the backend."
            )

        return {
            "api_key": str(config["api_key"]),
            "base_url": base_url or QWEN_DEFAULT_BASE_URL,
            "model": model,
            "api_format": str(config.get("api_format") or "openai"),
            "source": str(config.get("source") or "hyper_ai_profile"),
        }

    def _run_qwen_agent_step(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
        config: Dict[str, str],
        evidence_items: List[EvidenceItem],
        step_id: str,
        agent_name: str,
        team: str,
        tool_name: str,
        title: str,
        instructions: str,
        prior_results: Dict[str, str],
        required: bool,
        portfolio_context: Optional[Dict[str, Any]] = None,
        market_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        try:
            self._raise_if_cancelled(context, run_id)
            self._append_event(
                context,
                run_id,
                "agent.started",
                self._step_payload(step_id, progress=10),
                agent_name=agent_name,
                team=team,
            )
            if step_id == "risk_review":
                self._append_event(
                    context,
                    run_id,
                    "risk.warning",
                    self._step_payload(
                        step_id,
                        progress=20,
                        level="MEDIUM",
                        content="Risk review is starting after Bull / Bear logical tracks.",
                    ),
                    agent_name=agent_name,
                    team=team,
                )
            self._append_event(
                context,
                run_id,
                "tool.called",
                self._step_payload(
                    step_id,
                    progress=30,
                    toolName=tool_name,
                    args={"stream": True, "priorResults": list(prior_results.keys())},
                ),
                agent_name=agent_name,
                team=team,
            )
            content = self._call_qwen_step(
                base_url=config["base_url"],
                api_key=config["api_key"],
                model=config["model"],
                api_format=config["api_format"],
                request=request,
                evidence_items=evidence_items,
                step_id=step_id,
                title=title,
                instructions=instructions,
                prior_results=prior_results,
                context=context,
                run_id=run_id,
                agent_name=agent_name,
                team=team,
                tool_name=tool_name,
                portfolio_context=portfolio_context,
                market_context=market_context,
            )
            self._raise_if_cancelled(context, run_id)
            if step_id in {"bull_view", "bear_view"}:
                self._append_event(
                    context,
                    run_id,
                    "debate.message",
                    self._step_payload(
                        step_id,
                        progress=70,
                        stance="bull" if step_id == "bull_view" else "bear",
                        content=content[:1200],
                        evidenceIds=[item.evidenceId for item in evidence_items],
                    ),
                    agent_name=agent_name,
                    team=team,
                )
            elif step_id == "final_decision":
                self._append_event(
                    context,
                    run_id,
                    "decision.updated",
                    self._step_payload(
                        step_id,
                        progress=80,
                        action=self._infer_action(content),
                        confidence=self._infer_confidence(content),
                        evidenceIds=[item.evidenceId for item in evidence_items],
                    ),
                    agent_name=agent_name,
                    team=team,
                )
            else:
                self._append_event(
                    context,
                    run_id,
                    "reasoning.chunk",
                    self._step_payload(step_id, progress=65, content=content[:1200]),
                    agent_name=agent_name,
                    team=team,
                )
            self._append_event(
                context,
                run_id,
                "tool.result",
                self._step_payload(step_id, progress=85, toolName=tool_name, summary=f"{title} generated."),
                agent_name=agent_name,
                team=team,
            )
            if step_id != "final_decision":
                self._append_event(
                    context,
                    run_id,
                    "report.generated",
                    self._step_payload(
                        step_id,
                        progress=95,
                        reportId=f"pending_{run_id}_{step_id}",
                        title=f"{title} Report",
                    ),
                    agent_name=agent_name,
                    team=team,
                )
            self._append_event(
                context,
                run_id,
                "agent.completed",
                self._step_payload(step_id, progress=100),
                agent_name=agent_name,
                team=team,
            )
            return content
        except QwenRunCancelled:
            raise
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            self._append_event(
                context,
                run_id,
                "agent.failed",
                self._step_payload(step_id, progress=100, error=message),
                agent_name=agent_name,
                team=team,
            )
            if required:
                raise AgentRunnerExecutionError(f"{title} failed: {message}") from exc
            return f"{title} unavailable because the agent step failed: {message}"

    def _call_qwen_step(
        self,
        base_url: str,
        api_key: str,
        model: str,
        api_format: str,
        request: SubmitAgentRunRequest,
        evidence_items: List[EvidenceItem],
        step_id: str,
        title: str,
        instructions: str,
        prior_results: Dict[str, str],
        context: AgentRunnerContext,
        run_id: str,
        agent_name: str,
        team: str,
        tool_name: str,
        portfolio_context: Optional[Dict[str, Any]] = None,
        market_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        from services.ai_decision_service import (
            _extract_text_from_message,
            build_chat_completion_endpoints,
            build_llm_headers,
            build_llm_payload,
        )

        messages = [
            {"role": "system", "content": self._build_agent_step_system_prompt(title)},
            {
                "role": "user",
                "content": self._build_agent_step_user_prompt(
                    request=request,
                    evidence_items=evidence_items,
                    step_id=step_id,
                    title=title,
                    instructions=instructions,
                    prior_results=prior_results,
                    portfolio_context=portfolio_context,
                    market_context=market_context,
                ),
            },
        ]
        prompt_tokens = self._estimate_message_tokens(messages)
        self._update_token_metrics(
            context=context,
            run_id=run_id,
            prompt_delta=prompt_tokens,
            completion_delta=0,
            step_id=step_id,
            agent_name=agent_name,
            team=team,
            progress=35,
        )
        timeout_seconds = self._int_env(
            "QWEN_AGENT_STEP_TIMEOUT_SECONDS",
            QWEN_AGENT_STEP_TIMEOUT_SECONDS,
            minimum=10,
            maximum=300,
        )
        max_tokens = self._int_env("QWEN_MAX_TOKENS", QWEN_DEFAULT_MAX_TOKENS, minimum=256, maximum=4000)
        stream_chunk_chars = self._int_env("QWEN_STREAM_CHUNK_CHARS", QWEN_STREAM_CHUNK_CHARS, minimum=80, maximum=1000)
        stream_min_chunk_chars = min(
            stream_chunk_chars,
            self._int_env("QWEN_STREAM_MIN_CHUNK_CHARS", QWEN_STREAM_MIN_CHUNK_CHARS, minimum=20, maximum=500),
        )
        stream_chunk_seconds = self._float_env("QWEN_STREAM_CHUNK_SECONDS", QWEN_STREAM_CHUNK_SECONDS, minimum=0.1, maximum=2.0)
        stream_max_wait_seconds = self._float_env(
            "QWEN_STREAM_MAX_WAIT_SECONDS",
            QWEN_STREAM_MAX_WAIT_SECONDS,
            minimum=0.5,
            maximum=5.0,
        )
        payload = build_llm_payload(
            model=model,
            messages=messages,
            api_format=api_format,
            max_tokens=max_tokens,
            temperature=0.3,
            stream=True,
        )
        headers = build_llm_headers(api_format, api_key, base_url)
        endpoints = build_chat_completion_endpoints(base_url, model)
        if not endpoints:
            raise AgentRunnerExecutionError("Research model API endpoint is invalid.")

        last_error = ""
        for endpoint in endpoints:
            try:
                self._raise_if_cancelled(context, run_id)
                with requests.post(endpoint, headers=headers, json=payload, timeout=timeout_seconds, stream=True) as response:
                    if response.status_code != 200:
                        last_error = f"HTTP {response.status_code}: {response.text[:1000]}"
                        continue

                    accumulated_text = ""
                    buffer = ""
                    last_emit_at = time.monotonic()
                    last_completion_tokens = 0

                    for raw_line in response.iter_lines(chunk_size=1, decode_unicode=True):
                        self._raise_if_cancelled(context, run_id)
                        if not raw_line:
                            continue
                        line = raw_line.strip()
                        if not line:
                            continue
                        if line.startswith("data:"):
                            line = line[5:].strip()
                        if line == "[DONE]":
                            break

                        try:
                            body: Dict[str, Any] = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        choices = body.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or choices[0].get("message") or {}
                        delta_text = _extract_text_from_message(delta.get("content"))
                        if not delta_text:
                            delta_text = str(delta.get("reasoning_content") or "")
                        if not delta_text:
                            continue

                        accumulated_text += delta_text
                        buffer += delta_text
                        now = time.monotonic()
                        elapsed_since_emit = now - last_emit_at
                        should_flush = (
                            len(buffer) >= stream_chunk_chars
                            or (len(buffer) >= stream_min_chunk_chars and elapsed_since_emit >= stream_chunk_seconds)
                            or elapsed_since_emit >= stream_max_wait_seconds
                        )
                        if should_flush:
                            completion_delta = self._estimate_tokens(buffer)
                            completion_tokens = last_completion_tokens + completion_delta
                            self._append_streaming_chunk(
                                context=context,
                                run_id=run_id,
                                content=buffer,
                                accumulated_length=len(accumulated_text),
                                step_id=step_id,
                                agent_name=agent_name,
                                team=team,
                                prompt_tokens=prompt_tokens,
                                completion_tokens=completion_tokens,
                            )
                            self._update_token_metrics(
                                context=context,
                                run_id=run_id,
                                prompt_delta=0,
                                completion_delta=completion_delta,
                                step_id=step_id,
                                agent_name=agent_name,
                                team=team,
                                progress=55,
                            )
                            last_completion_tokens = completion_tokens
                            buffer = ""
                            last_emit_at = now

                    if buffer:
                        completion_delta = self._estimate_tokens(buffer)
                        completion_tokens = last_completion_tokens + completion_delta
                        self._append_streaming_chunk(
                            context=context,
                            run_id=run_id,
                            content=buffer,
                            accumulated_length=len(accumulated_text),
                            step_id=step_id,
                            agent_name=agent_name,
                            team=team,
                            prompt_tokens=prompt_tokens,
                            completion_tokens=completion_tokens,
                        )
                        self._update_token_metrics(
                            context=context,
                            run_id=run_id,
                            prompt_delta=0,
                            completion_delta=completion_delta,
                            step_id=step_id,
                            agent_name=agent_name,
                            team=team,
                            progress=60,
                            force=True,
                        )
                    else:
                        self._update_token_metrics(
                            context=context,
                            run_id=run_id,
                            prompt_delta=0,
                            completion_delta=0,
                            step_id=step_id,
                            agent_name=agent_name,
                            team=team,
                            progress=60,
                            force=True,
                        )

                    if not accumulated_text:
                        raise AgentRunnerExecutionError(f"Research model API returned an empty streaming response for {title}.")
                    return accumulated_text
            except QwenRunCancelled:
                raise
            except requests.exceptions.Timeout:
                last_error = f"{title} request timed out after {timeout_seconds}s"
                continue
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)
                continue
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise AgentRunnerExecutionError(
                    f"Research model API streaming response for {title} did not match the expected chat completion format."
                ) from exc

        raise AgentRunnerExecutionError(f"Research model API request failed for {title}: {last_error or 'no endpoint succeeded'}")

    @staticmethod
    def _build_agent_step_system_prompt(title: str) -> str:
        return (
            "你是 AlphaTrace Broker Research & Strategy Workspace 中的专业投研 Agent。\n"
            f"当前任务步骤：{title}。\n"
            "请面向 ETF、基金、期货等资产生成可追溯、可复盘、可量化评估的分析。\n"
            "不要承诺收益，不要给出确定性买卖指令，所有动作标签都只是配置观察。\n"
            "不要使用 HyperAI、AI 交易员、信号池、钱包、交易所、杠杆、开仓、平仓等自动化交易语义。\n"
            "不要暴露模型供应商、解析器、后端函数、API 路径、fallback、structured output 等内部实现细节。\n"
            "优先引用提供的 evidenceId，不要编造不存在的证据。\n"
            "正文必须按投研语义组织：结论状态、核心依据、风险与失效条件、待验证问题、后续观察。\n"
            "请先输出结构化 Markdown，保证人工可读，要点清晰，控制在 220-420 字。\n"
            "然后在回答末尾追加一个独立 ```json fenced code block```，用于机器解析；不要在正文中展示 JSON 原文。\n"
            "JSON 只能引用 availableEvidence 中存在的 evidenceId；证据不足时使用空数组并在 summary 中说明。\n"
            "JSON 必须尽量简洁，包含 summary、keyFindings、risks、openQuestions、nextActions、evidenceIds。\n"
            "不要把 JSON 放在正文中间；不要输出多个相互冲突的 JSON block。"
        )

    @staticmethod
    def _workspace_context_payload(request: SubmitAgentRunRequest) -> Optional[Dict[str, Any]]:
        extra = request.runnerConfig.extraParams or {}
        workspace_context = extra.get("workspaceContext")
        return workspace_context if isinstance(workspace_context, dict) else None

    @staticmethod
    def _truncate_text(value: Any, limit: int = 900) -> str:
        text = str(value or "").strip()
        if len(text) <= limit:
            return text
        return f"{text[:limit].rstrip()}... [truncated]"

    @classmethod
    def _compact_prior_results(cls, prior_results: Dict[str, str]) -> Dict[str, str]:
        return {
            key: cls._truncate_text(cls._strip_structured_json_blocks(value), 1200)
            for key, value in prior_results.items()
            if str(value or "").strip()
        }

    @classmethod
    def _compact_evidence_payload(cls, item: EvidenceItem) -> Dict[str, Any]:
        extracted = item.extractedFields if isinstance(item.extractedFields, dict) else {}
        compact_fields: Dict[str, Any] = {}
        for key in [
            "datasetId",
            "bindingId",
            "bindingName",
            "matchMode",
            "tableName",
            "assetSymbol",
            "assetName",
            "apiId",
            "queryTable",
            "fundCode",
            "fundName",
            "fundShortName",
            "fundCompanyName",
            "trackingIndexCodes",
            "indexCode",
            "indexName",
            "dateRange",
            "rowCount",
            "latest",
            "metricSummary",
            "keyMetrics",
            "topConstituents",
            "dataPolicy",
        ]:
            if key in extracted:
                compact_fields[key] = extracted[key]
        recent_rows = extracted.get("recentRows")
        if isinstance(recent_rows, list) and recent_rows:
            compact_fields["recentRowsSample"] = recent_rows[-8:]

        return {
            "evidenceId": item.evidenceId,
            "title": item.title,
            "sourceName": item.sourceName,
            "sourceType": item.sourceType,
            "sourceApiName": item.sourceApiName,
            "publishedAt": item.publishedAt,
            "evidenceType": item.evidenceType,
            "qualityScore": item.qualityScore,
            "reliabilityScore": item.reliabilityScore,
            "url": item.url,
            "summary": cls._truncate_text(item.summary, 700),
            "extractedFields": compact_fields,
        }

    @classmethod
    def _compact_market_context(cls, market_context: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not isinstance(market_context, dict):
            return market_context

        compact: Dict[str, Any] = {}
        for key in [
            "source",
            "status",
            "requestedAssetId",
            "assetId",
            "symbol",
            "name",
            "assetType",
            "market",
            "currency",
            "quote",
            "valuation",
            "liquidity",
            "volatility",
            "trend",
            "fundFlow",
            "indicators",
            "returnWindows",
            "klineSummary",
            "fundManagers",
            "sourceRefs",
        ]:
            if key in market_context:
                compact[key] = market_context[key]

        catalog = market_context.get("catalogContext")
        if isinstance(catalog, dict):
            compact["catalogContext"] = cls._compact_catalog_context(catalog)

        research_context = market_context.get("researchContext")
        if isinstance(research_context, dict):
            compact["researchContext"] = {
                "source": research_context.get("source"),
                "status": research_context.get("status"),
                "dataPolicy": research_context.get("dataPolicy"),
                "dataset": research_context.get("dataset"),
                "statistics": research_context.get("statistics"),
                "latest": research_context.get("latest"),
                "sourceRefs": research_context.get("sourceRefs"),
                "recentRowsSample": (research_context.get("recentRows") or [])[-8:]
                if isinstance(research_context.get("recentRows"), list)
                else [],
            }
        return compact

    @staticmethod
    def _compact_catalog_context(catalog: Dict[str, Any]) -> Dict[str, Any]:
        compact = {
            key: catalog.get(key)
            for key in [
                "source",
                "status",
                "datasetId",
                "bindingId",
                "bindingName",
                "matchMode",
                "tableName",
                "sourceName",
                "fileName",
                "assetSymbol",
                "assetName",
                "rowCount",
                "dateRange",
                "importedAt",
                "latest",
                "metricSummary",
            ]
            if key in catalog
        }
        recent_rows = catalog.get("recentRows")
        if isinstance(recent_rows, list) and recent_rows:
            compact["recentRowsSample"] = recent_rows[-8:]
        return compact

    @staticmethod
    def _build_agent_step_user_prompt(
        request: SubmitAgentRunRequest,
        evidence_items: List[EvidenceItem],
        step_id: str,
        title: str,
        instructions: str,
        prior_results: Dict[str, str],
        portfolio_context: Optional[Dict[str, Any]] = None,
        market_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        return json.dumps(
            {
                "stepId": step_id,
                "stepTitle": title,
                "instructions": instructions,
                "assetId": request.assetId,
                "portfolioId": request.portfolioId,
                "strategyId": request.strategyId,
                "taskType": request.taskType,
                "researchRunType": request.researchRunType,
                "question": request.question,
                "horizon": request.horizon,
                "riskPreference": request.riskPreference,
                "dataContext": QwenRunnerAdapter._data_context_payload(request),
                "workspaceContext": QwenRunnerAdapter._workspace_context_payload(request),
                "portfolioContext": portfolio_context,
                "marketContext": QwenRunnerAdapter._compact_market_context(market_context),
                "availableEvidence": [QwenRunnerAdapter._compact_evidence_payload(item) for item in evidence_items[:10]],
                "priorResults": QwenRunnerAdapter._compact_prior_results(prior_results),
                "toolContext": {
                    "executedBeforeThisStep": [
                        "ck.monitor.context.load",
                        "prepared_data.query",
                        "evidence.retrieve",
                        "bocha.search",
                    ],
                    "preparedDataPolicy": (
                        "AlphaTrace prepared data, ClickHouse monitor context, and ClickHouse catalog evidence are the "
                        "local fact base for valuation, time-series, holdings, manager profiles, and imported dataset facts."
                    ),
                    "bochaPolicy": (
                        "Bocha external search evidence is used as supplementary freshness context for news, announcements, "
                        "research views, and market narratives. It must not override local prepared-data numeric facts."
                    ),
                },
                "outputRules": [
                    "必须引用相关 evidenceId；如果证据不足请明确说明。",
                    "先输出结构化 Markdown，便于 Live Output 阅读。",
                    "回答末尾必须追加一个 ```json fenced code block```。",
                    (
                        "JSON schema: 根据 stepId 输出对应顶层字段 marketView / bullView / bearView / riskReview / finalDecision；"
                        "research_manager 使用 researchManager；risk_review 必须包含 riskPerspectives.conservative/neutral/aggressive；"
                        "字段必须尽量包含 summary、keyFindings、risks、openQuestions、nextActions、evidenceIds；"
                        "finalDecision 还需要 action、confidence、horizon、thesis、watchIndicators。"
                    ),
                    "action 只能是 overweight / underweight / hold / watch / avoid 之一；confidence 必须是 0-1 数字。",
                    "evidenceIds 只能来自 availableEvidence；不要编造 evidenceId。",
                    "不要声称这是自动交易、AI 交易员或交易所执行结果。",
                    "不要输出模型供应商、解析失败、fallback、structured output、内部 API 路径等实现细节。",
                    "如果 portfolioContext 可用，必须基于组合持仓、风险指标和调仓建议分析，不要编造不存在的持仓。",
                    "如果 marketContext 可用，必须优先使用其中的 quote、valuation、liquidity、volatility、trend、fundFlow、indicators、returnWindows、klineSummary 和 fundManagers。",
                    "如果 marketContext.source 是 clickhouse_monitor，把它作为当前 CK 业务库事实底座，优先用于行情、K线、ROI、基金经理和本地结构化数据判断。",
                    "如果 marketContext.catalogContext 或 clickhouse_catalog Evidence 可用，把它作为离线导入数据事实底座，优先用于估值、时间序列、区间变化和历史分位判断。",
                    "Bocha / external_search 证据只用于补充最新外部信息、公告、新闻和研究观点；不要用外部搜索覆盖离线数据中的数值事实。",
                    "结论必须区分：本地离线数据支持什么，Bocha 外部搜索补充了什么，仍然缺少什么。",
                    "如果 workspaceContext 可用，必须说明本轮结论延续、修正或推翻了哪些既有 thesis / openQuestions / riskConstraints。",
                    "把本轮新增事实、仍未解决的问题和失效条件写成可回写工作记忆的结构化要点。",
                ],
                "jsonSchemaHint": (
                    "Return one fenced JSON object using this step's top-level key. "
                    "Common fields: summary, keyFindings[{claim,evidenceIds,strength}], risks, openQuestions, nextActions, evidenceIds. "
                    "riskReview also needs riskPerspectives.conservative/neutral/aggressive. "
                    "finalDecision also needs action, confidence, horizon, thesis, watchIndicators."
                ),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    @staticmethod
    def _step_payload(step_id: str, progress: int, **payload: Any) -> Dict[str, Any]:
        tool_contract = get_agent_tool_contract(str(payload.get("toolName") or "")) if payload.get("toolName") else None
        if tool_contract and "toolContract" not in payload:
            payload["toolContract"] = tool_contract.to_payload()
        return {
            **payload,
            "stepId": step_id,
            "dependsOn": STEP_DEPENDENCIES.get(step_id, []),
            "progress": progress,
            "contractVersion": ALPHATRACE_RUNTIME_CONTRACT_VERSION,
        }

    @staticmethod
    def _dag_contract() -> List[Dict[str, Any]]:
        return [
            {"stepId": "evidence_retrieval", "title": "Evidence Retrieval", "dependsOn": [], "team": "analyst_team"},
            {"stepId": "market_view", "title": "Market View", "dependsOn": ["evidence_retrieval"], "team": "analyst_team"},
            {"stepId": "bull_view", "title": "Bull View", "dependsOn": ["market_view"], "team": "research_team"},
            {"stepId": "bear_view", "title": "Bear View", "dependsOn": ["market_view"], "team": "research_team"},
            {"stepId": "research_manager", "title": "Research Manager Summary", "dependsOn": ["bull_view", "bear_view"], "team": "research_team"},
            {"stepId": "risk_review", "title": "Risk Review", "dependsOn": ["research_manager"], "team": "risk_team"},
            {"stepId": "final_decision", "title": "Final Decision", "dependsOn": ["risk_review"], "team": "portfolio_team"},
        ]

    def _call_qwen_streaming(
        self,
        base_url: str,
        api_key: str,
        model: str,
        api_format: str,
        request: SubmitAgentRunRequest,
        evidence_items: List[EvidenceItem],
        context: AgentRunnerContext,
        run_id: str,
    ) -> str:
        from services.ai_decision_service import (
            _extract_text_from_message,
            build_chat_completion_endpoints,
            build_llm_headers,
            build_llm_payload,
        )

        messages = [
                {"role": "system", "content": self._build_system_prompt()},
                {"role": "user", "content": self._build_user_prompt(request, evidence_items)},
        ]
        timeout_seconds = self._int_env("QWEN_TIMEOUT_SECONDS", QWEN_DEFAULT_TIMEOUT_SECONDS, minimum=10, maximum=300)
        max_tokens = self._int_env("QWEN_MAX_TOKENS", QWEN_DEFAULT_MAX_TOKENS, minimum=256, maximum=4000)
        stream_chunk_chars = self._int_env("QWEN_STREAM_CHUNK_CHARS", QWEN_STREAM_CHUNK_CHARS, minimum=80, maximum=1000)
        stream_min_chunk_chars = min(
            stream_chunk_chars,
            self._int_env("QWEN_STREAM_MIN_CHUNK_CHARS", QWEN_STREAM_MIN_CHUNK_CHARS, minimum=20, maximum=500),
        )
        stream_chunk_seconds = self._float_env("QWEN_STREAM_CHUNK_SECONDS", QWEN_STREAM_CHUNK_SECONDS, minimum=0.1, maximum=2.0)
        stream_max_wait_seconds = self._float_env(
            "QWEN_STREAM_MAX_WAIT_SECONDS",
            QWEN_STREAM_MAX_WAIT_SECONDS,
            minimum=0.5,
            maximum=5.0,
        )
        payload = build_llm_payload(
            model=model,
            messages=messages,
            api_format=api_format,
            max_tokens=max_tokens,
            temperature=0.3,
            stream=True,
        )
        headers = build_llm_headers(api_format, api_key, base_url)
        endpoints = build_chat_completion_endpoints(base_url, model)
        if not endpoints:
            raise AgentRunnerExecutionError("Research model API endpoint is invalid.")

        last_error = ""
        for endpoint in endpoints:
            try:
                self._raise_if_cancelled(context, run_id)
                with requests.post(endpoint, headers=headers, json=payload, timeout=timeout_seconds, stream=True) as response:
                    if response.status_code != 200:
                        last_error = f"HTTP {response.status_code}: {response.text[:1000]}"
                        continue

                    accumulated_text = ""
                    buffer = ""
                    last_emit_at = time.monotonic()

                    for raw_line in response.iter_lines(chunk_size=1, decode_unicode=True):
                        self._raise_if_cancelled(context, run_id)
                        if not raw_line:
                            continue
                        line = raw_line.strip()
                        if not line:
                            continue
                        if line.startswith("data:"):
                            line = line[5:].strip()
                        if line == "[DONE]":
                            break

                        try:
                            body: Dict[str, Any] = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        choices = body.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or choices[0].get("message") or {}
                        delta_text = _extract_text_from_message(delta.get("content"))
                        if not delta_text:
                            delta_text = str(delta.get("reasoning_content") or "")
                        if not delta_text:
                            continue

                        accumulated_text += delta_text
                        buffer += delta_text
                        now = time.monotonic()
                        elapsed_since_emit = now - last_emit_at
                        should_flush = (
                            len(buffer) >= stream_chunk_chars
                            or (len(buffer) >= stream_min_chunk_chars and elapsed_since_emit >= stream_chunk_seconds)
                            or elapsed_since_emit >= stream_max_wait_seconds
                        )
                        if should_flush:
                            self._append_streaming_chunk(context, run_id, buffer, len(accumulated_text))
                            buffer = ""
                            last_emit_at = now

                    if buffer:
                        self._append_streaming_chunk(context, run_id, buffer, len(accumulated_text))

                    if not accumulated_text:
                        raise AgentRunnerExecutionError("Research model API returned an empty streaming response.")
                    return accumulated_text
            except QwenRunCancelled:
                raise
            except requests.exceptions.Timeout as exc:
                last_error = f"request timed out after {timeout_seconds}s"
                continue
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)
                continue
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise AgentRunnerExecutionError(
                    "Research model API response did not match the expected chat completion format."
                ) from exc

        raise AgentRunnerExecutionError(f"Research model API request failed: {last_error or 'no endpoint succeeded'}")

    def _append_streaming_chunk(
        self,
        context: AgentRunnerContext,
        run_id: str,
        content: str,
        accumulated_length: int,
        step_id: str = "unknown",
        agent_name: str = "投研编排器",
        team: str = "research_team",
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
    ) -> None:
        payload: Dict[str, Any] = {
            "content": content,
            "accumulatedLength": accumulated_length,
            "sectionHint": self._infer_section_hint_from_text(content),
            "streaming": True,
        }
        if prompt_tokens is not None or completion_tokens is not None:
            payload["tokenUsage"] = {
                "promptTokens": prompt_tokens or 0,
                "completionTokens": completion_tokens or 0,
                "totalTokens": (prompt_tokens or 0) + (completion_tokens or 0),
                "countingMode": "estimated",
            }
        if step_id in STEP_DEPENDENCIES:
            payload = self._step_payload(step_id, progress=55, **payload)

        self._append_event(
            context,
            run_id,
            "reasoning.chunk",
            payload,
            agent_name=agent_name,
            team=team,
        )

    @classmethod
    def _estimate_message_tokens(cls, messages: List[Dict[str, Any]]) -> int:
        total = 0
        for message in messages:
            total += cls._estimate_tokens(str(message.get("content") or "")) + 4
        return total

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        normalized = text or ""
        if not normalized:
            return 0
        cjk_chars = sum(1 for char in normalized if "\u4e00" <= char <= "\u9fff")
        non_space_chars = sum(1 for char in normalized if not char.isspace())
        latin_or_symbol_chars = max(0, non_space_chars - cjk_chars)
        estimated = int((cjk_chars * 1.1) + (latin_or_symbol_chars / 4))
        return max(1, estimated)

    def _update_token_metrics(
        self,
        context: AgentRunnerContext,
        run_id: str,
        prompt_delta: int,
        completion_delta: int,
        step_id: str,
        agent_name: str,
        team: str,
        progress: int,
        force: bool = False,
    ) -> None:
        prompt_delta = max(0, int(prompt_delta or 0))
        completion_delta = max(0, int(completion_delta or 0))
        if prompt_delta == 0 and completion_delta == 0 and not force:
            return
        if not context.get_run:
            return

        with self._event_lock:
            now_monotonic = time.monotonic()
            state = self._token_metric_state.get(run_id)
            if not state:
                run = context.get_run(run_id)
                if not run:
                    return
                state = {
                    "promptTokens": int(run.metrics.promptTokens or 0),
                    "completionTokens": int(run.metrics.completionTokens or 0),
                    "pendingPromptTokens": 0,
                    "pendingCompletionTokens": 0,
                    "lastPersistAt": 0.0,
                }
                self._token_metric_state[run_id] = state

            state["promptTokens"] = max(0, int(state["promptTokens"]) + prompt_delta)
            state["completionTokens"] = max(0, int(state["completionTokens"]) + completion_delta)
            state["pendingPromptTokens"] = max(0, int(state["pendingPromptTokens"]) + prompt_delta)
            state["pendingCompletionTokens"] = max(0, int(state["pendingCompletionTokens"]) + completion_delta)

            pending_total = int(state["pendingPromptTokens"]) + int(state["pendingCompletionTokens"])
            if pending_total <= 0 and force and prompt_delta == 0 and completion_delta == 0:
                return
            elapsed_since_persist = now_monotonic - float(state.get("lastPersistAt") or 0.0)
            flush_tokens = self._int_env(
                "QWEN_TOKEN_METRIC_FLUSH_TOKENS",
                QWEN_TOKEN_METRIC_FLUSH_TOKENS,
                minimum=120,
                maximum=5000,
            )
            flush_seconds = self._float_env(
                "QWEN_TOKEN_METRIC_FLUSH_SECONDS",
                QWEN_TOKEN_METRIC_FLUSH_SECONDS,
                minimum=1.0,
                maximum=30.0,
            )
            should_persist = (
                force
                or prompt_delta > 0
                or (pending_total >= flush_tokens and elapsed_since_persist >= flush_seconds)
            )
            if not should_persist:
                return

            run = context.get_run(run_id)
            if not run:
                return
            next_prompt_tokens = int(state["promptTokens"])
            next_completion_tokens = int(state["completionTokens"])
            flushed_prompt_delta = int(state["pendingPromptTokens"])
            flushed_completion_delta = int(state["pendingCompletionTokens"])
            next_metrics = run.metrics.model_copy(
                update={
                    "promptTokens": next_prompt_tokens,
                    "completionTokens": next_completion_tokens,
                    "totalTokens": next_prompt_tokens + next_completion_tokens,
                }
            )
            context.save_run(
                run.model_copy(
                    update={
                        "metrics": next_metrics,
                        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                    }
                )
            )

            metric_payload = self._step_payload(
                step_id,
                progress=progress,
                metrics={
                    "promptTokens": next_prompt_tokens,
                    "completionTokens": next_completion_tokens,
                    "totalTokens": next_prompt_tokens + next_completion_tokens,
                },
                tokenDelta={
                    "promptTokens": flushed_prompt_delta,
                    "completionTokens": flushed_completion_delta,
                    "totalTokens": flushed_prompt_delta + flushed_completion_delta,
                },
                tokenCountingMode="estimated",
            )
            self._append_event(
                context,
                run_id,
                "metric.updated",
                metric_payload,
                agent_name=agent_name,
                team=team,
            )
            state["pendingPromptTokens"] = 0
            state["pendingCompletionTokens"] = 0
            state["lastPersistAt"] = now_monotonic

    @staticmethod
    def _infer_section_hint_from_text(content: str) -> str:
        lowered = content.lower()
        if "market view" in lowered or "市场" in content:
            return "market_view"
        if "bull view" in lowered or "正方" in content:
            return "bull_view"
        if "bear view" in lowered or "反方" in content:
            return "bear_view"
        if "research manager" in lowered or "研究经理" in content or "共识" in content:
            return "research_manager"
        if "risk review" in lowered or "风险" in content:
            return "risk_review"
        if "final decision" in lowered or "最终" in content or "建议" in content:
            return "final_decision"
        return "unknown"

    @staticmethod
    def _first_config_value(*values: str | None) -> str:
        for value in values:
            normalized = (value or "").strip()
            if normalized and normalized.lower() not in {"none", "null", "undefined"}:
                return normalized
        return QWEN_DEFAULT_MODEL

    @staticmethod
    def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
        raw_value = os.getenv(name)
        if not raw_value:
            return default
        try:
            value = int(raw_value)
        except ValueError:
            return default
        return max(minimum, min(value, maximum))

    @staticmethod
    def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
        raw_value = os.getenv(name)
        if not raw_value:
            return default
        try:
            value = float(raw_value)
        except ValueError:
            return default
        return max(minimum, min(value, maximum))

    @staticmethod
    def _build_system_prompt() -> str:
        return (
            "你是 AlphaTrace Broker Research & Strategy Workspace 的多 Agent 投研编排器。\n"
            "你需要组织一个轻量投研团队，对 ETF、基金、期货等资产进行券商投研侧分析。\n"
            "请输出可追溯、可复盘、可量化评估的研究结论。\n"
            "不要承诺收益。\n"
            "不要给出确定性买卖指令；所有动作标签只代表配置观察。\n"
            "不要使用 HyperAI、AI 交易员、信号池、钱包、交易所、杠杆、开仓、平仓等自动化交易语义。\n"
            "不要暴露模型供应商、解析器、后端函数、API 路径、fallback、structured output 等内部实现细节。\n"
            "请严格使用以下 Markdown 标题输出：\n"
            "## Market View\n"
            "## Bull View\n"
            "## Bear View\n"
            "## Research Manager Summary\n"
            "## Risk Review\n"
            "## Final Decision\n"
            "## Watch Indicators\n"
            "Final Decision 必须包含建议动作：overweight / underweight / hold / watch / avoid 之一，以及 0-1 之间的置信度。\n"
            "Final Decision 必须用中文输出：结论状态、核心依据、主要风险、待验证问题、后续观察。不要输出 JSON 原文或内部解析说明。\n"
            "如果提供了 evidence，请在各章节引用 evidenceId；不要编造不存在的证据。\n"
            "如果证据不足，请明确说明证据不足和需要补充的数据。\n"
            "请控制在 1000-1400 字，优先给出结构化要点。"
        )

    @staticmethod
    def _build_user_prompt(request: SubmitAgentRunRequest, evidence_items: List[EvidenceItem]) -> str:
        return json.dumps(
            {
                "assetId": request.assetId,
                "portfolioId": request.portfolioId,
                "strategyId": request.strategyId,
                "taskType": request.taskType,
                "researchRunType": request.researchRunType,
                "question": request.question,
                "horizon": request.horizon,
                "riskPreference": request.riskPreference,
                "researchTarget": QwenRunnerAdapter._research_target_payload(request),
                "workspaceContext": QwenRunnerAdapter._workspace_context_payload(request),
                "evidenceScope": request.evidenceScope.model_dump(),
                "availableEvidence": [
                    {
                        "evidenceId": item.evidenceId,
                        "title": item.title,
                        "sourceName": item.sourceName,
                        "publishedAt": item.publishedAt,
                        "evidenceType": item.evidenceType,
                        "qualityScore": item.qualityScore,
                        "reliabilityScore": item.reliabilityScore,
                        "summary": item.summary,
                    }
                    for item in evidence_items
                ],
                "evidenceInstructions": [
                    "优先基于 availableEvidence 中的证据进行分析。",
                    "Market View / Bull View / Bear View / Research Manager Summary / Risk Review / Final Decision 中需要引用相关 evidenceId。",
                    "不要编造 availableEvidence 之外的证据。",
                    "如果证据不足，需要明确说明还缺少哪些数据。",
                    "如果 workspaceContext 可用，说明本轮判断相对既有工作记忆的延续、修正或推翻，并列出新增事实、未解问题和失效条件。",
                ],
                "requiredOutputSections": {
                    "Market View": "市场环境、趋势、流动性、波动和宏观背景。",
                    "Bull View": "支持配置或增配的正方观点。",
                    "Bear View": "风险、反方观点和失效条件。",
                    "Research Manager Summary": "正反方共识、关键分歧和待验证问题。",
                    "Risk Review": "最大回撤、波动、集中度、流动性、情景风险。",
                    "Final Decision": "建议动作、置信度、投资周期、核心理由、主要风险、待验证问题、后续动作。",
                    "Watch Indicators": "后续需要观察的指标列表。",
                },
            },
            ensure_ascii=False,
            indent=2,
        )

    def _map_qwen_response(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        model: str,
        content: str,
        config_source: str,
        run_id: Optional[str] = None,
        existing_events: Optional[List[AgentRuntimeEvent]] = None,
        retrieved_evidence: Optional[List[EvidenceItem]] = None,
    ) -> SubmitAgentRunResponse:
        current_run = context.get_run(run_id) if run_id and context.get_run else None
        if current_run and current_run.status in {"cancelled", "failed"}:
            return SubmitAgentRunResponse(
                runId=run_id,
                status=current_run.status,
                mode=self.runner_type,
                message="Research task was already terminal; Qwen result was ignored.",
                run=current_run,
            )
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        run_id = run_id or f"{self.run_id_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        is_portfolio_task = self._is_portfolio_diagnosis(request)
        asset_ids = [request.assetId] if request.assetId else []
        target_id = self._resolve_target_id(request, is_portfolio_task)
        parse_error: Optional[str] = None
        structured_payload = self._merge_structured_qwen_payloads(content)
        try:
            sections = self._parse_qwen_multistep_response(content)
        except Exception as exc:
            parse_error = str(exc) or exc.__class__.__name__
            raw_excerpt = content[:1800] if content else "Research model returned empty or unparseable content."
            sections = {
                "Market View": self._fallback_section_message("Market View", raw_excerpt),
                "Bull View": self._fallback_section_message("Bull View", raw_excerpt),
                "Bear View": self._fallback_section_message("Bear View", raw_excerpt),
                "Research Manager Summary": self._fallback_section_message("Research Manager Summary", raw_excerpt),
                "Risk Review": self._fallback_section_message("Risk Review", raw_excerpt),
                "Final Decision": self._fallback_section_message("Final Decision", raw_excerpt),
                "Watch Indicators": self._fallback_section_message("Watch Indicators", raw_excerpt),
            }
        final_decision_text = sections["Final Decision"]
        watch_indicators_text = sections["Watch Indicators"]
        structured_decision = self._get_structured_section_payload(structured_payload, "finalDecision", "final_decision")
        action = self._normalize_action(structured_decision.get("action")) if structured_decision else ""
        action = action or self._infer_action(final_decision_text)
        confidence = self._coerce_confidence(structured_decision.get("confidence")) if structured_decision else None
        confidence = confidence if confidence is not None else self._infer_confidence(final_decision_text)
        sequence = max(
            len(existing_events or []),
            int(self._event_sequence_state.get(run_id or "", 0)),
        )

        agents = [
            AgentParticipant(
                agentId="agent-qwen-market-001",
                name="市场环境分析师",
                role="market_analyst",
                team="analyst_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-bull-001",
                name="正方研究员",
                role="bull_researcher",
                team="research_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-bear-001",
                name="反方研究员",
                role="bear_researcher",
                team="research_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-research-manager-001",
                name="研究经理",
                role="research_manager",
                team="research_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-risk-001",
                name="风险复核员",
                role="risk_analyst",
                team="risk_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-pm-001",
                name="配置观察员",
                role="portfolio_manager",
                team="portfolio_team",
                status="completed",
            ),
        ]
        retrieved_evidence = retrieved_evidence or []
        if retrieved_evidence:
            evidence = [to_evidence_reference(item) for item in retrieved_evidence]
        else:
            evidence = [
                EvidenceReference(
                    evidenceId=f"ev_qwen_market_assumption_{run_id}",
                    title="Research model market view assumption",
                    evidenceType="market_snapshot",
                    sourceName="AlphaTrace 投研任务执行器",
                    qualityScore=45,
                    summary=sections["Market View"][:600],
                ),
                EvidenceReference(
                    evidenceId=f"ev_qwen_bull_assumption_{run_id}",
                    title="Research model bull view assumption",
                    evidenceType="research_report",
                    sourceName="AlphaTrace 投研任务执行器",
                    qualityScore=45,
                    summary=sections["Bull View"][:600],
                ),
                EvidenceReference(
                    evidenceId=f"ev_qwen_bear_assumption_{run_id}",
                    title="Research model bear view assumption",
                    evidenceType="research_report",
                    sourceName="AlphaTrace 投研任务执行器",
                    qualityScore=45,
                    summary=sections["Bear View"][:600],
                ),
                EvidenceReference(
                    evidenceId=f"ev_qwen_risk_assumption_{run_id}",
                    title="风险复核假设",
                    evidenceType="macro_data",
                    sourceName="AlphaTrace 投研任务",
                    qualityScore=45,
                    summary=sections["Risk Review"][:600],
                ),
            ]
        evidence_ids = [item.evidenceId for item in evidence]
        evidence_validation = self._validate_evidence_references(content, evidence_ids, structured_payload)
        evidence_support = score_evidence_support(content, evidence).to_payload()
        invalid_evidence_ids = evidence_validation["invalidEvidenceIds"]
        decision_evidence_ids = evidence_validation["validReferencedEvidenceIds"] or evidence_ids
        evidence_note = (
            f"\n\nEvidence used: {', '.join(evidence_ids)}"
            if evidence_ids
            else "\n\nEvidence used: none"
        )
        if is_portfolio_task:
            report_specs = [
                (
                    "portfolio_overview",
                    "市场环境分析师",
                    "组合暴露复核报告",
                    f"{sections['Market View']}{evidence_note}",
                ),
                ("bull", "正方研究员", "正方调仓论证报告", f"{sections['Bull View']}{evidence_note}"),
                ("bear", "反方研究员", "组合约束与反方风险报告", f"{sections['Bear View']}{evidence_note}"),
                (
                    "research_manager",
                    "研究经理",
                    "研究经理汇总报告",
                    f"{sections.get('Research Manager Summary', '本次输出未单独拆分研究经理汇总。')}{evidence_note}",
                ),
                (
                    "risk_rebalance",
                    "风险复核员",
                    "风险复核与调仓约束报告",
                    f"{sections['Risk Review']}{evidence_note}",
                ),
            ]
        else:
            report_specs = [
                ("market", "市场环境分析师", "市场环境分析报告", f"{sections['Market View']}{evidence_note}"),
                ("bull", "正方研究员", "正方论证报告", f"{sections['Bull View']}{evidence_note}"),
                ("bear", "反方研究员", "反方风险报告", f"{sections['Bear View']}{evidence_note}"),
                (
                    "research_manager",
                    "研究经理",
                    "研究经理汇总报告",
                    f"{sections.get('Research Manager Summary', '本次输出未单独拆分研究经理汇总。')}{evidence_note}",
                ),
                ("risk", "风险复核员", "风险复核报告", f"{sections['Risk Review']}{evidence_note}"),
            ]
        reports = [
            AgentReport(
                reportId=f"report_{run_id}_{slug}_001",
                runId=run_id,
                agentName=agent_name,
                title=title,
                summary=summary,
                createdAt=now,
                artifactType=resolve_research_artifact_type(
                    report_slug=slug,
                    title=title,
                    research_run_type=request.researchRunType,
                ),
            )
            for slug, agent_name, title, summary in report_specs
        ]
        structured_watch_indicators = self._coerce_string_list(structured_decision.get("watchIndicators") or structured_decision.get("watch_indicators")) if structured_decision else []
        structured_risks = self._coerce_string_list(structured_decision.get("risks")) if structured_decision else []
        structured_thesis = str(structured_decision.get("thesis") or "").strip() if structured_decision else ""
        structured_summary = str(structured_decision.get("summary") or "").strip() if structured_decision else ""
        if self._is_structured_missing_section(final_decision_text):
            final_decision_text = (
                structured_thesis
                or structured_summary
                or self._fallback_section_message("Final Decision", sections.get("Research Manager Summary", "") or content)
            )
        if self._is_structured_missing_section(watch_indicators_text):
            watch_indicators_text = ""
        observation_indicators = structured_watch_indicators or self._parse_watch_indicators(watch_indicators_text)
        decision = AgentDecision(
            action=action,
            horizon=request.horizon,
            confidence=confidence,
            thesis=structured_thesis or final_decision_text,
            summary=structured_summary or "AlphaTrace 生成了多步骤投研复核。该内容应作为分析草稿使用，不代表确定性投资结论。",
            risks=[
                *(structured_risks or [sections["Bear View"][:500], sections["Risk Review"][:500]]),
            ],
            evidenceIds=decision_evidence_ids,
            triggerConditions=["Evidence assumptions are independently verified", "Risk budget remains available"],
            invalidationConditions=["Key assumptions fail validation", "Liquidity or drawdown risk exceeds threshold"],
            observationIndicators=observation_indicators or ["Liquidity", "Volatility", "Evidence quality", "Macro context"],
        )
        events: List[AgentRuntimeEvent] = []
        step_evidence_ids = {
            "market": evidence_ids[:2] or evidence_ids,
            "bull": evidence_ids[1:3] or evidence_ids,
            "bear": evidence_ids[2:4] or evidence_ids,
            "research_manager": evidence_ids[:4] or evidence_ids,
            "risk": evidence_ids[3:5] or evidence_ids,
        }
        report_by_slug = {slug: report for (slug, _, _, _), report in zip(report_specs, reports)}
        market_report = report_by_slug.get("portfolio_overview") or report_by_slug.get("market")
        bull_report = report_by_slug.get("bull")
        bear_report = report_by_slug.get("bear")
        manager_report = report_by_slug.get("research_manager")
        risk_report = report_by_slug.get("risk_rebalance") or report_by_slug.get("risk")
        trace_steps = [
            DecisionTraceStep(
                stepId="evidence_retrieval",
                title="证据准备",
                agentName="证据检索",
                evidenceIds=evidence_ids,
                summary=f"本轮共纳入 {len(evidence_ids)} 条证据，作为后续判断的事实底座。",
            ),
            DecisionTraceStep(
                stepId="market_view",
                title="市场环境",
                agentName="市场环境分析师",
                artifactIds=[f"artifact_{market_report.reportId}"] if market_report else [],
                evidenceIds=step_evidence_ids["market"],
                summary=self._compact_for_trace(sections["Market View"]),
            ),
            DecisionTraceStep(
                stepId="bull_view",
                title="正方论证",
                agentName="正方研究员",
                artifactIds=[f"artifact_{bull_report.reportId}"] if bull_report else [],
                evidenceIds=step_evidence_ids["bull"],
                summary=self._compact_for_trace(sections["Bull View"]),
            ),
            DecisionTraceStep(
                stepId="bear_view",
                title="反方约束",
                agentName="反方研究员",
                artifactIds=[f"artifact_{bear_report.reportId}"] if bear_report else [],
                evidenceIds=step_evidence_ids["bear"],
                summary=self._compact_for_trace(sections["Bear View"]),
            ),
            DecisionTraceStep(
                stepId="research_manager",
                title="分歧收敛",
                agentName="研究经理",
                artifactIds=[f"artifact_{manager_report.reportId}"] if manager_report else [],
                evidenceIds=step_evidence_ids["research_manager"],
                summary=self._compact_for_trace(sections.get("Research Manager Summary", "")),
            ),
            DecisionTraceStep(
                stepId="risk_review",
                title="风险复核",
                agentName="风险复核员",
                artifactIds=[f"artifact_{risk_report.reportId}"] if risk_report else [],
                evidenceIds=step_evidence_ids["risk"],
                summary=self._compact_for_trace(sections["Risk Review"]),
            ),
            DecisionTraceStep(
                stepId="final_decision",
                title="配置观察",
                agentName="配置观察员",
                artifactIds=[],
                evidenceIds=decision.evidenceIds,
                summary=self._compact_for_trace(decision.summary or decision.thesis),
                status="needs_review",
            ),
        ]
        decision_trace = DecisionTrace(
            traceId=f"trace_{run_id}",
            runId=run_id,
            researchRunType=request.researchRunType,
            artifactIds=[f"artifact_{report.reportId}" for report in reports],
            evidenceIds=decision.evidenceIds,
            conclusion=decision.summary or decision.thesis,
            supportSummary=self._compact_for_trace(sections.get("Research Manager Summary", "") or sections["Bull View"]),
            riskSummary=self._compact_for_trace(sections["Risk Review"] or sections["Bear View"]),
            openQuestions=observation_indicators[:6],
            reviewStatus="pending",
            steps=trace_steps,
            createdAt=now,
        )

        def add_event(event_type: str, agent_name: Optional[str], team: Optional[str], payload: Dict[str, Any]) -> None:
            nonlocal sequence
            sequence += 1
            events.append(
                AgentRuntimeEvent(
                    eventId=f"evt_{run_id}_{sequence:03d}",
                    runId=run_id,
                    type=event_type,
                    timestamp=now,
                    sequence=sequence,
                    agentName=agent_name,
                    team=team,
                    payload=payload,
                )
            )

        add_event("reasoning.chunk", "市场环境分析师", "analyst_team", self._step_payload("market_view", progress=65, content=sections["Market View"][:1000]))
        if parse_error:
            add_event(
                "risk.warning",
                "输出结构检查",
                "runtime_team",
                {
                    "level": "MEDIUM",
                    "content": "模型输出未完全匹配预期章节结构，系统已按低结构化投研摘要处理。",
                    "error": parse_error,
                },
            )
        if invalid_evidence_ids:
            add_event(
                "risk.warning",
                "Evidence Validator",
                "runtime_team",
                {
                    "level": "MEDIUM",
                    "content": "模型引用了本次任务不可用的证据编号，系统已从最终证据列表中过滤。",
                    **evidence_validation,
                },
            )
        if evidence_support["evidenceSupportStatus"] in {"unsupported", "weak", "partial"}:
            add_event(
                "risk.warning",
                "Evidence Support Scorer",
                "runtime_team",
                {
                    "level": "MEDIUM",
                    "content": "证据支持度检查发现部分结论支撑较弱，使用前需要复核结论与证据之间的对应关系。",
                    **evidence_support,
                },
            )
        add_event("report.generated", "市场环境分析师", "analyst_team", self._step_payload("market_view", progress=95, reportId=reports[0].reportId, title=reports[0].title))
        add_event("agent.completed", "市场环境分析师", "analyst_team", self._step_payload("market_view", progress=100))
        add_event("debate.message", "正方研究员", "research_team", self._step_payload("bull_view", progress=70, stance="bull", content=sections["Bull View"][:1000], evidenceIds=step_evidence_ids["bull"]))
        add_event("report.generated", "正方研究员", "research_team", self._step_payload("bull_view", progress=95, reportId=reports[1].reportId, title=reports[1].title))
        add_event("agent.completed", "正方研究员", "research_team", self._step_payload("bull_view", progress=100))
        add_event("debate.message", "反方研究员", "research_team", self._step_payload("bear_view", progress=70, stance="bear", content=sections["Bear View"][:1000], evidenceIds=step_evidence_ids["bear"]))
        add_event("report.generated", "反方研究员", "research_team", self._step_payload("bear_view", progress=95, reportId=reports[2].reportId, title=reports[2].title))
        add_event("agent.completed", "反方研究员", "research_team", self._step_payload("bear_view", progress=100))
        add_event(
            "reasoning.chunk",
            "研究经理",
            "research_team",
            self._step_payload(
                "research_manager",
                progress=65,
                content=sections.get("Research Manager Summary", "")[:1000],
                evidenceIds=step_evidence_ids["research_manager"],
            ),
        )
        add_event("report.generated", "研究经理", "research_team", self._step_payload("research_manager", progress=95, reportId=reports[3].reportId, title=reports[3].title))
        add_event("agent.completed", "研究经理", "research_team", self._step_payload("research_manager", progress=100))
        add_event("risk.warning", "风险复核员", "risk_team", self._step_payload("risk_review", progress=65, level="MEDIUM", content=sections["Risk Review"][:1000], evidenceIds=step_evidence_ids["risk"]))
        for perspective, perspective_content in self._extract_risk_perspectives(sections["Risk Review"]).items():
            add_event(
                "risk.warning",
                "风险复核员",
                "risk_team",
                self._step_payload(
                    "risk_review",
                    progress=70,
                    level="MEDIUM",
                    riskPerspective=perspective,
                    content=perspective_content[:1000],
                    evidenceIds=step_evidence_ids["risk"],
                ),
            )
        add_event("report.generated", "风险复核员", "risk_team", self._step_payload("risk_review", progress=95, reportId=reports[4].reportId, title=reports[4].title))
        add_event("agent.completed", "风险复核员", "risk_team", self._step_payload("risk_review", progress=100))
        add_event("reasoning.chunk", "配置观察员", "portfolio_team", self._step_payload("final_decision", progress=65, content=final_decision_text[:1000]))
        add_event(
            "evidence.linked",
            "配置观察员",
            "portfolio_team",
            self._step_payload(
                "final_decision",
                progress=75,
                evidenceIds=evidence_ids,
                summary=(
                    "Retrieved evidence linked to final decision."
                    if retrieved_evidence
                    else "Research workflow assumptions linked to final decision."
                ),
                **evidence_validation,
                **evidence_support,
            ),
        )
        add_event(
            "decision.updated",
            "配置观察员",
            "portfolio_team",
            self._step_payload(
                "final_decision",
                progress=85,
                action=action,
                confidence=decision.confidence,
                evidenceIds=decision.evidenceIds,
                **evidence_validation,
                **evidence_support,
            ),
        )
        add_event("agent.completed", "配置观察员", "portfolio_team", self._step_payload("final_decision", progress=100))
        add_event("agent.run.completed", None, None, {})

        context.save_evidence_references(evidence)
        if context.update_run_outputs:
            context.update_run_outputs(run_id, reports, evidence, decision, 6)
            for event in events:
                self._append_existing_event(context, run_id, event)
            if context.update_run_status:
                context.update_run_status(run_id, "completed", now)
            run = context.get_run(run_id) if context.get_run else None
            if run and context.save_run:
                run = run.model_copy(update={"decisionTrace": decision_trace})
                context.save_run(run)
        else:
            run = AgentRun(
                runId=run_id,
                name=self.portfolio_run_name if is_portfolio_task else self.run_name,
                target=target_id,
                taskType=request.taskType,
                riskLevel="medium",
                status="completed",
                assetIds=asset_ids,
                portfolioId=request.portfolioId,
                strategyId=request.strategyId,
                triggeredBy=self.triggered_by,
                modelName=model,
                startedAt=now,
                updatedAt=now,
                completedAt=now,
                agents=agents,
                toolCalls=[],
                reports=reports,
                events=[*(existing_events or []), *events],
                evidenceIds=evidence_ids,
                finalDecision=decision,
                decisionTrace=decision_trace,
                metrics=RuntimeMetrics(llmCalls=6, toolCalls=6, generatedReports=len(reports), durationSeconds=0, estimatedCostUsd=None),
            )
            context.save_run(run)
        if not run:
            raise AgentRunnerExecutionError(f"Research run disappeared from runtime store: {run_id}")
        return SubmitAgentRunResponse(
            runId=run_id,
            status=run.status,
            mode=self.runner_type,
            message=f"Research task completed by {self.adapter_display_name} using {config_source}.",
            run=run,
        )

    def _create_running_run(self, request: SubmitAgentRunRequest, model: str, config_source: str) -> AgentRun:
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        run_id = f"{self.run_id_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        is_portfolio_task = self._is_portfolio_diagnosis(request)
        asset_ids = [request.assetId] if request.assetId else []
        target_id = self._resolve_target_id(request, is_portfolio_task)
        agent_prefix = self.runner_type.replace("_", "-")
        agents = [
            AgentParticipant(agentId=f"agent-{agent_prefix}-market-001", name="市场环境分析师", role="market_analyst", team="analyst_team", status="running"),
            AgentParticipant(agentId=f"agent-{agent_prefix}-bull-001", name="正方研究员", role="bull_researcher", team="research_team", status="running"),
            AgentParticipant(agentId=f"agent-{agent_prefix}-bear-001", name="反方研究员", role="bear_researcher", team="research_team", status="running"),
            AgentParticipant(agentId=f"agent-{agent_prefix}-research-manager-001", name="研究经理", role="research_manager", team="research_team", status="idle"),
            AgentParticipant(agentId=f"agent-{agent_prefix}-risk-001", name="风险复核员", role="risk_analyst", team="risk_team", status="running"),
            AgentParticipant(agentId=f"agent-{agent_prefix}-pm-001", name="配置观察员", role="portfolio_manager", team="portfolio_team", status="running"),
        ]
        decision = AgentDecision(
            action="watch",
            horizon=request.horizon,
            confidence=0.0,
            thesis="投研任务仍在运行中，最终配置观察会在模型返回并完成证据复核后更新。",
            summary="等待投研任务输出。",
            risks=["当前结论尚未完成，暂不应作为配置依据。"],
            evidenceIds=[],
            triggerConditions=[],
            invalidationConditions=[],
            observationIndicators=[],
        )
        events = [
            AgentRuntimeEvent(
                eventId=f"evt_{run_id}_001",
                runId=run_id,
                type="agent.run.started",
                timestamp=now,
                sequence=1,
                payload={
                    "source": self.triggered_by,
                    "runnerType": self.runner_type,
                    "configSource": config_source,
                    "contractVersion": ALPHATRACE_RUNTIME_CONTRACT_VERSION,
                    "dagNodes": self._dag_contract(),
                    "agenticLoop": {
                        "enabled": self._agentic_loop_rounds() > 1,
                        "rounds": self._agentic_loop_rounds(),
                        "phase": "bull_bear_cross_review",
                    },
                },
            ),
            AgentRuntimeEvent(
                eventId=f"evt_{run_id}_002",
                runId=run_id,
                type="reasoning.chunk",
                timestamp=now,
                sequence=2,
                agentName=self.initial_agent_name,
                team="research_team",
                payload=self._step_payload(
                    "evidence_retrieval",
                    progress=5,
                    content=self.initial_reasoning_content,
                    runnerType=self.runner_type,
                ),
            ),
        ]
        return AgentRun(
            runId=run_id,
            name=self.portfolio_run_name if is_portfolio_task else self.run_name,
            target=target_id,
            taskType=request.taskType,
            riskLevel="medium",
            status="running",
            assetIds=asset_ids,
            portfolioId=request.portfolioId,
            strategyId=request.strategyId,
            triggeredBy=self.triggered_by,
            modelName=model,
            startedAt=now,
            updatedAt=now,
            completedAt=None,
            agents=agents,
            toolCalls=[],
            reports=[],
            events=events,
            evidenceIds=[],
            finalDecision=decision,
            metrics=RuntimeMetrics(llmCalls=0, toolCalls=6, generatedReports=0, durationSeconds=0, estimatedCostUsd=None),
        )

    def _append_event(
        self,
        context: AgentRunnerContext,
        run_id: str,
        event_type: str,
        payload: Dict[str, Any],
        agent_name: Optional[str] = None,
        team: Optional[str] = None,
    ) -> None:
        with self._event_lock:
            sequence = self._event_sequence_state.get(run_id)
            if sequence is None:
                sequence = len(self._get_existing_events(context, run_id))
            sequence += 1
            self._event_sequence_state[run_id] = sequence
            event = AgentRuntimeEvent(
                eventId=f"evt_{run_id}_{sequence:03d}",
                runId=run_id,
                type=event_type,
                timestamp=datetime.now().astimezone().isoformat(timespec="seconds"),
                sequence=sequence,
                agentName=agent_name,
                team=team,
                payload=self._json_safe_value(payload),
            )
            self._append_existing_event(context, run_id, event)

    @staticmethod
    def _is_cancelled(context: AgentRunnerContext, run_id: str) -> bool:
        if not context.get_run:
            return False
        run = context.get_run(run_id)
        return bool(run and run.status == "cancelled")

    def _raise_if_cancelled(self, context: AgentRunnerContext, run_id: str) -> None:
        if self._is_cancelled(context, run_id):
            raise QwenRunCancelled(f"AgentRun {run_id} was cancelled.")

    @classmethod
    def _json_safe_value(cls, value: Any, seen: Optional[set[int]] = None) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value

        seen = seen or set()
        if isinstance(value, dict):
            value_id = id(value)
            if value_id in seen:
                return "[Circular]"
            seen.add(value_id)
            try:
                return {str(key): cls._json_safe_value(item, seen) for key, item in value.items()}
            finally:
                seen.remove(value_id)

        if isinstance(value, (list, tuple, set)):
            value_id = id(value)
            if value_id in seen:
                return ["[Circular]"]
            seen.add(value_id)
            try:
                return [cls._json_safe_value(item, seen) for item in value]
            finally:
                seen.remove(value_id)

        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            return cls._json_safe_value(model_dump(mode="json"), seen)

        return str(value)

    @staticmethod
    def _append_existing_event(context: AgentRunnerContext, run_id: str, event: AgentRuntimeEvent) -> None:
        if context.append_event:
            context.append_event(run_id, event)

    @staticmethod
    def _get_existing_events(context: AgentRunnerContext, run_id: str) -> List[AgentRuntimeEvent]:
        if context.get_run:
            run = context.get_run(run_id)
            if run:
                return list(run.events)
        return []

    def _mark_run_failed(self, context: AgentRunnerContext, run_id: str, exc: Exception) -> None:
        current_run = context.get_run(run_id) if context.get_run else None
        if current_run and current_run.status in {"completed", "cancelled"}:
            return
        message = str(exc) or exc.__class__.__name__
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        if context.update_run_status:
            context.update_run_status(run_id, "failed", now)
        self._append_event(
            context,
            run_id,
            "agent.failed",
            {"error": message, "summary": "投研任务步骤失败，请查看失败报告和临时决策链路。"},
            agent_name="投研编排器",
            team="research_team",
        )
        self._append_event(
            context,
            run_id,
            "agent.run.failed",
            {"error": message, "summary": "投研任务失败，已保存用于复盘。"},
        )
        run = context.get_run(run_id) if context.get_run else None
        if run and context.update_run_outputs:
            failure_report = AgentReport(
                reportId=f"report_{run_id}_failure_001",
                runId=run_id,
                agentName="投研编排器",
                title="投研任务失败报告",
                summary=(
                    "本次投研任务未能完整执行。\n\n"
                    f"失败原因：{message}\n\n"
                    "系统没有生成可靠的最终配置观察；该任务已保留用于复盘和重试。"
                ),
                createdAt=now,
                artifactType="risk_review_report",
            )
            fallback_decision = AgentDecision(
                action="watch",
                horizon="medium_term",
                confidence=0.5,
                thesis=f"投研任务在生成可靠决策链路前失败。失败原因：{message}",
                summary="仅为临时观察，不能作为投资结论。",
                risks=[
                    "投研任务未完整执行",
                    "未生成完整研究报告集",
                    message,
                ],
                evidenceIds=list(run.evidenceIds),
                triggerConditions=["重跑任务并生成有效模型输出"],
                invalidationConditions=["运行失败原因仍未解决"],
                observationIndicators=["模型可用性", "运行超时", "流式输出状态", "错误事件"],
            )
            context.update_run_outputs(run_id, [failure_report], [], fallback_decision, 0)

    @staticmethod
    def _runtime_steps() -> List[Dict[str, str]]:
        return [
            {"title": "Market View", "agent": "市场环境分析师", "team": "analyst_team", "toolName": "research.market_view"},
            {"title": "Bull View", "agent": "正方研究员", "team": "research_team", "toolName": "research.bull_view"},
            {"title": "Bear View", "agent": "反方研究员", "team": "research_team", "toolName": "research.bear_view"},
            {"title": "Research Manager Summary", "agent": "研究经理", "team": "research_team", "toolName": "research.manager_summary"},
            {"title": "Risk Review", "agent": "风险复核员", "team": "risk_team", "toolName": "research.risk_review"},
            {"title": "Final Decision", "agent": "配置观察员", "team": "portfolio_team", "toolName": "research.final_decision"},
        ]

    @classmethod
    def _compact_for_trace(cls, value: str, limit: int = 220) -> str:
        text = re.sub(r"```(?:json|markdown|md)?", "", str(value or ""), flags=re.IGNORECASE)
        text = re.sub(r"\s+", " ", text.replace("```", "")).strip()
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 1)].rstrip() + "…"

    @classmethod
    def _fallback_section_message(cls, name: str, content: str = "") -> str:
        excerpt = cls._clean_fallback_excerpt(content)
        messages = {
            "Market View": "本次输出缺少完整的市场观点结构。请暂按低结构化结果处理，并优先复核趋势、流动性、波动和宏观背景。",
            "Bull View": "本次输出缺少完整的正方观点结构。可暂以已有证据中支持配置的因素为参考，但需要重新确认其证据强度。",
            "Bear View": "本次输出缺少完整的反方观点结构。请重点复核估值、流动性、回撤、宏观扰动和证据时效性。",
            "Research Manager Summary": "本次输出缺少完整的研究经理汇总。正反方共识、关键分歧和待验证问题需要在复跑或人工复核后确认。",
            "Risk Review": "本次输出缺少完整的风险复核。请暂按低结构化结果处理，重点观察最大回撤、波动、流动性、集中度和证据可靠性。",
            "Final Decision": "本次任务缺少结构化最终结论，暂列观察。需要补齐市场观点、风险复核和证据有效性后，再确认是否适合配置。",
            "Watch Indicators": "证据质量、估值变化、流动性、波动率、宏观政策和关键财报/公告。",
        }
        base = messages.get(name, "本次输出缺少该章节的结构化内容，需要复跑或人工复核。")
        if excerpt and name in {"Market View", "Research Manager Summary"}:
            return f"{base}\n\n可参考摘要：{excerpt}"
        return base

    @staticmethod
    def _clean_fallback_excerpt(content: str, max_length: int = 360) -> str:
        if not content:
            return ""
        cleaned = re.sub(r"```[\s\S]*?```", " ", content)
        cleaned = re.sub(r"\{[\s\S]{200,}?\}", " ", cleaned)
        cleaned = re.sub(
            r"(?i)\b(Qwen|Final Decision was not provided|Risk Review was not provided|structured output|fallback excerpt|parser fallback|model provider|internal API)\b",
            " ",
            cleaned,
        )
        cleaned = re.sub(r"`[^`]{12,}`", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:：\n\t")
        return cleaned[:max_length]

    @classmethod
    def _ensure_risk_perspective_sections(cls, risk_review: str) -> str:
        perspectives = cls._extract_risk_perspectives(risk_review)
        missing = [label for label in ("conservative", "neutral", "aggressive") if label not in perspectives]
        if not missing:
            return risk_review

        fallback_sections = []
        for key in missing:
            title = {
                "conservative": "保守风险视角",
                "neutral": "中性风险视角",
                "aggressive": "进取风险视角",
            }[key]
            fallback_sections.append(
                f"### {title}\n"
                "本次输出未单独拆分该风险视角。请以上方风险复核为基础，并按低结构化结论处理。"
            )
        return f"{risk_review.rstrip()}\n\n" + "\n\n".join(fallback_sections)

    @staticmethod
    def _extract_risk_perspectives(risk_review: str) -> Dict[str, str]:
        heading_pattern = re.compile(
            r"(?im)^\s{0,3}(?:#{2,4}\s*)?(?P<label>Conservative|Neutral|Base|Balanced|Aggressive|Offensive|保守|中性|基准|平衡|进取|积极)"
            r"(?:\s+(?:Risk\s+Perspective|Perspective|View|风险视角|风险观点))?\s*[:：]?\s*$"
        )
        matches = list(heading_pattern.finditer(risk_review))
        perspectives: Dict[str, str] = {}
        for index, match in enumerate(matches):
            raw_label = match.group("label").lower()
            if raw_label in {"conservative", "保守"}:
                key = "conservative"
            elif raw_label in {"aggressive", "offensive", "进取", "积极"}:
                key = "aggressive"
            else:
                key = "neutral"
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(risk_review)
            content = risk_review[start:end].strip()
            if content:
                perspectives[key] = content

        if perspectives:
            return perspectives

        labels = {
            "conservative": r"(?:Conservative|保守)",
            "neutral": r"(?:Neutral|Base|Balanced|中性|基准|平衡)",
            "aggressive": r"(?:Aggressive|Offensive|进取|积极)",
        }
        next_label = r"(?:Conservative|Neutral|Base|Balanced|Aggressive|Offensive|保守|中性|基准|平衡|进取|积极)"
        for key, label_pattern in labels.items():
            match = re.search(
                rf"(?is){label_pattern}(?:\s+(?:Risk\s+Perspective|Perspective|View|风险视角|风险观点))?\s*[:：]\s*(.+?)(?={next_label}(?:\s+(?:Risk\s+Perspective|Perspective|View|风险视角|风险观点))?\s*[:：]|\Z)",
                risk_review,
            )
            if match:
                perspectives[key] = match.group(1).strip()
        return perspectives

    def _parse_qwen_multistep_response(self, content: str) -> Dict[str, str]:
        markdown_sections = {
            "Market View": self._extract_section(content, "Market View"),
            "Bull View": self._extract_section(content, "Bull View"),
            "Bear View": self._extract_section(content, "Bear View"),
            "Research Manager Summary": self._extract_section(content, "Research Manager Summary"),
            "Risk Review": self._extract_section(content, "Risk Review"),
            "Final Decision": self._extract_section(content, "Final Decision"),
            "Watch Indicators": self._extract_section(content, "Watch Indicators"),
        }
        structured_sections = self._parse_structured_qwen_json(content)
        if structured_sections:
            for name, fallback in markdown_sections.items():
                if fallback and self._is_structured_missing_section(structured_sections.get(name, "")):
                    structured_sections[name] = fallback
            structured_sections["Risk Review"] = self._ensure_risk_perspective_sections(structured_sections["Risk Review"])
            return structured_sections

        sections = markdown_sections
        for name, value in list(sections.items()):
            if not value:
                sections[name] = self._fallback_section_message(name, content)
        sections["Risk Review"] = self._ensure_risk_perspective_sections(sections["Risk Review"])
        return sections

    @staticmethod
    def _is_structured_missing_section(value: str) -> bool:
        return (
            "was not provided in structured Qwen output" in value
            or "were not provided in structured Qwen output" in value
            or "缺少结构化" in value
            or "缺少完整" in value
        )

    @classmethod
    def _parse_structured_qwen_json(cls, content: str) -> Optional[Dict[str, str]]:
        payload = cls._merge_structured_qwen_payloads(content)
        if not isinstance(payload, dict):
            return None

        market_view = cls._stringify_structured_section(payload.get("marketView") or payload.get("market_view"))
        bull_view = cls._stringify_structured_section(payload.get("bullView") or payload.get("bull_view"))
        bear_view = cls._stringify_structured_section(payload.get("bearView") or payload.get("bear_view"))
        research_manager = cls._stringify_structured_section(payload.get("researchManager") or payload.get("research_manager"))
        risk_review = cls._stringify_structured_section(payload.get("riskReview") or payload.get("risk_review"))
        final_decision = cls._stringify_structured_section(payload.get("finalDecision") or payload.get("final_decision"))
        watch_indicators = cls._stringify_structured_section(payload.get("watchIndicators") or payload.get("watch_indicators"))

        if not any([market_view, bull_view, bear_view, research_manager, risk_review, final_decision]):
            return None

        return {
            "Market View": market_view or cls._fallback_section_message("Market View", content),
            "Bull View": bull_view or cls._fallback_section_message("Bull View", content),
            "Bear View": bear_view or cls._fallback_section_message("Bear View", content),
            "Research Manager Summary": research_manager or cls._fallback_section_message("Research Manager Summary", content),
            "Risk Review": risk_review or cls._fallback_section_message("Risk Review", content),
            "Final Decision": final_decision or cls._fallback_section_message("Final Decision", content),
            "Watch Indicators": watch_indicators or cls._fallback_section_message("Watch Indicators", content),
        }

    @staticmethod
    def _extract_json_payload(content: str) -> Optional[Dict[str, Any]]:
        payloads = QwenRunnerAdapter._extract_json_payloads(content)
        return payloads[0] if payloads else None

    @staticmethod
    def _extract_json_payloads(content: str) -> List[Dict[str, Any]]:
        candidates: List[str] = []
        fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", content, flags=re.IGNORECASE)
        candidates.extend(candidate.strip() for candidate in fenced if candidate.strip().startswith("{"))

        stripped = content.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            candidates.append(stripped)

        payloads: List[Dict[str, Any]] = []
        for candidate in candidates:
            try:
                value = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                payloads.append(value)
        return payloads

    @classmethod
    def _merge_structured_qwen_payloads(cls, content: str) -> Dict[str, Any]:
        merged: Dict[str, Any] = {}
        for payload in cls._extract_json_payloads(content):
            for key, value in payload.items():
                if value is not None:
                    merged[key] = value
        return merged

    @staticmethod
    def _get_structured_section_payload(payload: Dict[str, Any], *keys: str) -> Dict[str, Any]:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, dict):
                return value
        return {}

    @classmethod
    def _collect_structured_evidence_ids(cls, payload: Dict[str, Any]) -> List[str]:
        evidence_ids: List[str] = []

        def walk(value: Any) -> None:
            if isinstance(value, dict):
                for key, child in value.items():
                    normalized_key = str(key).lower()
                    if normalized_key in {"evidenceids", "evidence_refs", "evidencerefs", "evidenceids"}:
                        evidence_ids.extend(cls._coerce_string_list(child))
                    else:
                        walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)

        walk(payload)
        return list(dict.fromkeys(evidence_ids))

    @classmethod
    def _validate_evidence_references(
        cls,
        content: str,
        available_evidence_ids: List[str],
        structured_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        available = set(available_evidence_ids)
        text_references = cls._extract_evidence_references(content)
        structured_references = cls._collect_structured_evidence_ids(structured_payload)
        referenced = list(dict.fromkeys([*text_references, *structured_references]))
        valid_referenced = [evidence_id for evidence_id in referenced if evidence_id in available]
        invalid = [evidence_id for evidence_id in referenced if evidence_id not in available]
        unreferenced_available = [evidence_id for evidence_id in available_evidence_ids if evidence_id not in set(valid_referenced)]
        if invalid:
            status = "invalid_references_filtered"
        elif valid_referenced:
            status = "valid"
        else:
            status = "no_explicit_references"
        return {
            "validationStatus": status,
            "availableEvidenceIds": available_evidence_ids,
            "referencedEvidenceIds": referenced,
            "validReferencedEvidenceIds": valid_referenced,
            "invalidEvidenceIds": invalid,
            "unreferencedAvailableEvidenceIds": unreferenced_available,
        }

    @staticmethod
    def _stringify_structured_section(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            lines = []
            for item in value:
                if isinstance(item, (dict, list)):
                    lines.append(f"- {json.dumps(item, ensure_ascii=False)}")
                else:
                    lines.append(f"- {item}")
            return "\n".join(lines).strip()
        if isinstance(value, dict):
            lines = []
            title = value.get("title") or value.get("summary")
            if title:
                lines.append(str(title))
            for key, section_value in value.items():
                if key in {"title", "summary"} and title:
                    continue
                label = re.sub(r"(?<!^)([A-Z])", r" \1", str(key)).replace("_", " ").strip().title()
                rendered = QwenRunnerAdapter._stringify_structured_section(section_value)
                if rendered:
                    lines.append(f"**{label}**\n{rendered}")
            return "\n\n".join(lines).strip()
        return str(value).strip()

    @staticmethod
    def _extract_section(content: str, section_name: str) -> str:
        headings = [
            "Market View",
            "Bull View",
            "Bear View",
            "Research Manager Summary",
            "Risk Review",
            "Final Decision",
            "Watch Indicators",
        ]
        current = re.escape(section_name)
        next_headings = [re.escape(item) for item in headings if item != section_name]
        next_pattern = "|".join(next_headings)
        pattern = rf"(?is)(?:^|\n)\s*#+\s*{current}\s*\n(.*?)(?=\n\s*#+\s*(?:{next_pattern})\s*\n|\Z)"
        match = re.search(pattern, content)
        if match:
            return QwenRunnerAdapter._strip_structured_json_blocks(match.group(1)).strip()

        loose_pattern = rf"(?is)(?:^|\n)\s*(?:\*\*)?{current}(?:\*\*)?\s*[:：]?\s*\n?(.*?)(?=\n\s*(?:{'|'.join(next_headings)})\s*[:：]|\Z)"
        loose_match = re.search(loose_pattern, content)
        return QwenRunnerAdapter._strip_structured_json_blocks(loose_match.group(1)).strip() if loose_match else ""

    @staticmethod
    def _strip_structured_json_blocks(content: str) -> str:
        return re.sub(r"```(?:json)?\s*[\[{][\s\S]*?[\]}]\s*```", "", content or "", flags=re.IGNORECASE).strip()

    @staticmethod
    def _infer_confidence(content: str) -> float:
        patterns = [
            r"(?:confidence|置信度)\s*[:：]?\s*(0(?:\.\d+)?|1(?:\.0+)?)",
            r"(?:confidence|置信度)\s*[:：]?\s*(\d{1,3})\s*%",
        ]
        for pattern in patterns:
            match = re.search(pattern, content, flags=re.IGNORECASE)
            if not match:
                continue
            value = float(match.group(1))
            if value > 1:
                value = value / 100
            return max(0.0, min(value, 1.0))
        return 0.65

    @staticmethod
    def _coerce_confidence(value: Any) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, str):
            value = value.strip().rstrip("%")
            if not value:
                return None
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return None
        if confidence > 1:
            confidence = confidence / 100
        return max(0.0, min(confidence, 1.0))

    @staticmethod
    def _parse_watch_indicators(content: str) -> List[str]:
        lines = [line.strip(" -*\t\r\n") for line in content.splitlines()]
        items = [line for line in lines if line]
        if len(items) == 1 and ("、" in items[0] or "," in items[0] or "，" in items[0]):
            items = [item.strip() for item in re.split(r"[、,，]", items[0]) if item.strip()]
        return items[:8]

    @staticmethod
    def _infer_action(content: str) -> str:
        lowered = content.lower()
        if any(token in content for token in ["增配", "提高配置", "适度配置"]) or "overweight" in lowered:
            return "overweight"
        if any(token in content for token in ["减配", "降低配置"]) or "underweight" in lowered:
            return "underweight"
        if any(token in content for token in ["持有", "维持"]) or "hold" in lowered:
            return "hold"
        if any(token in content for token in ["暂不配置", "不建议配置", "避免配置"]) or "no action" in lowered or "avoid" in lowered:
            return "no_action"
        return "watch"

    @staticmethod
    def _normalize_action(value: Any) -> str:
        normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
        if normalized == "avoid":
            return "no_action"
        if normalized in {"overweight", "underweight", "hold", "watch", "no_action"}:
            return normalized
        return ""

    @staticmethod
    def _coerce_string_list(value: Any) -> List[str]:
        if value is None:
            return []
        if isinstance(value, list):
            items = value
        elif isinstance(value, str):
            if "\n" in value:
                items = value.splitlines()
            else:
                items = re.split(r"[、,，;；]", value)
        else:
            items = [value]
        return [str(item).strip(" -*\t\r\n") for item in items if str(item).strip(" -*\t\r\n")]

    @staticmethod
    def _find_invalid_evidence_references(content: str, valid_evidence_ids: List[str]) -> List[str]:
        valid = set(valid_evidence_ids)
        referenced = set(QwenRunnerAdapter._extract_evidence_references(content))
        return sorted(evidence_id for evidence_id in referenced if evidence_id not in valid)

    @staticmethod
    def _extract_evidence_references(content: str) -> List[str]:
        return list(
            dict.fromkeys(
                re.findall(r"\b(?:ev_(?:static|qwen|bocha|ck|lixinger)[A-Za-z0-9_-]+|ck_[A-Za-z0-9_-]+)\b", content or "")
            )
        )
