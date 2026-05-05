"""Feature entitlement API routes."""

from typing import Any, Dict

from fastapi import APIRouter

from services.feature_entitlements import get_feature_entitlements

router = APIRouter(prefix="/api/features", tags=["features"])


@router.get("")
@router.get("/")
async def read_feature_entitlements() -> Dict[str, Any]:
    """Return local feature entitlements for the frontend."""
    return get_feature_entitlements()
