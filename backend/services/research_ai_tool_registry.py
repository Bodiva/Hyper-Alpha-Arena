"""
Research AI External Tool Registry

Generic registry for external tools that require user-provided API keys.
To add a new tool, just add an entry to EXTERNAL_TOOL_REGISTRY and
implement validate_<tool_name> + execute_<tool_name> functions.
"""

import json
import logging
import re
import hashlib
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
    """Read legacy tool_configs JSON from ResearchAiProfile."""
    from database.models import ResearchAiProfile
    profile = db.query(ResearchAiProfile).first()
    if not profile or not profile.tool_configs:
        return {}
    try:
        return json.loads(profile.tool_configs)
    except (json.JSONDecodeError, TypeError):
        return {}


def get_tool_configs(db: Session) -> dict:
    """Read Research AI tool configs from MySQL system config, then legacy profile JSON."""
    configs = {}
    try:
        from services.system_config_store import get_mysql_system_config_store

        configs.update(get_mysql_system_config_store().get_tool_configs())
    except Exception as exc:
        logger.debug("MySQL tool config store unavailable: %s", exc)
    configs.update(_get_legacy_tool_configs(db))
    return configs


def get_custom_tool_registry(configs: dict) -> Dict[str, dict]:
    """Build frontend metadata for user-defined API tools stored in config JSON."""
    tools: Dict[str, dict] = {}
    for name, cfg in configs.items():
        if not isinstance(cfg, dict) or not cfg.get("custom"):
            continue
        display_name = str(cfg.get("display_name") or name).strip()
        display_name_zh = str(cfg.get("display_name_zh") or display_name).strip()
        api_url = str(cfg.get("api_url") or "").strip()
        tools[name] = {
            "display_name": display_name,
            "display_name_zh": display_name_zh,
            "description": str(cfg.get("description") or "User-defined external API."),
            "description_zh": str(cfg.get("description_zh") or "用户自定义外部 API。"),
            "icon": "wrench",
            "config_fields": [
                {
                    "key": "display_name",
                    "type": "text",
                    "label": "Name",
                    "label_zh": "名称",
                    "required": True,
                    "placeholder": display_name,
                    "default_value": display_name,
                },
                {
                    "key": "api_url",
                    "type": "text",
                    "label": "API URL",
                    "label_zh": "API 地址",
                    "required": True,
                    "placeholder": api_url or "https://api.example.com/v1/search",
                    "default_value": api_url,
                },
                {
                    "key": "api_key",
                    "type": "secret",
                    "label": "API Key",
                    "label_zh": "API 密钥",
                    "required": False,
                    "placeholder": "输入新密钥以更新",
                },
            ],
        }
    return tools


def save_tool_configs(db: Session, configs: dict):
    """Write tool_configs JSON to ResearchAiProfile."""
    from database.models import ResearchAiProfile
    profile = db.query(ResearchAiProfile).first()
    if not profile:
        profile = ResearchAiProfile()
        db.add(profile)
    profile.tool_configs = json.dumps(configs)
    db.commit()


def normalize_custom_tool_name(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_]+", "_", value.strip().lower()).strip("_")
    if not slug:
        slug = hashlib.sha1(value.strip().encode("utf-8")).hexdigest()[:10]
    return f"custom_{slug or 'api'}"


def get_tool_api_key(db: Session, tool_name: str) -> Optional[str]:
    """Get decrypted API key for a tool. Returns None if not configured."""
    try:
        from services.system_config_store import get_mysql_system_config_store

        api_key = get_mysql_system_config_store().get_tool_api_key(tool_name)
        if api_key:
            return api_key
    except Exception as exc:
        logger.debug("MySQL tool API key unavailable for %s: %s", tool_name, exc)

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


def set_custom_tool_config(
    db: Session,
    tool_name: str,
    *,
    display_name: str,
    api_url: str,
    api_key: Optional[str] = None,
):
    """Create or update a user-defined API tool."""
    from utils.encryption import encrypt_private_key

    configs = get_tool_configs(db)
    current = configs.get(tool_name, {}) if isinstance(configs.get(tool_name), dict) else {}
    current.update(
        {
            "custom": True,
            "display_name": display_name,
            "display_name_zh": display_name,
            "description": f"User-defined API endpoint: {api_url}",
            "description_zh": f"用户自定义 API：{api_url}",
            "api_url": api_url,
            "enabled": True,
            "source": "user_custom",
        }
    )
    if api_key:
        current["api_key_encrypted"] = encrypt_private_key(api_key)
    configs[tool_name] = current
    save_tool_configs(db, configs)


def remove_tool_config(db: Session, tool_name: str):
    """Remove configuration for a tool."""
    configs = get_tool_configs(db)
    if tool_name in configs:
        del configs[tool_name]
        save_tool_configs(db, configs)


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
