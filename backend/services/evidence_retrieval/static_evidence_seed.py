from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class EvidenceItem:
    evidenceId: str
    title: str
    sourceName: str
    sourceType: str
    evidenceType: str
    relatedAssetIds: List[str]
    publishedAt: str
    qualityScore: int
    reliabilityScore: int
    summary: str
    url: Optional[str] = None
    extractedFields: Dict[str, Any] = field(default_factory=dict)
    sourceApiName: Optional[str] = None
    snapshotId: Optional[str] = None
    snapshotCapturedAt: Optional[str] = None


STATIC_EVIDENCE_SEED: List[EvidenceItem] = [
    EvidenceItem(
        evidenceId="ev_static_510300_snapshot_001",
        title="CSI 300 ETF Market Snapshot: Liquidity Remains Stable",
        sourceName="AlphaTrace Static Market Feed",
        sourceType="market_feed",
        evidenceType="market_snapshot",
        relatedAssetIds=["asset_etf_510300", "asset_index_csi300", "asset_index_000300", "000300.SH", "510300.SH"],
        publishedAt="2026-04-28T09:40:00+08:00",
        qualityScore=86,
        reliabilityScore=88,
        summary="CSI 300 ETF turnover stayed active while intraday volatility remained below the recent 20-day average.",
        extractedFields={"liquidity": "stable", "volatility": "moderate", "asset": "510300.SH"},
    ),
    EvidenceItem(
        evidenceId="ev_static_510300_fee_001",
        title="ETF Manager Fee Reduction Supports Long-term Tracking Cost",
        sourceName="Fund Disclosure Static Sample",
        sourceType="announcement",
        evidenceType="announcement",
        relatedAssetIds=["asset_etf_510300", "510300.SH"],
        publishedAt="2026-04-23T20:10:00+08:00",
        qualityScore=90,
        reliabilityScore=94,
        summary="A fee reduction plan may improve the ETF's long-term tracking cost competitiveness versus peer CSI 300 products.",
        extractedFields={"expenseRatioDirection": "down", "trackingCostImpact": "positive"},
    ),
    EvidenceItem(
        evidenceId="ev_static_csi300_macro_001",
        title="PMI Rebound Improves Cyclical Earnings Visibility",
        sourceName="Macro Static Dataset",
        sourceType="macro_database",
        evidenceType="macro_data",
        relatedAssetIds=["asset_index_csi300", "asset_index_000300", "asset_etf_510300", "000300.SH"],
        publishedAt="2026-04-25T09:30:00+08:00",
        qualityScore=85,
        reliabilityScore=93,
        summary="Manufacturing PMI returned above the expansion threshold, supporting cyclical sector sentiment but still requiring confirmation from new orders.",
        extractedFields={"manufacturingPMI": "50.4", "newOrders": "improving"},
    ),
    EvidenceItem(
        evidenceId="ev_static_csi300_research_001",
        title="CSI 300 Allocation Outlook: Valuation Repair with Policy Support",
        sourceName="Broker Research Static Sample",
        sourceType="research_provider",
        evidenceType="research_report",
        relatedAssetIds=["asset_etf_510300", "asset_index_csi300", "asset_index_000300", "000300.SH", "510300.SH"],
        publishedAt="2026-04-22T08:30:00+08:00",
        qualityScore=84,
        reliabilityScore=82,
        summary="The report argues that valuation repair may continue if earnings revisions stabilize and policy support remains consistent.",
        extractedFields={"styleBias": "large_cap", "policyTone": "supportive"},
    ),
    EvidenceItem(
        evidenceId="ev_static_fund_000001_quarterly_001",
        title="Balanced Fund Quarterly Holdings Show Defensive Tilt",
        sourceName="Fund Company Static Disclosure",
        sourceType="fund_disclosure",
        evidenceType="fund_quarterly_report",
        relatedAssetIds=["asset_fund_000001", "000001.OF"],
        publishedAt="2026-04-20T18:00:00+08:00",
        qualityScore=88,
        reliabilityScore=91,
        summary="The balanced fund increased utilities and dividend names while reducing cyclical beta exposure.",
        extractedFields={"topSector": "utilities", "style": "defensive_value"},
    ),
    EvidenceItem(
        evidenceId="ev_static_fund_000001_news_001",
        title="Balanced Fund Manager Emphasizes Drawdown Control",
        sourceName="Financial News Static Sample",
        sourceType="news",
        evidenceType="news",
        relatedAssetIds=["asset_fund_000001", "000001.OF"],
        publishedAt="2026-04-24T11:00:00+08:00",
        qualityScore=78,
        reliabilityScore=80,
        summary="The manager highlighted drawdown control, lower turnover, and dividend cashflow as key portfolio construction priorities.",
        extractedFields={"managerTone": "risk_control", "turnover": "lower"},
    ),
    EvidenceItem(
        evidenceId="ev_static_if_future_snapshot_001",
        title="CSI 300 Index Futures Open Interest and Basis Snapshot",
        sourceName="Futures Static Market Feed",
        sourceType="market_feed",
        evidenceType="market_snapshot",
        relatedAssetIds=["asset_future_if_main", "IF_MAIN"],
        publishedAt="2026-04-28T10:15:00+08:00",
        qualityScore=82,
        reliabilityScore=86,
        summary="Index futures open interest increased modestly while basis remained near neutral, suggesting balanced hedging demand.",
        extractedFields={"openInterest": "rising_moderately", "basis": "neutral"},
    ),
    EvidenceItem(
        evidenceId="ev_static_crude_industry_001",
        title="Commodity Chain Weekly: Inventory Tightness Supports Crude Spreads",
        sourceName="Energy Industry Static Dataset",
        sourceType="industry_database",
        evidenceType="industry_data",
        relatedAssetIds=["asset_future_sc_main", "SC_MAIN"],
        publishedAt="2026-04-24T19:10:00+08:00",
        qualityScore=79,
        reliabilityScore=82,
        summary="Middle distillate inventory tightness implies upside risk to near-month crude spreads during the peak demand window.",
        extractedFields={"inventoryDirection": "tightening", "termStructureBias": "backwardation"},
    ),
    EvidenceItem(
        evidenceId="ev_static_macro_policy_001",
        title="Policy Signals Favor Stable Cashflow and Dividend Assets",
        sourceName="Policy Static Brief",
        sourceType="policy_database",
        evidenceType="macro_data",
        relatedAssetIds=["asset_etf_510300", "asset_fund_000001", "asset_index_csi300", "asset_index_000300"],
        publishedAt="2026-04-24T09:00:00+08:00",
        qualityScore=83,
        reliabilityScore=88,
        summary="Recent policy communication emphasized stable cashflow quality and shareholder return, which may support dividend-oriented exposures.",
        extractedFields={"policyTone": "supportive", "focus": "cashflow_quality"},
    ),
    EvidenceItem(
        evidenceId="ev_static_user_upload_001",
        title="Manufacturing Chain Survey Notes Show Mixed Order Visibility",
        sourceName="User Upload Static Sample",
        sourceType="user_upload",
        evidenceType="user_upload",
        relatedAssetIds=["asset_fund_006011"],
        publishedAt="2026-04-27T09:10:00+08:00",
        qualityScore=65,
        reliabilityScore=62,
        summary="Survey notes from domestic manufacturing suppliers indicate mixed short-term order visibility across upstream segments.",
        extractedFields={"sampleSize": "18 suppliers", "orderVisibility": "mixed"},
    ),
]


def get_static_evidence_seed() -> List[EvidenceItem]:
    return list(STATIC_EVIDENCE_SEED)
