from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import JSON, Column, MetaData, String, Table, Text, create_engine, insert, select, update
from sqlalchemy.engine import Engine

from services.domain_store.mysql_domain_store import get_mysql_domain_database_url
from services.agent_runtime_store.mysql_store import _json_payload
from utils.encryption import decrypt_private_key, encrypt_private_key


LLM_CONFIG_KEY = "llm:default"
TOOL_CONFIG_PREFIX = "tool:"


class MysqlSystemConfigStore:
    """MySQL-backed AlphaTrace system configuration store.

    Secrets are stored encrypted with the existing backend Fernet key. Public
    API responses must only expose availability flags, never decrypted values.
    """

    def __init__(self, database_url: Optional[str] = None) -> None:
        self.database_url = database_url or get_mysql_domain_database_url()
        self.engine: Engine = create_engine(
            self.database_url,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args={"connect_timeout": 2, "read_timeout": 2, "write_timeout": 2},
        )
        self.metadata = MetaData()
        self.configs = Table(
            "alpha_trace_system_configs",
            self.metadata,
            Column("config_key", String(160), primary_key=True),
            Column("config_type", String(64), nullable=False, index=True),
            Column("provider", String(128), nullable=True, index=True),
            Column("model", String(160), nullable=True),
            Column("base_url", String(512), nullable=True),
            Column("enabled", String(16), nullable=True, index=True),
            Column("secret_encrypted", Text, nullable=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.metadata.create_all(self.engine)

    def get_llm_config(self) -> Dict[str, Any]:
        row = self._get_payload(LLM_CONFIG_KEY)
        if not row:
            return {"configured": False}
        payload = row["payload"]
        secret = self._decrypt_secret(row.get("secret_encrypted"))
        return {
            "configured": bool(payload.get("provider")),
            "provider": payload.get("provider"),
            "model": payload.get("model"),
            "base_url": payload.get("base_url"),
            "api_key": secret,
            "api_key_available": bool(secret),
            "source": "mysql_system_config",
        }

    def save_llm_config(
        self,
        provider: str,
        api_key: str,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        payload = {
            "provider": provider,
            "model": model,
            "base_url": base_url,
            "api_key_available": bool(api_key),
        }
        self._upsert_config(
            config_key=LLM_CONFIG_KEY,
            config_type="llm",
            provider=provider,
            model=model,
            base_url=base_url,
            enabled=True,
            secret=api_key,
            payload=payload,
        )

    def get_tool_configs(self) -> Dict[str, Dict[str, Any]]:
        with self.engine.begin() as conn:
            rows = conn.execute(
                select(
                    self.configs.c.config_key,
                    self.configs.c.enabled,
                    self.configs.c.secret_encrypted,
                    self.configs.c.payload_json,
                ).where(self.configs.c.config_type == "external_tool")
            ).fetchall()
        configs: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            key = str(row.config_key)
            if not key.startswith(TOOL_CONFIG_PREFIX):
                continue
            tool_name = key[len(TOOL_CONFIG_PREFIX):]
            payload = _json_payload(row.payload_json) or {}
            configs[tool_name] = {
                **payload,
                "enabled": row.enabled == "true",
                "api_key_encrypted": row.secret_encrypted,
                "source": "mysql_system_config",
            }
        return configs

    def get_tool_api_key(self, tool_name: str) -> Optional[str]:
        row = self._get_payload(f"{TOOL_CONFIG_PREFIX}{tool_name}")
        if not row:
            return None
        return self._decrypt_secret(row.get("secret_encrypted"))

    def set_tool_api_key(self, tool_name: str, api_key: str) -> None:
        self._upsert_config(
            config_key=f"{TOOL_CONFIG_PREFIX}{tool_name}",
            config_type="external_tool",
            provider=tool_name,
            model=None,
            base_url=None,
            enabled=True,
            secret=api_key,
            payload={"enabled": True, "api_key_available": bool(api_key)},
        )

    def remove_tool_config(self, tool_name: str) -> None:
        config_key = f"{TOOL_CONFIG_PREFIX}{tool_name}"
        with self.engine.begin() as conn:
            existing = conn.execute(select(self.configs.c.config_key).where(self.configs.c.config_key == config_key)).first()
            if not existing:
                return
            payload = {"enabled": False, "api_key_available": False}
            conn.execute(
                update(self.configs)
                .where(self.configs.c.config_key == config_key)
                .values(enabled="false", secret_encrypted=None, payload_json=payload, updated_at=self._now())
            )

    def _get_payload(self, config_key: str) -> Optional[Dict[str, Any]]:
        with self.engine.begin() as conn:
            row = conn.execute(
                select(self.configs.c.payload_json, self.configs.c.secret_encrypted).where(self.configs.c.config_key == config_key)
            ).first()
        if not row:
            return None
        return {"payload": _json_payload(row.payload_json) or {}, "secret_encrypted": row.secret_encrypted}

    def _upsert_config(
        self,
        *,
        config_key: str,
        config_type: str,
        provider: Optional[str],
        model: Optional[str],
        base_url: Optional[str],
        enabled: bool,
        secret: Optional[str],
        payload: Dict[str, Any],
    ) -> None:
        now = self._now()
        values = {
            "config_type": config_type,
            "provider": provider,
            "model": model,
            "base_url": base_url,
            "enabled": "true" if enabled else "false",
            "secret_encrypted": encrypt_private_key(secret) if secret else None,
            "updated_at": now,
            "payload_json": payload,
        }
        with self.engine.begin() as conn:
            existing = conn.execute(select(self.configs.c.config_key).where(self.configs.c.config_key == config_key)).first()
            if existing:
                conn.execute(update(self.configs).where(self.configs.c.config_key == config_key).values(**values))
            else:
                conn.execute(insert(self.configs).values(config_key=config_key, **values))

    @staticmethod
    def _decrypt_secret(secret_encrypted: Optional[str]) -> Optional[str]:
        if not secret_encrypted:
            return None
        try:
            return decrypt_private_key(secret_encrypted)
        except Exception:
            return None

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()


_SYSTEM_CONFIG_STORE: Optional[MysqlSystemConfigStore] = None


def get_mysql_system_config_store() -> MysqlSystemConfigStore:
    global _SYSTEM_CONFIG_STORE
    if _SYSTEM_CONFIG_STORE is None:
        _SYSTEM_CONFIG_STORE = MysqlSystemConfigStore()
    return _SYSTEM_CONFIG_STORE
