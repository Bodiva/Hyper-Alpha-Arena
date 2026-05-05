from __future__ import annotations

from typing import Dict, List


def get_static_data_source_seed() -> List[Dict[str, object]]:
    """AlphaTrace-governed data source seed for MVP/demo mode.

    These records describe data origins and governance state; they do not imply
    real-time subscriptions or production-grade vendor integrations.
    """

    return [
        {
            "sourceId": "ds_etf_file_import_clickhouse",
            "name": "ETF File Import to ClickHouse",
            "sourceType": "FILE_IMPORT",
            "vendor": "AlphaTrace Upload",
            "status": "HEALTHY",
            "reliabilityScore": 80,
            "qualityScore": 82,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "INDEX"],
            "dataCategories": ["MARKET_DATA", "FUND_QUARTERLY_REPORT"],
            "evidenceSources": ["ETF File Upload", "data/test"],
            "description": "Upload ETF-related CSV, TSV, JSON, JSONL, Excel, or Parquet files and persist normalized rows to ClickHouse.",
            "configState": "clickhouse_env_required",
            "governanceNotes": [
                "Uploaded files are normalized into typed ClickHouse metadata plus raw row JSON.",
                "The raw source row is preserved in payload_json for later schema hardening.",
                "ClickHouse connection is configured with ALPHA_TRACE_CLICKHOUSE_URL and ALPHA_TRACE_ETF_IMPORT_TABLE.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_etf_file_import_ready",
                    "taskName": "ETF file import endpoint ready",
                    "taskType": "FILE_IMPORT",
                    "status": "SUCCESS",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:01+08:00",
                    "durationSeconds": 1,
                    "recordsFetched": 0,
                    "recordsSucceeded": 0,
                    "recordsFailed": 0,
                    "message": "Use /api/alpha-trace/data-sources/file-imports to write uploads into ClickHouse.",
                }
            ],
        },
        {
            "sourceId": "ds_alphatrace_static_evidence_seed",
            "name": "AlphaTrace Static Evidence Seed",
            "sourceType": "DATABASE_SYNC",
            "vendor": "AlphaTrace MVP Seed",
            "status": "HEALTHY",
            "reliabilityScore": 82,
            "qualityScore": 84,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "FUTURE", "INDEX"],
            "dataCategories": ["NEWS", "ANNOUNCEMENT", "RESEARCH_REPORT", "MACRO_DATA", "MARKET_DATA"],
            "evidenceSources": [
                "Fund Disclosure Static Sample",
                "Macro Static Dataset",
                "Broker Research Static Sample",
                "AlphaTrace Static Market Feed",
            ],
            "description": "Static evidence corpus used for deterministic AlphaTrace MVP demos and fallback retrieval.",
            "configState": "configured",
            "governanceNotes": [
                "Development seed, not an external real-time feed.",
                "Used as fallback when external search is disabled or unavailable.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_static_evidence_seed_load",
                    "taskName": "Load static evidence seed",
                    "taskType": "SEED_LOAD",
                    "status": "SUCCESS",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:01+08:00",
                    "durationSeconds": 1,
                    "recordsFetched": 10,
                    "recordsSucceeded": 10,
                    "recordsFailed": 0,
                    "message": "Static evidence seed available.",
                }
            ],
        },
        {
            "sourceId": "ds_bocha_web_search",
            "name": "Bocha Web Search",
            "sourceType": "THIRD_PARTY",
            "vendor": "Bocha AI",
            "status": "HEALTHY",
            "reliabilityScore": 78,
            "qualityScore": 80,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "FUTURE", "INDEX"],
            "dataCategories": ["NEWS", "RESEARCH_REPORT", "MACRO_DATA", "INDUSTRY_DATA"],
            "evidenceSources": ["Bocha Web Search"],
            "description": "Optional backend-only external web search source. API key remains server-side.",
            "configState": "configured_or_env_required",
            "governanceNotes": [
                "External search results keep source URL as canonical evidence.",
                "Search failures must fall back to static evidence and must not fail AgentRun.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_bocha_on_demand_search",
                    "taskName": "Bocha on-demand search",
                    "taskType": "WEB_SEARCH",
                    "status": "SUCCESS",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:03+08:00",
                    "durationSeconds": 3,
                    "recordsFetched": 5,
                    "recordsSucceeded": 5,
                    "recordsFailed": 0,
                    "message": "Bocha is used by EvidenceRetriever when configured.",
                }
            ],
        },
        {
            "sourceId": "ds_alphatrace_static_market_data",
            "name": "AlphaTrace Static Market Data Seed",
            "sourceType": "DATABASE_SYNC",
            "vendor": "AlphaTrace MVP Seed",
            "status": "HEALTHY",
            "reliabilityScore": 76,
            "qualityScore": 78,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "FUTURE", "INDEX"],
            "dataCategories": ["MARKET_DATA", "FUTURES_STRUCTURE"],
            "evidenceSources": ["AlphaTrace Static Market Feed"],
            "description": "Static quote/snapshot/kline/indicator seed for ETF/fund/index/future demos.",
            "configState": "configured",
            "governanceNotes": [
                "Not a real-time market data subscription.",
                "Professional ETF/fund/index data providers are planned after MVP stabilization.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_market_seed_load",
                    "taskName": "Load static market data seed",
                    "taskType": "SEED_LOAD",
                    "status": "SUCCESS",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:01+08:00",
                    "durationSeconds": 1,
                    "recordsFetched": 8,
                    "recordsSucceeded": 8,
                    "recordsFailed": 0,
                    "message": "Static market context available.",
                }
            ],
        },
        {
            "sourceId": "ds_alphatrace_domain_seed",
            "name": "AlphaTrace Domain Seed Store",
            "sourceType": "DATABASE_SYNC",
            "vendor": "AlphaTrace MySQL Domain Store",
            "status": "HEALTHY",
            "reliabilityScore": 86,
            "qualityScore": 83,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "FUTURE", "INDEX"],
            "dataCategories": ["MARKET_DATA", "RESEARCH_REPORT"],
            "evidenceSources": ["Asset Store", "Strategy Store", "Portfolio Store"],
            "description": "MySQL-backed domain seed for assets, strategies, portfolios, and leaderboard demos.",
            "configState": "configured",
            "governanceNotes": [
                "Formal MySQL persistence path for AlphaTrace domain records.",
                "Still uses JSON payloads for MVP flexibility; structured schema hardening is planned.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_domain_seed_mysql_check",
                    "taskName": "Verify MySQL domain seed",
                    "taskType": "DB_SMOKE",
                    "status": "SUCCESS",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:02+08:00",
                    "durationSeconds": 2,
                    "recordsFetched": 29,
                    "recordsSucceeded": 29,
                    "recordsFailed": 0,
                    "message": "Domain seed tables are readable.",
                }
            ],
        },
    ]
