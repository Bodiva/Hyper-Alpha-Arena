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
    EvidenceReference,
    RuntimeMetrics,
    SubmitAgentRunRequest,
    SubmitAgentRunResponse,
)
from services.agent_runners.base import AgentRunnerContext
from services.agent_runners.registry import AgentRunnerConfigurationError, AgentRunnerExecutionError
from services.evidence_retrieval.retriever import EvidenceRetriever, to_evidence_reference
from services.evidence_retrieval.static_evidence_seed import EvidenceItem
from services.portfolio_store.portfolio_store import get_static_portfolio_store


QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_DEFAULT_MODEL = "qwen-plus"
QWEN_DEFAULT_TIMEOUT_SECONDS = 120
QWEN_DEFAULT_MAX_TOKENS = 1600
QWEN_AGENT_MAX_PARALLEL_CALLS = 2
QWEN_AGENT_STEP_TIMEOUT_SECONDS = 90

STEP_DEPENDENCIES: Dict[str, List[str]] = {
    "evidence_retrieval": [],
    "market_view": ["evidence_retrieval"],
    "bull_view": ["market_view"],
    "bear_view": ["market_view"],
    "risk_review": ["bull_view", "bear_view"],
    "final_decision": ["risk_review"],
}


class QwenRunnerAdapter:
    runner_type = "qwen"

    def __init__(self) -> None:
        self._event_lock = threading.Lock()

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        config = self._resolve_qwen_config(request, context)
        run = self._create_running_run(request, config["model"], config["source"])
        context.save_run(run)

        worker = threading.Thread(
            target=self._execute_qwen_run,
            args=(request, context, run.runId, config),
            name=f"alpha-trace-qwen-{run.runId}",
            daemon=True,
        )
        worker.start()

        return SubmitAgentRunResponse(
            runId=run.runId,
            status=run.status,
            mode="qwen",
            message="Agent run submitted. QwenRunnerAdapter is executing in a background thread.",
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
            portfolio_context = self._load_portfolio_context(request, context, run_id)
            retrieved_evidence = self._retrieve_evidence(request, context, run_id, portfolio_context)
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
                agent_name="Market Analyst",
                team="analyst_team",
                tool_name="qwen.market_view",
                title=market_title,
                instructions=market_instructions,
                prior_results={},
                required=True,
                portfolio_context=portfolio_context,
            )

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
                    "Bull Researcher",
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
                )
                bear_future = executor.submit(
                    self._run_qwen_agent_step,
                    request,
                    context,
                    run_id,
                    config,
                    retrieved_evidence,
                    "bear_view",
                    "Bear Researcher",
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
                )
                bull_view = bull_future.result()
                bear_view = bear_future.result()

            risk_review = self._run_qwen_agent_step(
                request=request,
                context=context,
                run_id=run_id,
                config=config,
                evidence_items=retrieved_evidence,
                step_id="risk_review",
                agent_name="Risk Analyst",
                team="risk_team",
                tool_name="qwen.risk_review",
                title="Risk Review / Rebalance Suggestions" if is_portfolio_task else "Risk Review",
                instructions=(
                    "输入 Market / Bull / Bear 和组合上下文，诊断资产配置、风险暴露、调仓建议、最大回撤、波动、集中度、流动性和情景风险。必须引用 evidenceId。"
                    if is_portfolio_task
                    else "输入 Market / Bull / Bear，评估最大回撤、波动、集中度、流动性、情景风险和需要观察的风险指标。必须引用 evidenceId。"
                ),
                prior_results={"Market View": market_view, "Bull View": bull_view, "Bear View": bear_view},
                required=True,
                portfolio_context=portfolio_context,
            )

            final_decision = self._run_qwen_agent_step(
                request=request,
                context=context,
                run_id=run_id,
                config=config,
                evidence_items=retrieved_evidence,
                step_id="final_decision",
                agent_name="Portfolio Manager",
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
                    "Risk Review": risk_review,
                },
                required=True,
                portfolio_context=portfolio_context,
            )

            content = (
                f"## Market View\n{market_view}\n\n"
                f"## Bull View\n{bull_view}\n\n"
                f"## Bear View\n{bear_view}\n\n"
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
        except Exception as exc:
            self._mark_run_failed(context, run_id, exc)

    @staticmethod
    def _is_portfolio_diagnosis(request: SubmitAgentRunRequest) -> bool:
        return request.taskType in {"portfolio_diagnostic", "portfolio_diagnosis"}

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
                    summary=f"Portfolio context loading failed; Qwen will continue without portfolio seed context. Error: {exc}",
                ),
                agent_name="Portfolio Context Loader",
                team="analyst_team",
            )
            return {"portfolioId": request.portfolioId, "available": False, "error": str(exc)}

    def _retrieve_evidence(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
        portfolio_context: Optional[Dict[str, Any]] = None,
    ) -> List[EvidenceItem]:
        self._append_event(
            context,
            run_id,
            "tool.called",
            {
                "toolName": "evidence.retrieve",
                "args": {
                    "assetId": request.assetId,
                    "taskType": request.taskType,
                    "limit": 5,
                    "source": "static_evidence_seed",
                },
            },
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
                )
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                {
                    "toolName": "evidence.retrieve",
                    "status": "failed",
                    "summary": f"Evidence retrieval failed; Qwen will continue with assumption fallback. Error: {exc}",
                },
                agent_name="Evidence Retriever",
                team="analyst_team",
            )
            return []

        evidence_ids = [item.evidenceId for item in items]
        self._append_event(
            context,
            run_id,
            "tool.result",
            {
                "toolName": "evidence.retrieve",
                "status": "completed",
                "summary": f"Retrieved {len(items)} static evidence item(s).",
                "evidenceIds": evidence_ids,
            },
            agent_name="Evidence Retriever",
            team="analyst_team",
        )
        if items:
            self._append_event(
                context,
                run_id,
                "evidence.linked",
                {
                    "evidenceIds": evidence_ids,
                    "summary": "Retrieved static evidence items linked before Qwen prompt construction.",
                },
                agent_name="Evidence Retriever",
                team="analyst_team",
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
            "Hyper AI qwen configuration is not available and DASHSCOPE_API_KEY is not configured."
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
            raise AgentRunnerConfigurationError(f"Failed to read Hyper AI LLM configuration: {exc}") from exc

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
                "Hyper AI qwen provider/model/base URL are configured, but the API key is missing or could not be decrypted. "
                "Please save the Qwen API Key again in Hyper AI settings, or set DASHSCOPE_API_KEY on the backend."
            )

        return {
            "api_key": str(config["api_key"]),
            "base_url": base_url or QWEN_DEFAULT_BASE_URL,
            "model": model,
            "api_format": str(config.get("api_format") or "openai"),
            "source": "hyper_ai_profile",
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
    ) -> str:
        try:
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
            )
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
                ),
            },
        ]
        timeout_seconds = self._int_env(
            "QWEN_AGENT_STEP_TIMEOUT_SECONDS",
            QWEN_AGENT_STEP_TIMEOUT_SECONDS,
            minimum=10,
            maximum=300,
        )
        max_tokens = self._int_env("QWEN_MAX_TOKENS", QWEN_DEFAULT_MAX_TOKENS, minimum=512, maximum=4000)
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
            raise AgentRunnerExecutionError("Qwen API endpoint is invalid.")

        last_error = ""
        for endpoint in endpoints:
            try:
                with requests.post(endpoint, headers=headers, json=payload, timeout=timeout_seconds, stream=True) as response:
                    if response.status_code != 200:
                        last_error = f"HTTP {response.status_code}: {response.text[:1000]}"
                        continue

                    accumulated_text = ""
                    buffer = ""
                    last_emit_at = time.monotonic()

                    for raw_line in response.iter_lines(decode_unicode=True):
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
                        if len(buffer) >= 120 or now - last_emit_at >= 0.35:
                            self._append_streaming_chunk(
                                context=context,
                                run_id=run_id,
                                content=buffer,
                                accumulated_length=len(accumulated_text),
                                step_id=step_id,
                                agent_name=agent_name,
                                team=team,
                            )
                            buffer = ""
                            last_emit_at = now

                    if buffer:
                        self._append_streaming_chunk(
                            context=context,
                            run_id=run_id,
                            content=buffer,
                            accumulated_length=len(accumulated_text),
                            step_id=step_id,
                            agent_name=agent_name,
                            team=team,
                        )

                    if not accumulated_text:
                        raise AgentRunnerExecutionError(f"Qwen API returned an empty streaming response for {title}.")
                    return accumulated_text
            except requests.exceptions.Timeout:
                last_error = f"{title} request timed out after {timeout_seconds}s"
                continue
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)
                continue
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise AgentRunnerExecutionError(
                    f"Qwen API streaming response for {title} did not match OpenAI-compatible chat completion format."
                ) from exc

        raise AgentRunnerExecutionError(f"Qwen API request failed for {title}: {last_error or 'no endpoint succeeded'}")

    @staticmethod
    def _build_agent_step_system_prompt(title: str) -> str:
        return (
            "你是 AlphaTrace 智能投研决策平台中的一个专业投研 Agent。\n"
            f"当前任务步骤：{title}。\n"
            "请面向 ETF、基金、期货等资产生成可追溯、可复盘、可量化评估的分析。\n"
            "不要承诺收益，不要给出确定性投资结论。\n"
            "优先引用提供的 evidenceId，不要编造不存在的证据。\n"
            "请输出结构化 Markdown，要点清晰，控制在 350-700 字。"
        )

    @staticmethod
    def _build_agent_step_user_prompt(
        request: SubmitAgentRunRequest,
        evidence_items: List[EvidenceItem],
        step_id: str,
        title: str,
        instructions: str,
        prior_results: Dict[str, str],
        portfolio_context: Optional[Dict[str, Any]] = None,
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
                "question": request.question,
                "horizon": request.horizon,
                "riskPreference": request.riskPreference,
                "portfolioContext": portfolio_context,
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
                "priorResults": prior_results,
                "outputRules": [
                    "必须引用相关 evidenceId；如果证据不足请明确说明。",
                    "不要输出 JSON，直接输出 Markdown 分析文本。",
                    "不要声称这是 TradingAgents 真实并行运行结果。",
                    "如果 portfolioContext 可用，必须基于组合持仓、风险指标和调仓建议分析，不要编造不存在的持仓。",
                ],
            },
            ensure_ascii=False,
            indent=2,
        )

    @staticmethod
    def _step_payload(step_id: str, progress: int, **payload: Any) -> Dict[str, Any]:
        return {
            **payload,
            "stepId": step_id,
            "dependsOn": STEP_DEPENDENCIES.get(step_id, []),
            "progress": progress,
        }

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
        max_tokens = self._int_env("QWEN_MAX_TOKENS", QWEN_DEFAULT_MAX_TOKENS, minimum=512, maximum=4000)
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
            raise AgentRunnerExecutionError("Qwen API endpoint is invalid.")

        last_error = ""
        for endpoint in endpoints:
            try:
                with requests.post(endpoint, headers=headers, json=payload, timeout=timeout_seconds, stream=True) as response:
                    if response.status_code != 200:
                        last_error = f"HTTP {response.status_code}: {response.text[:1000]}"
                        continue

                    accumulated_text = ""
                    buffer = ""
                    last_emit_at = time.monotonic()

                    for raw_line in response.iter_lines(decode_unicode=True):
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
                        if len(buffer) >= 120 or now - last_emit_at >= 0.35:
                            self._append_streaming_chunk(context, run_id, buffer, len(accumulated_text))
                            buffer = ""
                            last_emit_at = now

                    if buffer:
                        self._append_streaming_chunk(context, run_id, buffer, len(accumulated_text))

                    if not accumulated_text:
                        raise AgentRunnerExecutionError("Qwen API returned an empty streaming response.")
                    return accumulated_text
            except requests.exceptions.Timeout as exc:
                last_error = f"request timed out after {timeout_seconds}s"
                continue
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)
                continue
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise AgentRunnerExecutionError(
                    "Qwen API response did not match OpenAI-compatible chat completion format."
                ) from exc

        raise AgentRunnerExecutionError(f"Qwen API request failed: {last_error or 'no endpoint succeeded'}")

    def _append_streaming_chunk(
        self,
        context: AgentRunnerContext,
        run_id: str,
        content: str,
        accumulated_length: int,
        step_id: str = "unknown",
        agent_name: str = "Qwen Research Agent",
        team: str = "research_team",
    ) -> None:
        payload: Dict[str, Any] = {
            "content": content,
            "accumulatedLength": accumulated_length,
            "sectionHint": self._infer_section_hint_from_text(content),
            "streaming": True,
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

    @staticmethod
    def _infer_section_hint_from_text(content: str) -> str:
        lowered = content.lower()
        if "market view" in lowered or "市场" in content:
            return "market_view"
        if "bull view" in lowered or "正方" in content:
            return "bull_view"
        if "bear view" in lowered or "反方" in content:
            return "bear_view"
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
    def _build_system_prompt() -> str:
        return (
            "你是 AlphaTrace 智能投研决策平台中的多 Agent 投研编排器。\n"
            "你需要模拟一个轻量投研团队，对 ETF、基金、期货等资产进行分析。\n"
            "请输出可追溯、可复盘、可量化评估的分析。\n"
            "不要承诺收益。\n"
            "不要给出确定性投资结论。\n"
            "请严格使用以下 Markdown 标题输出：\n"
            "## Market View\n"
            "## Bull View\n"
            "## Bear View\n"
            "## Risk Review\n"
            "## Final Decision\n"
            "## Watch Indicators\n"
            "Final Decision 必须包含建议动作：overweight / underweight / hold / watch / avoid 之一，以及 0-1 之间的置信度。\n"
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
                "question": request.question,
                "horizon": request.horizon,
                "riskPreference": request.riskPreference,
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
                    "Market View / Bull View / Bear View / Risk Review / Final Decision 中需要引用相关 evidenceId。",
                    "不要编造 availableEvidence 之外的证据。",
                    "如果证据不足，需要明确说明还缺少哪些数据。",
                ],
                "requiredOutputSections": {
                    "Market View": "市场环境、趋势、流动性、波动和宏观背景。",
                    "Bull View": "支持配置或增配的正方观点。",
                    "Bear View": "风险、反方观点和失效条件。",
                    "Risk Review": "最大回撤、波动、集中度、流动性、情景风险。",
                    "Final Decision": "建议动作、置信度、投资周期、核心理由、主要风险。",
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
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        run_id = run_id or f"run_qwen_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        is_portfolio_task = self._is_portfolio_diagnosis(request)
        asset_ids = [request.assetId] if request.assetId else []
        target_id = request.portfolioId or request.assetId or ("portfolio_diagnosis" if is_portfolio_task else "agent_task")
        sections = self._parse_qwen_multistep_response(content)
        final_decision_text = sections["Final Decision"]
        watch_indicators_text = sections["Watch Indicators"]
        action = self._infer_action(final_decision_text)
        confidence = self._infer_confidence(final_decision_text)
        sequence = len(existing_events or [])

        agents = [
            AgentParticipant(
                agentId="agent-qwen-market-001",
                name="Market Analyst",
                role="market_analyst",
                team="analyst_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-bull-001",
                name="Bull Researcher",
                role="bull_researcher",
                team="research_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-bear-001",
                name="Bear Researcher",
                role="bear_researcher",
                team="research_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-risk-001",
                name="Risk Analyst",
                role="risk_analyst",
                team="risk_team",
                status="completed",
            ),
            AgentParticipant(
                agentId="agent-qwen-pm-001",
                name="Portfolio Manager",
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
                    title="Qwen market view assumption",
                    evidenceType="market_snapshot",
                    sourceName="Qwen Runner",
                    qualityScore=72,
                    summary=sections["Market View"][:600],
                ),
                EvidenceReference(
                    evidenceId=f"ev_qwen_bull_assumption_{run_id}",
                    title="Qwen bull view assumption",
                    evidenceType="research_report",
                    sourceName="Qwen Runner",
                    qualityScore=72,
                    summary=sections["Bull View"][:600],
                ),
                EvidenceReference(
                    evidenceId=f"ev_qwen_bear_assumption_{run_id}",
                    title="Qwen bear view assumption",
                    evidenceType="research_report",
                    sourceName="Qwen Runner",
                    qualityScore=72,
                    summary=sections["Bear View"][:600],
                ),
                EvidenceReference(
                    evidenceId=f"ev_qwen_risk_assumption_{run_id}",
                    title="Qwen risk review assumption",
                    evidenceType="macro_data",
                    sourceName="Qwen Runner",
                    qualityScore=72,
                    summary=sections["Risk Review"][:600],
                ),
            ]
        evidence_ids = [item.evidenceId for item in evidence]
        evidence_note = (
            f"\n\nEvidence used: {', '.join(evidence_ids)}"
            if evidence_ids
            else "\n\nEvidence used: none"
        )
        if is_portfolio_task:
            report_specs = [
                (
                    "portfolio_overview",
                    "Market Analyst",
                    "Portfolio Overview / Exposure Review Report",
                    f"{sections['Market View']}{evidence_note}",
                ),
                ("bull", "Bull Researcher", "Bull View Report", f"{sections['Bull View']}{evidence_note}"),
                ("bear", "Bear Researcher", "Bear View Report", f"{sections['Bear View']}{evidence_note}"),
                (
                    "risk_rebalance",
                    "Risk Analyst",
                    "Risk Review / Rebalance Suggestions Report",
                    f"{sections['Risk Review']}{evidence_note}",
                ),
            ]
        else:
            report_specs = [
                ("market", "Market Analyst", "Market View Report", f"{sections['Market View']}{evidence_note}"),
                ("bull", "Bull Researcher", "Bull View Report", f"{sections['Bull View']}{evidence_note}"),
                ("bear", "Bear Researcher", "Bear View Report", f"{sections['Bear View']}{evidence_note}"),
                ("risk", "Risk Analyst", "Risk Review Report", f"{sections['Risk Review']}{evidence_note}"),
            ]
        reports = [
            AgentReport(
                reportId=f"report_{run_id}_{slug}_001",
                runId=run_id,
                agentName=agent_name,
                title=title,
                summary=summary,
                createdAt=now,
            )
            for slug, agent_name, title, summary in report_specs
        ]
        observation_indicators = self._parse_watch_indicators(watch_indicators_text)
        decision = AgentDecision(
            action=action,
            horizon=request.horizon,
            confidence=confidence,
            thesis=final_decision_text,
            summary="Qwen generated a multi-step research review. Treat this as an analyst draft, not a deterministic investment conclusion.",
            risks=[
                sections["Bear View"][:500],
                sections["Risk Review"][:500],
                "No TradingAgents multi-agent process has been executed",
                "No database-backed evidence validation has been performed",
            ],
            evidenceIds=evidence_ids,
            triggerConditions=["Evidence assumptions are independently verified", "Risk budget remains available"],
            invalidationConditions=["Key assumptions fail validation", "Liquidity or drawdown risk exceeds threshold"],
            observationIndicators=observation_indicators or ["Liquidity", "Volatility", "Evidence quality", "Macro context"],
        )
        events: List[AgentRuntimeEvent] = []
        step_evidence_ids = {
            "market": evidence_ids[:2] or evidence_ids,
            "bull": evidence_ids[1:3] or evidence_ids,
            "bear": evidence_ids[2:4] or evidence_ids,
            "risk": evidence_ids[3:5] or evidence_ids,
        }

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

        add_event("reasoning.chunk", "Market Analyst", "analyst_team", {"content": sections["Market View"][:1000]})
        add_event("report.generated", "Market Analyst", "analyst_team", {"reportId": reports[0].reportId, "title": reports[0].title})
        add_event("agent.completed", "Market Analyst", "analyst_team", {})
        add_event("debate.message", "Bull Researcher", "research_team", {"stance": "bull", "content": sections["Bull View"][:1000], "evidenceIds": step_evidence_ids["bull"]})
        add_event("report.generated", "Bull Researcher", "research_team", {"reportId": reports[1].reportId, "title": reports[1].title})
        add_event("agent.completed", "Bull Researcher", "research_team", {})
        add_event("debate.message", "Bear Researcher", "research_team", {"stance": "bear", "content": sections["Bear View"][:1000], "evidenceIds": step_evidence_ids["bear"]})
        add_event("report.generated", "Bear Researcher", "research_team", {"reportId": reports[2].reportId, "title": reports[2].title})
        add_event("agent.completed", "Bear Researcher", "research_team", {})
        add_event("risk.warning", "Risk Analyst", "risk_team", {"level": "MEDIUM", "content": sections["Risk Review"][:1000], "evidenceIds": step_evidence_ids["risk"]})
        add_event("report.generated", "Risk Analyst", "risk_team", {"reportId": reports[3].reportId, "title": reports[3].title})
        add_event("agent.completed", "Risk Analyst", "risk_team", {})
        add_event("reasoning.chunk", "Portfolio Manager", "portfolio_team", {"content": final_decision_text[:1000]})
        add_event(
            "evidence.linked",
            "Portfolio Manager",
            "portfolio_team",
            {
                "evidenceIds": evidence_ids,
                "summary": (
                    "Retrieved static evidence linked to final decision."
                    if retrieved_evidence
                    else "Qwen multi-step assumptions linked to final decision."
                ),
            },
        )
        add_event("decision.updated", "Portfolio Manager", "portfolio_team", {"action": action, "confidence": decision.confidence, "evidenceIds": evidence_ids})
        add_event("agent.completed", "Portfolio Manager", "portfolio_team", {})
        add_event("agent.run.completed", None, None, {})

        context.save_evidence_references(evidence)
        if context.update_run_outputs:
            context.update_run_outputs(run_id, reports, evidence, decision, 1)
            for event in events:
                self._append_existing_event(context, run_id, event)
            if context.update_run_status:
                context.update_run_status(run_id, "completed", now)
            run = context.get_run(run_id) if context.get_run else None
        else:
            run = AgentRun(
                runId=run_id,
                name="AlphaTrace Qwen Portfolio Diagnosis" if is_portfolio_task else "AlphaTrace Qwen Runner Agent Task",
                target=target_id,
                taskType=request.taskType,
                riskLevel="medium",
                status="completed",
                assetIds=asset_ids,
                portfolioId=request.portfolioId,
                strategyId=request.strategyId,
                triggeredBy="qwen_runner",
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
                metrics=RuntimeMetrics(llmCalls=1, toolCalls=5, generatedReports=len(reports), durationSeconds=0, estimatedCostUsd=None),
            )
            context.save_run(run)
        if not run:
            raise AgentRunnerExecutionError(f"Qwen run disappeared from runtime store: {run_id}")
        return SubmitAgentRunResponse(
            runId=run_id,
            status=run.status,
            mode="qwen",
            message=f"Agent task completed by QwenRunnerAdapter using {config_source}. TradingAgents and database persistence were not used.",
            run=run,
        )

    def _create_running_run(self, request: SubmitAgentRunRequest, model: str, config_source: str) -> AgentRun:
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        run_id = f"run_qwen_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        is_portfolio_task = self._is_portfolio_diagnosis(request)
        asset_ids = [request.assetId] if request.assetId else []
        target_id = request.portfolioId or request.assetId or ("portfolio_diagnosis" if is_portfolio_task else "agent_task")
        agents = [
            AgentParticipant(agentId="agent-qwen-market-001", name="Market Analyst", role="market_analyst", team="analyst_team", status="running"),
            AgentParticipant(agentId="agent-qwen-bull-001", name="Bull Researcher", role="bull_researcher", team="research_team", status="running"),
            AgentParticipant(agentId="agent-qwen-bear-001", name="Bear Researcher", role="bear_researcher", team="research_team", status="running"),
            AgentParticipant(agentId="agent-qwen-risk-001", name="Risk Analyst", role="risk_analyst", team="risk_team", status="running"),
            AgentParticipant(agentId="agent-qwen-pm-001", name="Portfolio Manager", role="portfolio_manager", team="portfolio_team", status="running"),
        ]
        decision = AgentDecision(
            action="watch",
            horizon=request.horizon,
            confidence=0.0,
            thesis="Agent run is still executing. Final decision will be updated when Qwen returns.",
            summary="Pending Qwen runner output.",
            risks=["Runtime is still running"],
            evidenceIds=[],
            triggerConditions=[],
            invalidationConditions=[],
            observationIndicators=[],
        )
        events = [
            AgentRuntimeEvent(eventId=f"evt_{run_id}_001", runId=run_id, type="agent.run.started", timestamp=now, sequence=1, payload={"source": "qwen_runner", "configSource": config_source}),
            AgentRuntimeEvent(eventId=f"evt_{run_id}_002", runId=run_id, type="reasoning.chunk", timestamp=now, sequence=2, agentName="Qwen Research Agent", team="research_team", payload={"content": "Preparing multi-step Qwen research orchestration."}),
        ]
        return AgentRun(
            runId=run_id,
            name="AlphaTrace Qwen Portfolio Diagnosis" if is_portfolio_task else "AlphaTrace Qwen Runner Agent Task",
            target=target_id,
            taskType=request.taskType,
            riskLevel="medium",
            status="running",
            assetIds=asset_ids,
            portfolioId=request.portfolioId,
            strategyId=request.strategyId,
            triggeredBy="qwen_runner",
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
            metrics=RuntimeMetrics(llmCalls=0, toolCalls=5, generatedReports=0, durationSeconds=0, estimatedCostUsd=None),
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
            sequence = len(self._get_existing_events(context, run_id)) + 1
            event = AgentRuntimeEvent(
                eventId=f"evt_{run_id}_{sequence:03d}",
                runId=run_id,
                type=event_type,
                timestamp=datetime.now().astimezone().isoformat(timespec="seconds"),
                sequence=sequence,
                agentName=agent_name,
                team=team,
                payload=payload,
            )
            self._append_existing_event(context, run_id, event)

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
        message = str(exc) or exc.__class__.__name__
        self._append_event(
            context,
            run_id,
            "agent.failed",
            {"error": message},
            agent_name="Qwen Research Agent",
            team="research_team",
        )
        self._append_event(
            context,
            run_id,
            "agent.run.failed",
            {"error": message},
        )
        if context.update_run_status:
            context.update_run_status(run_id, "failed", datetime.now().astimezone().isoformat(timespec="seconds"))

    @staticmethod
    def _runtime_steps() -> List[Dict[str, str]]:
        return [
            {"title": "Market View", "agent": "Market Analyst", "team": "analyst_team", "toolName": "qwen.market_view"},
            {"title": "Bull View", "agent": "Bull Researcher", "team": "research_team", "toolName": "qwen.bull_view"},
            {"title": "Bear View", "agent": "Bear Researcher", "team": "research_team", "toolName": "qwen.bear_view"},
            {"title": "Risk Review", "agent": "Risk Analyst", "team": "risk_team", "toolName": "qwen.risk_review"},
            {"title": "Final Decision", "agent": "Portfolio Manager", "team": "portfolio_team", "toolName": "qwen.final_decision"},
        ]

    def _parse_qwen_multistep_response(self, content: str) -> Dict[str, str]:
        sections = {
            "Market View": self._extract_section(content, "Market View"),
            "Bull View": self._extract_section(content, "Bull View"),
            "Bear View": self._extract_section(content, "Bear View"),
            "Risk Review": self._extract_section(content, "Risk Review"),
            "Final Decision": self._extract_section(content, "Final Decision"),
            "Watch Indicators": self._extract_section(content, "Watch Indicators"),
        }
        for name, value in list(sections.items()):
            if not value:
                sections[name] = content[:1400] if name == "Final Decision" else f"{name} was not explicitly separated by Qwen. Fallback excerpt:\n{content[:1000]}"
        return sections

    @staticmethod
    def _extract_section(content: str, section_name: str) -> str:
        headings = [
            "Market View",
            "Bull View",
            "Bear View",
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
            return match.group(1).strip()

        loose_pattern = rf"(?is)(?:^|\n)\s*(?:\*\*)?{current}(?:\*\*)?\s*[:：]?\s*\n?(.*?)(?=\n\s*(?:{'|'.join(next_headings)})\s*[:：]|\Z)"
        loose_match = re.search(loose_pattern, content)
        return loose_match.group(1).strip() if loose_match else ""

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

