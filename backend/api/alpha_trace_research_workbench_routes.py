from __future__ import annotations

from pathlib import Path
from typing import Dict

from fastapi import APIRouter, HTTPException

from services.research_workbench_store import get_research_workbench_store


router = APIRouter(
    prefix="/api/alpha-trace/research-workbench",
    tags=["AlphaTrace Research Workbench"],
)


def _store():
    return get_research_workbench_store()


@router.get("/traders")
def list_research_traders():
    return _store().list_traders()


@router.post("/traders")
def create_research_trader(payload: Dict):
    return _store().create_trader(payload)


@router.put("/traders/{trader_id}")
def update_research_trader(trader_id: int, payload: Dict):
    try:
        return _store().update_trader(trader_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Research AI trader not found: {trader_id}") from exc


@router.delete("/traders/{trader_id}")
def delete_research_trader(trader_id: int):
    result = _store().delete_trader(trader_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Research AI trader not found"))
    return result


@router.get("/assistant/sessions")
def list_research_assistant_sessions(limit: int = 20):
    return {
        "sessions": _store().list_assistant_sessions(limit=limit),
        "total": len(_store().list_assistant_sessions(limit=100)),
    }


@router.post("/assistant/sessions")
def create_research_assistant_session(payload: Dict):
    return _store().create_assistant_session(payload)


@router.get("/assistant/sessions/{session_id}")
def get_research_assistant_session(session_id: str):
    session = _store().get_assistant_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Research assistant session not found: {session_id}")
    return session


@router.patch("/assistant/sessions/{session_id}")
def update_research_assistant_session(session_id: str, payload: Dict):
    try:
        return _store().update_assistant_session(session_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Research assistant session not found: {session_id}") from exc


@router.delete("/assistant/sessions/{session_id}")
def delete_research_assistant_session(session_id: str):
    result = _store().delete_assistant_session(session_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Research assistant session not found"))
    return result


@router.get("/prompts")
def list_research_prompts():
    return {
        "templates": _store().list_templates(),
        "bindings": _store().list_bindings(),
    }


@router.post("/prompts")
def create_research_prompt(payload: Dict):
    return _store().create_template(payload)


@router.put("/prompts/{key}")
def update_research_prompt(key: str, payload: Dict):
    try:
        return _store().update_template(key, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Research prompt not found: {key}") from exc


@router.post("/prompts/{template_id}/copy")
def copy_research_prompt(template_id: int, payload: Dict):
    try:
        return _store().copy_template(template_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Research prompt not found: {template_id}") from exc


@router.delete("/prompts/{template_id}")
def delete_research_prompt(template_id: int):
    result = _store().delete_template(template_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Delete failed"))
    return result


@router.patch("/prompts/{template_id}/name")
def update_research_prompt_name(template_id: int, payload: Dict):
    try:
        return _store().update_template_name(template_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Research prompt not found: {template_id}") from exc


@router.post("/prompts/bindings")
def upsert_research_prompt_binding(payload: Dict):
    try:
        return _store().upsert_binding(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/prompts/bindings/{binding_id}")
def delete_research_prompt_binding(binding_id: int):
    result = _store().delete_binding(binding_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Binding not found"))
    return result


@router.get("/prompts/variables-reference")
def get_research_variables_reference(lang: str = "en"):
    filename = "PROMPT_VARIABLES_REFERENCE_ZH.md" if lang == "zh" else "PROMPT_VARIABLES_REFERENCE.md"
    doc_path = Path(__file__).resolve().parents[1] / "config" / filename
    if doc_path.exists():
        content = doc_path.read_text(encoding="utf-8")
    else:
        content = (
            "# Research Prompt Variables\n\n"
            "| Variable | Description |\n"
            "| --- | --- |\n"
            "| `{symbol}` | Research target symbol or asset id. |\n"
            "| `{research_objective}` | Research objective. |\n"
            "| `{research_question}` | Main research question. |\n"
            "| `{evidence_summary}` | Evidence collected in AlphaTrace. |\n"
            "| `{risk_constraints}` | Risk constraints and invalidation rules. |\n"
            "| `{portfolio_constraints}` | Portfolio-level constraints. |\n"
        )
    return {"content": content}


@router.post("/prompts/preview")
def preview_research_prompt(payload: Dict):
    template_text = payload.get("templateText") or ""
    prompt_key = payload.get("promptTemplateKey")
    if not template_text and prompt_key:
        template = _store().get_template_by_key(prompt_key)
        if template:
            template_text = template.get("templateText") or ""
    if not template_text:
        raise HTTPException(status_code=400, detail="templateText or promptTemplateKey is required")

    account_ids = payload.get("accountIds") or []
    traders = _store().list_traders()
    selected = [item for item in traders if item["id"] in account_ids] or traders[:1]
    context = {
        "symbol": "BTC",
        "research_objective": "验证资产方向、风险暴露和证据强度",
        "research_question": "当前是否存在可执行的投研假设？",
        "evidence_summary": "当前为迁移期示例预览；后续会接入 Evidence Center 和 Agent Run 输出。",
        "risk_constraints": "禁止把样例预览当成交易建议；需要证据、仓位和风控复核。",
        "portfolio_constraints": "组合约束待接入 Portfolio Workspace。",
    }

    class SafeDict(dict):
        def __missing__(self, key):
            return "{" + key + "}"

    previews = []
    for trader in selected:
        try:
            filled_prompt = template_text.format_map(SafeDict(context))
        except Exception as exc:
            filled_prompt = f"Error filling research prompt: {exc}"
        previews.append(
            {
                "accountId": trader["id"],
                "accountName": trader["name"],
                "exchange": "research",
                "symbols": ["BTC"],
                "filledPrompt": filled_prompt,
            }
        )
    return {"previews": previews}
