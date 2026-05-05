"""Local feature entitlement helpers.

These values replace login/member checks for project-owned capabilities.
They can later be backed by a license server, local admin settings, or a
different account system without changing feature code.
"""

from __future__ import annotations

import os
from typing import Any, Dict


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str | None, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value) if value is not None else default
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _parse_float(value: str | None, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value) if value is not None else default
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def get_feature_entitlements() -> Dict[str, Any]:
    """Return local feature entitlements.

    Environment overrides:
    - HAA_MAX_SAMPLING_DEPTH: 10..60, defaults to 60
    - HAA_ENABLE_PROMPT_GENERATOR: true/false, defaults to true
    - HAA_SERVICE_FEE_RATE: 0..1, defaults to 0.0
    """

    max_sampling_depth = _parse_int(
        os.getenv("HAA_MAX_SAMPLING_DEPTH"),
        default=60,
        minimum=10,
        maximum=60,
    )

    return {
        "source": "local",
        "max_sampling_depth": max_sampling_depth,
        "can_use_prompt_generator": _parse_bool(
            os.getenv("HAA_ENABLE_PROMPT_GENERATOR"),
            default=True,
        ),
        "service_fee_rate": _parse_float(
            os.getenv("HAA_SERVICE_FEE_RATE"),
            default=0.0,
            minimum=0.0,
            maximum=1.0,
        ),
    }
