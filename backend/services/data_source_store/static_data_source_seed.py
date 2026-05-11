from __future__ import annotations

from typing import Dict, List


def get_static_data_source_seed() -> List[Dict[str, object]]:
    """AlphaTrace-governed data source bootstrap records.

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
            "name": "AlphaTrace Development Evidence Fixture",
            "sourceType": "DATABASE_SYNC",
            "vendor": "AlphaTrace Development Fixture",
            "status": "PAUSED",
            "reliabilityScore": 82,
            "qualityScore": 84,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "FUTURE", "INDEX"],
            "dataCategories": ["NEWS", "ANNOUNCEMENT", "RESEARCH_REPORT", "MACRO_DATA", "MARKET_DATA"],
            "evidenceSources": [
                "Fund Disclosure Fixture",
                "Macro Fixture Dataset",
                "Broker Research Fixture",
                "AlphaTrace Market Fixture",
            ],
            "description": "Development-only evidence fixture. Product retrieval should prefer ClickHouse catalog evidence and Bocha external search when configured.",
            "configState": "development_only",
            "governanceNotes": [
                "Development fixture, not an external real-time feed.",
                "Do not present this source as production truth.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_static_evidence_seed_load",
                    "taskName": "Load development evidence fixture",
                    "taskType": "SEED_LOAD",
                    "status": "PAUSED",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:01+08:00",
                    "durationSeconds": 1,
                    "recordsFetched": 10,
                    "recordsSucceeded": 10,
                    "recordsFailed": 0,
                    "message": "Development evidence fixture is not a product data source.",
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
                "Search failures should be surfaced as unavailable/degraded instead of silently substituting fixture data.",
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
            "name": "AlphaTrace Development Market Data Fixture",
            "sourceType": "DATABASE_SYNC",
            "vendor": "AlphaTrace Development Fixture",
            "status": "PAUSED",
            "reliabilityScore": 76,
            "qualityScore": 78,
            "lastSyncAt": "2026-05-05T08:00:00+08:00",
            "syncFrequency": "ON_DEMAND",
            "supportedAssetTypes": ["ETF", "FUND", "FUTURE", "INDEX"],
            "dataCategories": ["MARKET_DATA", "FUTURES_STRUCTURE"],
            "evidenceSources": ["AlphaTrace Market Fixture"],
            "description": "Development-only quote/snapshot/kline/indicator fixture. Product market data should come from ClickHouse or a configured provider.",
            "configState": "development_only",
            "governanceNotes": [
                "Not a real-time market data subscription.",
                "Do not present this source as production truth.",
            ],
            "recentTasks": [
                {
                    "taskId": "task_market_seed_load",
                    "taskName": "Load development market data fixture",
                    "taskType": "SEED_LOAD",
                    "status": "PAUSED",
                    "startedAt": "2026-05-05T08:00:00+08:00",
                    "endedAt": "2026-05-05T08:00:01+08:00",
                    "durationSeconds": 1,
                    "recordsFetched": 8,
                    "recordsSucceeded": 8,
                    "recordsFailed": 0,
                    "message": "Development market fixture is not a product data source.",
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
