from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from services.architecture_index import get_alphatrace_architecture_index
from services.agent_skill_catalog import get_agent_skill_catalog
from services.backend_module_boundaries import get_backend_module_boundary_catalog
from services.data_center_catalog import get_data_center_catalog
from services.external_component_catalog import get_external_component_catalog
from services.integration_decision_guide import get_integration_decision_guide
from services.runtime_readiness import get_runtime_readiness_summary


def get_architecture_review_bundle(db: Session | None = None) -> dict[str, Any]:
    """Return a consolidated architecture/refactor review payload.

    This endpoint is intentionally read-only. It lets frontend diagnostics and
    architecture review tools fetch all high-level contracts in one call without
    rebuilding product logic in page components.
    """

    architecture = get_alphatrace_architecture_index(db)
    module_boundaries = get_backend_module_boundary_catalog().to_response()
    external_components = get_external_component_catalog().to_response()
    integration_decisions = get_integration_decision_guide().to_response()
    data_center = get_data_center_catalog().to_response()
    skills = get_agent_skill_catalog().to_response()
    readiness = get_runtime_readiness_summary(db)

    return {
        "version": 1,
        "architecture": architecture,
        "moduleBoundaries": module_boundaries,
        "externalComponents": external_components,
        "integrationDecisions": integration_decisions,
        "dataCenter": data_center,
        "skills": skills,
        "readiness": readiness,
        "summary": {
            "layers": len(architecture.get("layers", [])),
            "modules": module_boundaries.get("total", 0),
            "externalComponents": external_components.get("total", 0),
            "integrationDecisions": integration_decisions.get("total", 0),
            "dataCenterConnectors": data_center.get("total", 0),
            "skills": skills.get("total", 0),
            "readiness": readiness.get("overallStatus", "unknown"),
        },
        "policies": {
            "schemaBoundary": "Frontend and external integrations consume AlphaTrace-owned contracts only.",
            "openSourceReuse": "Use adapters and concepts first; do not copy external code without license/compliance review.",
            "persistence": "MySQL stores config/task control; ClickHouse stores structured business analytics; external checkpoints are execution details only.",
            "legacyIsolation": "Legacy crypto/trading modules remain separated from AlphaTrace ETF/fund/index data contracts.",
        },
        "message": "Architecture review bundle consolidates AlphaTrace runtime boundaries, external component decisions, and readiness diagnostics.",
    }


__all__ = ["get_architecture_review_bundle"]
