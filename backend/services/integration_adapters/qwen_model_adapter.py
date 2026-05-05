from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Iterable

import requests

from services.integration_adapters.base import (
    IntegrationCapability,
    IntegrationHealth,
    ModelInvocationRequest,
    ModelInvocationResult,
)


QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_DEFAULT_MODEL = "qwen-plus"


class QwenModelProviderAdapter:
    """OpenAI-compatible Qwen/DashScope model provider boundary.

    This adapter is additive and is not yet wired into QwenRunner. It exists so
    future refactors can move model invocation out of runner orchestration in a
    small, testable slice.
    """

    adapter_id = "qwen_openai_compatible"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="model_provider",
            display_name="Qwen OpenAI-Compatible API",
            supported_operations=("chat_completions", "chat_completions_stream"),
            supports_streaming=True,
            supports_artifacts=False,
            production_ready=False,
            notes="Backend-only Qwen/DashScope model provider. Credentials must come from env or server-side config.",
        )

    def health(self) -> IntegrationHealth:
        api_key = os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY")
        if not api_key:
            return IntegrationHealth(
                adapter_id=self.adapter_id,
                status="missing_config",
                source="environment_or_mysql_system_config",
                message="Qwen/DashScope API key is not configured for this provider adapter.",
                checked_at=datetime.now(timezone.utc).isoformat(),
            )
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready",
            source="environment",
            message="Qwen/DashScope API key is configured in environment. Network health is checked during invocation.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def invoke(self, request: ModelInvocationRequest) -> ModelInvocationResult:
        api_key = os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY")
        if not api_key:
            return ModelInvocationResult(
                status="failed",
                provider_id=self.adapter_id,
                model_name=request.model_name or QWEN_DEFAULT_MODEL,
                message="Qwen/DashScope API key is not configured.",
            )

        model_name = request.model_name or os.getenv("QWEN_MODEL") or QWEN_DEFAULT_MODEL
        base_url = str(request.context.get("baseUrl") or os.getenv("QWEN_BASE_URL") or QWEN_DEFAULT_BASE_URL).rstrip("/")
        timeout_seconds = int(request.timeout_seconds or request.context.get("timeoutSeconds") or 120)
        payload = {
            "model": model_name,
            "messages": list(request.messages),
            "stream": False,
        }
        if request.temperature is not None:
            payload["temperature"] = request.temperature
        if request.response_format == "json_object":
            payload["response_format"] = {"type": "json_object"}

        try:
            response = requests.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                timeout=timeout_seconds,
            )
            if response.status_code != 200:
                return ModelInvocationResult(
                    status="failed",
                    provider_id=self.adapter_id,
                    model_name=model_name,
                    message=f"Qwen request failed with HTTP {response.status_code}: {response.text[:240]}",
                )
            body = response.json()
            content = ""
            choices = body.get("choices") or []
            if choices:
                content = ((choices[0].get("message") or {}).get("content") or "")
            return ModelInvocationResult(
                status="completed",
                provider_id=self.adapter_id,
                model_name=model_name,
                content=str(content),
                usage=body.get("usage") or {},
                raw_metadata={"id": body.get("id"), "created": body.get("created")},
            )
        except requests.Timeout:
            return ModelInvocationResult(
                status="timeout",
                provider_id=self.adapter_id,
                model_name=model_name,
                message="Qwen request timed out.",
            )
        except Exception as exc:  # noqa: BLE001 - provider boundary returns structured failure.
            return ModelInvocationResult(
                status="failed",
                provider_id=self.adapter_id,
                model_name=model_name,
                message=f"Qwen request failed: {exc}",
            )

    def stream(self, request: ModelInvocationRequest) -> Iterable[ModelInvocationResult]:
        # Streaming is intentionally deferred until QwenRunner migration. The
        # current runner already has a tested streaming/chunk path.
        result = self.invoke(request)
        yield result


__all__ = ["QwenModelProviderAdapter"]
