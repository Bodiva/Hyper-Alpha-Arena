from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4

from schemas.alpha_trace_agent_runtime import AgentDecision, AgentReport, AgentRun, EvidenceReference, SubmitAgentRunRequest
from schemas.research_workspace_taxonomy import resolve_research_artifact_type


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _safe_id(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip())
    return normalized.strip("_") or uuid4().hex[:12]


class ResearchWorkspaceStore:
    """Small JSON-backed workspace kernel for research assistant migration.

    It stores durable research memory independently from AgentRun runtime state.
    The first version is intentionally compact so it can later move to database
    tables without changing submit/runner contracts.
    """

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or (_project_root() / "backend" / "runtime_data" / "alpha_trace_research_workspaces.json")
        self._lock = Lock()

    def _default_state(self) -> Dict[str, Any]:
        now = _utc_now()
        workspace_id = "workspace_asset_etf_510300"
        thread_id = "thread_asset_etf_510300_default"
        return {
            "workspaces": [
                {
                    "workspaceId": workspace_id,
                    "name": "沪深300ETF 投研工作区",
                    "description": "围绕沪深300ETF中期配置判断沉淀研究记忆、证据和任务链路。",
                    "type": "asset",
                    "primaryAssetId": "asset_etf_510300",
                    "portfolioId": None,
                    "strategyId": "research_assistant_lab",
                    "status": "active",
                    "pinnedRunId": None,
                    "memory": {
                        "researchObjective": "判断沪深300ETF是否适合中期配置，并跟踪估值、资金、政策和盈利修复信号。",
                        "currentThesis": "等待真实投研任务沉淀首轮结论。",
                        "confirmedFacts": [],
                        "openQuestions": ["盈利修复是否有财报验证", "资金流入能否持续", "政策和PMI信号是否改善"],
                        "riskConstraints": ["证据不足时只输出观察结论，不作为配置依据。"],
                        "lastDecision": None,
                        "updatedAt": now,
                    },
                    "createdAt": now,
                    "updatedAt": now,
                }
            ],
            "threads": [
                {
                    "threadId": thread_id,
                    "workspaceId": workspace_id,
                    "title": "默认投研线程",
                    "status": "active",
                    "linkedRunIds": [],
                    "createdAt": now,
                    "updatedAt": now,
                }
            ],
            "timeline": [
                {
                    "eventId": f"event_{uuid4().hex[:12]}",
                    "workspaceId": workspace_id,
                    "threadId": thread_id,
                    "runId": None,
                    "type": "workspace.created",
                    "title": "工作区已创建",
                    "summary": "用于沉淀沪深300ETF投研任务的长期记忆。",
                    "payload": {},
                    "createdAt": now,
                }
            ],
            "artifacts": [],
        }

    def _read_unlocked(self) -> Dict[str, Any]:
        if not self.path.exists():
            return self._default_state()
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return self._default_state()
        default = self._default_state()
        for key, value in default.items():
            data.setdefault(key, value)
        return data

    def _write_unlocked(self, data: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(self.path)

    def snapshot(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        data = self.read()
        workspace = self._find_workspace(data, workspace_id)
        if not workspace:
            return None
        return {
            "workspace": deepcopy(workspace),
            "threads": [deepcopy(item) for item in data.get("threads", []) if item.get("workspaceId") == workspace_id],
            "timeline": [
                deepcopy(item)
                for item in sorted(data.get("timeline", []), key=lambda item: str(item.get("createdAt") or ""), reverse=True)
                if item.get("workspaceId") == workspace_id
            ][:30],
            "artifacts": [
                deepcopy(item)
                for item in sorted(data.get("artifacts", []), key=lambda item: str(item.get("createdAt") or ""), reverse=True)
                if item.get("workspaceId") == workspace_id
            ][:30],
        }

    def read(self) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            self._write_unlocked(data)
            return deepcopy(data)

    def list_workspaces(self, status: Optional[str] = "active") -> List[Dict[str, Any]]:
        data = self.read()
        workspaces = data.get("workspaces", [])
        if status:
            workspaces = [item for item in workspaces if item.get("status") == status]
        return sorted(deepcopy(workspaces), key=lambda item: str(item.get("updatedAt") or ""), reverse=True)

    def ensure_workspace(
        self,
        *,
        asset_id: Optional[str] = None,
        portfolio_id: Optional[str] = None,
        strategy_id: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            workspace = self._find_matching_workspace(data, asset_id=asset_id, portfolio_id=portfolio_id, strategy_id=strategy_id)
            if workspace:
                changed = False
                if name and workspace.get("name") != name:
                    workspace["name"] = name
                    changed = True
                if description and workspace.get("description") != description:
                    workspace["description"] = description
                    changed = True
                if changed:
                    workspace["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                return deepcopy(workspace)

            now = _utc_now()
            anchor = asset_id or portfolio_id or strategy_id or f"ad_hoc_{uuid4().hex[:8]}"
            workspace_id = f"workspace_{_safe_id(anchor)}"
            workspace = {
                "workspaceId": workspace_id,
                "name": name or self._default_workspace_name(asset_id, portfolio_id, strategy_id),
                "description": description or "投研助手自动创建的研究工作区。",
                "type": "portfolio" if portfolio_id else ("strategy" if strategy_id and not asset_id else "asset"),
                "primaryAssetId": asset_id,
                "portfolioId": portfolio_id,
                "strategyId": strategy_id,
                "status": "active",
                "pinnedRunId": None,
                "memory": {
                    "researchObjective": self._default_research_objective(asset_id, portfolio_id, strategy_id),
                    "currentThesis": "等待真实投研任务沉淀首轮结论。",
                    "confirmedFacts": [],
                    "openQuestions": ["核心假设尚未验证", "关键风险尚未量化"],
                    "riskConstraints": ["证据不足时只输出观察结论，不作为配置依据。"],
                    "lastDecision": None,
                    "updatedAt": now,
                },
                "createdAt": now,
                "updatedAt": now,
            }
            data.setdefault("workspaces", []).append(workspace)
            thread = self._create_thread_unlocked(data, workspace_id, title="默认投研线程")
            data.setdefault("timeline", []).append(
                self._event(
                    workspace_id=workspace_id,
                    thread_id=thread["threadId"],
                    event_type="workspace.created",
                    title="工作区已创建",
                    summary=workspace["description"],
                )
            )
            self._write_unlocked(data)
            return deepcopy(workspace)

    def get_or_create_thread(self, workspace_id: str, thread_id: Optional[str] = None, title: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            if not self._find_workspace(data, workspace_id):
                raise KeyError(f"Research workspace not found: {workspace_id}")
            for thread in data.setdefault("threads", []):
                if thread.get("workspaceId") != workspace_id:
                    continue
                if thread_id and thread.get("threadId") != thread_id:
                    continue
                if title and thread.get("title") != title:
                    thread["title"] = title
                    thread["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                return deepcopy(thread)
            thread = self._create_thread_unlocked(data, workspace_id, thread_id=thread_id, title=title or "投研线程")
            data.setdefault("timeline", []).append(
                self._event(
                    workspace_id=workspace_id,
                    thread_id=thread["threadId"],
                    event_type="thread.created",
                    title="线程已创建",
                    summary=thread["title"],
                )
            )
            self._write_unlocked(data)
            return deepcopy(thread)

    def build_context(self, workspace_id: str, thread_id: Optional[str] = None, asset_id: Optional[str] = None) -> Dict[str, Any]:
        data = self.read()
        workspace = self._find_workspace(data, workspace_id)
        if not workspace:
            raise KeyError(f"Research workspace not found: {workspace_id}")
        threads = [item for item in data.get("threads", []) if item.get("workspaceId") == workspace_id]
        thread = next((item for item in threads if item.get("threadId") == thread_id), None) or (threads[0] if threads else None)
        timeline = [
            item
            for item in sorted(data.get("timeline", []), key=lambda item: str(item.get("createdAt") or ""), reverse=True)
            if item.get("workspaceId") == workspace_id
        ][:8]
        artifacts = [
            item
            for item in sorted(data.get("artifacts", []), key=lambda item: str(item.get("createdAt") or ""), reverse=True)
            if item.get("workspaceId") == workspace_id
        ][:8]
        return {
            "workspaceId": workspace_id,
            "threadId": thread.get("threadId") if thread else thread_id,
            "currentTime": _utc_now(),
            "assetId": asset_id or workspace.get("primaryAssetId"),
            "workspaceName": workspace.get("name"),
            "memory": deepcopy(workspace.get("memory") or {}),
            "recentTimeline": [
                {
                    "type": item.get("type"),
                    "title": item.get("title"),
                    "summary": item.get("summary"),
                    "runId": item.get("runId"),
                    "createdAt": item.get("createdAt"),
                }
                for item in timeline
            ],
            "recentArtifacts": [
                {
                    "artifactType": item.get("artifactType"),
                    "title": item.get("title"),
                    "summary": item.get("summary"),
                    "runId": item.get("runId"),
                    "createdAt": item.get("createdAt"),
                }
                for item in artifacts
            ],
            "contextRules": [
                "延续 workspace memory 中的 currentThesis，但必须基于本轮证据修正或推翻。",
                "明确说明哪些事实是本轮新增，哪些问题仍未解决。",
                "若结论与 lastDecision 不一致，说明触发变化的证据。",
            ],
        }

    def record_run_submitted(self, workspace_id: str, thread_id: Optional[str], run_id: str, request: SubmitAgentRunRequest) -> None:
        with self._lock:
            data = self._read_unlocked()
            workspace = self._find_workspace(data, workspace_id)
            if not workspace:
                return
            thread = self._ensure_thread_unlocked(data, workspace_id, thread_id)
            linked = thread.setdefault("linkedRunIds", [])
            if run_id not in linked:
                linked.append(run_id)
            now = _utc_now()
            thread["updatedAt"] = now
            workspace["pinnedRunId"] = run_id
            workspace["updatedAt"] = now
            data.setdefault("timeline", []).append(
                self._event(
                    workspace_id=workspace_id,
                    thread_id=thread.get("threadId"),
                    run_id=run_id,
                    event_type="run.submitted",
                    title="投研任务已提交",
                    summary=request.question or request.taskType or run_id,
                    payload={
                        "assetId": request.assetId,
                        "taskType": request.taskType,
                        "researchRunType": request.researchRunType,
                        "horizon": request.horizon,
                    },
                )
            )
            self._write_unlocked(data)

    def record_run_outputs(
        self,
        workspace_id: str,
        thread_id: Optional[str],
        run: Optional[AgentRun],
        reports: List[AgentReport],
        evidence: List[EvidenceReference],
        decision: AgentDecision,
    ) -> None:
        with self._lock:
            data = self._read_unlocked()
            workspace = self._find_workspace(data, workspace_id)
            if not workspace:
                return
            thread = self._ensure_thread_unlocked(data, workspace_id, thread_id)
            now = _utc_now()
            run_id = run.runId if run else (decision.decisionId if hasattr(decision, "decisionId") else "")
            decision_payload = decision.model_dump() if hasattr(decision, "model_dump") else dict(decision)
            memory = workspace.setdefault("memory", {})
            if run and run.target and not memory.get("researchObjective"):
                memory["researchObjective"] = run.target
            memory["currentThesis"] = self._compact_text(decision_payload.get("thesis") or decision_payload.get("summary") or "", limit=360)
            memory["confirmedFacts"] = self._merge_unique(
                memory.get("confirmedFacts"),
                [self._compact_text(item.summary or item.title or "", limit=180) for item in evidence[:6]],
                limit=8,
            )
            memory["openQuestions"] = self._merge_unique(
                decision_payload.get("observationIndicators") or memory.get("openQuestions"),
                self._extract_report_questions(reports),
                limit=8,
            )
            memory["riskConstraints"] = self._merge_unique(
                decision_payload.get("invalidationConditions") or decision_payload.get("risks") or memory.get("riskConstraints"),
                decision_payload.get("risks") or [],
                limit=8,
            )
            memory["lastDecision"] = {
                "runId": run_id,
                "action": decision_payload.get("action"),
                "horizon": decision_payload.get("horizon"),
                "confidence": decision_payload.get("confidence"),
                "summary": self._compact_text(decision_payload.get("summary") or decision_payload.get("thesis") or "", limit=260),
                "updatedAt": now,
            }
            memory["updatedAt"] = now
            workspace["pinnedRunId"] = run_id or workspace.get("pinnedRunId")
            workspace["updatedAt"] = now
            self._upsert_run_artifacts_unlocked(data, workspace_id, thread.get("threadId"), run_id, reports, evidence, decision_payload, run)
            already_recorded = any(
                item.get("workspaceId") == workspace_id and item.get("runId") == run_id and item.get("type") == "memory.updated"
                for item in data.get("timeline", [])
            )
            if not already_recorded:
                data.setdefault("timeline", []).append(
                    self._event(
                        workspace_id=workspace_id,
                        thread_id=thread.get("threadId"),
                        run_id=run_id,
                        event_type="memory.updated",
                        title="工作记忆已更新",
                        summary=memory.get("currentThesis") or "本轮任务已回写投研记忆。",
                        payload={"decision": memory["lastDecision"], "decisionTrace": self._decision_trace_payload(run)},
                    )
                )
                data.setdefault("timeline", []).append(
                    self._event(
                        workspace_id=workspace_id,
                        thread_id=thread.get("threadId"),
                        run_id=run_id,
                        event_type="run.completed",
                        title="投研任务已完成",
                        summary=memory["lastDecision"]["summary"],
                        payload={
                            "reportCount": len(reports),
                            "evidenceCount": len(evidence),
                            "decisionTrace": self._decision_trace_payload(run),
                        },
                    )
                )
            self._write_unlocked(data)

    def record_decision_review(
        self,
        workspace_id: str,
        *,
        run_id: str,
        status: str,
        note: Optional[str] = None,
        reviewer: Optional[str] = None,
        thread_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            workspace = self._find_workspace(data, workspace_id)
            if not workspace:
                raise KeyError(f"Research workspace not found: {workspace_id}")
            thread = self._ensure_thread_unlocked(data, workspace_id, thread_id)
            now = _utc_now()
            review_payload = {
                "runId": run_id,
                "status": status,
                "note": self._compact_text(note or "", limit=260),
                "reviewer": reviewer or "research_reviewer",
                "updatedAt": now,
            }
            memory = workspace.setdefault("memory", {})
            last_decision = memory.setdefault("lastDecision", {})
            if isinstance(last_decision, dict) and (not last_decision.get("runId") or last_decision.get("runId") == run_id):
                last_decision["reviewStatus"] = status
                last_decision["reviewNote"] = review_payload["note"]
                last_decision["reviewedAt"] = now
            workspace["updatedAt"] = now

            for artifact in data.setdefault("artifacts", []):
                if artifact.get("workspaceId") != workspace_id or artifact.get("runId") != run_id:
                    continue
                payload = artifact.setdefault("payload", {})
                if artifact.get("artifactType") == "decision_trace" and isinstance(payload, dict):
                    payload["reviewStatus"] = status
                    payload["review"] = review_payload
                if artifact.get("artifactType") in {"trade_plan", "asset_research_report", "risk_review_report", "decision_trace"}:
                    artifact["reviewStatus"] = status
                    artifact["reviewedAt"] = now

            data.setdefault("timeline", []).append(
                self._event(
                    workspace_id=workspace_id,
                    thread_id=thread.get("threadId"),
                    run_id=run_id,
                    event_type="review.updated",
                    title="人工复核已更新",
                    summary=review_payload["note"] or f"复核状态更新为 {status}",
                    payload=review_payload,
                )
            )
            self._write_unlocked(data)
            return review_payload

    def _upsert_run_artifacts_unlocked(
        self,
        data: Dict[str, Any],
        workspace_id: str,
        thread_id: Optional[str],
        run_id: str,
        reports: List[AgentReport],
        evidence: List[EvidenceReference],
        decision_payload: Dict[str, Any],
        run: Optional[AgentRun] = None,
    ) -> None:
        artifacts = data.setdefault("artifacts", [])
        existing_ids = {item.get("artifactId") for item in artifacts}
        now = _utc_now()
        for report in reports:
            artifact_id = f"artifact_{report.reportId}"
            if artifact_id in existing_ids:
                continue
            artifact_type = getattr(report, "artifactType", None) or resolve_research_artifact_type(
                title=report.title,
                research_run_type=getattr(run, "researchRunType", None),
            )
            artifacts.append(
                {
                    "artifactId": artifact_id,
                    "workspaceId": workspace_id,
                    "threadId": thread_id,
                    "runId": run_id,
                    "artifactType": artifact_type,
                    "title": report.title,
                    "summary": self._compact_text(report.summary or "", limit=260),
                    "payload": report.model_dump() if hasattr(report, "model_dump") else {},
                    "createdAt": now,
                }
            )
        evidence_artifact_id = f"artifact_evidence_bundle_{run_id}"
        if evidence and evidence_artifact_id not in existing_ids:
            artifacts.append(
                {
                    "artifactId": evidence_artifact_id,
                    "workspaceId": workspace_id,
                    "threadId": thread_id,
                    "runId": run_id,
                    "artifactType": "evidence_bundle",
                    "title": "本轮证据包",
                    "summary": f"本轮投研任务纳入 {len(evidence)} 条证据，供报告和结论链路引用。",
                    "payload": {
                        "evidenceIds": [item.evidenceId for item in evidence],
                        "evidence": [item.model_dump() if hasattr(item, "model_dump") else {} for item in evidence],
                    },
                    "createdAt": now,
                }
            )
        decision_trace = self._decision_trace_payload(run)
        decision_trace_artifact_id = f"artifact_decision_trace_{run_id}"
        if decision_trace and decision_trace_artifact_id not in existing_ids:
            artifacts.append(
                {
                    "artifactId": decision_trace_artifact_id,
                    "workspaceId": workspace_id,
                    "threadId": thread_id,
                    "runId": run_id,
                    "artifactType": "decision_trace",
                    "title": "决策链路",
                    "summary": self._compact_text(decision_trace.get("conclusion") or decision_trace.get("supportSummary") or "", limit=260),
                    "payload": decision_trace,
                    "createdAt": now,
                }
            )
        decision_artifact_id = f"artifact_decision_{run_id}"
        if decision_artifact_id not in existing_ids:
            artifacts.append(
                {
                    "artifactId": decision_artifact_id,
                    "workspaceId": workspace_id,
                    "threadId": thread_id,
                    "runId": run_id,
                    "artifactType": "decision_snapshot",
                    "title": "最终配置观察",
                    "summary": self._compact_text(decision_payload.get("summary") or decision_payload.get("thesis") or "", limit=260),
                    "payload": decision_payload,
                    "createdAt": now,
                }
            )

    @staticmethod
    def _decision_trace_payload(run: Optional[AgentRun]) -> Optional[Dict[str, Any]]:
        trace = getattr(run, "decisionTrace", None) if run else None
        if not trace:
            return None
        return trace.model_dump() if hasattr(trace, "model_dump") else dict(trace)

    def _ensure_thread_unlocked(self, data: Dict[str, Any], workspace_id: str, thread_id: Optional[str]) -> Dict[str, Any]:
        for thread in data.setdefault("threads", []):
            if thread.get("workspaceId") == workspace_id and (not thread_id or thread.get("threadId") == thread_id):
                return thread
        return self._create_thread_unlocked(data, workspace_id, thread_id=thread_id, title="投研线程")

    def _create_thread_unlocked(
        self,
        data: Dict[str, Any],
        workspace_id: str,
        thread_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        now = _utc_now()
        thread = {
            "threadId": thread_id or f"thread_{uuid4().hex[:12]}",
            "workspaceId": workspace_id,
            "title": title or "投研线程",
            "status": "active",
            "linkedRunIds": [],
            "createdAt": now,
            "updatedAt": now,
        }
        data.setdefault("threads", []).append(thread)
        return thread

    def _event(
        self,
        *,
        workspace_id: str,
        event_type: str,
        title: str,
        summary: str = "",
        thread_id: Optional[str] = None,
        run_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "eventId": f"event_{uuid4().hex[:12]}",
            "workspaceId": workspace_id,
            "threadId": thread_id,
            "runId": run_id,
            "type": event_type,
            "title": title,
            "summary": self._compact_text(summary, limit=320),
            "payload": payload or {},
            "createdAt": _utc_now(),
        }

    @staticmethod
    def _find_workspace(data: Dict[str, Any], workspace_id: str) -> Optional[Dict[str, Any]]:
        for workspace in data.get("workspaces", []):
            if workspace.get("workspaceId") == workspace_id and workspace.get("status") != "archived":
                return workspace
        return None

    @staticmethod
    def _find_matching_workspace(
        data: Dict[str, Any],
        *,
        asset_id: Optional[str],
        portfolio_id: Optional[str],
        strategy_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        for workspace in data.get("workspaces", []):
            if workspace.get("status") == "archived":
                continue
            if asset_id and workspace.get("primaryAssetId") == asset_id:
                return workspace
            if portfolio_id and workspace.get("portfolioId") == portfolio_id:
                return workspace
            if strategy_id and not asset_id and not portfolio_id and workspace.get("strategyId") == strategy_id:
                return workspace
        return None

    @staticmethod
    def _default_workspace_name(asset_id: Optional[str], portfolio_id: Optional[str], strategy_id: Optional[str]) -> str:
        if asset_id == "asset_etf_510300":
            return "沪深300ETF 投研工作区"
        if asset_id:
            return f"{asset_id} 投研工作区"
        if portfolio_id:
            return f"{portfolio_id} 组合工作区"
        if strategy_id:
            return f"{strategy_id} 策略工作区"
        return "投研工作区"

    @staticmethod
    def _default_research_objective(asset_id: Optional[str], portfolio_id: Optional[str], strategy_id: Optional[str]) -> str:
        if asset_id:
            return f"持续判断 {asset_id} 的配置价值、风险约束和关键验证指标。"
        if portfolio_id:
            return f"持续评估组合 {portfolio_id} 的结构、风险和调仓依据。"
        if strategy_id:
            return f"持续评估策略 {strategy_id} 的有效性和适用环境。"
        return "持续沉淀投研任务的关键事实、假设和未解问题。"

    @staticmethod
    def _compact_text(value: str, limit: int = 200) -> str:
        text = re.sub(r"\s+", " ", str(value or "")).strip()
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 1)].rstrip() + "…"

    @classmethod
    def _merge_unique(cls, existing: Any, incoming: Any, limit: int = 8) -> List[str]:
        result: List[str] = []
        for source in (existing or [], incoming or []):
            if not isinstance(source, str):
                continue
            item = cls._compact_text(source, limit=180)
            if item and item not in result:
                result.append(item)
            if len(result) >= limit:
                break
        return result

    @classmethod
    def _extract_report_questions(cls, reports: List[AgentReport]) -> List[str]:
        questions: List[str] = []
        for report in reports:
            summary = report.summary or ""
            if "缺少" in summary or "待" in summary or "验证" in summary:
                questions.append(cls._compact_text(summary, limit=160))
        return questions[:4]


_STORE = ResearchWorkspaceStore()


def get_research_workspace_store() -> ResearchWorkspaceStore:
    return _STORE
