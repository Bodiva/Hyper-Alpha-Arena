"""
Hyper AI External Tool Registry

Generic registry for external tools that require user-provided API keys.
To add a new tool, just add an entry to EXTERNAL_TOOL_REGISTRY and
implement validate_<tool_name> + execute_<tool_name> functions.
"""

import json
import logging
from typing import Dict, Optional, Tuple

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# --- Tool Registry ---
# Each entry defines metadata + config schema for one external tool.
# Frontend reads this to dynamically render config UI.

EXTERNAL_TOOL_REGISTRY: Dict[str, dict] = {
    "bocha": {
        "display_name": "Bocha Web Search",
        "display_name_zh": "博查联网搜索",
        "description": "Search public web pages and map results into AlphaTrace evidence.",
        "description_zh": "搜索公开网页并映射为 AlphaTrace 证据。",
        "icon": "search",
        "config_fields": [
            {
                "key": "api_key",
                "type": "secret",
                "label": "API Key",
                "label_zh": "API 密钥",
                "required": True,
                "placeholder": "sk-...",
            },
        ],
        "get_url": "https://open.bocha.cn",
        "get_url_label": "Get API Key at open.bocha.cn",
        "get_url_label_zh": "在 open.bocha.cn 获取 API Key",
    },
    "tavily": {
        "display_name": "Tavily Web Search",
        "display_name_zh": "Tavily 联网搜索",
        "description": "Search the web for quant research, market news, and factor ideas.",
        "description_zh": "联网搜索量化研究、市场新闻和因子灵感。",
        "icon": "search",
        "config_fields": [
            {
                "key": "api_key",
                "type": "secret",
                "label": "API Key",
                "label_zh": "API 密钥",
                "required": True,
                "placeholder": "tvly-...",
            },
        ],
        "get_url": "https://tavily.com",
        "get_url_label": "Get API Key at tavily.com",
        "get_url_label_zh": "在 tavily.com 获取 API Key",
    },
}


# --- Config Helpers ---

def _get_legacy_tool_configs(db: Session) -> dict:
    """Read legacy tool_configs JSON from HyperAiProfile."""
    from database.models import HyperAiProfile
    profile = db.query(HyperAiProfile).first()
    if not profile or not profile.tool_configs:
        return {}
    try:
        return json.loads(profile.tool_configs)
    except (json.JSONDecodeError, TypeError):
        return {}


def get_tool_configs(db: Session) -> dict:
    """Read tool configs, preferring AlphaTrace MySQL config over legacy profile JSON."""
    configs = _get_legacy_tool_configs(db)
    try:
        from services.system_config_store import get_mysql_system_config_store

        mysql_configs = get_mysql_system_config_store().get_tool_configs()
        if mysql_configs:
            configs.update(mysql_configs)
    except Exception as exc:
        logger.warning("Failed to read AlphaTrace MySQL tool configs, falling back to legacy profile: %s", exc)
    return configs


def save_tool_configs(db: Session, configs: dict):
    """Write tool_configs JSON to HyperAiProfile."""
    from database.models import HyperAiProfile
    profile = db.query(HyperAiProfile).first()
    if not profile:
        profile = HyperAiProfile()
        db.add(profile)
    profile.tool_configs = json.dumps(configs)
    db.commit()


def get_tool_api_key(db: Session, tool_name: str) -> Optional[str]:
    """Get decrypted API key for a tool. Returns None if not configured."""
    try:
        from services.system_config_store import get_mysql_system_config_store

        api_key = get_mysql_system_config_store().get_tool_api_key(tool_name)
        if api_key:
            return api_key
    except Exception as exc:
        logger.warning("Failed to read AlphaTrace MySQL tool API key, falling back to legacy profile: %s", exc)

    from utils.encryption import decrypt_private_key
    configs = _get_legacy_tool_configs(db)
    tool_cfg = configs.get(tool_name, {})
    encrypted = tool_cfg.get("api_key_encrypted")
    if not encrypted:
        return None
    try:
        return decrypt_private_key(encrypted)
    except Exception:
        return None


def set_tool_api_key(db: Session, tool_name: str, api_key: str):
    """Encrypt and save API key for a tool."""
    from utils.encryption import encrypt_private_key
    configs = get_tool_configs(db)
    if tool_name not in configs:
        configs[tool_name] = {}
    configs[tool_name]["api_key_encrypted"] = encrypt_private_key(api_key)
    configs[tool_name]["enabled"] = True
    save_tool_configs(db, configs)
    try:
        from services.system_config_store import get_mysql_system_config_store

        get_mysql_system_config_store().set_tool_api_key(tool_name, api_key)
    except Exception as exc:
        logger.warning("Failed to persist AlphaTrace MySQL tool config; legacy profile was saved: %s", exc)


def remove_tool_config(db: Session, tool_name: str):
    """Remove configuration for a tool."""
    configs = get_tool_configs(db)
    if tool_name in configs:
        del configs[tool_name]
        save_tool_configs(db, configs)
    try:
        from services.system_config_store import get_mysql_system_config_store

        get_mysql_system_config_store().remove_tool_config(tool_name)
    except Exception as exc:
        logger.warning("Failed to remove AlphaTrace MySQL tool config; legacy profile was updated if present: %s", exc)


# --- Validation Functions ---

async def validate_tavily(api_key: str) -> Tuple[bool, str]:
    """Validate Tavily API key by making a test search."""
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        client.search("test", max_results=1)
        return True, ""
    except Exception as e:
        err = str(e)
        if "401" in err or "Unauthorized" in err or "Invalid" in err:
            return False, "Invalid API key"
        return False, f"Validation failed: {err}"



async def validate_bocha(api_key: str) -> Tuple[bool, str]:
    """Validate Bocha API key with a minimal web-search request."""
    try:
        import os
        import requests

        base_url = os.getenv("BOCHA_BASE_URL", "https://api.bocha.cn").rstrip("/")
        endpoint = os.getenv("BOCHA_SEARCH_ENDPOINT", "/v1/web-search")
        url = f"{base_url}/{endpoint.lstrip('/')}"
        response = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"query": "AlphaTrace API key validation", "summary": False, "count": 1, "freshness": "noLimit"},
            timeout=10,
        )
        if response.status_code == 200:
            body = response.json()
            if str(body.get("code")) == "200":
                return True, ""
            return False, str(body.get("message") or body.get("msg") or body.get("code"))
        if response.status_code in (401, 403):
            return False, "Invalid Bocha API key or insufficient account balance"
        return False, f"Bocha validation failed with HTTP {response.status_code}: {response.text[:160]}"
    except Exception as e:
        return False, f"Validation failed: {str(e)[:180]}"


# Map tool_name -> validation function
TOOL_VALIDATORS = {
    "bocha": validate_bocha,
    "tavily": validate_tavily,
}
