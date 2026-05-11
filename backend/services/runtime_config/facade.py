from __future__ import annotations

import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional


@dataclass(frozen=True)
class RuntimeConfigStatus:
    name: str
    status: str
    configured: bool
    available: bool
    source: str
    message: str
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RuntimeConfigFacade:
    """Sanitized runtime configuration resolver for AlphaTrace integrations.

    This class centralizes readiness/status checks for model providers, search
    providers, and optional runner dependencies. It never returns raw secrets.
    """

    def __init__(self, project_root: Optional[Path] = None) -> None:
        self.project_root = project_root or Path(__file__).resolve().parents[3]

    def qwen(self, db: Any = None) -> RuntimeConfigStatus:
        env_source = self._first_env_key_source(("DASHSCOPE_API_KEY", "QWEN_API_KEY"))
        if env_source:
            return RuntimeConfigStatus(
                name="qwen",
                status="ready",
                configured=True,
                available=True,
                source=env_source,
                message="Qwen/DashScope API key is configured in backend environment.",
                metadata={"provider": "qwen", "baseUrlConfigured": bool(os.getenv("QWEN_BASE_URL")), "model": os.getenv("QWEN_MODEL")},
            )

        profile_status = self._qwen_from_hyper_ai_profile(db)
        if profile_status:
            return profile_status

        mysql_status = self._qwen_from_mysql_system_config()
        if mysql_status:
            return mysql_status

        return RuntimeConfigStatus(
            name="qwen",
            status="missing_qwen_key",
            configured=False,
            available=False,
            source="missing",
            message="Qwen runner requires a backend Qwen API key. Save Qwen API Key in Settings or set DASHSCOPE_API_KEY on the backend.",
            metadata={},
        )

    def bocha(self) -> RuntimeConfigStatus:
        env_source = self._first_env_key_source(("BOCHA_API_KEY",))
        if env_source:
            return RuntimeConfigStatus(
                name="bocha",
                status="ready",
                configured=True,
                available=True,
                source=env_source,
                message="Bocha API key is configured in backend environment.",
                metadata={"baseUrlConfigured": bool(os.getenv("BOCHA_BASE_URL")), "endpointConfigured": bool(os.getenv("BOCHA_SEARCH_ENDPOINT"))},
            )
        try:
            from services.system_config_store import get_mysql_system_config_store

            key = get_mysql_system_config_store().get_tool_api_key("bocha")
            if key:
                return RuntimeConfigStatus(
                    name="bocha",
                    status="ready",
                    configured=True,
                    available=True,
                    source="mysql_system_config",
                    message="Bocha API key is configured in MySQL system config.",
                    metadata={},
                )
        except Exception as exc:  # noqa: BLE001 - diagnostics should not fail startup.
            return RuntimeConfigStatus(
                name="bocha",
                status="config_store_error",
                configured=False,
                available=False,
                source="mysql_system_config",
                message=f"Bocha system config could not be checked: {exc}",
                metadata={},
            )
        return RuntimeConfigStatus(
            name="bocha",
            status="missing_config",
            configured=False,
            available=False,
            source="missing",
            message="Bocha API key is not configured; external evidence search is unavailable until another source is configured.",
            metadata={},
        )

    def tradingagents(self, qwen_status: Optional[RuntimeConfigStatus] = None) -> RuntimeConfigStatus:
        enabled = os.getenv("ALPHATRACE_TRADINGAGENTS_ENABLED", "").strip().lower() == "true"
        repo_path = os.getenv("TRADINGAGENTS_REPO_PATH", "").strip()
        repo_exists, resolved_repo_path = self._resolve_optional_repo_path(repo_path)
        metadata: dict[str, Any] = {
            "enabled": enabled,
            "repoPathConfigured": bool(repo_path),
            "repoPathExists": repo_exists if repo_path else None,
            "repoPath": resolved_repo_path if repo_path else None,
        }
        if not enabled:
            return RuntimeConfigStatus(
                name="tradingagents",
                status="disabled",
                configured=False,
                available=False,
                source="environment",
                message="TradingAgents PoC is disabled. Set ALPHATRACE_TRADINGAGENTS_ENABLED=true to enable local PoC.",
                metadata=metadata,
            )

        importable, import_error = self._check_tradingagents_import(repo_path)
        metadata.update({"importable": importable, "importError": import_error or None})
        if not importable:
            return RuntimeConfigStatus(
                name="tradingagents",
                status="import_error",
                configured=True,
                available=False,
                source="environment",
                message=f"TradingAgents package is not importable: {import_error}",
                metadata=metadata,
            )

        qwen_status = qwen_status or self.qwen()
        metadata.update({"qwenKeyConfigured": qwen_status.configured, "qwenConfigSource": qwen_status.source})
        if not qwen_status.available:
            return RuntimeConfigStatus(
                name="tradingagents",
                status="missing_qwen_key",
                configured=True,
                available=False,
                source="environment",
                message="TradingAgents PoC requires Qwen API key via Settings, MySQL system config, or DASHSCOPE_API_KEY.",
                metadata=metadata,
            )

        return RuntimeConfigStatus(
            name="tradingagents",
            status="ready",
            configured=True,
            available=True,
            source="environment",
            message="TradingAgents PoC is enabled and importable; Qwen key is available.",
            metadata=metadata,
        )

    def langalpha(self) -> RuntimeConfigStatus:
        enabled = os.getenv("ALPHATRACE_LANGALPHA_ENABLED", "").strip().lower() == "true"
        return RuntimeConfigStatus(
            name="langalpha",
            status="design_only" if enabled else "disabled",
            configured=enabled,
            available=False,
            source="environment",
            message="LangAlpha adapter is design-only in this phase and does not run tasks.",
            metadata={"enabled": enabled},
        )

    def snapshot(self, db: Any = None) -> dict[str, Any]:
        qwen = self.qwen(db)
        return {
            "qwen": qwen.to_dict(),
            "bocha": self.bocha().to_dict(),
            "tradingagents": self.tradingagents(qwen).to_dict(),
            "langalpha": self.langalpha().to_dict(),
        }

    @staticmethod
    def _first_env_key_source(names: tuple[str, ...]) -> str:
        for name in names:
            if os.getenv(name):
                return "environment"
        return ""

    @staticmethod
    def _qwen_config_matches(config: dict[str, Any]) -> bool:
        provider = str(config.get("provider") or "").lower()
        base_url = str(config.get("base_url") or "")
        model = str(config.get("model") or "")
        return provider == "qwen" or (
            provider == "custom" and ("dashscope.aliyuncs.com" in base_url.lower() or model.lower().startswith("qwen"))
        )

    def _qwen_from_hyper_ai_profile(self, db: Any = None) -> Optional[RuntimeConfigStatus]:
        if db is None:
            return None
        try:
            from services.hyper_ai_service import get_llm_config

            config = get_llm_config(db)
            if bool(config.get("api_key")) and self._qwen_config_matches(config):
                return RuntimeConfigStatus(
                    name="qwen",
                    status="ready",
                    configured=True,
                    available=True,
                    source=str(config.get("source") or "legacy_hyper_ai_profile"),
                    message="Qwen API key is available from Hyper AI profile.",
                    metadata={
                        "provider": config.get("provider"),
                        "model": config.get("model"),
                        "baseUrlConfigured": bool(config.get("base_url")),
                    },
                )
        except Exception:
            return None
        return None

    def _qwen_from_mysql_system_config(self) -> Optional[RuntimeConfigStatus]:
        try:
            from services.system_config_store import get_mysql_system_config_store

            config = get_mysql_system_config_store().get_llm_config()
            if bool(config.get("api_key_available")) and self._qwen_config_matches(config):
                return RuntimeConfigStatus(
                    name="qwen",
                    status="ready",
                    configured=True,
                    available=True,
                    source=str(config.get("source") or "mysql_system_config"),
                    message="Qwen API key is available from MySQL system config.",
                    metadata={
                        "provider": config.get("provider"),
                        "model": config.get("model"),
                        "baseUrlConfigured": bool(config.get("base_url")),
                    },
                )
        except Exception:
            return None
        return None

    def _resolve_optional_repo_path(self, raw_path: str) -> tuple[bool, str]:
        if not raw_path:
            return False, ""
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = (self.project_root / raw_path).resolve()
        return candidate.exists(), str(candidate)

    def _check_tradingagents_import(self, raw_path: str) -> tuple[bool, str]:
        repo_exists, resolved_path = self._resolve_optional_repo_path(raw_path)
        if raw_path and not repo_exists:
            return False, f"TradingAgents repo path does not exist: {resolved_path}"

        inserted_path = False
        if resolved_path and resolved_path not in sys.path:
            sys.path.insert(0, resolved_path)
            inserted_path = True
        try:
            from tradingagents.default_config import DEFAULT_CONFIG  # noqa: F401
            from tradingagents.graph.trading_graph import TradingAgentsGraph  # noqa: F401
            return True, ""
        except Exception as exc:  # pragma: no cover - depends on optional local TradingAgents env.
            return False, str(exc)
        finally:
            if inserted_path:
                try:
                    sys.path.remove(resolved_path)
                except ValueError:
                    pass


def get_runtime_config_facade() -> RuntimeConfigFacade:
    return RuntimeConfigFacade()
