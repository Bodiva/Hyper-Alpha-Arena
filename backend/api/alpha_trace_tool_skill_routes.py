from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services.agent_skill_bindings import get_agent_skill_binding_catalog
from services.agent_skill_catalog import get_agent_skill_catalog
from services.agent_tool_registry import get_agent_tool_contract, list_agent_tool_contracts


router = APIRouter(prefix="/api/alpha-trace", tags=["AlphaTrace Tool Skill Catalog"])


def _optional_query_text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


@router.get("/tools")
def list_alpha_trace_tools(
    category: str | None = Query(None),
    source: str | None = Query(None),
) -> dict:
    category = _optional_query_text(category)
    source = _optional_query_text(source)
    tools = [tool.to_payload() for tool in list_agent_tool_contracts()]
    if category:
        tools = [tool for tool in tools if tool.get("category") == category]
    if source:
        tools = [tool for tool in tools if tool.get("source") == source]

    by_category: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for tool in tools:
        category_key = str(tool.get("category") or "unknown")
        source_key = str(tool.get("source") or "unknown")
        by_category[category_key] = by_category.get(category_key, 0) + 1
        by_source[source_key] = by_source.get(source_key, 0) + 1

    return {
        "version": 1,
        "tools": tools,
        "total": len(tools),
        "summary": {
            "byCategory": by_category,
            "bySource": by_source,
        },
        "policies": {
            "toolBoundary": "Tools are backend contracts. Provider-specific credentials stay server-side.",
            "dataBoundary": "Tool outputs must map into AlphaTrace schemas before persistence or frontend display.",
        },
    }


@router.get("/tools/{tool_name}")
def get_alpha_trace_tool(tool_name: str) -> dict:
    tool = get_agent_tool_contract(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"AlphaTrace tool not found: {tool_name}")
    return tool.to_payload()


@router.get("/skills")
def list_alpha_trace_skills(
    skillType: str | None = Query(None),
    status: str | None = Query(None),
) -> dict:
    skillType = _optional_query_text(skillType)
    status = _optional_query_text(status)
    catalog = get_agent_skill_catalog().to_response()
    skills = catalog["skills"]
    if skillType:
        skills = [skill for skill in skills if skill.get("skill_type") == skillType]
    if status:
        skills = [skill for skill in skills if skill.get("status") == status]
    catalog["skills"] = skills
    catalog["total"] = len(skills)
    return catalog


@router.get("/skills/bindings")
def list_alpha_trace_skill_bindings(
    team: str | None = Query(None),
    status: str | None = Query(None),
) -> dict:
    team = _optional_query_text(team)
    status = _optional_query_text(status)
    catalog = get_agent_skill_binding_catalog().to_response()
    bindings = catalog["bindings"]
    if team:
        bindings = [binding for binding in bindings if binding.get("team") == team]
    if status:
        bindings = [binding for binding in bindings if binding.get("status") == status]
    catalog["bindings"] = bindings
    catalog["total"] = len(bindings)
    return catalog


@router.get("/skills/roles/{role_id}")
def get_alpha_trace_role_skill_binding(role_id: str) -> dict:
    catalog = get_agent_skill_binding_catalog().to_response()
    for binding in catalog["bindings"]:
        if binding.get("role_id") == role_id:
            return binding
    raise HTTPException(status_code=404, detail=f"AlphaTrace agent role binding not found: {role_id}")
