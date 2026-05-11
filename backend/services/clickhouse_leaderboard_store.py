from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal, Optional

from services.clickhouse_business_store import (
    ClickHouseBusinessStore,
    ClickHouseStoreError,
    get_clickhouse_business_store,
)


RankingType = Literal["manager", "fund", "etf"]
LEADERBOARD_CACHE_TTL_SECONDS = 12 * 60 * 60
LEADERBOARD_CACHE_LIMIT = 200
LEADERBOARD_CACHE_VERSION = 1

_LEADERBOARD_CACHE_REFRESH_LOCK = threading.Lock()
_LEADERBOARD_CACHE_SCHEDULER_STARTED = False
_DEFAULT_RANKING_TYPES: tuple[RankingType, ...] = ("manager", "fund", "etf")
_SAFE_CACHE_KEY_RE = re.compile(r"[^a-zA-Z0-9_-]+")


def _rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    return data if isinstance(data, list) else []


def _as_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _as_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value)
    return text if text else None


def _utc_now() -> datetime:
    return datetime.utcnow()


def _leaderboard_cache_ttl_seconds() -> int:
    try:
        return max(300, int(os.getenv("ALPHA_TRACE_LEADERBOARD_CACHE_TTL_SECONDS", str(LEADERBOARD_CACHE_TTL_SECONDS))))
    except ValueError:
        return LEADERBOARD_CACHE_TTL_SECONDS


def _leaderboard_cache_dir() -> Path:
    configured = os.getenv("ALPHA_TRACE_LEADERBOARD_CACHE_DIR")
    cache_dir = Path(configured) if configured else Path(__file__).resolve().parents[1] / "data" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _leaderboard_cache_path(*, ranking_type: RankingType, sort_by: str) -> Path:
    safe_sort_by = _SAFE_CACHE_KEY_RE.sub("_", sort_by or "score").strip("_") or "score"
    return _leaderboard_cache_dir() / f"alpha_trace_rankings_{ranking_type}_{safe_sort_by}.json"


def _parse_cache_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _sort_expr(ranking_type: RankingType, sort_by: str) -> str:
    if ranking_type == "manager":
        return {
            "score": "score DESC, activeScale DESC",
            "roi": "scaleWeightedRoi DESC, averageAnnualizedRoi DESC",
            "annualizedRoi": "averageAnnualizedRoi DESC, scaleWeightedRoi DESC",
            "scale": "activeScale DESC, score DESC",
        }.get(sort_by, "score DESC, activeScale DESC")
    return {
        "score": "score DESC, scale DESC",
        "return1y": "return1y DESC, score DESC",
        "scale": "scale DESC, score DESC",
        "drawdown": "drawdown DESC, score DESC",
    }.get(sort_by, "score DESC, scale DESC")


class ClickHouseLeaderboardStore:
    def __init__(self, store: Optional[ClickHouseBusinessStore] = None) -> None:
        self.store = store or get_clickhouse_business_store()

    def list_cached_rankings(
        self,
        *,
        ranking_type: RankingType,
        sort_by: str = "score",
        limit: int = 50,
        offset: int = 0,
        refresh: bool = False,
    ) -> tuple[list[dict[str, Any]], int]:
        bounded_limit = min(max(limit, 1), 200)
        bounded_offset = max(offset, 0)
        cached_items = None if refresh else self._load_rankings_cache(ranking_type=ranking_type, sort_by=sort_by, fresh_only=True)
        if cached_items is not None:
            return cached_items[bounded_offset : bounded_offset + bounded_limit], len(cached_items)

        try:
            refreshed_items = self.refresh_rankings_cache(ranking_type=ranking_type, sort_by=sort_by)
            return refreshed_items[bounded_offset : bounded_offset + bounded_limit], len(refreshed_items)
        except Exception:
            stale_items = self._load_rankings_cache(ranking_type=ranking_type, sort_by=sort_by, fresh_only=False)
            if stale_items is not None:
                return stale_items[bounded_offset : bounded_offset + bounded_limit], len(stale_items)
            raise

    def refresh_rankings_cache(self, *, ranking_type: RankingType, sort_by: str = "score") -> list[dict[str, Any]]:
        items = self.list_rankings(
            ranking_type=ranking_type,
            sort_by=sort_by,
            limit=LEADERBOARD_CACHE_LIMIT,
            offset=0,
        )
        now = _utc_now()
        ttl_seconds = _leaderboard_cache_ttl_seconds()
        cached_at = now.isoformat()
        expires_at = (now + timedelta(seconds=ttl_seconds)).isoformat()
        cache_path = _leaderboard_cache_path(ranking_type=ranking_type, sort_by=sort_by)
        tmp_path = cache_path.with_suffix(".tmp")
        payload = {
            "version": LEADERBOARD_CACHE_VERSION,
            "ranking_type": ranking_type,
            "sort_by": sort_by,
            "cached_at": cached_at,
            "expires_at": expires_at,
            "ttl_seconds": ttl_seconds,
            "items": items,
        }
        try:
            tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp_path, cache_path)
        except Exception:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
            raise
        return items

    def _load_rankings_cache(
        self,
        *,
        ranking_type: RankingType,
        sort_by: str,
        fresh_only: bool,
    ) -> Optional[list[dict[str, Any]]]:
        cache_path = _leaderboard_cache_path(ranking_type=ranking_type, sort_by=sort_by)
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            if payload.get("version") != LEADERBOARD_CACHE_VERSION:
                return None
            if payload.get("ranking_type") != ranking_type or payload.get("sort_by") != sort_by:
                return None
            expires_at = _parse_cache_datetime(payload.get("expires_at"))
            if fresh_only and (expires_at is None or expires_at <= _utc_now()):
                return None
            items = payload.get("items")
            if not isinstance(items, list):
                return None
            return [item for item in items if isinstance(item, dict)]
        except Exception:
            return None

    def list_rankings(
        self,
        *,
        ranking_type: RankingType,
        sort_by: str = "score",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        bounded_limit = min(max(limit, 1), 200)
        bounded_offset = max(offset, 0)
        if ranking_type == "manager":
            rows = self._query_manager_rankings(sort_by=sort_by, limit=bounded_limit, offset=bounded_offset)
        elif ranking_type in {"fund", "etf"}:
            rows = self._query_fund_rankings(
                ranking_type=ranking_type,
                sort_by=sort_by,
                limit=bounded_limit,
                offset=bounded_offset,
            )
        else:
            raise ClickHouseStoreError(f"Unsupported ranking type: {ranking_type}")

        return [self._normalize_row(row, ranking_type=ranking_type, rank=bounded_offset + index + 1) for index, row in enumerate(rows)]

    def _query_manager_rankings(self, *, sort_by: str, limit: int, offset: int) -> list[dict[str, Any]]:
        order_by = _sort_expr("manager", sort_by)
        return _rows(
            self.store.query_json(
                f"""
                WITH
                active_rel AS (
                    SELECT manager_code, manager_name, stock_code, appointment_date
                    FROM monitor.fund_manager_relation
                    WHERE departure_date IS NULL AND appointment_date IS NOT NULL
                ),
                profile_latest AS (
                    SELECT
                        stock_code,
                        argMax(fund_company_name, updated_at) AS fund_company,
                        argMax(operation_mode, updated_at) AS operation_mode
                    FROM monitor.dim_lixinger_fund_profile
                    GROUP BY stock_code
                ),
                fund_meta AS (
                    SELECT
                        f.stock_code AS stock_code,
                        any(f.short_name) AS fund_name,
                        any(f.fund_second_level) AS fund_type,
                        any(profile.fund_company) AS fund_company,
                        any(profile.operation_mode) AS operation_mode
                    FROM monitor.dim_lixinger_fund AS f
                    LEFT JOIN profile_latest AS profile ON profile.stock_code = f.stock_code
                    GROUP BY f.stock_code
                ),
                scale_latest AS (
                    SELECT
                        stock_code,
                        argMax(coalesce(exchange_traded_asset_scale, asset_scale), date) AS latest_scale
                    FROM monitor.factor_fund_shares
                    GROUP BY stock_code
                ),
                fund_roi AS (
                    SELECT
                        rel.manager_code AS manager_code,
                        any(rel.manager_name) AS manager_name,
                        rel.stock_code AS stock_code,
                        min(price.date) AS roi_start_date,
                        max(price.date) AS roi_end_date,
                        dateDiff('day', min(price.date), max(price.date)) AS roi_days,
                        if(argMin(price.close, price.date) > 0, argMax(price.close, price.date) / argMin(price.close, price.date) - 1, NULL) AS tenure_roi,
                        if(roi_days > 30 AND tenure_roi > -0.9999, pow(1 + tenure_roi, 365 / roi_days) - 1, NULL) AS annualized_roi
                    FROM active_rel AS rel
                    INNER JOIN monitor.factor_fund_price_daily AS price ON price.stock_code = rel.stock_code
                    WHERE price.close IS NOT NULL AND price.date >= rel.appointment_date
                    GROUP BY rel.manager_code, rel.stock_code
                    HAVING roi_days >= 90
                ),
                manager_rollup AS (
                    SELECT
                        roi.manager_code AS managerCode,
                        any(roi.manager_name) AS managerName,
                        count() AS activeFundCount,
                        sum(ifNull(scale.latest_scale, 0)) AS activeScale,
                        avg(roi.tenure_roi) AS averageTenureRoi,
                        avg(roi.annualized_roi) AS averageAnnualizedRoi,
                        sum(ifNull(scale.latest_scale, 0) * ifNull(roi.tenure_roi, 0)) / nullIf(sumIf(ifNull(scale.latest_scale, 0), isNotNull(roi.tenure_roi)), 0) AS scaleWeightedRoi,
                        min(roi.roi_start_date) AS earliestRoiStartDate,
                        max(roi.roi_end_date) AS latestRoiEndDate,
                        argMax(roi.stock_code, ifNull(scale.latest_scale, 0)) AS representativeFundCode,
                        argMax(meta.fund_name, ifNull(scale.latest_scale, 0)) AS representativeFundName,
                        argMax(meta.fund_company, ifNull(scale.latest_scale, 0)) AS fundCompany,
                        argMax(meta.fund_type, ifNull(scale.latest_scale, 0)) AS fundType,
                        arraySlice(
                            arrayReverseSort(
                                fund -> fund.3,
                                groupArray((roi.stock_code, meta.fund_name, toFloat64(ifNull(scale.latest_scale, 0))))
                            ),
                            1,
                            30
                        ) AS managedFundsRaw
                    FROM fund_roi AS roi
                    LEFT JOIN scale_latest AS scale ON scale.stock_code = roi.stock_code
                    LEFT JOIN fund_meta AS meta ON meta.stock_code = roi.stock_code
                    GROUP BY roi.manager_code
                )
                SELECT
                    managerCode,
                    managerName,
                    fundCompany,
                    representativeFundCode,
                    representativeFundName,
                    managedFundsRaw,
                    fundType,
                    activeFundCount,
                    activeScale,
                    averageTenureRoi,
                    averageAnnualizedRoi,
                    scaleWeightedRoi,
                    earliestRoiStartDate,
                    latestRoiEndDate,
                    greatest(0, least(100,
                        48
                        + least(greatest(ifNull(scaleWeightedRoi, 0), -0.2), 0.6) * 35
                        + least(greatest(ifNull(averageAnnualizedRoi, 0), -0.1), 0.4) * 30
                        + log10(1 + activeScale / 100000000) * 4
                        + activeFundCount * 0.7
                    )) AS score
                FROM manager_rollup
                WHERE activeFundCount > 0
                ORDER BY {order_by}
                LIMIT {limit} OFFSET {offset}
                FORMAT JSON
                """
            )
        )

    def _query_fund_rankings(self, *, ranking_type: RankingType, sort_by: str, limit: int, offset: int) -> list[dict[str, Any]]:
        order_by = _sort_expr(ranking_type, sort_by)
        if ranking_type == "etf":
            value_cte = """
                value_window AS (
                    SELECT
                        stock_code,
                        max(date) AS latest_date,
                        argMax(close, date) AS latest_nav,
                        argMin(close, date) AS start_nav,
                        if(argMin(close, date) > 0, argMax(close, date) / argMin(close, date) - 1, NULL) AS return_1y,
                        count() AS points
                    FROM monitor.factor_fund_price_daily
                    WHERE close IS NOT NULL AND date >= addYears(today(), -1)
                    GROUP BY stock_code
                )
            """
            value_join = "INNER JOIN value_window AS value ON value.stock_code = meta.stock_code"
            asset_filter = "is_etf = 1"
            asset_type_literal = "ETF"
        else:
            value_cte = """
                value_window AS (
                    SELECT
                        fund_code AS stock_code,
                        max(trade_date) AS latest_date,
                        argMax(net_value, trade_date) AS latest_nav,
                        argMin(net_value, trade_date) AS start_nav,
                        if(argMin(net_value, trade_date) > 0, argMax(net_value, trade_date) / argMin(net_value, trade_date) - 1, NULL) AS return_1y,
                        count() AS points
                    FROM monitor.factor_fund_net_value_daily
                    WHERE net_value IS NOT NULL AND trade_date >= addYears(today(), -1)
                    GROUP BY fund_code
                )
            """
            value_join = "INNER JOIN value_window AS value ON value.stock_code = meta.stock_code"
            asset_filter = "is_etf = 0"
            asset_type_literal = "FUND"

        return _rows(
            self.store.query_json(
                f"""
                WITH
                profile_latest AS (
                    SELECT
                        stock_code,
                        argMax(fund_company_name, updated_at) AS fund_company,
                        argMax(exchange_traded_short_name, updated_at) AS etf_name,
                        argMax(operation_mode, updated_at) AS operation_mode
                    FROM monitor.dim_lixinger_fund_profile
                    GROUP BY stock_code
                ),
                fund_meta AS (
                    SELECT
                        f.stock_code AS stock_code,
                        any(f.short_name) AS name,
                        any(f.fund_second_level) AS fund_type,
                        any(f.exchange) AS exchange,
                        any(profile.fund_company) AS fund_company,
                        any(profile.etf_name) AS etf_name,
                        any(profile.operation_mode) AS operation_mode,
                        if(
                            positionCaseInsensitiveUTF8(any(profile.operation_mode), '交易型开放式') > 0
                            OR notEmpty(any(profile.etf_name)),
                            1,
                            0
                        ) AS is_etf
                    FROM monitor.dim_lixinger_fund AS f
                    LEFT JOIN profile_latest AS profile ON profile.stock_code = f.stock_code
                    GROUP BY f.stock_code
                ),
                scale_latest AS (
                    SELECT
                        stock_code,
                        argMax(ifNull(exchange_traded_asset_scale, asset_scale), date) AS latest_scale
                    FROM monitor.factor_fund_shares
                    GROUP BY stock_code
                ),
                {value_cte},
                drawdown_latest AS (
                    SELECT stock_code, argMax(drawdown, date) AS drawdown
                    FROM monitor.factor_fund_drawdown
                    GROUP BY stock_code
                ),
                turnover_latest AS (
                    SELECT stock_code, argMax(turnover_rate, date) AS turnover_rate
                    FROM monitor.factor_fund_turnover
                    GROUP BY stock_code
                ),
                manager_counts AS (
                    SELECT
                        stock_code,
                        countIf(departure_date IS NULL) AS active_manager_count,
                        anyIf(manager_name, departure_date IS NULL) AS representative_manager
                    FROM monitor.fund_manager_relation
                    GROUP BY stock_code
                )
                SELECT
                    meta.stock_code AS code,
                    meta.name AS name,
                    meta.fund_company AS fundCompany,
                    meta.fund_type AS fundType,
                    meta.operation_mode AS operationMode,
                    '{asset_type_literal}' AS assetType,
                    scale.latest_scale AS scale,
                    value.latest_nav AS latestNav,
                    value.latest_date AS latestDate,
                    value.return_1y AS return1y,
                    drawdown.drawdown AS drawdown,
                    turnover.turnover_rate AS turnoverRate,
                    managers.active_manager_count AS activeManagerCount,
                    managers.representative_manager AS representativeManager,
                    greatest(0, least(100,
                        46
                        + least(greatest(ifNull(value.return_1y, 0), -0.5), 1.2) * 22
                        + log10(1 + ifNull(scale.latest_scale, 0) / 100000000) * 5
                        - abs(ifNull(drawdown.drawdown, 0)) * 10
                        + ifNull(value.points, 0) / 160
                    )) AS score
                FROM fund_meta AS meta
                LEFT JOIN scale_latest AS scale ON scale.stock_code = meta.stock_code
                {value_join}
                LEFT JOIN drawdown_latest AS drawdown ON drawdown.stock_code = meta.stock_code
                LEFT JOIN turnover_latest AS turnover ON turnover.stock_code = meta.stock_code
                LEFT JOIN manager_counts AS managers ON managers.stock_code = meta.stock_code
                WHERE {asset_filter}
                ORDER BY {order_by}
                LIMIT {limit} OFFSET {offset}
                FORMAT JSON
                """
            )
        )

    def _normalize_row(self, row: dict[str, Any], *, ranking_type: RankingType, rank: int) -> dict[str, Any]:
        item = {
            "rank": rank,
            "rankingType": ranking_type,
            "code": _as_str(row.get("code")),
            "name": _as_str(row.get("name")),
            "assetType": _as_str(row.get("assetType")),
            "managerCode": _as_str(row.get("managerCode")),
            "managerName": _as_str(row.get("managerName")),
            "fundCompany": _as_str(row.get("fundCompany")),
            "fundType": _as_str(row.get("fundType")),
            "representativeFundCode": _as_str(row.get("representativeFundCode")),
            "representativeFundName": _as_str(row.get("representativeFundName")),
            "managedFunds": self._managed_funds(row.get("managedFundsRaw")),
            "activeFundCount": _as_int(row.get("activeFundCount")),
            "activeManagerCount": _as_int(row.get("activeManagerCount")),
            "activeScale": _as_float(row.get("activeScale")),
            "scale": _as_float(row.get("scale")),
            "latestNav": _as_float(row.get("latestNav")),
            "latestDate": _as_str(row.get("latestDate")),
            "return1y": _as_float(row.get("return1y")),
            "averageTenureRoi": _as_float(row.get("averageTenureRoi")),
            "averageAnnualizedRoi": _as_float(row.get("averageAnnualizedRoi")),
            "scaleWeightedRoi": _as_float(row.get("scaleWeightedRoi")),
            "drawdown": _as_float(row.get("drawdown")),
            "turnoverRate": _as_float(row.get("turnoverRate")),
            "representativeManager": _as_str(row.get("representativeManager")),
            "earliestRoiStartDate": _as_str(row.get("earliestRoiStartDate")),
            "latestRoiEndDate": _as_str(row.get("latestRoiEndDate")),
            "score": _as_float(row.get("score")) or 0,
            "metadata": {"collectedAt": datetime.utcnow().isoformat()},
        }
        item["rationale"] = self._rationale(item, ranking_type=ranking_type)
        return item

    def _managed_funds(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        funds: list[dict[str, Any]] = []
        for raw in value:
            if not isinstance(raw, list) or len(raw) < 2:
                continue
            funds.append(
                {
                    "code": _as_str(raw[0]) or "",
                    "name": _as_str(raw[1]) or "",
                    "scale": _as_float(raw[2]) if len(raw) > 2 else None,
                }
            )
        return funds

    def _rationale(self, item: dict[str, Any], *, ranking_type: RankingType) -> str:
        if ranking_type == "manager":
            return (
                f"管理 {item.get('activeFundCount') or 0} 只在任基金；"
                f"代表基金 {item.get('representativeFundName') or '-'}；"
                f"规模加权任期 ROI {self._fmt_ratio(item.get('scaleWeightedRoi'))}。"
            )
        return (
            f"近一年收益 {self._fmt_ratio(item.get('return1y'))}；"
            f"最新规模 {self._fmt_scale(item.get('scale'))}；"
            f"当前经理 {item.get('representativeManager') or '-'}。"
        )

    @staticmethod
    def _fmt_ratio(value: Any) -> str:
        number = _as_float(value)
        return "-" if number is None else f"{number * 100:.1f}%"

    @staticmethod
    def _fmt_scale(value: Any) -> str:
        number = _as_float(value)
        if number is None:
            return "-"
        if number >= 100_000_000:
            return f"{number / 100_000_000:.1f} 亿"
        if number >= 10_000:
            return f"{number / 10_000:.1f} 万"
        return f"{number:.0f}"


def get_clickhouse_leaderboard_store() -> ClickHouseLeaderboardStore:
    return ClickHouseLeaderboardStore()


def refresh_clickhouse_leaderboard_cache_once() -> None:
    if not _LEADERBOARD_CACHE_REFRESH_LOCK.acquire(blocking=False):
        return
    try:
        store = get_clickhouse_leaderboard_store()
        for ranking_type in _DEFAULT_RANKING_TYPES:
            try:
                store.refresh_rankings_cache(ranking_type=ranking_type, sort_by="score")
            except Exception as exc:
                print(f"[leaderboard-cache] Refresh failed for {ranking_type}: {exc}")
    finally:
        _LEADERBOARD_CACHE_REFRESH_LOCK.release()


def start_clickhouse_leaderboard_cache_scheduler() -> None:
    global _LEADERBOARD_CACHE_SCHEDULER_STARTED
    if _LEADERBOARD_CACHE_SCHEDULER_STARTED:
        return
    _LEADERBOARD_CACHE_SCHEDULER_STARTED = True
    interval_seconds = _leaderboard_cache_ttl_seconds()

    def _loop() -> None:
        refresh_clickhouse_leaderboard_cache_once()
        while True:
            time.sleep(interval_seconds)
            refresh_clickhouse_leaderboard_cache_once()

    threading.Thread(target=_loop, name="alpha-trace-leaderboard-cache-refresh", daemon=True).start()
