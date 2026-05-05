from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from schemas.alpha_trace_market_data import (
    AlphaTraceMarketIndicator,
    AlphaTraceMarketKline,
    AlphaTraceMarketQuote,
    AlphaTraceMarketSnapshot,
)
from services.market_data_store.static_market_data_seed import get_static_market_data_seed


class StaticAlphaTraceMarketDataStore:
    """Read-only AlphaTrace market data store backed by static seed data."""

    def __init__(self) -> None:
        self._items = get_static_market_data_seed()
        self._by_id: Dict[str, Dict[str, Any]] = {}
        for item in self._items:
            self._by_id[str(item["assetId"])] = item
            self._by_id[str(item["symbol"])] = item

    def get_quote(self, asset_id: str) -> Optional[AlphaTraceMarketQuote]:
        item = self._by_id.get(asset_id)
        if not item:
            return None
        quote = item["quote"]
        return AlphaTraceMarketQuote(
            assetId=item["assetId"],
            symbol=item["symbol"],
            name=item["name"],
            assetType=item["assetType"],
            market=item["market"],
            currency=item["currency"],
            **quote,
        )

    def get_snapshot(self, asset_id: str) -> Optional[AlphaTraceMarketSnapshot]:
        item = self._by_id.get(asset_id)
        if not item:
            return None
        quote = self.get_quote(item["assetId"])
        if not quote:
            return None
        snapshot = item["snapshot"]
        return AlphaTraceMarketSnapshot(
            assetId=item["assetId"],
            symbol=item["symbol"],
            name=item["name"],
            assetType=item["assetType"],
            market=item["market"],
            currency=item["currency"],
            quote=quote,
            valuation=snapshot.get("valuation", {}),
            liquidity=snapshot.get("liquidity", {}),
            volatility=snapshot.get("volatility", {}),
            trend=snapshot.get("trend", {}),
            fundFlow=snapshot.get("fundFlow", {}),
            premiumDiscount=snapshot.get("premiumDiscount", {}),
            source=snapshot.get("source", "alphatrace_static_market_seed"),
            collectedAt=snapshot.get("collectedAt", quote.timestamp),
        )

    def get_indicators(self, asset_id: str) -> List[AlphaTraceMarketIndicator]:
        item = self._by_id.get(asset_id)
        if not item:
            return []
        quote = item["quote"]
        return [
            AlphaTraceMarketIndicator(
                assetId=item["assetId"],
                symbol=item["symbol"],
                source=quote.get("source", "alphatrace_static_market_seed"),
                updatedAt=quote.get("timestamp", datetime.now(timezone.utc).isoformat()),
                **indicator,
            )
            for indicator in item.get("indicators", [])
        ]

    def get_klines(self, asset_id: str, period: str = "1d", limit: int = 60) -> List[AlphaTraceMarketKline]:
        item = self._by_id.get(asset_id)
        if not item:
            return []
        base = item["klineBase"]
        limit = max(1, min(limit, 240))
        period_seconds = self._period_seconds(period)
        source = item["quote"].get("source", "alphatrace_static_market_seed")
        rows: List[AlphaTraceMarketKline] = []
        for index in range(limit):
            timestamp = int(base["startTimestamp"] + index * period_seconds)
            drift = float(base["dailyStep"]) * index
            wave = ((index % 7) - 3) * float(base["volatility"]) * 0.18
            close = max(0.0001, float(base["startPrice"]) + drift + wave)
            open_price = close - float(base["volatility"]) * 0.08
            high = max(open_price, close) + float(base["volatility"]) * 0.18
            low = min(open_price, close) - float(base["volatility"]) * 0.15
            volume = float(item["quote"].get("volume") or 0) * (0.72 + (index % 5) * 0.07)
            rows.append(
                AlphaTraceMarketKline(
                    assetId=item["assetId"],
                    symbol=item["symbol"],
                    period=period,
                    timestamp=timestamp,
                    datetime=datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(),
                    open=round(open_price, 4),
                    high=round(high, 4),
                    low=round(max(low, 0.0001), 4),
                    close=round(close, 4),
                    volume=round(volume, 2),
                    amount=round(volume * close, 2),
                    source=source,
                )
            )
        return rows

    def get_prompt_context(self, asset_id: str) -> Optional[Dict[str, Any]]:
        snapshot = self.get_snapshot(asset_id)
        indicators = self.get_indicators(asset_id)
        if not snapshot:
            return None
        return {
            "assetId": snapshot.assetId,
            "symbol": snapshot.symbol,
            "source": snapshot.source,
            "quote": snapshot.quote.model_dump(mode="json"),
            "valuation": snapshot.valuation,
            "liquidity": snapshot.liquidity,
            "volatility": snapshot.volatility,
            "trend": snapshot.trend,
            "fundFlow": snapshot.fundFlow,
            "premiumDiscount": snapshot.premiumDiscount,
            "indicators": [item.model_dump(mode="json") for item in indicators],
        }

    @staticmethod
    def _period_seconds(period: str) -> int:
        return {
            "1m": 60,
            "5m": 300,
            "15m": 900,
            "30m": 1800,
            "1h": 3600,
            "4h": 14400,
            "1d": 86400,
            "1w": 604800,
        }.get(period, 86400)


def get_static_market_data_store() -> StaticAlphaTraceMarketDataStore:
    return StaticAlphaTraceMarketDataStore()

