from __future__ import annotations

from functools import lru_cache
from typing import Iterable, List, Optional

from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem, AlphaTraceExtractedField
from services.domain_store import get_domain_store_type, get_mysql_domain_store
from services.evidence_retrieval.retriever import EvidenceRetriever
from services.evidence_retrieval.static_evidence_seed import (
    EvidenceItem,
    get_static_evidence_seed,
    is_static_seed_evidence_id,
    static_evidence_seed_enabled,
)


def _is_static_seed_api_item(item: AlphaTraceEvidenceItem) -> bool:
    metadata = item.metadata or {}
    return bool(metadata.get("staticSeed")) or is_static_seed_evidence_id(item.evidenceId)


class StaticEvidenceStore:
    """Read-only Evidence Store backed by the AlphaTrace static seed."""

    def __init__(self, seed: Iterable[EvidenceItem] | None = None) -> None:
        self._seed = list(seed or get_static_evidence_seed())
        self._by_id = {item.evidenceId: item for item in self._seed}

    def list_evidence(
        self,
        asset_id: Optional[str] = None,
        evidence_type: Optional[str] = None,
        source_type: Optional[str] = None,
        keyword: Optional[str] = None,
        min_quality_score: Optional[int] = None,
        limit: int = 100,
    ) -> List[AlphaTraceEvidenceItem]:
        keyword_normalized = (keyword or "").strip().lower()
        asset_id_normalized = (asset_id or "").strip().lower()
        items = []
        for item in self._seed:
            if asset_id_normalized and asset_id_normalized not in [asset.lower() for asset in item.relatedAssetIds]:
                continue
            if evidence_type and item.evidenceType != evidence_type:
                continue
            if source_type and item.sourceType != source_type:
                continue
            if min_quality_score is not None and item.qualityScore < min_quality_score:
                continue
            if keyword_normalized:
                searchable = f"{item.title} {item.summary} {item.sourceName} {' '.join(item.relatedAssetIds)}".lower()
                if keyword_normalized not in searchable:
                    continue
            items.append(item)

        items.sort(key=lambda evidence: (evidence.qualityScore, evidence.reliabilityScore, evidence.publishedAt), reverse=True)
        return [self._to_api_item(item) for item in items[: max(1, limit)]]

    def get_evidence(self, evidence_id: str) -> Optional[AlphaTraceEvidenceItem]:
        if not static_evidence_seed_enabled() and is_static_seed_evidence_id(evidence_id):
            return None
        item = self._by_id.get(evidence_id)
        return self._to_api_item(item) if item else None

    def search(
        self,
        asset_id: Optional[str],
        query: str,
        task_type: str,
        limit: int = 5,
    ) -> List[AlphaTraceEvidenceItem]:
        items = EvidenceRetriever(self._seed).retrieve(
            asset_id=asset_id,
            question=query,
            task_type=task_type,
            limit=limit,
        )
        return [self._to_api_item(item) for item in items]

    @staticmethod
    def _to_api_item(item: EvidenceItem) -> AlphaTraceEvidenceItem:
        extracted_fields = [
            AlphaTraceExtractedField(field=key, value=str(value), confidence=0.8)
            for key, value in item.extractedFields.items()
        ]
        return AlphaTraceEvidenceItem(
            evidenceId=item.evidenceId,
            id=item.evidenceId,
            title=item.title,
            sourceName=item.sourceName,
            sourceType=item.sourceType,
            evidenceType=item.evidenceType,
            relatedAssetIds=item.relatedAssetIds,
            publishedAt=item.publishedAt,
            collectedAt=item.publishedAt,
            qualityScore=item.qualityScore,
            reliabilityScore=item.reliabilityScore,
            summary=item.summary,
            url=item.url or "#",
            extractedFields=extracted_fields,
            usedByAgentRunIds=[],
            usedByDecisionIds=[],
            metadata={
                "staticSeed": True,
                "sourceLabel": "Static Evidence Seed",
                "provenanceStatus": "seeded",
                "governanceNote": "Static seed evidence for AlphaTrace MVP demos; not an external real-time feed.",
            },
        )


@lru_cache(maxsize=1)
def get_static_evidence_store() -> StaticEvidenceStore:
    if get_domain_store_type() == "mysql":
        return MysqlEvidenceStore()
    return StaticEvidenceStore()


class MysqlEvidenceStore(StaticEvidenceStore):
    """Evidence Store backed by MySQL seed payloads."""

    def __init__(self) -> None:
        domain_store = get_mysql_domain_store()
        seed = [
            StaticEvidenceStore._to_api_item(item).model_dump(mode="json")
            for item in get_static_evidence_seed()
        ]
        domain_store.seed_if_empty(
            domain_store.evidence_items,
            "evidence_id",
            seed,
            lambda item: {
                "evidence_id": item["evidenceId"],
                "source_type": item.get("sourceType"),
                "evidence_type": item.get("evidenceType"),
                "quality_score": item.get("qualityScore"),
                "published_at": item.get("publishedAt"),
            },
        )
        self._items = [
            AlphaTraceEvidenceItem.model_validate(item)
            for item in domain_store.fetch_all(domain_store.evidence_items)
        ]
        if not static_evidence_seed_enabled():
            self._items = [item for item in self._items if not _is_static_seed_api_item(item)]
        self._by_id = {item.evidenceId: item for item in self._items}

    def list_evidence(
        self,
        asset_id: Optional[str] = None,
        evidence_type: Optional[str] = None,
        source_type: Optional[str] = None,
        keyword: Optional[str] = None,
        min_quality_score: Optional[int] = None,
        limit: int = 100,
    ) -> List[AlphaTraceEvidenceItem]:
        keyword_normalized = (keyword or "").strip().lower()
        asset_id_normalized = (asset_id or "").strip().lower()
        items: List[AlphaTraceEvidenceItem] = []
        for item in self._items:
            if asset_id_normalized and asset_id_normalized not in [asset.lower() for asset in item.relatedAssetIds]:
                continue
            if evidence_type and item.evidenceType != evidence_type:
                continue
            if source_type and item.sourceType != source_type:
                continue
            if min_quality_score is not None and item.qualityScore < min_quality_score:
                continue
            if keyword_normalized:
                searchable = f"{item.title} {item.summary} {item.sourceName} {' '.join(item.relatedAssetIds)}".lower()
                if keyword_normalized not in searchable:
                    continue
            items.append(item)
        items.sort(key=lambda evidence: (evidence.qualityScore, evidence.reliabilityScore or 0, evidence.publishedAt or ""), reverse=True)
        return items[: max(1, limit)]

    def get_evidence(self, evidence_id: str) -> Optional[AlphaTraceEvidenceItem]:
        if not static_evidence_seed_enabled() and is_static_seed_evidence_id(evidence_id):
            return None
        return self._by_id.get(evidence_id)

    def search(
        self,
        asset_id: Optional[str],
        query: str,
        task_type: str,
        limit: int = 5,
    ) -> List[AlphaTraceEvidenceItem]:
        items = self.list_evidence(asset_id=asset_id, keyword=query, limit=limit)
        if items:
            return items
        return self.list_evidence(asset_id=asset_id, limit=limit)
