from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


class ResearchWorkbenchStore:
    """JSON-backed migration store for AlphaTrace research workbench data.

    This store deliberately does not read or write the legacy automation tables.
    It gives migrated research pages their own persistence boundary while the
    production database schema catches up.
    """

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or (_project_root() / "backend" / "runtime_data" / "alpha_trace_research_workbench.json")
        self._lock = Lock()

    def _default_state(self) -> Dict[str, Any]:
        now = _utc_now()
        return {
            "nextTemplateId": 3,
            "nextBindingId": 1,
            "nextTraderId": 3,
            "assistantSessions": [],
            "templates": [
                {
                    "id": 1,
                    "key": "research_market_brief",
                    "name": "投研市场简报",
                    "description": "用于生成资产/行业投研简报的基础提示词。",
                    "templateText": (
                        "你是投研分析师。请基于以下上下文输出结构化简报：\n"
                        "- 标的：{symbol}\n"
                        "- 研究目标：{research_objective}\n"
                        "- 证据摘要：{evidence_summary}\n"
                        "- 风险约束：{risk_constraints}\n\n"
                        "输出：核心结论、关键证据、反方风险、后续验证清单。"
                    ),
                    "systemTemplateText": "",
                    "isSystem": "true",
                    "isDeleted": "false",
                    "createdBy": "research-seed",
                    "updatedBy": "research-seed",
                    "createdAt": now,
                    "updatedAt": now,
                },
                {
                    "id": 2,
                    "key": "research_deep_dive",
                    "name": "投研深度分析",
                    "description": "用于多证据链深度研究和策略假设验证。",
                    "templateText": (
                        "请围绕 {symbol} 完成投研深度分析。\n\n"
                        "研究问题：{research_question}\n"
                        "数据证据：{evidence_summary}\n"
                        "组合约束：{portfolio_constraints}\n\n"
                        "请输出：1. 投资假设 2. 证据链 3. 关键变量 4. 失效条件 5. 执行建议。"
                    ),
                    "systemTemplateText": "",
                    "isSystem": "true",
                    "isDeleted": "false",
                    "createdBy": "research-seed",
                    "updatedBy": "research-seed",
                    "createdAt": now,
                    "updatedAt": now,
                },
            ],
            "bindings": [],
            "traders": [
                {
                    "id": 1,
                    "user_id": 1,
                    "name": "Research Analyst",
                    "model": "qwen-plus",
                    "base_url": "",
                    "api_key": "",
                    "initial_capital": 0,
                    "current_cash": 0,
                    "frozen_cash": 0,
                    "account_type": "AI",
                    "is_active": True,
                    "auto_trading_enabled": False,
                    "show_on_dashboard": True,
                    "avatar_preset_id": None,
                },
                {
                    "id": 2,
                    "user_id": 1,
                    "name": "Risk Reviewer",
                    "model": "qwen-plus",
                    "base_url": "",
                    "api_key": "",
                    "initial_capital": 0,
                    "current_cash": 0,
                    "frozen_cash": 0,
                    "account_type": "AI",
                    "is_active": True,
                    "auto_trading_enabled": False,
                    "show_on_dashboard": True,
                    "avatar_preset_id": None,
                },
            ],
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

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            self._write_unlocked(data)
            return deepcopy(data)

    def list_templates(self) -> List[Dict[str, Any]]:
        data = self.snapshot()
        return [item for item in data["templates"] if item.get("isDeleted") != "true"]

    def list_bindings(self) -> List[Dict[str, Any]]:
        data = self.snapshot()
        return [item for item in data["bindings"] if item.get("isDeleted") != "true"]

    def list_traders(self) -> List[Dict[str, Any]]:
        data = self.snapshot()
        return [item for item in data["traders"] if item.get("is_active") is True]

    def list_assistant_sessions(self, limit: int = 20) -> List[Dict[str, Any]]:
        data = self.snapshot()
        sessions = [item for item in data.get("assistantSessions", []) if not item.get("isDeleted")]
        sessions.sort(key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""), reverse=True)
        return deepcopy(sessions[: max(1, min(int(limit or 20), 100))])

    def get_assistant_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        data = self.snapshot()
        for session in data.get("assistantSessions", []):
            if session.get("id") == session_id and not session.get("isDeleted"):
                return deepcopy(session)
        return None

    def create_assistant_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            now = _utc_now()
            messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
            session = {
                "id": str(payload.get("id") or f"research-session-{uuid4().hex[:12]}"),
                "title": payload.get("title") or self._infer_session_title(messages),
                "selectedAssetId": payload.get("selectedAssetId") or "asset_etf_510300",
                "messages": messages,
                "toolLogs": payload.get("toolLogs") if isinstance(payload.get("toolLogs"), list) else [],
                "activeRunId": payload.get("activeRunId"),
                "linkedRunIds": self._coerce_string_list(payload.get("linkedRunIds")),
                "statusText": payload.get("statusText") or "就绪",
                "lastSequence": int(payload.get("lastSequence") or 0),
                "createdAt": now,
                "updatedAt": now,
                "isDeleted": False,
            }
            data.setdefault("assistantSessions", []).insert(0, session)
            self._write_unlocked(data)
            return deepcopy(session)

    def update_assistant_session(self, session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for session in data.setdefault("assistantSessions", []):
                if session.get("id") != session_id or session.get("isDeleted"):
                    continue
                if "title" in payload:
                    session["title"] = payload.get("title") or session.get("title") or "投研会话"
                if "selectedAssetId" in payload:
                    session["selectedAssetId"] = payload.get("selectedAssetId") or session.get("selectedAssetId")
                if isinstance(payload.get("messages"), list):
                    session["messages"] = payload["messages"]
                    if not session.get("title") or session.get("title") == "投研会话":
                        session["title"] = self._infer_session_title(payload["messages"])
                if isinstance(payload.get("toolLogs"), list):
                    session["toolLogs"] = payload["toolLogs"][-120:]
                if "activeRunId" in payload:
                    session["activeRunId"] = payload.get("activeRunId")
                if "linkedRunIds" in payload:
                    session["linkedRunIds"] = self._coerce_string_list(payload.get("linkedRunIds"))
                elif payload.get("activeRunId"):
                    linked = self._coerce_string_list(session.get("linkedRunIds"))
                    active_run_id = str(payload["activeRunId"])
                    if active_run_id not in linked:
                        linked.append(active_run_id)
                    session["linkedRunIds"] = linked
                if "statusText" in payload:
                    session["statusText"] = payload.get("statusText") or session.get("statusText") or "就绪"
                if "lastSequence" in payload:
                    session["lastSequence"] = max(int(session.get("lastSequence") or 0), int(payload.get("lastSequence") or 0))
                session["updatedAt"] = _utc_now()
                self._write_unlocked(data)
                return deepcopy(session)
        raise KeyError(session_id)

    def delete_assistant_session(self, session_id: str) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for session in data.setdefault("assistantSessions", []):
                if session.get("id") == session_id and not session.get("isDeleted"):
                    session["isDeleted"] = True
                    session["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                    return {"success": True, "deleted": True, "id": session_id}
        return {"success": False, "error": "Research assistant session not found"}

    @staticmethod
    def _coerce_string_list(value: Any) -> List[str]:
        if not value:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if str(item)]
        return [str(value)]

    @staticmethod
    def _infer_session_title(messages: List[Dict[str, Any]]) -> str:
        for message in messages:
            if message.get("role") == "user" and str(message.get("content") or "").strip():
                content = str(message["content"]).strip().replace("\n", " ")
                return content[:36] + ("..." if len(content) > 36 else "")
        return "投研会话"

    def create_trader(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            trader_id = int(data.get("nextTraderId", 1))
            trader = {
                "id": trader_id,
                "user_id": 1,
                "name": payload.get("name") or f"Research Trader {trader_id}",
                "model": payload.get("model") or "qwen-plus",
                "base_url": payload.get("base_url") or "",
                "api_key": "",
                "initial_capital": 0,
                "current_cash": 0,
                "frozen_cash": 0,
                "account_type": "AI",
                "is_active": True,
                "auto_trading_enabled": False,
                "show_on_dashboard": True,
                "avatar_preset_id": None,
            }
            data["nextTraderId"] = trader_id + 1
            data["traders"].insert(0, trader)
            self._write_unlocked(data)
            return deepcopy(trader)

    def update_trader(self, trader_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for trader in data["traders"]:
                if trader["id"] == trader_id and trader.get("is_active") is True:
                    if payload.get("name") is not None:
                        trader["name"] = payload["name"]
                    if payload.get("model") is not None:
                        trader["model"] = payload["model"]
                    if payload.get("base_url") is not None:
                        trader["base_url"] = payload["base_url"]
                    self._write_unlocked(data)
                    return deepcopy(trader)
        raise KeyError(str(trader_id))

    def delete_trader(self, trader_id: int) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for trader in data["traders"]:
                if trader["id"] == trader_id and trader.get("is_active") is True:
                    trader["is_active"] = False
                    self._write_unlocked(data)
                    return {"success": True, "deleted": True, "id": trader_id}
        return {"success": False, "error": "Research AI trader not found"}

    def get_template_by_id(self, template_id: int) -> Optional[Dict[str, Any]]:
        return next((item for item in self.list_templates() if item["id"] == template_id), None)

    def get_template_by_key(self, key: str) -> Optional[Dict[str, Any]]:
        return next((item for item in self.list_templates() if item["key"] == key), None)

    def create_template(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            template_id = int(data.get("nextTemplateId", 1))
            now = _utc_now()
            key = f"research_custom_{template_id}"
            template = {
                "id": template_id,
                "key": key,
                "name": payload.get("name") or f"Research Prompt {template_id}",
                "description": payload.get("description") or "",
                "templateText": payload.get("templateText") or self._default_state()["templates"][0]["templateText"],
                "systemTemplateText": "",
                "isSystem": "false",
                "isDeleted": "false",
                "createdBy": payload.get("createdBy") or "ui",
                "updatedBy": payload.get("createdBy") or "ui",
                "createdAt": now,
                "updatedAt": now,
            }
            data["nextTemplateId"] = template_id + 1
            data["templates"].insert(0, template)
            self._write_unlocked(data)
            return deepcopy(template)

    def update_template(self, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for template in data["templates"]:
                if template["key"] == key and template.get("isDeleted") != "true":
                    template["templateText"] = payload.get("templateText", template["templateText"])
                    template["description"] = payload.get("description", template.get("description") or "")
                    template["updatedBy"] = payload.get("updatedBy") or "ui"
                    template["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                    return deepcopy(template)
        raise KeyError(key)

    def update_template_name(self, template_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for template in data["templates"]:
                if template["id"] == template_id and template.get("isDeleted") != "true":
                    template["name"] = payload.get("name") or template["name"]
                    template["description"] = payload.get("description", template.get("description") or "")
                    template["updatedBy"] = payload.get("updatedBy") or "ui"
                    template["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                    return deepcopy(template)
        raise KeyError(str(template_id))

    def copy_template(self, template_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        source = self.get_template_by_id(template_id)
        if not source:
            raise KeyError(str(template_id))
        return self.create_template(
            {
                "name": payload.get("newName") or f"{source['name']} (Copy)",
                "description": source.get("description") or "",
                "templateText": source.get("templateText") or "",
                "createdBy": payload.get("createdBy") or "ui",
            }
        )

    def delete_template(self, template_id: int) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for template in data["templates"]:
                if template["id"] == template_id and template.get("isDeleted") != "true":
                    if template.get("isSystem") == "true":
                        return {"success": False, "error": "Cannot delete system templates"}
                    template["isDeleted"] = "true"
                    template["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                    return {"success": True, "deleted": True, "id": template_id}
        return {"success": False, "error": "Template not found"}

    def upsert_binding(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        account_id = int(payload.get("accountId") or 0)
        template_id = int(payload.get("promptTemplateId") or 0)
        trader = next((item for item in self.list_traders() if item["id"] == account_id), None)
        template = self.get_template_by_id(template_id)
        if not trader:
            raise ValueError("Research AI trader not found")
        if not template:
            raise ValueError("Research prompt template not found")

        with self._lock:
            data = self._read_unlocked()
            binding_id = payload.get("id")
            binding = None
            if binding_id:
                binding = next((item for item in data["bindings"] if item["id"] == binding_id), None)
            if binding is None:
                binding = next(
                    (
                        item
                        for item in data["bindings"]
                        if item.get("accountId") == account_id and item.get("isDeleted") != "true"
                    ),
                    None,
                )
            if binding is None:
                binding = {"id": int(data.get("nextBindingId", 1)), "isDeleted": "false"}
                data["nextBindingId"] = binding["id"] + 1
                data["bindings"].append(binding)
            binding.update(
                {
                    "accountId": account_id,
                    "accountName": trader["name"],
                    "accountModel": trader.get("model"),
                    "promptTemplateId": template_id,
                    "promptKey": template["key"],
                    "promptName": template["name"],
                    "updatedBy": payload.get("updatedBy") or "ui",
                    "updatedAt": _utc_now(),
                    "isDeleted": "false",
                }
            )
            self._write_unlocked(data)
            return deepcopy(binding)

    def delete_binding(self, binding_id: int) -> Dict[str, Any]:
        with self._lock:
            data = self._read_unlocked()
            for binding in data["bindings"]:
                if binding["id"] == binding_id and binding.get("isDeleted") != "true":
                    binding["isDeleted"] = "true"
                    binding["updatedAt"] = _utc_now()
                    self._write_unlocked(data)
                    return {"success": True, "deleted": True, "id": binding_id}
        return {"success": False, "error": "Binding not found"}


_STORE: Optional[ResearchWorkbenchStore] = None


def get_research_workbench_store() -> ResearchWorkbenchStore:
    global _STORE
    if _STORE is None:
        _STORE = ResearchWorkbenchStore()
    return _STORE
