from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Any, Dict, List

from schemas.alpha_trace_agent_runtime import EvidenceReference

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "were", "will", "can",
    "市场", "风险", "配置", "当前", "需要", "可能", "观察", "证据", "支持", "分析", "组合", "资产",
}


@dataclass
class ClaimSupportResult:
    claim: str
    evidenceIds: List[str]
    score: float
    status: str
    matchedKeywords: List[str]


@dataclass
class EvidenceSupportResult:
    evidenceSupportScore: float
    supportStatus: str
    claims: List[ClaimSupportResult]
    unsupportedClaims: List[str]
    weakClaims: List[str]

    def to_payload(self) -> Dict[str, Any]:
        return {
            "evidenceSupportScore": self.evidenceSupportScore,
            "evidenceSupportStatus": self.supportStatus,
            "claims": [asdict(item) for item in self.claims],
            "unsupportedClaims": self.unsupportedClaims,
            "weakClaims": self.weakClaims,
        }


def score_evidence_support(content: str, evidence: List[EvidenceReference], max_claims: int = 12) -> EvidenceSupportResult:
    evidence_by_id = {item.evidenceId: item for item in evidence}
    claims = extract_claims(content, max_claims=max_claims)
    if not claims:
        return EvidenceSupportResult(0.0, "unsupported", [], [], [])

    results: List[ClaimSupportResult] = []
    for claim in claims:
        cited_ids = [evidence_id for evidence_id in extract_evidence_ids(claim) if evidence_id in evidence_by_id]
        candidate_ids = cited_ids or list(evidence_by_id.keys())[:3]
        best_score = 0.0
        best_keywords: List[str] = []
        for evidence_id in candidate_ids:
            evidence_item = evidence_by_id[evidence_id]
            score, keywords = keyword_support_score(claim, evidence_item)
            if score > best_score:
                best_score = score
                best_keywords = keywords
        if cited_ids:
            best_score = min(1.0, best_score + 0.15)
        status = support_status(best_score)
        results.append(ClaimSupportResult(claim=claim, evidenceIds=cited_ids, score=round(best_score, 2), status=status, matchedKeywords=best_keywords[:8]))

    avg_score = round(sum(item.score for item in results) / max(1, len(results)), 2)
    unsupported = [item.claim for item in results if item.status == "unsupported"]
    weak = [item.claim for item in results if item.status == "weak"]
    return EvidenceSupportResult(
        evidenceSupportScore=avg_score,
        supportStatus=support_status(avg_score),
        claims=results,
        unsupportedClaims=unsupported[:5],
        weakClaims=weak[:5],
    )


def extract_claims(content: str, max_claims: int = 12) -> List[str]:
    text = re.sub(r"```.*?```", " ", content or "", flags=re.DOTALL)
    text = re.sub(r"\|[-:| ]+\|", " ", text)
    pieces = re.split(r"[\n。；;.!?！？]+", text)
    claims: List[str] = []
    for piece in pieces:
        normalized = re.sub(r"^[\s\-*#0-9.、]+", "", piece).strip()
        if len(normalized) < 18:
            continue
        if normalized.startswith("{") or normalized.startswith('"'):
            continue
        claims.append(normalized[:500])
        if len(claims) >= max_claims:
            break
    return list(dict.fromkeys(claims))


def extract_evidence_ids(content: str) -> List[str]:
    return list(dict.fromkeys(re.findall(r"\bev_(?:static|qwen|bocha)[A-Za-z0-9_-]+\b", content or "")))


def keyword_support_score(claim: str, evidence: EvidenceReference) -> tuple[float, List[str]]:
    claim_terms = set(tokenize(claim))
    evidence_text = " ".join([evidence.title, evidence.summary, evidence.sourceName, evidence.evidenceType])
    evidence_terms = set(tokenize(evidence_text))
    if not claim_terms or not evidence_terms:
        return 0.0, []
    overlap = sorted(claim_terms & evidence_terms)
    score = min(1.0, len(overlap) / max(4, min(len(claim_terms), 12)))
    quality_bonus = min(0.15, max(0, evidence.qualityScore - 70) / 200)
    return min(1.0, score + quality_bonus), overlap


def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z0-9_]{3,}|[\u4e00-\u9fff]{2,}", (text or "").lower())
    return [token for token in tokens if token not in _STOPWORDS]


def support_status(score: float) -> str:
    if score >= 0.8:
        return "strongly_supported"
    if score >= 0.6:
        return "supported"
    if score >= 0.3:
        return "partial"
    if score > 0:
        return "weak"
    return "unsupported"
