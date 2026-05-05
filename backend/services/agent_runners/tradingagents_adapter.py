from __future__ import annotations

import json
import os
import re
import sys
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
from services.asset_store.asset_store import get_static_asset_store
from services.agent_tool_registry import get_agent_tool_contract
from services.agent_orchestrator.subprocess_orchestrator import (
    SubprocessOrchestrator,
    SubprocessWorkerArtifacts,
    SubprocessWorkerSpec,
)
from services.evidence_retrieval.external_search import ExternalEvidenceSearch
from services.evidence_retrieval.retriever import EvidenceRetriever, to_evidence_reference
from services.evidence_retrieval.static_evidence_seed import EvidenceItem


TRADINGAGENTS_DEFAULT_TICKER = "SPY"
TRADINGAGENTS_CONTEXT_EVIDENCE_ID = "ev_tradingagents_poc_context"


class TradingAgentsRunnerAdapter:
    """Optional AlphaTrace runner adapter for a local TradingAgents PoC.

    The adapter is intentionally lazy:
    - FastAPI startup never imports TradingAgents.
    - TradingAgents only runs when `ALPHATRACE_TRADINGAGENTS_ENABLED=true`.
    - Missing repo paths or Python dependencies return clear submit errors.
    """

    runner_type = "tradingagents"

    def __init__(self) -> None:
        self._event_lock = threading.Lock()

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        if os.getenv("ALPHATRACE_TRADINGAGENTS_ENABLED", "").strip().lower() != "true":
            raise AgentRunnerConfigurationError("TradingAgents runner is not enabled.")

        if request.taskType != "single_asset_analysis":
            raise AgentRunnerConfigurationError(
                f"TradingAgents PoC only supports taskType=single_asset_analysis; got {request.taskType}."
            )

        if self._should_use_subprocess_worker(request):
            return self._submit_subprocess_worker(request, context)

        graph_cls, default_config = self._load_tradingagents_symbols()
        ticker, ticker_note = self._resolve_ticker(request)
        trade_date = self._resolve_trade_date(request)
        selected_analysts = self._resolve_selected_analysts(request)
        run_config = self._build_tradingagents_config(request, default_config)
        self._hydrate_qwen_runtime_config(request, context, run_config)

        run = self._create_running_run(
            request=request,
            ticker=ticker,
            trade_date=trade_date,
            selected_analysts=selected_analysts,
            model_name=str(run_config.get("deep_think_llm") or run_config.get("quick_think_llm") or "tradingagents"),
        )
        context.save_run(run)
        if ticker_note:
            self._append_event(
                context,
                run.runId,
                "reasoning.chunk",
                {"content": ticker_note, "source": "tradingagents_adapter", "stepId": "ticker_mapping"},
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )

        worker = threading.Thread(
            target=self._execute_tradingagents_run,
            args=(request, context, run.runId, graph_cls, run_config, ticker, trade_date, selected_analysts),
            name=f"alpha-trace-tradingagents-{run.runId}",
            daemon=True,
        )
        worker.start()

        return SubmitAgentRunResponse(
            runId=run.runId,
            status=run.status,
            mode="tradingagents",
            message="Agent run submitted. TradingAgentsRunnerAdapter is executing in a background thread.",
            run=run,
        )

    def _submit_subprocess_worker(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        ticker, ticker_note = self._resolve_ticker(request)
        trade_date = self._resolve_trade_date(request)
        selected_analysts = self._resolve_selected_analysts(request)
        parent_run_config = {
            "llm_provider": request.runnerConfig.modelProvider or "qwen",
            "backend_url": os.getenv("QWEN_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        }
        self._hydrate_qwen_runtime_config(request, context, parent_run_config)
        self._validate_runtime_provider_config(parent_run_config)

        model_name = request.runnerConfig.modelName or os.getenv("QWEN_MODEL") or "qwen-plus"
        run = self._create_running_run(
            request=request,
            ticker=ticker,
            trade_date=trade_date,
            selected_analysts=selected_analysts,
            model_name=model_name,
        )
        context.save_run(run)
        if ticker_note:
            self._append_event(
                context,
                run.runId,
                "reasoning.chunk",
                {"content": ticker_note, "source": "tradingagents_adapter", "stepId": "ticker_mapping"},
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )

        timeout_seconds = self._int_value((request.runnerConfig.extraParams or {}).get("workerTimeoutSeconds"), 900)
        self._append_event(
            context,
            run.runId,
            "agent.started",
            {
                "content": "AlphaTrace Orchestrator is launching TradingAgents in a subprocess worker.",
                "source": "alphatrace_orchestrator",
                "workerType": "subprocess",
                "timeoutSeconds": timeout_seconds,
                "ticker": ticker,
                "tradeDate": trade_date,
                "selectedAnalysts": selected_analysts,
            },
            agent_name="AlphaTrace Orchestrator",
            team="runtime",
        )

        current_run = context.get_run(run.runId) if context.get_run else run
        current_run = current_run or run
        work_dir = self._worker_root_dir() / run.runId
        work_dir.mkdir(parents=True, exist_ok=True)
        input_path = work_dir / "input.json"
        input_payload = {
            "request": request.model_dump(),
            "run": current_run.model_dump(),
            "baseSequence": len(current_run.events),
            "ticker": ticker,
            "tradeDate": trade_date,
            "selectedAnalysts": selected_analysts,
        }
        input_path.write_text(json.dumps(input_payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

        backend_dir = Path(__file__).resolve().parents[2]
        env = {
            "PYTHONPATH": self._worker_pythonpath(backend_dir),
            "ALPHATRACE_TRADINGAGENTS_ENABLED": "true",
        }
        if os.getenv("TRADINGAGENTS_REPO_PATH"):
            env["TRADINGAGENTS_REPO_PATH"] = os.getenv("TRADINGAGENTS_REPO_PATH", "")

        spec = SubprocessWorkerSpec(
            run_id=run.runId,
            command=[
                sys.executable,
                "-m",
                "services.agent_runners.tradingagents_worker",
                "--input",
                str(input_path),
                "--output-dir",
                str(work_dir),
            ],
            work_dir=work_dir,
            cwd=backend_dir,
            env=env,
            timeout_seconds=timeout_seconds,
        )
        orchestrator = SubprocessOrchestrator()
        artifacts = orchestrator.start(
            spec=spec,
            on_event=lambda event_payload: self._append_worker_event(context, run.runId, event_payload),
            on_result=lambda result, worker_artifacts: self._apply_worker_result(context, run.runId, result, worker_artifacts),
            on_timeout=lambda worker_artifacts: self._mark_run_failed(
                context,
                run.runId,
                request,
                ticker,
                trade_date,
                TimeoutError(f"TradingAgents subprocess worker timed out after {timeout_seconds} seconds."),
            ),
            on_error=lambda message, worker_artifacts: self._mark_run_failed(
                context,
                run.runId,
                request,
                ticker,
                trade_date,
                AgentRunnerExecutionError(message),
            ),
        )
        self._append_event(
            context,
            run.runId,
            "tool.called",
            {
                "toolName": "tradingagents.subprocess_worker",
                "source": "alphatrace_orchestrator",
                "workDir": str(artifacts.work_dir),
                "stdout": str(artifacts.stdout_path),
                "stderr": str(artifacts.stderr_path),
                "events": str(artifacts.events_path),
                "result": str(artifacts.result_path),
            },
            agent_name="AlphaTrace Orchestrator",
            team="runtime",
        )

        return SubmitAgentRunResponse(
            runId=run.runId,
            status=run.status,
            mode="tradingagents",
            message="Agent run submitted. AlphaTrace Orchestrator launched TradingAgents in a subprocess worker.",
            run=(context.get_run(run.runId) if context.get_run else None) or run,
        )

    @staticmethod
    def _should_use_subprocess_worker(request: SubmitAgentRunRequest) -> bool:
        extra = request.runnerConfig.extraParams or {}
        value = extra.get("useSubprocessWorker", extra.get("subprocessWorker", True))
        if isinstance(value, str):
            return value.strip().lower() not in {"false", "0", "no", "off"}
        return bool(value)

    @staticmethod
    def _worker_root_dir() -> Path:
        configured = os.getenv("ALPHATRACE_AGENT_WORKER_DIR", "").strip()
        if configured:
            return Path(configured)
        return Path(__file__).resolve().parents[2] / "runtime_data" / "agent_workers"

    @staticmethod
    def _worker_pythonpath(backend_dir: Path) -> str:
        parts = [str(backend_dir)]
        repo_path = os.getenv("TRADINGAGENTS_REPO_PATH", "").strip()
        if repo_path:
            parts.append(repo_path)
        existing = os.getenv("PYTHONPATH", "").strip()
        if existing:
            parts.append(existing)
        return os.pathsep.join(parts)

    def _append_worker_event(self, context: AgentRunnerContext, run_id: str, payload: Dict[str, Any]) -> None:
        try:
            event = AgentRuntimeEvent.model_validate(payload)
        except Exception:
            return
        if event.runId != run_id:
            return
        if context.append_event:
            context.append_event(run_id, event)

    def _apply_worker_result(
        self,
        context: AgentRunnerContext,
        run_id: str,
        result: Dict[str, Any],
        artifacts: SubprocessWorkerArtifacts,
    ) -> None:
        current_run = context.get_run(run_id) if context.get_run else None
        if current_run and current_run.status == "cancelled":
            self._append_event(
                context,
                run_id,
                "tool.result",
                {
                    "toolName": "tradingagents.subprocess_worker",
                    "status": "cancelled",
                    "source": "alphatrace_orchestrator",
                    "summary": "Worker result was ignored because the AgentRun was already cancelled.",
                    "workDir": str(artifacts.work_dir),
                    "result": str(artifacts.result_path),
                },
                agent_name="AlphaTrace Orchestrator",
                team="runtime",
            )
            return

        reports = [AgentReport.model_validate(item) for item in result.get("reports") or []]
        evidence = [EvidenceReference.model_validate(item) for item in result.get("evidence") or []]
        decision_payload = result.get("decision")
        decision = AgentDecision.model_validate(decision_payload) if decision_payload else None
        if decision and context.update_run_outputs:
            context.update_run_outputs(run_id, reports, evidence, decision, result.get("llmCalls"))

        status = str(result.get("status") or "completed")
        completed_at = result.get("completedAt") or datetime.now().astimezone().isoformat(timespec="seconds")
        if context.update_run_status and status in {"completed", "failed", "cancelled"}:
            context.update_run_status(run_id, status, completed_at)

        self._append_event(
            context,
            run_id,
            "tool.result",
            {
                "toolName": "tradingagents.subprocess_worker",
                "status": status,
                "source": "alphatrace_orchestrator",
                "workDir": str(artifacts.work_dir),
                "stdout": str(artifacts.stdout_path),
                "stderr": str(artifacts.stderr_path),
                "result": str(artifacts.result_path),
            },
            agent_name="AlphaTrace Orchestrator",
            team="runtime",
        )

    def _load_tradingagents_symbols(self) -> Tuple[Any, Dict[str, Any]]:
        repo_path = self._resolve_repo_path()
        if repo_path:
            repo_path_str = str(repo_path)
            if repo_path_str not in sys.path:
                sys.path.insert(0, repo_path_str)

        try:
            from tradingagents.default_config import DEFAULT_CONFIG
            from tradingagents.graph.trading_graph import TradingAgentsGraph
        except Exception as exc:  # pragma: no cover - environment-dependent
            raise AgentRunnerConfigurationError(f"TradingAgents package is not importable: {exc}") from exc

        return TradingAgentsGraph, DEFAULT_CONFIG

    @staticmethod
    def _resolve_repo_path() -> Optional[Path]:
        raw_path = os.getenv("TRADINGAGENTS_REPO_PATH", "").strip()
        if not raw_path:
            return None

        candidate = Path(raw_path)
        if not candidate.is_absolute():
            project_root = Path(__file__).resolve().parents[3]
            candidate = (project_root / candidate).resolve()

        if not candidate.exists():
            raise AgentRunnerConfigurationError(f"TradingAgents repo path does not exist: {candidate}")
        return candidate

    def _execute_tradingagents_run(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
        graph_cls: Any,
        run_config: Dict[str, Any],
        ticker: str,
        trade_date: str,
        selected_analysts: List[str],
    ) -> None:
        retrieved_evidence: List[EvidenceItem] = []
        try:
            self._append_event(
                context,
                run_id,
                "agent.started",
                {
                    "content": "TradingAgents graph initialization started.",
                    "source": "tradingagents_adapter",
                    "ticker": ticker,
                    "tradeDate": trade_date,
                    "selectedAnalysts": selected_analysts,
                },
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )
            self._append_event(
                context,
                run_id,
                "tool.called",
                {
                    "toolName": "tradingagents.graph.run",
                    "args": {
                        "ticker": ticker,
                        "tradeDate": trade_date,
                        "selectedAnalysts": selected_analysts,
                        "llmProvider": run_config.get("llm_provider"),
                        "deepThinkModel": run_config.get("deep_think_llm"),
                        "quickThinkModel": run_config.get("quick_think_llm"),
                        "checkpointEnabled": run_config.get("checkpoint_enabled"),
                    },
                    "source": "tradingagents_adapter",
                },
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )

            self._validate_runtime_provider_config(run_config)
            self._patch_tradingagents_provider_endpoint(run_config)
            retrieved_evidence = self._retrieve_alphatrace_evidence(request, context, run_id)
            evidence_context = self._format_evidence_context(retrieved_evidence)
            if retrieved_evidence:
                self._append_event(
                    context,
                    run_id,
                    "reasoning.chunk",
                    {
                        "content": "AlphaTrace evidence context was prepared for TradingAgents data tool outputs. TradingAgents internal state remains hidden behind AlphaTrace runtime events.",
                        "source": "tradingagents_adapter",
                        "stepId": "evidence_retrieval",
                        "progress": 100,
                        "evidenceIds": [item.evidenceId for item in retrieved_evidence],
                    },
                    agent_name="Evidence Retriever",
                    team="evidence",
                )
            if self._should_use_offline_data(request):
                self._patch_tradingagents_data_tools(ticker, trade_date, evidence_context)
                self._append_event(
                    context,
                    run_id,
                    "reasoning.chunk",
                    {
                        "content": "TradingAgents PoC is using AlphaTrace static offline market context to avoid external data-source rate limits.",
                        "source": "tradingagents_adapter",
                        "dataMode": "offline_static",
                    },
                    agent_name="TradingAgentsAdapter",
                    team="runtime",
                )
            graph = graph_cls(selected_analysts=selected_analysts, debug=False, config=run_config)
            self._append_event(
                context,
                run_id,
                "reasoning.chunk",
                {
                    "content": "TradingAgents LangGraph streaming is starting. AlphaTrace maps graph chunks into runtime events; internal TradingAgents state is not exposed directly.",
                    "source": "tradingagents_adapter",
                    "stepId": "tradingagents_graph",
                    "progress": 15,
                },
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )
            final_state, raw_decision = self._run_tradingagents_graph_stream(
                graph=graph,
                context=context,
                run_id=run_id,
                ticker=ticker,
                trade_date=trade_date,
            )

            self._append_event(
                context,
                run_id,
                "tool.result",
                {
                    "toolName": "tradingagents.graph.run",
                    "status": "completed",
                    "summary": "TradingAgents graph completed and returned final state.",
                    "source": "tradingagents_adapter",
                    "stepId": "tradingagents_graph",
                    "progress": 100,
                },
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )

            reports = self._map_reports(run_id, final_state, raw_decision)
            evidence = self._build_output_evidence(retrieved_evidence, ticker, trade_date, selected_analysts, request)
            decision = self._map_decision(
                request,
                final_state,
                raw_decision,
                evidence_ids=[item.evidenceId for item in retrieved_evidence] + [TRADINGAGENTS_CONTEXT_EVIDENCE_ID],
            )

            if context.update_run_outputs:
                context.update_run_outputs(run_id, reports, evidence, decision, 1)

            for report in reports:
                self._append_event(
                    context,
                    run_id,
                    "report.generated",
                    {
                        "reportId": report.reportId,
                        "title": report.title,
                        "source": "tradingagents_adapter",
                    },
                    agent_name=report.agentName,
                    team="runtime",
                )

            self._append_event(
                context,
                run_id,
                "decision.updated",
                {
                    "action": decision.action,
                    "confidence": decision.confidence,
                    "evidenceIds": decision.evidenceIds,
                    "source": "tradingagents_adapter",
                },
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )
            self._append_event(
                context,
                run_id,
                "agent.completed",
                {"content": "TradingAgents PoC run completed.", "source": "tradingagents_adapter"},
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )
            self._append_event(
                context,
                run_id,
                "agent.run.completed",
                {"source": "tradingagents_adapter", "ticker": ticker, "tradeDate": trade_date},
            )
            if context.update_run_status:
                context.update_run_status(run_id, "completed", datetime.now().astimezone().isoformat(timespec="seconds"))
        except Exception as exc:
            self._mark_run_failed(context, run_id, request, ticker, trade_date, exc, retrieved_evidence)

    def _run_tradingagents_graph_stream(
        self,
        graph: Any,
        context: AgentRunnerContext,
        run_id: str,
        ticker: str,
        trade_date: str,
    ) -> Tuple[Any, Any]:
        """Run TradingAgents with LangGraph stream and map chunks to AlphaTrace events."""
        try:
            graph.ticker = ticker
            if hasattr(graph, "_resolve_pending_entries"):
                graph._resolve_pending_entries(ticker)

            past_context = None
            if getattr(graph, "memory_log", None) is not None and hasattr(graph.memory_log, "get_past_context"):
                past_context = graph.memory_log.get_past_context(ticker)

            init_agent_state = graph.propagator.create_initial_state(ticker, trade_date, past_context=past_context)
            args = graph.propagator.get_graph_args()
            trace: List[Any] = []
            processed_message_ids: set[str] = set()
            stream_lengths: Dict[str, int] = {"bull_researcher": 0, "bear_researcher": 0}

            self._emit_tradingagents_flow_event(context, run_id, "market_analyst", "Market Analyst", "running", 20)

            for chunk in graph.graph.stream(init_agent_state, **args):
                if not isinstance(chunk, dict):
                    continue
                trace.append(chunk)
                self._map_tradingagents_stream_chunk(context, run_id, chunk, processed_message_ids, stream_lengths)

            if not trace:
                self._append_event(
                    context,
                    run_id,
                    "reasoning.chunk",
                    {
                        "content": "TradingAgents stream returned no chunks; falling back to propagate().",
                        "source": "tradingagents_adapter",
                        "stepId": "tradingagents_graph",
                        "progress": 30,
                    },
                    agent_name="TradingAgentsAdapter",
                    team="runtime",
                )
                return graph.propagate(ticker, trade_date)

            final_state = trace[-1]
            graph.curr_state = final_state
            if hasattr(graph, "_log_state"):
                graph._log_state(trade_date, final_state)
            final_decision_text = self._state_get(final_state, "final_trade_decision")
            if getattr(graph, "memory_log", None) is not None and final_decision_text:
                graph.memory_log.store_decision(ticker=ticker, trade_date=trade_date, final_trade_decision=final_decision_text)

            raw_decision = graph.process_signal(final_decision_text)
            self._emit_tradingagents_completion_events(context, run_id)
            return final_state, raw_decision
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "reasoning.chunk",
                {
                    "content": f"TradingAgents LangGraph stream failed: {exc}. The adapter will not expose raw internal state.",
                    "source": "tradingagents_adapter",
                    "stepId": "tradingagents_graph",
                    "progress": 95,
                },
                agent_name="TradingAgentsAdapter",
                team="runtime",
            )
            raise

    def _map_tradingagents_stream_chunk(
        self,
        context: AgentRunnerContext,
        run_id: str,
        chunk: Dict[str, Any],
        processed_message_ids: set[str],
        stream_lengths: Dict[str, int],
    ) -> None:
        for message in chunk.get("messages", []) or []:
            message_id = getattr(message, "id", None)
            if message_id is not None:
                message_id_str = str(message_id)
                if message_id_str in processed_message_ids:
                    continue
                processed_message_ids.add(message_id_str)

            content = self._message_content(message)
            if content:
                self._append_event(
                    context,
                    run_id,
                    "reasoning.chunk",
                    {
                        "content": content[:4000],
                        "source": "tradingagents_langgraph",
                        "stepId": self._infer_tradingagents_step_from_chunk(chunk),
                        "progress": self._infer_tradingagents_progress(chunk),
                        "streaming": True,
                        "sectionHint": self._infer_tradingagents_section_hint(chunk),
                    },
                    agent_name=self._infer_tradingagents_agent_from_chunk(chunk),
                    team="runtime",
                )

            tool_calls = getattr(message, "tool_calls", None)
            if tool_calls:
                for tool_call in tool_calls:
                    name = tool_call.get("name") if isinstance(tool_call, dict) else getattr(tool_call, "name", "tradingagents.tool")
                    args = tool_call.get("args") if isinstance(tool_call, dict) else getattr(tool_call, "args", {})
                    self._append_event(
                        context,
                        run_id,
                        "tool.called",
                        {
                            "toolName": name or "tradingagents.tool",
                            "args": args if isinstance(args, dict) else {"value": str(args)},
                            "source": "tradingagents_langgraph",
                            "stepId": self._infer_tradingagents_step_from_chunk(chunk),
                        },
                        agent_name=self._infer_tradingagents_agent_from_chunk(chunk),
                        team="runtime",
                    )

        if self._state_get(chunk, "market_report"):
            self._emit_tradingagents_flow_event(context, run_id, "market_analyst", "Market Analyst", "completed", 100)
            self._emit_tradingagents_flow_event(context, run_id, "research_manager", "Research Manager", "running", 20)

        debate_state = self._state_get(chunk, "investment_debate_state")
        if isinstance(debate_state, dict):
            bull_history = str(debate_state.get("bull_history") or "").strip()
            bear_history = str(debate_state.get("bear_history") or "").strip()
            judge = str(debate_state.get("judge_decision") or "").strip()
            if bull_history:
                bull_delta = bull_history[stream_lengths.get("bull_researcher", 0) :]
                stream_lengths["bull_researcher"] = max(stream_lengths.get("bull_researcher", 0), len(bull_history))
            else:
                bull_delta = ""
            if bull_delta.strip():
                self._append_event(
                    context,
                    run_id,
                    "debate.message",
                    {
                        "content": bull_delta[-4000:],
                        "stance": "BULL",
                        "source": "tradingagents_langgraph",
                        "stepId": "bull_researcher",
                        "sectionHint": "bull_view",
                        "progress": 70,
                        "streaming": True,
                    },
                    agent_name="Bull Researcher",
                    team="research_team",
                )
            if bear_history:
                bear_delta = bear_history[stream_lengths.get("bear_researcher", 0) :]
                stream_lengths["bear_researcher"] = max(stream_lengths.get("bear_researcher", 0), len(bear_history))
            else:
                bear_delta = ""
            if bear_delta.strip():
                self._append_event(
                    context,
                    run_id,
                    "debate.message",
                    {
                        "content": bear_delta[-4000:],
                        "stance": "BEAR",
                        "source": "tradingagents_langgraph",
                        "stepId": "bear_researcher",
                        "sectionHint": "bear_view",
                        "progress": 70,
                        "streaming": True,
                    },
                    agent_name="Bear Researcher",
                    team="research_team",
                )
            if judge:
                self._emit_tradingagents_flow_event(context, run_id, "research_manager", "Research Manager", "completed", 100)
                self._emit_tradingagents_flow_event(context, run_id, "trader", "Trader", "running", 20)

        if self._state_get(chunk, "trader_investment_plan"):
            self._emit_tradingagents_flow_event(context, run_id, "trader", "Trader", "completed", 100)
            self._emit_tradingagents_flow_event(context, run_id, "risk_manager", "Risk Manager", "running", 20)

        risk_state = self._state_get(chunk, "risk_debate_state")
        if isinstance(risk_state, dict) and str(risk_state.get("judge_decision") or "").strip():
            self._emit_tradingagents_flow_event(context, run_id, "risk_manager", "Risk Manager", "completed", 100)
            self._emit_tradingagents_flow_event(context, run_id, "portfolio_manager", "Portfolio Manager", "running", 60)

        if self._state_get(chunk, "final_trade_decision"):
            self._emit_tradingagents_flow_event(context, run_id, "portfolio_manager", "Portfolio Manager", "completed", 100)

    def _emit_tradingagents_flow_event(
        self,
        context: AgentRunnerContext,
        run_id: str,
        step_id: str,
        agent_name: str,
        status: str,
        progress: int,
    ) -> None:
        self._append_event(
            context,
            run_id,
            "agent.completed" if status == "completed" else "agent.started",
            {
                "content": f"{agent_name} {status}.",
                "source": "tradingagents_langgraph",
                "stepId": step_id,
                "dependsOn": self._tradingagents_depends_on(step_id),
                "status": status,
                "progress": progress,
            },
            agent_name=agent_name,
            team=self._tradingagents_team(step_id),
        )

    def _emit_tradingagents_completion_events(self, context: AgentRunnerContext, run_id: str) -> None:
        for step_id, agent_name in [
            ("market_analyst", "Market Analyst"),
            ("research_manager", "Research Manager"),
            ("trader", "Trader"),
            ("risk_manager", "Risk Manager"),
            ("portfolio_manager", "Portfolio Manager"),
        ]:
            self._emit_tradingagents_flow_event(context, run_id, step_id, agent_name, "completed", 100)

    @staticmethod
    def _tradingagents_depends_on(step_id: str) -> List[str]:
        return {
            "market_analyst": [],
            "research_manager": ["market_analyst"],
            "trader": ["research_manager"],
            "risk_manager": ["trader"],
            "portfolio_manager": ["risk_manager"],
        }.get(step_id, [])

    @staticmethod
    def _tradingagents_team(step_id: str) -> str:
        return {
            "market_analyst": "analyst_team",
            "bull_researcher": "research_team",
            "bear_researcher": "research_team",
            "research_manager": "research_team",
            "trader": "strategy_team",
            "risk_manager": "risk_team",
            "portfolio_manager": "portfolio_team",
        }.get(step_id, "runtime")

    @staticmethod
    def _message_content(message: Any) -> str:
        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: List[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text") or item.get("content")
                    if text:
                        parts.append(str(text))
                elif item is not None:
                    parts.append(str(item))
            return "\n".join(parts).strip()
        return str(content).strip() if content is not None else ""

    @staticmethod
    def _infer_tradingagents_step_from_chunk(chunk: Dict[str, Any]) -> str:
        if TradingAgentsRunnerAdapter._has_content(chunk.get("final_trade_decision")):
            return "portfolio_manager"
        if TradingAgentsRunnerAdapter._has_content(chunk.get("risk_debate_state")):
            return "risk_manager"
        if TradingAgentsRunnerAdapter._has_content(chunk.get("trader_investment_plan")):
            return "trader"
        if TradingAgentsRunnerAdapter._has_content(chunk.get("investment_debate_state")):
            return "research_manager"
        if (
            TradingAgentsRunnerAdapter._has_content(chunk.get("market_report"))
            or TradingAgentsRunnerAdapter._has_content(chunk.get("sentiment_report"))
            or TradingAgentsRunnerAdapter._has_content(chunk.get("news_report"))
            or TradingAgentsRunnerAdapter._has_content(chunk.get("fundamentals_report"))
        ):
            return "market_analyst"
        return "tradingagents_graph"

    @staticmethod
    def _has_content(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, dict):
            return any(TradingAgentsRunnerAdapter._has_content(item) for item in value.values())
        if isinstance(value, list):
            return any(TradingAgentsRunnerAdapter._has_content(item) for item in value)
        return bool(value)

    @staticmethod
    def _infer_tradingagents_agent_from_chunk(chunk: Dict[str, Any]) -> str:
        return {
            "portfolio_manager": "Portfolio Manager",
            "risk_manager": "Risk Manager",
            "trader": "Trader",
            "research_manager": "Research Manager",
            "market_analyst": "Market Analyst",
        }.get(TradingAgentsRunnerAdapter._infer_tradingagents_step_from_chunk(chunk), "TradingAgentsAdapter")

    @staticmethod
    def _infer_tradingagents_section_hint(chunk: Dict[str, Any]) -> str:
        return {
            "portfolio_manager": "final_decision",
            "risk_manager": "risk_review",
            "trader": "final_decision",
            "research_manager": "bull_view",
            "market_analyst": "market_view",
        }.get(TradingAgentsRunnerAdapter._infer_tradingagents_step_from_chunk(chunk), "unknown")

    @staticmethod
    def _infer_tradingagents_progress(chunk: Dict[str, Any]) -> int:
        return {
            "tradingagents_graph": 25,
            "market_analyst": 35,
            "research_manager": 55,
            "trader": 70,
            "risk_manager": 85,
            "portfolio_manager": 95,
        }.get(TradingAgentsRunnerAdapter._infer_tradingagents_step_from_chunk(chunk), 25)

    def _create_running_run(
        self,
        request: SubmitAgentRunRequest,
        ticker: str,
        trade_date: str,
        selected_analysts: List[str],
        model_name: str,
    ) -> AgentRun:
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        run_id = f"run_tradingagents_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        decision = AgentDecision(
            action="watch",
            horizon=request.horizon,
            confidence=0.0,
            thesis="TradingAgents PoC run is still executing.",
            summary="Pending TradingAgents PoC output.",
            risks=["TradingAgents PoC is still running"],
            evidenceIds=[],
            observationIndicators=[],
        )
        agents = [
            AgentParticipant(
                agentId="agent-tradingagents-adapter",
                name="TradingAgentsAdapter",
                role="runner_adapter",
                team="runtime",
                status="running",
            )
        ]
        events = [
            AgentRuntimeEvent(
                eventId=f"evt_{run_id}_001",
                runId=run_id,
                type="agent.run.started",
                timestamp=now,
                sequence=1,
                payload={
                    "source": "tradingagents_adapter",
                    "ticker": ticker,
                    "tradeDate": trade_date,
                    "selectedAnalysts": selected_analysts,
                },
            ),
            AgentRuntimeEvent(
                eventId=f"evt_{run_id}_002",
                runId=run_id,
                type="reasoning.chunk",
                timestamp=now,
                sequence=2,
                agentName="TradingAgentsAdapter",
                team="runtime",
                payload={"content": "Preparing TradingAgents PoC runner.", "source": "tradingagents_adapter"},
            ),
        ]
        return AgentRun(
            runId=run_id,
            name="AlphaTrace TradingAgents PoC Run",
            target=ticker,
            taskType=request.taskType,
            riskLevel="medium",
            status="running",
            assetIds=[request.assetId] if request.assetId else [],
            portfolioId=request.portfolioId,
            strategyId=request.strategyId,
            triggeredBy="tradingagents_runner",
            modelName=model_name,
            startedAt=now,
            updatedAt=now,
            completedAt=None,
            agents=agents,
            toolCalls=[],
            reports=[],
            events=events,
            evidenceIds=[],
            finalDecision=decision,
            metrics=RuntimeMetrics(llmCalls=0, toolCalls=1, generatedReports=0, durationSeconds=0, estimatedCostUsd=None),
        )

    @staticmethod
    def _resolve_ticker(request: SubmitAgentRunRequest) -> Tuple[str, Optional[str]]:
        extra = request.runnerConfig.extraParams or {}
        explicit_ticker = str(extra.get("ticker") or "").strip()
        if explicit_ticker:
            return explicit_ticker, None

        if request.assetId:
            asset = get_static_asset_store().get_asset(request.assetId)
            if asset and asset.symbol:
                if TradingAgentsRunnerAdapter._is_tradingagents_compatible_ticker(asset.symbol):
                    return asset.symbol, None
                return (
                    TRADINGAGENTS_DEFAULT_TICKER,
                    (
                        f"Asset {request.assetId} maps to symbol {asset.symbol}, which is not a TradingAgents-compatible "
                        "US stock/ETF ticker in this PoC; fallback to SPY."
                    ),
                )

        return (
            TRADINGAGENTS_DEFAULT_TICKER,
            "No ticker mapping found; fallback to SPY for TradingAgents PoC.",
        )

    @staticmethod
    def _is_tradingagents_compatible_ticker(symbol: str) -> bool:
        normalized = (symbol or "").strip().upper()
        if not normalized:
            return False
        incompatible_suffixes = (".SH", ".SZ", ".OF", ".CFFEX", ".SHFE")
        if normalized.endswith(incompatible_suffixes):
            return False
        return bool(re.fullmatch(r"[A-Z][A-Z0-9.-]{0,9}", normalized))

    @staticmethod
    def _resolve_trade_date(request: SubmitAgentRunRequest) -> str:
        extra = request.runnerConfig.extraParams or {}
        return str(extra.get("tradeDate") or extra.get("trade_date") or date.today().isoformat())

    @staticmethod
    def _resolve_selected_analysts(request: SubmitAgentRunRequest) -> List[str]:
        extra = request.runnerConfig.extraParams or {}
        raw_value = extra.get("selectedAnalysts") or extra.get("selected_analysts") or ["market"]
        if isinstance(raw_value, str):
            analysts = [item.strip() for item in raw_value.split(",") if item.strip()]
        elif isinstance(raw_value, list):
            analysts = [str(item).strip() for item in raw_value if str(item).strip()]
        else:
            analysts = []
        return analysts or ["market"]

    @staticmethod
    def _build_tradingagents_config(request: SubmitAgentRunRequest, default_config: Dict[str, Any]) -> Dict[str, Any]:
        extra = request.runnerConfig.extraParams or {}
        config = dict(default_config)
        model_provider = request.runnerConfig.modelProvider or "qwen"
        if model_provider == "none":
            model_provider = "qwen"
        model_name = request.runnerConfig.modelName or os.getenv("QWEN_MODEL") or "qwen-plus"
        if model_name == "none":
            model_name = os.getenv("QWEN_MODEL") or "qwen-plus"

        config["llm_provider"] = model_provider
        config["quick_think_llm"] = model_name
        config["deep_think_llm"] = model_name
        config["backend_url"] = extra.get("baseUrl") or extra.get("baseURL") or os.getenv("QWEN_BASE_URL") or config.get("backend_url")
        config["max_debate_rounds"] = TradingAgentsRunnerAdapter._int_value(extra.get("maxDebateRounds") or extra.get("max_debate_rounds"), 1)
        config["max_risk_discuss_rounds"] = TradingAgentsRunnerAdapter._int_value(
            extra.get("maxRiskDiscussRounds") or extra.get("max_risk_discuss_rounds"),
            1,
        )
        config["checkpoint_enabled"] = False
        if extra.get("outputLanguage") or extra.get("output_language"):
            config["output_language"] = str(extra.get("outputLanguage") or extra.get("output_language"))
        return config

    @staticmethod
    def _hydrate_qwen_runtime_config(
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_config: Dict[str, Any],
    ) -> None:
        if str(run_config.get("llm_provider") or "").lower() != "qwen":
            return

        if not run_config.get("backend_url"):
            run_config["backend_url"] = os.getenv("QWEN_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1"

        if os.getenv("DASHSCOPE_API_KEY"):
            return

        if not context.get_llm_config:
            return

        try:
            config = context.get_llm_config()
        except Exception:
            return

        provider = str(config.get("provider") or "").lower()
        base_url = str(config.get("base_url") or "").rstrip("/")
        model = str(config.get("model") or "").strip()
        is_qwen_provider = provider == "qwen"
        is_custom_qwen_endpoint = provider == "custom" and (
            "dashscope.aliyuncs.com" in base_url.lower() or model.lower().startswith("qwen")
        )
        api_key = str(config.get("api_key") or "").strip()
        if not api_key or not (is_qwen_provider or is_custom_qwen_endpoint):
            return

        os.environ["DASHSCOPE_API_KEY"] = api_key
        if base_url:
            run_config["backend_url"] = base_url
        if model and (request.runnerConfig.modelName in {"", "none", None}):
            run_config["quick_think_llm"] = model
            run_config["deep_think_llm"] = model

    @staticmethod
    def _patch_tradingagents_provider_endpoint(run_config: Dict[str, Any]) -> None:
        """Point TradingAgents' qwen provider at the AlphaTrace-configured endpoint.

        TradingAgents stores provider defaults in an internal module-level map.
        The PoC patches that map at runtime instead of modifying TradingAgents
        source, so China DashScope keys can use QWEN_BASE_URL.
        """
        if str(run_config.get("llm_provider") or "").lower() != "qwen":
            return

    @staticmethod
    def _validate_runtime_provider_config(run_config: Dict[str, Any]) -> None:
        provider = str(run_config.get("llm_provider") or "").lower()
        if provider == "qwen" and not os.getenv("DASHSCOPE_API_KEY"):
            raise AgentRunnerConfigurationError(
                "TradingAgents qwen provider requires DASHSCOPE_API_KEY or a server-side Hyper AI Qwen configuration."
            )
        base_url = str(run_config.get("backend_url") or "").strip()
        if not base_url:
            return

        try:
            from tradingagents.llm_clients import openai_client

            provider_config = getattr(openai_client, "_PROVIDER_CONFIG", None)
            if isinstance(provider_config, dict):
                provider_config["qwen"] = (base_url, "DASHSCOPE_API_KEY")
        except Exception:
            # Best-effort only; graph execution will persist any real provider
            # error into the AlphaTrace failed run.
            return

    @staticmethod
    def _should_use_offline_data(request: SubmitAgentRunRequest) -> bool:
        extra = request.runnerConfig.extraParams or {}
        value = extra.get("offlineData", extra.get("offline_data", extra.get("useOfflineData", True)))
        if isinstance(value, str):
            return value.strip().lower() not in {"false", "0", "no", "off"}
        return bool(value)

    def _retrieve_alphatrace_evidence(
        self,
        request: SubmitAgentRunRequest,
        context: AgentRunnerContext,
        run_id: str,
    ) -> List[EvidenceItem]:
        extra = request.runnerConfig.extraParams or {}
        limit = self._int_value(extra.get("evidenceLimit") or extra.get("evidence_limit"), 5)
        include_external = self._bool_value(extra.get("includeExternalEvidence", extra.get("include_external_evidence", True)), True)

        self._append_event(
            context,
            run_id,
            "tool.called",
            {
                "toolName": "evidence.retrieve",
                "args": {
                    "assetId": request.assetId,
                    "taskType": request.taskType,
                    "limit": limit,
                    "includeExternal": include_external,
                },
                "source": "alphatrace_evidence_retriever",
                "stepId": "evidence_retrieval",
                "progress": 20,
            },
            agent_name="Evidence Retriever",
            team="evidence",
        )

        try:
            if include_external:
                self._append_event(
                    context,
                    run_id,
                    "tool.called",
                    {
                        "toolName": "bocha.search",
                        "args": {
                            "query": ExternalEvidenceSearch._build_query(request.assetId, request.question, request.taskType),
                            "limit": limit,
                        },
                        "source": "bocha_search",
                        "stepId": "evidence_retrieval",
                        "progress": 40,
                    },
                    agent_name="Evidence Retriever",
                    team="evidence",
                )
            retriever = EvidenceRetriever()
            items = retriever.retrieve(
                asset_id=request.assetId,
                question=request.question,
                task_type=request.taskType,
                limit=limit,
                include_external=include_external,
            )
        except Exception as exc:
            self._append_event(
                context,
                run_id,
                "tool.result",
                {
                    "toolName": "evidence.retrieve",
                    "status": "failed_non_fatal",
                    "message": str(exc) or exc.__class__.__name__,
                    "source": "alphatrace_evidence_retriever",
                    "stepId": "evidence_retrieval",
                    "progress": 100,
                },
                agent_name="Evidence Retriever",
                team="evidence",
            )
            return []

        external_result = getattr(retriever, "last_external_search", None)
        if external_result is not None:
            self._append_event(
                context,
                run_id,
                "tool.result",
                {
                    "toolName": "bocha.search",
                    "status": external_result.status,
                    "query": external_result.query,
                    "message": external_result.message,
                    "evidenceIds": [item.evidenceId for item in external_result.items],
                    "source": external_result.source,
                    "stepId": "evidence_retrieval",
                    "progress": 70,
                },
                agent_name="Evidence Retriever",
                team="evidence",
            )

        self._append_event(
            context,
            run_id,
            "tool.result",
            {
                "toolName": "evidence.retrieve",
                "status": "completed",
                "count": len(items),
                "evidenceIds": [item.evidenceId for item in items],
                "sourceTypes": [item.sourceType for item in items],
                "source": "alphatrace_evidence_retriever",
                "stepId": "evidence_retrieval",
                "progress": 90,
            },
            agent_name="Evidence Retriever",
            team="evidence",
        )
        if items:
            self._append_event(
                context,
                run_id,
                "evidence.linked",
                {
                    "evidenceIds": [item.evidenceId for item in items],
                    "sourceTypes": [item.sourceType for item in items],
                    "summary": f"Linked {len(items)} AlphaTrace evidence item(s) into TradingAgents PoC context.",
                    "source": "alphatrace_evidence_retriever",
                    "stepId": "evidence_retrieval",
                    "progress": 100,
                },
                agent_name="Evidence Retriever",
                team="evidence",
            )
        return items

    @staticmethod
    def _format_evidence_context(items: List[EvidenceItem]) -> str:
        if not items:
            return (
                "\n\nAlphaTrace evidence context: no retrieved evidence was available. "
                "If analysis refers to evidence, mark it as a low-confidence runtime assumption."
            )

        lines = [
            "",
            "",
            "AlphaTrace evidence context for this PoC. Cite evidenceId when using a source and do not invent evidence:",
        ]
        for item in items:
            url_part = f"; url={item.url}" if item.url else ""
            lines.append(
                f"- evidenceId={item.evidenceId}; title={item.title}; source={item.sourceName}; "
                f"type={item.evidenceType}; publishedAt={item.publishedAt}; "
                f"quality={item.qualityScore}; reliability={item.reliabilityScore}; "
                f"summary={item.summary}{url_part}"
            )
        return "\n".join(lines)

    @staticmethod
    def _bool_value(value: Any, default: bool) -> bool:
        if value is None:
            return default
        if isinstance(value, str):
            return value.strip().lower() not in {"false", "0", "no", "off"}
        return bool(value)

    @staticmethod
    def _patch_tradingagents_data_tools(ticker: str, trade_date: str, evidence_context: str = "") -> None:
        """Replace TradingAgents vendor data calls with deterministic PoC data.

        This keeps the LangGraph/agent flow runnable when public data providers
        rate-limit requests. It is intentionally runtime-only and does not
        modify TradingAgents source files.
        """
        try:
            from tradingagents.dataflows import interface
        except Exception:
            return

        def stock_data(symbol: str, start_date: str, end_date: str) -> str:
            return (
                f"AlphaTrace offline SPY PoC OHLCV sample for {symbol or ticker} from {start_date} to {end_date}.\n"
                "| date | open | high | low | close | volume |\n"
                "|---|---:|---:|---:|---:|---:|\n"
                "| 2025-05-30 | 525.10 | 529.40 | 522.80 | 528.30 | 62,100,000 |\n"
                "| 2025-06-02 | 528.60 | 531.20 | 526.90 | 530.75 | 58,400,000 |\n"
                "| 2025-06-03 | 530.20 | 533.10 | 529.10 | 532.40 | 55,900,000 |\n"
                "| 2025-06-04 | 532.00 | 534.20 | 530.80 | 533.10 | 57,300,000 |\n"
                f"| {trade_date} | 533.40 | 535.00 | 531.60 | 534.20 | 60,200,000 |\n"
                "Offline interpretation: SPY shows a mild upward bias with stable liquidity and moderate intraday range."
            )

        def indicators(symbol: str, indicator: str, curr_date: str, look_back_days: int = 30) -> str:
            ind = (indicator or "trend").lower()
            values = {
                "rsi": "RSI(14)=57.8, neutral-to-positive momentum without overbought pressure.",
                "macd": "MACD histogram is modestly positive, suggesting trend continuation but limited acceleration.",
                "close_50_sma": "Close remains above the 50-day SMA, supporting an intermediate uptrend.",
                "close_200_sma": "Close remains above the 200-day SMA, confirming constructive long-term trend.",
                "atr": "ATR is near its 20-day median, indicating no volatility shock in this offline sample.",
            }
            return (
                f"AlphaTrace offline technical indicator sample for {symbol or ticker} on {curr_date}; "
                f"indicator={ind}; lookBackDays={look_back_days}.\n"
                f"{values.get(ind, 'Indicator is broadly consistent with a stable, slightly constructive market profile.')}"
            )

        def fundamentals(symbol: str, curr_date: str) -> str:
            return (
                f"AlphaTrace offline fundamentals context for ETF ticker {symbol or ticker} on {curr_date}.\n"
                "- Instrument: broad US equity ETF proxy.\n"
                "- Revenue/earnings are not directly applicable to ETF shares.\n"
                "- Key drivers: index earnings breadth, valuation, liquidity, macro rates, and sector concentration.\n"
                "- Current PoC assumption: diversified exposure with high liquidity and moderate concentration risk."
                f"{evidence_context}"
            )

        def balance_sheet(symbol: str, freq: str = "quarterly", curr_date: Optional[str] = None) -> str:
            return (
                f"AlphaTrace offline balance-sheet proxy for ETF {symbol or ticker}; freq={freq}; date={curr_date or trade_date}.\n"
                "ETF-level balance-sheet statements are not applicable; use holdings quality, liquidity, and issuer operations as proxies."
            )

        def cashflow(symbol: str, freq: str = "quarterly", curr_date: Optional[str] = None) -> str:
            return (
                f"AlphaTrace offline cashflow proxy for ETF {symbol or ticker}; freq={freq}; date={curr_date or trade_date}.\n"
                "ETF cashflow is represented by creations/redemptions and dividend distributions; no stress signal in this PoC sample."
            )

        def income_statement(symbol: str, freq: str = "quarterly", curr_date: Optional[str] = None) -> str:
            return (
                f"AlphaTrace offline income-statement proxy for ETF {symbol or ticker}; freq={freq}; date={curr_date or trade_date}.\n"
                "ETF-level income statement is not applicable; underlying index earnings revisions are the relevant proxy."
            )

        def news(symbol: str, start_date: str, end_date: str) -> str:
            return (
                f"AlphaTrace offline news context for {symbol or ticker} from {start_date} to {end_date}.\n"
                "- Broad ETF flows remain resilient.\n"
                "- Market commentary highlights rate-cut timing, earnings revisions, and liquidity as the primary watch items.\n"
                "- No single news event dominates the PoC risk profile."
                f"{evidence_context}"
            )

        def global_news(curr_date: str, look_back_days: int = 7, limit: int = 5) -> str:
            return (
                f"AlphaTrace offline global macro context ending {curr_date}; lookBackDays={look_back_days}; limit={limit}.\n"
                "- Macro tone is mixed but not stressed.\n"
                "- Inflation and central-bank guidance remain the key risk factors.\n"
                "- Equity risk appetite is constructive but sensitive to rates and earnings breadth."
                f"{evidence_context}"
            )

        def insider_transactions(symbol: str) -> str:
            return (
                f"AlphaTrace offline insider transaction context for {symbol or ticker}.\n"
                "Not applicable for broad ETF PoC; no issuer-level insider signal is used."
            )

        interface.VENDOR_METHODS["get_stock_data"] = {"alphatrace_static": stock_data}
        interface.VENDOR_METHODS["get_indicators"] = {"alphatrace_static": indicators}
        interface.VENDOR_METHODS["get_fundamentals"] = {"alphatrace_static": fundamentals}
        interface.VENDOR_METHODS["get_balance_sheet"] = {"alphatrace_static": balance_sheet}
        interface.VENDOR_METHODS["get_cashflow"] = {"alphatrace_static": cashflow}
        interface.VENDOR_METHODS["get_income_statement"] = {"alphatrace_static": income_statement}
        interface.VENDOR_METHODS["get_news"] = {"alphatrace_static": news}
        interface.VENDOR_METHODS["get_global_news"] = {"alphatrace_static": global_news}
        interface.VENDOR_METHODS["get_insider_transactions"] = {"alphatrace_static": insider_transactions}

    @staticmethod
    def _int_value(value: Any, default: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return max(1, parsed)

    def _map_reports(self, run_id: str, final_state: Any, raw_decision: Any) -> List[AgentReport]:
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        report_specs = [
            ("market_report", "Market Analyst", "TradingAgents Market Report"),
            ("sentiment_report", "Sentiment Analyst", "TradingAgents Sentiment Report"),
            ("news_report", "News Analyst", "TradingAgents News Report"),
            ("fundamentals_report", "Fundamentals Analyst", "TradingAgents Fundamentals Report"),
            ("investment_plan", "Research Manager", "TradingAgents Investment Plan"),
            ("trader_investment_plan", "Trader", "TradingAgents Trader Plan"),
            ("risk_debate_state", "Risk Manager", "TradingAgents Risk Review"),
            ("final_trade_decision", "Portfolio Manager", "TradingAgents Final Decision"),
        ]
        reports: List[AgentReport] = []
        for key, agent_name, title in report_specs:
            value = self._state_get(final_state, key)
            if not value:
                continue
            reports.append(
                AgentReport(
                    reportId=f"report_{run_id}_{key}",
                    runId=run_id,
                    agentName=agent_name,
                    title=title,
                    summary=self._stringify(value),
                    createdAt=now,
                )
            )

        if not reports:
            reports.append(
                AgentReport(
                    reportId=f"report_{run_id}_summary",
                    runId=run_id,
                    agentName="TradingAgentsAdapter",
                    title="TradingAgents PoC Report",
                    summary=self._stringify(raw_decision) or "TradingAgents completed without a detailed report payload.",
                    createdAt=now,
                )
            )
        return reports

    def _map_decision(
        self,
        request: SubmitAgentRunRequest,
        final_state: Any,
        raw_decision: Any,
        evidence_ids: Optional[List[str]] = None,
    ) -> AgentDecision:
        final_text = self._stringify(raw_decision or self._state_get(final_state, "final_trade_decision"))
        if not final_text:
            final_text = "TradingAgents returned no explicit final decision payload."
        risks_text = self._stringify(self._state_get(final_state, "risk_debate_state"))
        resolved_evidence_ids = evidence_ids or [TRADINGAGENTS_CONTEXT_EVIDENCE_ID]
        return AgentDecision(
            action=self._infer_action(final_text),
            horizon=request.horizon,
            confidence=0.6,
            thesis=final_text,
            summary="TradingAgents PoC decision mapped into AlphaTrace schema.",
            risks=self._split_risks(risks_text),
            evidenceIds=resolved_evidence_ids,
            triggerConditions=["TradingAgents PoC environment remains configured"],
            invalidationConditions=["TradingAgents PoC dependencies unavailable", "Underlying TradingAgents run fails"],
            observationIndicators=["TradingAgents final decision", "risk debate summary", "model/tool availability"],
        )

    def _build_output_evidence(
        self,
        retrieved_evidence: List[EvidenceItem],
        ticker: str,
        trade_date: str,
        selected_analysts: List[str],
        request: SubmitAgentRunRequest,
    ) -> List[EvidenceReference]:
        evidence_refs = [to_evidence_reference(item) for item in retrieved_evidence]
        evidence_refs.append(self._build_context_evidence(ticker, trade_date, selected_analysts, request))
        return evidence_refs

    @staticmethod
    def _build_context_evidence(
        ticker: str,
        trade_date: str,
        selected_analysts: List[str],
        request: SubmitAgentRunRequest,
    ) -> EvidenceReference:
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        return EvidenceReference(
            evidenceId=TRADINGAGENTS_CONTEXT_EVIDENCE_ID,
            title="TradingAgents PoC Runtime Context",
            evidenceType="runtime_context",
            sourceName="TradingAgents PoC",
            qualityScore=50,
            reliabilityScore=50,
            summary=(
                "PoC context evidence only. "
                f"ticker={ticker}; tradeDate={trade_date}; selectedAnalysts={','.join(selected_analysts)}; "
                f"question={request.question}"
            ),
            collectedAt=now,
            relatedAssetIds=[request.assetId] if request.assetId else [],
            extractedFields={
                "ticker": ticker,
                "tradeDate": trade_date,
                "selectedAnalysts": selected_analysts,
                "runnerType": "tradingagents",
            },
        )

    def _mark_run_failed(
        self,
        context: AgentRunnerContext,
        run_id: str,
        request: SubmitAgentRunRequest,
        ticker: str,
        trade_date: str,
        exc: Exception,
        retrieved_evidence: Optional[List[EvidenceItem]] = None,
    ) -> None:
        message = str(exc) or exc.__class__.__name__
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        current_run = context.get_run(run_id) if context.get_run else None
        if current_run and current_run.status == "cancelled":
            self._append_event(
                context,
                run_id,
                "tool.result",
                {
                    "toolName": "tradingagents.subprocess_worker",
                    "status": "cancelled",
                    "source": "alphatrace_orchestrator",
                    "summary": "Worker failure was ignored because the AgentRun was already cancelled.",
                    "error": message,
                },
                agent_name="AlphaTrace Orchestrator",
                team="runtime",
            )
            return
        self._append_event(
            context,
            run_id,
            "agent.failed",
            {
                "error": message,
                "summary": "TradingAgents PoC execution failed. The failed run is persisted for replay.",
                "source": "tradingagents_adapter",
            },
            agent_name="TradingAgentsAdapter",
            team="runtime",
        )
        self._append_event(
            context,
            run_id,
            "agent.run.failed",
            {"error": message, "source": "tradingagents_adapter", "ticker": ticker, "tradeDate": trade_date},
        )
        failure_report = AgentReport(
            reportId=f"report_{run_id}_failure",
            runId=run_id,
            agentName="TradingAgentsAdapter",
            title="TradingAgents PoC Failure Report",
            summary=(
                "TradingAgents did not complete successfully.\n\n"
                f"Failure reason: {message}\n\n"
                "No TradingAgents internal state is exposed directly to the frontend."
            ),
            createdAt=now,
        )
        evidence = self._build_output_evidence(
            retrieved_evidence or [],
            ticker,
            trade_date,
            self._resolve_selected_analysts(request),
            request,
        )
        evidence_ids = [item.evidenceId for item in evidence]
        decision = AgentDecision(
            action="watch",
            horizon=request.horizon,
            confidence=0.5,
            thesis=f"TradingAgents PoC failed before producing a reliable decision. Failure reason: {message}",
            summary="Failure fallback decision. Do not treat this as an investment conclusion.",
            risks=["TradingAgents PoC failed before completion", message],
            evidenceIds=evidence_ids,
            observationIndicators=["TradingAgents availability", "dependency status", "runner logs"],
        )
        if context.update_run_outputs:
            context.update_run_outputs(run_id, [failure_report], evidence, decision, 0)
        if context.update_run_status:
            context.update_run_status(run_id, "failed", now)

    def _append_event(
        self,
        context: AgentRunnerContext,
        run_id: str,
        event_type: str,
        payload: Dict[str, Any],
        agent_name: Optional[str] = None,
        team: Optional[str] = None,
    ) -> None:
        if payload.get("toolName") and "toolContract" not in payload:
            tool_contract = get_agent_tool_contract(str(payload.get("toolName") or ""))
            if tool_contract:
                payload = {**payload, "toolContract": tool_contract.to_payload()}
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
            if context.append_event:
                context.append_event(run_id, event)

    @staticmethod
    def _get_existing_events(context: AgentRunnerContext, run_id: str) -> List[AgentRuntimeEvent]:
        if context.get_run:
            run = context.get_run(run_id)
            if run:
                return list(run.events)
        return []

    @staticmethod
    def _state_get(state: Any, key: str) -> Any:
        if isinstance(state, dict):
            return state.get(key)
        return getattr(state, key, None)

    @staticmethod
    def _stringify(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        try:
            return json.dumps(value, ensure_ascii=False, indent=2, default=str)
        except TypeError:
            return str(value)

    @staticmethod
    def _infer_action(text: str) -> str:
        lowered = (text or "").lower()
        if any(token in lowered for token in ["buy", "long", "bullish", "overweight"]):
            return "overweight"
        if any(token in lowered for token in ["sell", "short", "bearish", "underweight"]):
            return "underweight"
        if "hold" in lowered:
            return "hold"
        return "watch"

    @staticmethod
    def _split_risks(text: str) -> List[str]:
        if not text:
            return ["TradingAgents risk output was not available in the PoC result."]
        parts = [item.strip(" -*\t\r\n") for item in text.replace("；", ";").replace("。", ";").split(";")]
        risks = [item for item in parts if item][:5]
        return risks or [text[:500]]


# Backward-compatible alias for existing service registration imports.
TradingAgentsAdapter = TradingAgentsRunnerAdapter


class TradingAgentsEventMapper:
    """Placeholder for future detailed TradingAgents progress/message mapping."""

    def map_progress(self, progress: object) -> list[object]:
        raise NotImplementedError("Detailed TradingAgents event mapping is not implemented in this PoC.")


class TradingAgentsReportMapper:
    """Placeholder for future TradingAgents report mapping improvements."""

    def map_reports(self, reports: object) -> list[object]:
        raise NotImplementedError("Detailed TradingAgents report mapping is not implemented in this PoC.")


class TradingAgentsDecisionMapper:
    """Placeholder for future TradingAgents decision mapping improvements."""

    def map_decision(self, decision: object) -> object:
        raise NotImplementedError("Detailed TradingAgents decision mapping is not implemented in this PoC.")
