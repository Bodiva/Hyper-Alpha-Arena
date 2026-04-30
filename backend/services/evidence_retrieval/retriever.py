from __future__ import annotations

import re
from typing import Iterable, List, Tuple

from schemas.alpha_trace_agent_runtime import EvidenceReference
from services.evidence_retrieval.static_evidence_seed import EvidenceItem, get_static_evidence_seed


TASK_TYPE_HINTS = {
    "single_asset_analysis": {"market_snapshot", "research_report", "macro_data", "announcement"},
    "multi_asset_comparison": {"market_snapshot", "research_report", "macro_data"},
    "portfolio_diagnostic": {"market_snapshot", "macro_data", "fund_quarterly_report", "industry_data"},
    "portfolio_diagnosis": {"market_snapshot", "macro_data", "fund_quarterly_report", "industry_data"},
    "event_impact_analysis": {"news", "announcement", "macro_data", "industry_data"},
    "rebalance_suggestion": {"market_snapshot", "research_report", "fund_quarterly_report", "macro_data"},
}

QUESTION_HINTS = [
    "ETF",
    "基金",
    "期货",
    "指数",
    "中期",
    "配置",
    "风险",
    "回撤",
    "流动性",
    "波动",
    "宏观",
    "估值",
    "红利",
    "成长",
    "商品",
    "沪深300",
    "CSI 300",
    "510300",
    "000001",
    "000300",
]


class EvidenceRetriever:
    def __init__(self, seed: Iterable[EvidenceItem] | None = None) -> None:
        self._seed = list(seed or get_static_evidence_seed())

    def retrieve(self, asset_id: str | None, question: str, task_type: str, limit: int = 5) -> List[EvidenceItem]:
        scored: List[Tuple[float, EvidenceItem]] = []
        query_terms = self._extract_query_terms(question)
        normalized_asset_id = (asset_id or "").lower()
        preferred_types = TASK_TYPE_HINTS.get(task_type, set())

        for item in self._seed:
            score = item.qualityScore * 0.1 + item.reliabilityScore * 0.05
            related_assets = [asset.lower() for asset in item.relatedAssetIds]
            if normalized_asset_id and normalized_asset_id in related_assets:
                score += 80
            elif normalized_asset_id and any(normalized_asset_id in asset or asset in normalized_asset_id for asset in related_assets):
                score += 30

            searchable_text = f"{item.title} {item.summary} {' '.join(item.relatedAssetIds)}".lower()
            for term in query_terms:
                if term.lower() in searchable_text:
                    score += 8

            if item.evidenceType in preferred_types:
                score += 12

            if score > 0:
                scored.append((score, item))

        scored.sort(key=lambda pair: (pair[0], pair[1].qualityScore, pair[1].reliabilityScore), reverse=True)
        return [item for _, item in scored[: max(1, limit)]]

    @staticmethod
    def _extract_query_terms(question: str) -> List[str]:
        terms = set(re.findall(r"[A-Za-z0-9_.-]{2,}", question or ""))
        for hint in QUESTION_HINTS:
            if hint.lower() in (question or "").lower():
                terms.add(hint)
        return list(terms)


def to_evidence_reference(item: EvidenceItem) -> EvidenceReference:
    return EvidenceReference(
        evidenceId=item.evidenceId,
        title=item.title,
        evidenceType=item.evidenceType,
        sourceName=item.sourceName,
        qualityScore=item.qualityScore,
        reliabilityScore=item.reliabilityScore,
        summary=item.summary,
        url=item.url,
        publishedAt=item.publishedAt,
        relatedAssetIds=item.relatedAssetIds,
        extractedFields=item.extractedFields,
    )
