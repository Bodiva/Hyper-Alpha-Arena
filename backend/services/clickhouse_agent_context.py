from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from services.clickhouse_asset_store import get_clickhouse_asset_store, parse_ck_asset_id
from services.clickhouse_business_store import ClickHouseStoreError


class ClickHouseAgentContextError(RuntimeError):
    pass


def is_clickhouse_monitor_asset_id(asset_id: Optional[str]) -> bool:
    return normalize_clickhouse_monitor_asset_id(asset_id) is not None


def normalize_clickhouse_monitor_asset_id(asset_id: Optional[str]) -> Optional[str]:
    value = str(asset_id or "").strip()
    if not value:
        return None
    if value.startswith(("ck_fund_", "ck_index_")):
        return value
    if value.startswith("ck_monitor_fund_"):
        return f"ck_fund_{value.removeprefix('ck_monitor_fund_')}"
    if value.startswith("ck_monitor_index_"):
        return f"ck_index_{value.removeprefix('ck_monitor_index_')}"
    if value.startswith("ck_etf_index_"):
        return f"ck_index_{value.removeprefix('ck_etf_index_')}"
    if value.startswith(("asset_etf_", "asset_fund_")):
        return f"ck_fund_{value.split('_')[-1]}"
    if value.startswith("asset_index_"):
        return f"ck_index_{value.removeprefix('asset_index_')}"
    return None


def build_clickhouse_monitor_context(asset_id: str, *, kline_limit: int = 900) -> Optional[dict[str, Any]]:
    normalized_asset_id = normalize_clickhouse_monitor_asset_id(asset_id)
    if not normalized_asset_id:
        return None

    try:
        kind, code = parse_ck_asset_id(normalized_asset_id)
    except ClickHouseStoreError as exc:
        raise ClickHouseAgentContextError(str(exc)) from exc

    store = get_clickhouse_asset_store()
    try:
        asset = store.get_asset(normalized_asset_id)
        if not asset:
            return None

        quote = store.get_quote(normalized_asset_id)
        klines = store.get_klines(normalized_asset_id, limit=kline_limit)
        indicators = store.get_indicators(normalized_asset_id)
        snapshot = store.get_snapshot(normalized_asset_id)
        manager_profiles = (
            store.get_fund_manager_profiles(normalized_asset_id, include_external=False) if kind == "fund" else None
        )
    except ClickHouseStoreError as exc:
        raise ClickHouseAgentContextError(str(exc)) from exc

    snapshot_payload = _model_payload(snapshot) if snapshot else {}
    quote_payload = _model_payload(quote) if quote else snapshot_payload.get("quote")
    return_windows = _return_windows(klines)
    kline_summary = _kline_summary(klines)

    source_refs = {
        "database": "monitor",
        "assetTable": "monitor.dim_lixinger_fund_profile" if kind == "fund" else "monitor.dim_lixinger_index_profile",
        "priceTable": "monitor.factor_fund_price_daily" if kind == "fund" else "monitor.factor_index_price_daily",
        "fallbackPriceTable": "monitor.factor_fund_net_value_daily" if kind == "fund" else None,
        "managerTable": "monitor.fund_manager_relation" if kind == "fund" else None,
        "views": [
            "monitor.v_llm_fund_manager_basic",
            "monitor.v_llm_fund_latest_overview",
        ]
        if kind == "fund"
        else ["monitor.v_llm_index_latest_valuation"],
    }

    return {
        "source": "clickhouse_monitor",
        "status": "available",
        "requestedAssetId": asset_id,
        "assetId": asset.id,
        "symbol": asset.symbol,
        "name": asset.name,
        "assetType": asset.assetType,
        "market": asset.market,
        "currency": asset.currency,
        "quote": quote_payload,
        "valuation": snapshot_payload.get("valuation", {}),
        "liquidity": snapshot_payload.get("liquidity", {}),
        "volatility": snapshot_payload.get("volatility", {}),
        "trend": snapshot_payload.get("trend", {}),
        "fundFlow": snapshot_payload.get("fundFlow", {}),
        "premiumDiscount": snapshot_payload.get("premiumDiscount", {}),
        "indicators": [_model_payload(item) for item in indicators[:12]],
        "returnWindows": return_windows,
        "klineSummary": kline_summary,
        "fundManagers": _compact_manager_profiles(manager_profiles),
        "sourceRefs": source_refs,
        "collectedAt": datetime.utcnow().isoformat(),
    }


def _model_payload(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return {}


def _return_windows(klines: list[Any]) -> dict[str, Any]:
    closes = [_kline_close(item) for item in klines]
    closes = [value for value in closes if value is not None and value > 0]
    if not closes:
        return {}

    latest = closes[-1]
    windows = {
        "1m": 21,
        "3m": 63,
        "6m": 126,
        "1y": 252,
        "3y": 756,
        "5y": 1260,
    }
    payload: dict[str, Any] = {"latestClose": latest, "points": len(closes)}
    for label, days in windows.items():
        if len(closes) > days and closes[-days - 1] > 0:
            payload[label] = latest / closes[-days - 1] - 1
    return payload


def _kline_summary(klines: list[Any]) -> dict[str, Any]:
    if not klines:
        return {"points": 0}
    closes = [_kline_close(item) for item in klines]
    closes = [value for value in closes if value is not None and value > 0]
    dates = [_kline_datetime(item) for item in klines]
    if not closes:
        return {"points": len(klines), "startDate": dates[0], "endDate": dates[-1]}

    peak = closes[0]
    max_drawdown = 0.0
    for close in closes:
        peak = max(peak, close)
        if peak > 0:
            max_drawdown = min(max_drawdown, close / peak - 1)

    return {
        "points": len(klines),
        "startDate": dates[0],
        "endDate": dates[-1],
        "latestClose": closes[-1],
        "periodHigh": max(closes),
        "periodLow": min(closes),
        "periodReturn": closes[-1] / closes[0] - 1 if closes[0] > 0 else None,
        "maxDrawdown": max_drawdown,
    }


def _compact_manager_profiles(manager_profiles: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(manager_profiles, dict):
        return []
    managers = manager_profiles.get("managers")
    if not isinstance(managers, list):
        return []
    compacted: list[dict[str, Any]] = []
    for manager in managers[:5]:
        if not isinstance(manager, dict):
            continue
        career = manager.get("career") if isinstance(manager.get("career"), dict) else {}
        current_fund = manager.get("currentFund") if isinstance(manager.get("currentFund"), dict) else {}
        performance = manager.get("performance") if isinstance(manager.get("performance"), dict) else {}
        managed_funds = manager.get("managedFunds") if isinstance(manager.get("managedFunds"), list) else []
        compacted.append(
            {
                "managerCode": manager.get("managerCode"),
                "managerName": manager.get("managerName"),
                "status": manager.get("status"),
                "currentFund": current_fund,
                "career": career,
                "styleSignals": manager.get("styleSignals", []),
                "performance": performance,
                "managedFundsSample": [
                    {
                        "fundCode": item.get("fundCode"),
                        "fundName": item.get("fundName"),
                        "isActive": item.get("isActive"),
                        "latestScale": item.get("latestScale"),
                        "tenureRoi": item.get("tenureRoi"),
                        "annualizedRoi": item.get("annualizedRoi"),
                    }
                    for item in managed_funds[:8]
                    if isinstance(item, dict)
                ],
            }
        )
    return compacted


def _kline_close(item: Any) -> Optional[float]:
    value = _get_value(item, "close")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _kline_datetime(item: Any) -> Optional[str]:
    value = _get_value(item, "datetime")
    return str(value) if value is not None else None


def _get_value(item: Any, key: str) -> Any:
    if isinstance(item, dict):
        return item.get(key)
    return getattr(item, key, None)
