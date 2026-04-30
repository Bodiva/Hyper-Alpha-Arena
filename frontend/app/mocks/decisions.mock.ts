import type { Decision } from "../entities/decision/model";

export const decisionsMock: Decision[] = [
  {
    decisionId: "decision_20260425_001",
    runId: "run_20260425_001",
    assetIds: ["asset_etf_510300", "asset_fund_000001"],
    portfolioId: "portfolio_etf_core_001",
    action: "OVERWEIGHT",
    horizon: "MEDIUM_TERM",
    confidence: 0.78,
    thesis:
      "Macro stabilization and improving earnings breadth support incremental allocation to core broad-market exposure.",
    risks: ["Policy implementation lag", "Unexpected external demand shock"],
    evidenceIds: ["ev_macro_001", "ev_news_001", "ev_fund_q_001"],
    expectedOutcome: {
      targetReturn: 9.5,
      expectedMaxDrawdown: 8.5,
      reviewDate: "2026-07-15",
      note: "Prefer gradual position build over 2 rebalancing windows.",
    },
    actualOutcome: {
      realizedReturn: 3.2,
      realizedMaxDrawdown: 2.7,
      status: "PARTIAL",
      asOf: "2026-04-27",
      note: "Initial stage aligns with thesis; trend persistence still under observation.",
    },
    attribution: {
      summary: "Return primarily came from valuation rerating and dividend factor resilience.",
      factors: [
        { factor: "valuation_expansion", contribution: 1.4, explanation: "Index multiple expanded by ~0.8x." },
        { factor: "dividend_factor", contribution: 1.1, explanation: "High dividend constituents outperformed." },
        { factor: "macro_confirmation", contribution: 0.7, explanation: "PMI rebound improved risk appetite." },
      ],
      riskReview: {
        correctlyIdentified: ["External demand shock", "Policy communication uncertainty"],
        underestimated: ["Sector concentration drift"],
      },
      agentContributions: [
        { team: "RESEARCH_TEAM", score: 86, adoptedInsight: "Bull/Bear debate preserved downside guardrails." },
        { team: "RISK_TEAM", score: 82, adoptedInsight: "Concentration warning was incorporated into sizing." },
      ],
      learningPoints: ["Dividend signal should be combined with liquidity regime filter."],
    },
    createdAt: "2026-04-25T10:10:00+08:00",
  },
  {
    decisionId: "decision_20260426_002",
    runId: "run_20260426_002",
    assetIds: ["asset_future_sc_main"],
    portfolioId: "portfolio_multi_asset_001",
    action: "OVERWEIGHT",
    horizon: "SHORT_TERM",
    confidence: 0.74,
    thesis:
      "Crude futures curve moved deeper into backwardation with inventory draw, favoring tactical long exposure.",
    risks: ["Geopolitical headline reversal", "Unexpected inventory rebuild"],
    evidenceIds: ["ev_industry_001", "ev_macro_001", "ev_snapshot_001"],
    expectedOutcome: {
      targetReturn: 6.0,
      expectedMaxDrawdown: 5.5,
      reviewDate: "2026-05-20",
      note: "Use trailing stop if term-structure signal weakens materially.",
    },
    actualOutcome: {
      realizedReturn: 4.6,
      realizedMaxDrawdown: 3.9,
      status: "ACHIEVED",
      asOf: "2026-04-27",
      note: "Signal matured faster than expected due to tightening inventory confirmation.",
    },
    attribution: {
      summary: "Major contribution came from basis widening and stronger refinery demand data.",
      factors: [
        { factor: "term_structure", contribution: 2.1, explanation: "Front-end backwardation steepened." },
        { factor: "inventory_draw", contribution: 1.6, explanation: "Weekly inventory drops exceeded estimates." },
        { factor: "risk_overlay", contribution: 0.9, explanation: "Position sizing prevented adverse gap losses." },
      ],
      riskReview: {
        correctlyIdentified: ["Event-driven gap risk", "Liquidity stress window"],
        underestimated: ["Cross-asset contagion speed"],
      },
      agentContributions: [
        { team: "ANALYST_TEAM", score: 88, adoptedInsight: "Futures structure scan gave high-conviction carry signal." },
        { team: "STRATEGY_TEAM", score: 80, adoptedInsight: "Timing overlay improved entry efficiency." },
      ],
      learningPoints: ["Keep commodity risk budget dynamic with event calendar weighting."],
    },
    createdAt: "2026-04-26T14:25:00+08:00",
  },
  {
    decisionId: "decision_20260426_003",
    runId: "run_20260426_002",
    assetIds: ["asset_etf_513100", "asset_index_nasdaq100"],
    portfolioId: "portfolio_etf_core_001",
    action: "WATCH",
    horizon: "SHORT_TERM",
    confidence: 0.66,
    thesis:
      "Growth valuation reset appears near completion, but earnings confirmation is needed before aggressive add.",
    risks: ["US rate path uncertainty", "Large-cap concentration risk"],
    evidenceIds: ["ev_research_001", "ev_snapshot_001"],
    expectedOutcome: {
      targetReturn: 4.2,
      expectedMaxDrawdown: 6.8,
      reviewDate: "2026-05-23",
      note: "Upgrade to OVERWEIGHT when forward guidance revision breadth improves.",
    },
    actualOutcome: {
      realizedReturn: 0.9,
      realizedMaxDrawdown: 1.9,
      status: "PENDING",
      asOf: "2026-04-27",
      note: "Position remains in observation mode pending next earnings season data.",
    },
    attribution: {
      summary: "Decision quality was driven by disciplined entry timing rather than directional conviction.",
      factors: [
        { factor: "valuation_signal", contribution: 0.5, explanation: "Valuation signal improved from oversold levels." },
        { factor: "earnings_uncertainty", contribution: -0.2, explanation: "Limited near-term estimate upgrades." },
        { factor: "timing_discipline", contribution: 0.8, explanation: "Avoided premature risk expansion." },
      ],
      riskReview: {
        correctlyIdentified: ["US rate sensitivity", "Concentration in mega-cap technology"],
        underestimated: ["Earnings diffusion lag persistence"],
      },
      learningPoints: ["Need earnings breadth threshold to transition WATCH to OVERWEIGHT."],
    },
    createdAt: "2026-04-26T18:10:00+08:00",
  },
  {
    decisionId: "decision_20260427_004",
    runId: "run_20260427_003",
    assetIds: ["asset_future_if_main"],
    portfolioId: "portfolio_multi_asset_001",
    action: "UNDERWEIGHT",
    horizon: "SHORT_TERM",
    confidence: 0.72,
    thesis: "Event shock may weaken index beta, so reducing equity-index futures exposure should protect downside.",
    risks: ["Policy response speed may trigger sharp rebound", "Short-horizon sentiment reversal"],
    evidenceIds: ["ev_macro_001", "ev_snapshot_001", "ev_upload_001"],
    expectedOutcome: {
      targetReturn: 2.8,
      expectedMaxDrawdown: 3.2,
      reviewDate: "2026-05-03",
      note: "Reassess after next volatility regime update.",
    },
    actualOutcome: {
      realizedReturn: -2.4,
      realizedMaxDrawdown: 4.8,
      status: "MISSED",
      asOf: "2026-04-27",
      note: "Fast policy tone shift reversed risk sentiment and squeezed the underweight stance.",
    },
    attribution: {
      summary: "Loss came from overemphasizing short-term risk evidence and underweighting rebound probability.",
      factors: [
        { factor: "timing_error", contribution: -1.5, explanation: "Underweight entry occurred near local sentiment trough." },
        { factor: "policy_reversal", contribution: -0.7, explanation: "Policy tone shifted faster than expected." },
        { factor: "signal_noise", contribution: -0.2, explanation: "Low-quality user upload evidence increased false confidence." },
      ],
      riskReview: {
        correctlyIdentified: ["Volatility spike risk"],
        underestimated: ["Policy-driven rebound speed", "Liquidity squeeze under short-covering"],
      },
      mistakeReview: {
        errorSource: "Overweighting low-confidence evidence in a high-noise event window.",
        misleadingEvidenceIds: ["ev_upload_001"],
        invalidatedAssumptions: [
          "Assumed negative sentiment would persist at least 3 trading days",
          "Assumed policy communication lag would delay rebound",
        ],
        improvementActions: [
          "Add evidence-quality floor for discretionary user-upload signals",
          "Introduce policy-event override in timing module",
          "Reduce position size when confidence and evidence quality diverge",
        ],
      },
      agentContributions: [
        { team: "RISK_TEAM", score: 78, adoptedInsight: "Detected volatility spike risk correctly." },
        {
          team: "ANALYST_TEAM",
          score: 62,
          adoptedInsight: "Macro stress signal was valid but rebound branch probability was underestimated.",
          needsOptimization: "Improve policy scenario weighting in event model.",
        },
      ],
      learningPoints: [
        "Confidence must be capped when key evidence quality falls below threshold.",
        "Event-driven decisions should include explicit rebound scenario tests.",
      ],
    },
    createdAt: "2026-04-27T10:35:00+08:00",
  },
];

