from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, List, Optional
from urllib.parse import urljoin

import requests

from services.evidence_retrieval.static_evidence_seed import EvidenceItem


BOCHA_DEFAULT_BASE_URL = "https://api.bocha.cn"
BOCHA_DEFAULT_SEARCH_ENDPOINT = "/v1/web-search"


@dataclass(frozen=True)
class ExternalSearchResult:
    status: str
    query: str
    items: List[EvidenceItem] = field(default_factory=list)
    message: Optional[str] = None
    source: str = "bocha_search"


class ExternalEvidenceSearch:
    """Optional external evidence retrieval via Bocha Web Search.

    This module is kept under services so Docker dev mounts can pick it up without
    rebuilding the image. Missing credentials and provider errors are non-fatal;
    callers should continue with static evidence fallback.
    """

    def search(self, asset_id: str | None, question: str, task_type: str, limit: int = 5) -> ExternalSearchResult:
        query = self._build_query(asset_id, question, task_type)
        api_key = self._read_bocha_api_key()
        if not api_key:
            return ExternalSearchResult(status="disabled", query=query, message="BOCHA_API_KEY is not configured or saved in backend settings.")

        try:
            payload = {
                "query": query,
                "freshness": "noLimit",
                "summary": True,
                "count": max(1, min(int(limit or 5), 50)),
            }
            response = requests.post(
                self._search_url(),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                timeout=self._timeout_seconds(),
            )
            if response.status_code != 200:
                return ExternalSearchResult(
                    status="failed",
                    query=query,
                    message=f"Bocha search failed with HTTP {response.status_code}: {response.text[:240]}",
                )
            body = response.json()
            if str(body.get("code")) != "200":
                return ExternalSearchResult(
                    status="failed",
                    query=query,
                    message=f"Bocha search failed: {body.get('message') or body.get('msg') or body.get('code')}",
                )
            items = self._map_response_to_evidence(body, asset_id=asset_id, task_type=task_type, limit=limit)
            return ExternalSearchResult(
                status="completed",
                query=query,
                items=items,
                message=f"Retrieved {len(items)} Bocha evidence item(s).",
            )
        except requests.Timeout:
            return ExternalSearchResult(status="failed", query=query, message="Bocha search request timed out.")
        except Exception as exc:  # noqa: BLE001 - external provider failures must not fail the run.
            return ExternalSearchResult(status="failed", query=query, message=f"Bocha search failed: {exc}")


    @staticmethod
    def _read_bocha_api_key() -> str | None:
        env_key = os.getenv("BOCHA_API_KEY")
        if env_key:
            return env_key
        try:
            from services.system_config_store import get_mysql_system_config_store

            return get_mysql_system_config_store().get_tool_api_key("bocha")
        except Exception:
            return None

    @staticmethod
    def _build_query(asset_id: str | None, question: str, task_type: str) -> str:
        context_terms = {
            "single_asset_analysis": "ETF 基金 期货 投研 证据 风险",
            "portfolio_diagnosis": "组合 资产配置 风险暴露 调仓建议 投研证据",
            "portfolio_diagnostic": "组合 资产配置 风险暴露 调仓建议 投研证据",
            "rebalance_suggestion": "调仓建议 组合 风险 资产配置",
            "dashboard_market_overview": "财经新闻 市场收评 A股 美股 港股 新浪财经 东方财富 财联社 证券时报",
        }
        suffix = context_terms.get(task_type, "ETF 基金 期货 投研 证据")
        parts = [question.strip(), ExternalEvidenceSearch._asset_search_terms(asset_id), suffix]
        return " ".join(part for part in parts if part).strip()

    @staticmethod
    def _asset_search_terms(asset_id: str | None) -> str:
        if not asset_id:
            return ""
        try:
            from services.asset_store.asset_store import get_static_asset_store

            asset = get_static_asset_store().get_asset(asset_id)
        except Exception:
            asset = None
        if not asset:
            return asset_id
        profile = asset.profile if isinstance(asset.profile, dict) else {}
        terms = [asset.name, asset.symbol, *asset.aliases]
        tracking_index = str(profile.get("trackingIndex") or "")
        if tracking_index:
            terms.append(tracking_index)
        return " ".join(str(term) for term in terms if term)

    @staticmethod
    def _search_url() -> str:
        base_url = os.getenv("BOCHA_BASE_URL", BOCHA_DEFAULT_BASE_URL).rstrip("/") + "/"
        endpoint = os.getenv("BOCHA_SEARCH_ENDPOINT", BOCHA_DEFAULT_SEARCH_ENDPOINT).lstrip("/")
        return urljoin(base_url, endpoint)

    @staticmethod
    def _timeout_seconds() -> int:
        try:
            return max(3, min(int(os.getenv("BOCHA_TIMEOUT_SECONDS", "10")), 60))
        except ValueError:
            return 10

    @staticmethod
    def _map_response_to_evidence(
        body: dict[str, Any],
        asset_id: str | None,
        task_type: str,
        limit: int,
    ) -> list[EvidenceItem]:
        pages = (((body.get("data") or {}).get("webPages") or {}).get("value") or [])[: max(1, limit)]
        collected_at = datetime.now(timezone.utc).isoformat()
        items: list[EvidenceItem] = []
        for index, page in enumerate(pages):
            url = str(page.get("url") or page.get("displayUrl") or "")
            title = str(page.get("name") or page.get("displayUrl") or "Bocha search result")
            evidence_id = "ev_bocha_" + hashlib.sha1(f"{url}|{title}".encode("utf-8")).hexdigest()[:14]
            published_at = page.get("datePublished") or page.get("dateLastCrawled") or collected_at
            if isinstance(published_at, str) and published_at.endswith("Z"):
                published_at = published_at[:-1] + "+08:00"
            summary = page.get("summary") or page.get("snippet") or title
            items.append(
                EvidenceItem(
                    evidenceId=evidence_id,
                    title=title,
                    sourceName=page.get("siteName") or "Bocha Web Search",
                    sourceType="bocha_search",
                    evidenceType="external_search",
                    relatedAssetIds=[asset_id] if asset_id else [],
                    publishedAt=str(published_at),
                    qualityScore=max(55, 82 - index * 3),
                    reliabilityScore=max(50, 78 - index * 2),
                    summary=str(summary),
                    url=url or None,
                    extractedFields={
                        "query": ((body.get("data") or {}).get("queryContext") or {}).get("originalQuery"),
                        "displayUrl": page.get("displayUrl"),
                        "siteIcon": page.get("siteIcon"),
                        "dateLastCrawled": page.get("dateLastCrawled"),
                        "collectedAt": collected_at,
                        "taskType": task_type,
                        "sourceType": "bocha_search",
                    },
                )
            )
        return items
