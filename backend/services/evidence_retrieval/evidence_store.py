from __future__ import annotations

from typing import Iterable, List, Optional

from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem, AlphaTraceExtractedField
from services.evidence_retrieval.retriever import EvidenceRetriever
from services.evidence_retrieval.static_evidence_seed import EvidenceItem, get_static_evidence_seed


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
            metadata={"staticSeed": True},
        )


def get_static_evidence_store() -> StaticEvidenceStore:
    return StaticEvidenceStore()

