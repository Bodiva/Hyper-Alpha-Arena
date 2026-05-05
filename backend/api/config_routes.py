"""
System config API routes
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import logging
import json
import re

from database.connection import SessionLocal
from database.models import SystemConfig, GlobalSamplingConfig
from services.feature_entitlements import get_feature_entitlements

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class ConfigUpdateRequest(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


WORKSPACE_PRESETS_CONFIG_KEY = "alphatrace_workspace_default_presets"
SETTINGS_MODULE_PRESET_PREFIX = "alphatrace_settings_module_presets"
ALLOWED_SETTINGS_MODULES = {"riskModel", "agents", "dataPolicy", "pagePreferences"}


class WorkspacePresetRequest(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    assetTypes: List[str]
    markets: List[str]
    tags: List[str]
    leaderboardSortMetric: str
    evidenceQualityThreshold: str
    decisionDefaultStatus: str
    dataSourceDefaultStatus: str


class SettingsModulePresetRequest(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    data: Dict[str, Any]


def _slugify_preset_id(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", name.strip()).strip("-").lower()
    return f"custom-{slug or 'workspace-preset'}"


def _settings_module_config_key(module_key: str) -> str:
    if module_key not in ALLOWED_SETTINGS_MODULES:
        raise HTTPException(status_code=404, detail="settings module not found")
    return f"{SETTINGS_MODULE_PRESET_PREFIX}_{module_key}"


def _normalize_workspace_preset(raw: Dict[str, Any]) -> Dict[str, Any]:
    name = str(raw.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="preset name is required")

    preset_id = str(raw.get("id") or "").strip() or _slugify_preset_id(name)
    if not preset_id.startswith("custom-"):
        preset_id = f"custom-{preset_id}"

    def list_of_strings(key: str) -> List[str]:
        value = raw.get(key)
        if not isinstance(value, list):
            raise HTTPException(status_code=400, detail=f"{key} must be a list")
        return [str(item).strip() for item in value if str(item).strip()]

    return {
        "id": preset_id,
        "name": name,
        "description": str(raw.get("description") or "").strip(),
        "assetTypes": list_of_strings("assetTypes"),
        "markets": list_of_strings("markets"),
        "tags": list_of_strings("tags"),
        "leaderboardSortMetric": str(raw.get("leaderboardSortMetric") or "COMPOSITE_SCORE"),
        "evidenceQualityThreshold": str(raw.get("evidenceQualityThreshold") or "GE_80"),
        "decisionDefaultStatus": str(raw.get("decisionDefaultStatus") or "VERIFIED"),
        "dataSourceDefaultStatus": str(raw.get("dataSourceDefaultStatus") or "NORMAL"),
        "source": "database",
    }


def _load_workspace_presets(db: Session) -> List[Dict[str, Any]]:
    config = db.query(SystemConfig).filter(SystemConfig.key == WORKSPACE_PRESETS_CONFIG_KEY).first()
    if not config or not config.value:
        return []
    try:
        payload = json.loads(config.value)
    except json.JSONDecodeError:
        logger.warning("Invalid workspace presets JSON in SystemConfig")
        return []
    if not isinstance(payload, list):
        return []
    presets = []
    for item in payload:
        if isinstance(item, dict):
            try:
                presets.append(_normalize_workspace_preset(item))
            except HTTPException:
                logger.warning("Skipping invalid workspace preset: %s", item)
    return presets


def _save_workspace_presets(db: Session, presets: List[Dict[str, Any]]) -> None:
    config = db.query(SystemConfig).filter(SystemConfig.key == WORKSPACE_PRESETS_CONFIG_KEY).first()
    value = json.dumps(presets, ensure_ascii=False)
    if config:
        config.value = value
        config.description = "AlphaTrace custom workspace default presets"
    else:
        config = SystemConfig(
            key=WORKSPACE_PRESETS_CONFIG_KEY,
            value=value,
            description="AlphaTrace custom workspace default presets",
        )
        db.add(config)
    db.commit()


def _normalize_settings_module_preset(raw: Dict[str, Any], module_key: str) -> Dict[str, Any]:
    name = str(raw.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="preset name is required")

    data = raw.get("data")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="preset data must be an object")

    preset_id = str(raw.get("id") or "").strip() or _slugify_preset_id(name)
    if not preset_id.startswith("custom-"):
        preset_id = f"custom-{preset_id}"

    return {
        "id": preset_id,
        "moduleKey": module_key,
        "name": name,
        "description": str(raw.get("description") or "").strip(),
        "data": data,
        "source": "database",
    }


def _load_settings_module_presets(db: Session, module_key: str) -> List[Dict[str, Any]]:
    config_key = _settings_module_config_key(module_key)
    config = db.query(SystemConfig).filter(SystemConfig.key == config_key).first()
    if not config or not config.value:
        return []
    try:
        payload = json.loads(config.value)
    except json.JSONDecodeError:
        logger.warning("Invalid settings preset JSON in SystemConfig for %s", module_key)
        return []
    if not isinstance(payload, list):
        return []

    presets = []
    for item in payload:
        if isinstance(item, dict):
            try:
                presets.append(_normalize_settings_module_preset(item, module_key))
            except HTTPException:
                logger.warning("Skipping invalid settings module preset: %s", item)
    return presets


def _save_settings_module_presets(db: Session, module_key: str, presets: List[Dict[str, Any]]) -> None:
    config_key = _settings_module_config_key(module_key)
    config = db.query(SystemConfig).filter(SystemConfig.key == config_key).first()
    value = json.dumps(presets, ensure_ascii=False)
    description = f"AlphaTrace custom settings presets for {module_key}"
    if config:
        config.value = value
        config.description = description
    else:
        config = SystemConfig(key=config_key, value=value, description=description)
        db.add(config)
    db.commit()


@router.get("/check-required")
async def check_required_configs(db: Session = Depends(get_db)):
    """Check if required configs are set"""
    try:
        return {
            "has_required_configs": True,
            "missing_configs": []
        }
    except Exception as e:
        logger.error(f"Failed to check required configs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check required configs: {str(e)}")


@router.get("/global-sampling")
async def get_global_sampling_config(db: Session = Depends(get_db)):
    """Get global sampling configuration"""
    try:
        config = db.query(GlobalSamplingConfig).first()
        if not config:
            # Create default config
            config = GlobalSamplingConfig(sampling_interval=18, sampling_depth=10)
            db.add(config)
            db.commit()
            db.refresh(config)

        return {
            "sampling_interval": config.sampling_interval,
            "sampling_depth": config.sampling_depth
        }
    except Exception as e:
        logger.error(f"Failed to get global sampling config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get global sampling config: {str(e)}")


@router.put("/global-sampling")
async def update_global_sampling_config(payload: dict, db: Session = Depends(get_db)):
    """Update global sampling configuration"""
    try:
        sampling_interval = payload.get("sampling_interval")
        sampling_depth = payload.get("sampling_depth")

        # Validate sampling_interval if provided
        if sampling_interval is not None:
            if not isinstance(sampling_interval, int) or sampling_interval < 5 or sampling_interval > 60:
                raise HTTPException(
                    status_code=400,
                    detail="sampling_interval must be between 5 and 60 seconds"
                )

        # Validate sampling_depth if provided
        if sampling_depth is not None:
            if not isinstance(sampling_depth, int) or sampling_depth < 10 or sampling_depth > 60:
                raise HTTPException(
                    status_code=400,
                    detail="sampling_depth must be between 10 and 60"
                )
            max_sampling_depth = get_feature_entitlements()["max_sampling_depth"]
            if sampling_depth > max_sampling_depth:
                raise HTTPException(
                    status_code=403,
                    detail=f"sampling_depth exceeds local entitlement limit ({max_sampling_depth})"
                )

        config = db.query(GlobalSamplingConfig).first()
        if not config:
            config = GlobalSamplingConfig(
                sampling_interval=sampling_interval or 18,
                sampling_depth=sampling_depth or 10
            )
            db.add(config)
        else:
            if sampling_interval is not None:
                config.sampling_interval = sampling_interval
            if sampling_depth is not None:
                config.sampling_depth = sampling_depth

        db.commit()
        db.refresh(config)

        # Trigger sampling pool reconfiguration (use watchlist if available)
        try:
            print(f"[DEBUG] Starting sampling pool update to depth={config.sampling_depth}")
            from services.sampling_pool import sampling_pool
            from services.trading_commands import AI_TRADING_SYMBOLS
            from services.hyperliquid_symbol_service import get_selected_symbols as get_hyperliquid_selected_symbols

            symbols = get_hyperliquid_selected_symbols() or AI_TRADING_SYMBOLS
            for symbol in symbols:
                sampling_pool.set_max_samples(symbol, config.sampling_depth)

            print(f"[DEBUG] Sampling pool updated: depth={config.sampling_depth} for {len(symbols)} symbols")
            logger.info(f"Sampling pool updated: depth={config.sampling_depth} for {len(symbols)} symbols")
        except Exception as pool_err:
            print(f"[ERROR] Failed to update sampling pool: {pool_err}")
            logger.warning(f"Failed to update sampling pool: {pool_err}")

        return {
            "sampling_interval": config.sampling_interval,
            "sampling_depth": config.sampling_depth
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update global sampling config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update global sampling config: {str(e)}")


@router.get("/workspace-presets")
async def get_workspace_presets(db: Session = Depends(get_db)):
    """Get custom AlphaTrace workspace default presets stored in SystemConfig."""
    try:
        return {"presets": _load_workspace_presets(db)}
    except Exception as e:
        logger.error(f"Failed to get workspace presets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get workspace presets: {str(e)}")


@router.post("/workspace-presets")
async def upsert_workspace_preset(payload: WorkspacePresetRequest, db: Session = Depends(get_db)):
    """Create or update a custom AlphaTrace workspace default preset."""
    try:
        preset = _normalize_workspace_preset(payload.dict())
        presets = _load_workspace_presets(db)
        next_presets = [item for item in presets if item.get("id") != preset["id"]]
        next_presets.insert(0, preset)
        _save_workspace_presets(db, next_presets)
        return {"preset": preset, "presets": next_presets}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save workspace preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save workspace preset: {str(e)}")


@router.delete("/workspace-presets/{preset_id}")
async def delete_workspace_preset(preset_id: str, db: Session = Depends(get_db)):
    """Delete a custom AlphaTrace workspace default preset."""
    try:
        presets = _load_workspace_presets(db)
        next_presets = [item for item in presets if item.get("id") != preset_id]
        if len(next_presets) == len(presets):
            raise HTTPException(status_code=404, detail="workspace preset not found")
        _save_workspace_presets(db, next_presets)
        return {"success": True, "presets": next_presets}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete workspace preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete workspace preset: {str(e)}")


@router.get("/settings-presets/{module_key}")
async def get_settings_module_presets(module_key: str, db: Session = Depends(get_db)):
    """Get custom named presets for a Settings module."""
    try:
        return {"presets": _load_settings_module_presets(db, module_key)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get settings module presets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get settings module presets: {str(e)}")


@router.post("/settings-presets/{module_key}")
async def upsert_settings_module_preset(
    module_key: str,
    payload: SettingsModulePresetRequest,
    db: Session = Depends(get_db),
):
    """Create or update a custom named preset for a Settings module."""
    try:
        preset = _normalize_settings_module_preset(payload.dict(), module_key)
        presets = _load_settings_module_presets(db, module_key)
        next_presets = [item for item in presets if item.get("id") != preset["id"]]
        next_presets.insert(0, preset)
        _save_settings_module_presets(db, module_key, next_presets)
        return {"preset": preset, "presets": next_presets}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save settings module preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings module preset: {str(e)}")


@router.delete("/settings-presets/{module_key}/{preset_id}")
async def delete_settings_module_preset(module_key: str, preset_id: str, db: Session = Depends(get_db)):
    """Delete a custom named preset for a Settings module."""
    try:
        presets = _load_settings_module_presets(db, module_key)
        next_presets = [item for item in presets if item.get("id") != preset_id]
        if len(next_presets) == len(presets):
            raise HTTPException(status_code=404, detail="settings module preset not found")
        _save_settings_module_presets(db, module_key, next_presets)
        return {"success": True, "presets": next_presets}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete settings module preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete settings module preset: {str(e)}")


# Generic system config update - must be after specific routes to avoid path conflicts
class ConfigValueRequest(BaseModel):
    value: str


@router.put("/{key}")
async def update_system_config(key: str, payload: ConfigValueRequest, db: Session = Depends(get_db)):
    """Update a single system config value by key."""
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if config:
        config.value = payload.value
    else:
        config = SystemConfig(key=key, value=payload.value)
        db.add(config)
    db.commit()
    return {"success": True, "key": key, "value": payload.value}
