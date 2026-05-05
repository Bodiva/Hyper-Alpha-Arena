from __future__ import annotations

import os
from typing import Any, Dict, Optional

import requests

from .schemas import BochaSearchConfig, BochaSearchError, BochaSearchResponse, BochaWebPage

BOCHA_DEFAULT_BASE_URL = "https://api.bocha.cn"
BOCHA_DEFAULT_SEARCH_ENDPOINT = "/v1/web-search"


class BochaSearchClient:
    def __init__(self, config: Optional[BochaSearchConfig] = None) -> None:
        self.config = config or self.from_env_config()

    @staticmethod
    def from_env_config() -> Optional[BochaSearchConfig]:
        api_key = os.getenv("BOCHA_API_KEY")
        if not api_key:
            return None
        return BochaSearchConfig(
            api_key=api_key,
            base_url=(os.getenv("BOCHA_BASE_URL") or BOCHA_DEFAULT_BASE_URL).rstrip("/"),
            search_endpoint=os.getenv("BOCHA_SEARCH_ENDPOINT") or BOCHA_DEFAULT_SEARCH_ENDPOINT,
            timeout_seconds=_int_env("BOCHA_TIMEOUT_SECONDS", 10, minimum=3, maximum=60),
        )

    def is_enabled(self) -> bool:
        return self.config is not None and bool(self.config.api_key)

    def search(
        self,
        query: str,
        count: int = 5,
        freshness: str = "noLimit",
        summary: bool = True,
    ) -> BochaSearchResponse:
        if not self.config:
            raise BochaSearchError("BOCHA_API_KEY is not configured.")
        if not query.strip():
            raise BochaSearchError("Bocha search query is empty.")

        url = self._resolve_url(self.config.base_url, self.config.search_endpoint)
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "query": query,
            "freshness": freshness,
            "summary": summary,
            "count": max(1, min(count, 50)),
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=self.config.timeout_seconds)
        except requests.exceptions.Timeout as exc:
            raise BochaSearchError(f"Bocha search request timed out after {self.config.timeout_seconds}s") from exc
        except requests.exceptions.RequestException as exc:
            raise BochaSearchError(f"Bocha search request failed: {exc}") from exc

        if response.status_code != 200:
            raise BochaSearchError(f"Bocha search HTTP {response.status_code}: {response.text[:500]}")

        try:
            body: Dict[str, Any] = response.json()
        except ValueError as exc:
            raise BochaSearchError("Bocha search returned non-JSON response.") from exc

        if str(body.get("code")) != "200":
            message = body.get("message") or body.get("msg") or "unknown error"
            raise BochaSearchError(f"Bocha search API error {body.get('code')}: {message}")

        data = body.get("data") or {}
        web_pages = data.get("webPages") or {}
        values = web_pages.get("value") or []
        pages = [_map_web_page(item) for item in values if isinstance(item, dict)]
        original_query = ((data.get("queryContext") or {}).get("originalQuery") or query)
        return BochaSearchResponse(
            query=str(original_query),
            total_estimated_matches=int(web_pages.get("totalEstimatedMatches") or 0),
            web_pages=pages,
            log_id=body.get("log_id"),
        )

    @staticmethod
    def _resolve_url(base_url: str, endpoint: str) -> str:
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint
        return f"{base_url}{endpoint if endpoint.startswith('/') else '/' + endpoint}"


def _map_web_page(item: Dict[str, Any]) -> BochaWebPage:
    return BochaWebPage(
        name=str(item.get("name") or "Untitled Bocha result"),
        url=str(item.get("url") or item.get("displayUrl") or "#"),
        display_url=str(item.get("displayUrl") or item.get("url") or "#"),
        snippet=str(item.get("snippet") or ""),
        summary=str(item.get("summary") or item.get("snippet") or ""),
        site_name=str(item.get("siteName") or "Bocha Web Search"),
        site_icon=item.get("siteIcon"),
        date_published=item.get("datePublished") or item.get("dateLastCrawled"),
        date_last_crawled=item.get("dateLastCrawled"),
        raw=item,
    )


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))
