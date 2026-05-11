from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any, Mapping, Sequence

import requests


class LixingerApiError(RuntimeError):
    """Raised when Lixinger rejects a request or returns an unexpected payload."""


@dataclass(frozen=True)
class LixingerConfig:
    token: str
    base_url: str = "https://open.lixinger.com/api"
    timeout_seconds: int = 20

    @classmethod
    def from_env(cls) -> "LixingerConfig":
        token = (
            os.getenv("ALPHATRACE_LIXINGER_TOKEN")
            or os.getenv("LIXINGER_TOKEN")
            or ""
        ).strip()
        if not token:
            raise LixingerApiError("Lixinger token is not configured.")
        base_url = (os.getenv("ALPHATRACE_LIXINGER_BASE_URL") or cls.base_url).rstrip("/")
        timeout_seconds = int(os.getenv("ALPHATRACE_LIXINGER_TIMEOUT_SECONDS") or "20")
        return cls(token=token, base_url=base_url, timeout_seconds=timeout_seconds)


class LixingerClient:
    """Minimal read-only client for Lixinger Open API resources used by AlphaTrace."""

    def __init__(self, config: LixingerConfig, session: requests.Session | None = None) -> None:
        self._config = config
        self._session = session or requests.Session()

    def get_cn_indices(self, stock_codes: Sequence[str] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if stock_codes:
            payload["stockCodes"] = list(stock_codes)
        return self._post("cn/index", payload)

    def get_cn_funds(self, stock_codes: Sequence[str] | None = None, page_index: int = 0) -> dict[str, Any]:
        payload: dict[str, Any] = {"pageIndex": page_index}
        if stock_codes:
            payload["stockCodes"] = list(stock_codes)
        return self._post("cn/fund", payload)

    def get_cn_fund_managers(self, stock_codes: Sequence[str]) -> dict[str, Any]:
        if not stock_codes:
            raise LixingerApiError("stock_codes is required for fund manager queries.")
        if len(stock_codes) > 100:
            raise LixingerApiError("fund manager queries support at most 100 stock codes.")
        return self._post("cn/fund/manager", {"stockCodes": list(stock_codes)})

    def _post(self, path: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        body = {**payload, "token": self._config.token}
        try:
            response = self._session.post(
                f"{self._config.base_url}/{path.lstrip('/')}",
                json=body,
                timeout=self._config.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise LixingerApiError(f"Lixinger request failed: {exc}") from exc

        if response.status_code >= 400:
            raise LixingerApiError(f"Lixinger HTTP {response.status_code}: {response.text[:300]}")
        try:
            data = response.json()
        except ValueError as exc:
            raise LixingerApiError("Lixinger returned a non-JSON response.") from exc

        if not isinstance(data, dict):
            raise LixingerApiError("Lixinger returned an unexpected response shape.")
        if data.get("code") != 1:
            message = str(data.get("message") or "unknown error")
            raise LixingerApiError(f"Lixinger API rejected the request: {message}")
        return data


def get_lixinger_client() -> LixingerClient:
    return LixingerClient(LixingerConfig.from_env())
