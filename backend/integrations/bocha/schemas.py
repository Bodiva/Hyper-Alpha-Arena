from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class BochaWebPage:
    name: str
    url: str
    display_url: str
    snippet: str
    summary: str
    site_name: str
    site_icon: Optional[str]
    date_published: Optional[str]
    date_last_crawled: Optional[str]
    raw: Dict[str, Any]


@dataclass(frozen=True)
class BochaSearchResponse:
    query: str
    total_estimated_matches: int
    web_pages: List[BochaWebPage]
    log_id: Optional[str] = None


@dataclass(frozen=True)
class BochaSearchConfig:
    api_key: str
    base_url: str
    search_endpoint: str
    timeout_seconds: int = 10


class BochaSearchError(Exception):
    pass
