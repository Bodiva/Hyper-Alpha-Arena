from __future__ import annotations

import hashlib
from datetime import datetime
from typing import List, Optional

from services.evidence_retrieval.static_evidence_seed import EvidenceItem

from .schemas import BochaSearchResponse, BochaWebPage


def bocha_response_to_evidence_items(
    response: BochaSearchResponse,
    asset_id: Optional[str],
    task_type: str,
    limit: int = 5,
) -> List[EvidenceItem]:
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    related_assets = [asset_id] if asset_id else []
    return [
        _page_to_evidence_item(page, response.query, related_assets, task_type, index, now)
        for index, page in enumerate(response.web_pages[: max(1, limit)], start=1)
    ]


def _page_to_evidence_item(
    page: BochaWebPage,
    query: str,
    related_assets: List[str],
    task_type: str,
    index: int,
    collected_at: str,
) -> EvidenceItem:
    stable = hashlib.sha1(f"{page.url}|{page.name}".encode("utf-8")).hexdigest()[:14]
    summary = page.summary or page.snippet or page.name
    published_at = _normalize_published_at(page.date_published) or collected_at
    return EvidenceItem(
        evidenceId=f"ev_bocha_{stable}",
        title=page.name,
        sourceName=page.site_name or "Bocha Web Search",
        sourceType="bocha_search",
        evidenceType="external_search",
        relatedAssetIds=related_assets,
        publishedAt=published_at,
        qualityScore=max(50, 82 - min(index, 10)),
        reliabilityScore=max(50, 78 - min(index, 10)),
        summary=summary[:1200],
        url=page.url,
        extractedFields={
            "query": query,
            "displayUrl": page.display_url,
            "siteIcon": page.site_icon,
            "dateLastCrawled": page.date_last_crawled,
            "collectedAt": collected_at,
            "taskType": task_type,
            "sourceType": "bocha_search",
        },
    )


def _normalize_published_at(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if value.endswith("Z"):
        return value[:-1] + "+08:00"
    return value
