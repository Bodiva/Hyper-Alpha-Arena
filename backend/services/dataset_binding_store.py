from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from database.connection import SessionLocal
from database.models import SystemConfig
from schemas.alpha_trace_data_source import DatasetBinding, DatasetBindingRequest
from services.system_config_store import get_mysql_system_config_store


DATASET_BINDINGS_CONFIG_KEY = "alphatrace_dataset_bindings"
DEFAULT_PRIMARY_METRICS = [
    "close_price",
    "pe_etf_weighted",
    "pb_etf_weighted",
    "dividend_yield_pct",
]
DEFAULT_AGENT_RUNNERS = ["qwen", "alphatrace_native"]
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")


class DatasetBindingError(ValueError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.:-]+", "_", value.strip()).strip("_")
    return slug or "dataset_binding"


def _use_mysql_store() -> bool:
    return os.getenv("ALPHA_TRACE_DOMAIN_STORE", "").strip().lower() == "mysql"


def _load_raw_bindings_mysql() -> list[dict[str, Any]]:
    store = get_mysql_system_config_store()
    with store.engine.begin() as conn:
        row = conn.execute(
            select(store.configs.c.payload_json).where(store.configs.c.config_key == DATASET_BINDINGS_CONFIG_KEY)
        ).first()
    if not row:
        return []
    payload = row.payload_json
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return []
    if isinstance(payload, dict):
        payload = payload.get("bindings")
    return [item for item in payload if isinstance(item, dict)] if isinstance(payload, list) else []


def _save_raw_bindings_mysql(bindings: list[dict[str, Any]]) -> None:
    store = get_mysql_system_config_store()
    now = _now()
    payload = {"bindings": bindings}
    values = {
        "config_type": "dataset_binding",
        "provider": "alphatrace",
        "model": None,
        "base_url": None,
        "enabled": "true",
        "secret_encrypted": None,
        "updated_at": now,
        "payload_json": payload,
    }
    with store.engine.begin() as conn:
        existing = conn.execute(
            select(store.configs.c.config_key).where(store.configs.c.config_key == DATASET_BINDINGS_CONFIG_KEY)
        ).first()
        if existing:
            conn.execute(update(store.configs).where(store.configs.c.config_key == DATASET_BINDINGS_CONFIG_KEY).values(**values))
        else:
            conn.execute(insert(store.configs).values(config_key=DATASET_BINDINGS_CONFIG_KEY, **values))


def _load_raw_bindings(db: Session) -> list[dict[str, Any]]:
    config = db.query(SystemConfig).filter(SystemConfig.key == DATASET_BINDINGS_CONFIG_KEY).first()
    if not config or not config.value:
        return []
    try:
        payload = json.loads(config.value)
    except json.JSONDecodeError:
        return []
    return [item for item in payload if isinstance(item, dict)] if isinstance(payload, list) else []


def _save_raw_bindings(db: Session, bindings: list[dict[str, Any]]) -> None:
    value = json.dumps(bindings, ensure_ascii=False)
    config = db.query(SystemConfig).filter(SystemConfig.key == DATASET_BINDINGS_CONFIG_KEY).first()
    if config:
        config.value = value
        config.description = "AlphaTrace dataset bindings for Agent Lab and Data Catalog"
    else:
        db.add(
            SystemConfig(
                key=DATASET_BINDINGS_CONFIG_KEY,
                value=value,
                description="AlphaTrace dataset bindings for Agent Lab and Data Catalog",
            )
        )
    db.commit()


def _normalize_binding(raw: dict[str, Any]) -> DatasetBinding:
    dataset_id = str(raw.get("datasetId") or raw.get("dataset_id") or "").strip()
    asset_id = str(raw.get("assetId") or raw.get("asset_id") or "").strip()
    if not dataset_id:
        raise DatasetBindingError("datasetId is required")
    if not asset_id:
        raise DatasetBindingError("assetId is required")
    if not _SAFE_ID_RE.match(dataset_id):
        raise DatasetBindingError("datasetId contains unsupported characters")
    if not _SAFE_ID_RE.match(asset_id):
        raise DatasetBindingError("assetId contains unsupported characters")

    name = str(raw.get("name") or "").strip() or f"{asset_id} dataset"
    binding_id = str(raw.get("bindingId") or raw.get("binding_id") or "").strip()
    if not binding_id:
        binding_id = f"binding_{_slug(asset_id)}_{_slug(dataset_id)}"
    if not _SAFE_ID_RE.match(binding_id):
        raise DatasetBindingError("bindingId contains unsupported characters")

    created_at = str(raw.get("createdAt") or raw.get("created_at") or _now())
    updated_at = str(raw.get("updatedAt") or raw.get("updated_at") or created_at)
    primary_metrics = raw.get("primaryMetrics") if isinstance(raw.get("primaryMetrics"), list) else DEFAULT_PRIMARY_METRICS
    agent_runners = raw.get("agentRunners") if isinstance(raw.get("agentRunners"), list) else DEFAULT_AGENT_RUNNERS
    return DatasetBinding(
        bindingId=binding_id,
        name=name,
        datasetId=dataset_id,
        tableName=str(raw.get("tableName") or "alpha_trace.etf_index_valuation_daily").strip(),
        assetId=asset_id,
        assetSymbol=str(raw.get("assetSymbol") or "").strip(),
        assetName=str(raw.get("assetName") or "").strip(),
        dataSymbol=str(raw.get("dataSymbol") or raw.get("assetSymbol") or "").strip(),
        dateField=str(raw.get("dateField") or "trade_date").strip(),
        primaryMetrics=[str(item).strip() for item in primary_metrics if str(item).strip()],
        agentRunners=[str(item).strip() for item in agent_runners if str(item).strip()],
        isDefault=bool(raw.get("isDefault", True)),
        status=str(raw.get("status") or "ACTIVE").strip().upper(),
        createdAt=created_at,
        updatedAt=updated_at,
    )


def list_dataset_bindings(
    db: Optional[Session] = None,
    *,
    asset_id: Optional[str] = None,
    dataset_id: Optional[str] = None,
    active_only: bool = False,
) -> list[DatasetBinding]:
    if _use_mysql_store():
        bindings: list[DatasetBinding] = []
        for item in _load_raw_bindings_mysql():
            try:
                binding = _normalize_binding(item)
            except DatasetBindingError:
                continue
            if asset_id and binding.assetId != asset_id:
                continue
            if dataset_id and binding.datasetId != dataset_id:
                continue
            if active_only and binding.status != "ACTIVE":
                continue
            bindings.append(binding)
        bindings.sort(key=lambda item: (not item.isDefault, item.assetId, item.name))
        return bindings

    owns_session = db is None
    session = db or SessionLocal()
    try:
        bindings: list[DatasetBinding] = []
        for item in _load_raw_bindings(session):
            try:
                binding = _normalize_binding(item)
            except DatasetBindingError:
                continue
            if asset_id and binding.assetId != asset_id:
                continue
            if dataset_id and binding.datasetId != dataset_id:
                continue
            if active_only and binding.status != "ACTIVE":
                continue
            bindings.append(binding)
        bindings.sort(key=lambda item: (not item.isDefault, item.assetId, item.name))
        return bindings
    finally:
        if owns_session:
            session.close()


def save_dataset_binding(payload: DatasetBindingRequest, db: Optional[Session] = None) -> DatasetBinding:
    if _use_mysql_store():
        now = _now()
        incoming = _normalize_binding(
            {
                **payload.model_dump(mode="json"),
                "bindingId": payload.bindingId or f"binding_{_slug(payload.assetId)}_{_slug(payload.datasetId)}",
                "createdAt": now,
                "updatedAt": now,
            }
        )
        normalized_existing: list[DatasetBinding] = []
        for item in _load_raw_bindings_mysql():
            try:
                normalized_existing.append(_normalize_binding(item))
            except DatasetBindingError:
                continue

        previous = next((item for item in normalized_existing if item.bindingId == incoming.bindingId), None)
        if previous:
            incoming = incoming.model_copy(update={"createdAt": previous.createdAt, "updatedAt": now})

        next_bindings: list[DatasetBinding] = []
        for item in normalized_existing:
            if item.bindingId == incoming.bindingId:
                continue
            if incoming.isDefault and item.assetId == incoming.assetId:
                item = item.model_copy(update={"isDefault": False, "updatedAt": now})
            next_bindings.append(item)
        next_bindings.append(incoming)
        _save_raw_bindings_mysql([item.model_dump(mode="json") for item in next_bindings])
        return incoming

    owns_session = db is None
    session = db or SessionLocal()
    try:
        now = _now()
        incoming = _normalize_binding(
            {
                **payload.model_dump(mode="json"),
                "bindingId": payload.bindingId or f"binding_{_slug(payload.assetId)}_{_slug(payload.datasetId)}",
                "createdAt": now,
                "updatedAt": now,
            }
        )
        raw_existing = _load_raw_bindings(session)
        normalized_existing: list[DatasetBinding] = []
        for item in raw_existing:
            try:
                normalized_existing.append(_normalize_binding(item))
            except DatasetBindingError:
                continue

        previous = next((item for item in normalized_existing if item.bindingId == incoming.bindingId), None)
        if previous:
            incoming = incoming.model_copy(update={"createdAt": previous.createdAt, "updatedAt": now})

        next_bindings: list[DatasetBinding] = []
        for item in normalized_existing:
            if item.bindingId == incoming.bindingId:
                continue
            if incoming.isDefault and item.assetId == incoming.assetId:
                item = item.model_copy(update={"isDefault": False, "updatedAt": now})
            next_bindings.append(item)
        next_bindings.append(incoming)
        _save_raw_bindings(session, [item.model_dump(mode="json") for item in next_bindings])
        return incoming
    finally:
        if owns_session:
            session.close()


def delete_dataset_binding(binding_id: str, db: Optional[Session] = None) -> list[DatasetBinding]:
    if _use_mysql_store():
        remaining = [item for item in list_dataset_bindings() if item.bindingId != binding_id]
        _save_raw_bindings_mysql([item.model_dump(mode="json") for item in remaining])
        return remaining

    owns_session = db is None
    session = db or SessionLocal()
    try:
        remaining = [item for item in list_dataset_bindings(session) if item.bindingId != binding_id]
        _save_raw_bindings(session, [item.model_dump(mode="json") for item in remaining])
        return remaining
    finally:
        if owns_session:
            session.close()


def get_default_dataset_binding_for_asset(asset_id: str) -> Optional[DatasetBinding]:
    if not asset_id:
        return None
    bindings = list_dataset_bindings(asset_id=asset_id, active_only=True)
    if not bindings:
        return None
    return next((item for item in bindings if item.isDefault), bindings[0])


__all__ = [
    "DatasetBindingError",
    "delete_dataset_binding",
    "get_default_dataset_binding_for_asset",
    "list_dataset_bindings",
    "save_dataset_binding",
]
