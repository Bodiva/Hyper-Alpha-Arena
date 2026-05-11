"""OpenClaw gateway client used by backend-owned chat surfaces."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import time
import uuid
from dataclasses import dataclass
from itertools import count
from pathlib import Path
from typing import Any

import websockets
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _short_json(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= 600 else text[:597] + "..."


def _deep_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "\n".join(part for item in value if (part := _deep_text(item))).strip()
    if not isinstance(value, dict):
        return ""
    for key in ("text", "content", "message", "delta", "value"):
        text = _deep_text(value.get(key))
        if text:
            return text
    return ""


def _deep_find(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in keys and item not in (None, ""):
                return item
        for item in value.values():
            found = _deep_find(item, keys)
            if found not in (None, ""):
                return found
    elif isinstance(value, list):
        for item in value:
            found = _deep_find(item, keys)
            if found not in (None, ""):
                return found
    return None


@dataclass
class OpenClawGatewayConfig:
    ws_url: str
    gateway_token: str
    session_key: str = "agent:main:main"
    gateway_password: str = ""
    device_key_path: str = ".openclaw-device-key.pem"
    client_id: str = "cli"
    client_mode: str = "cli"
    timeout_seconds: float = 90.0

    @classmethod
    def from_env(cls) -> "OpenClawGatewayConfig":
        return cls(
            ws_url=_env("OPENCLAW_WS_URL", "ws://127.0.0.1:18789/sce4tf6i"),
            gateway_token=_env("OPENCLAW_GATEWAY_TOKEN"),
            gateway_password=_env("OPENCLAW_GATEWAY_PASSWORD"),
            session_key=_env("OPENCLAW_SESSION_KEY", "agent:main:main"),
            device_key_path=_env("OPENCLAW_DEVICE_KEY_PATH", ".openclaw-device-key.pem"),
            client_id=_env("OPENCLAW_CLIENT_ID", "cli"),
            client_mode=_env("OPENCLAW_CLIENT_MODE", "cli"),
            timeout_seconds=float(_env("OPENCLAW_CHAT_TIMEOUT_SECONDS", "90")),
        )


class OpenClawGatewayClient:
    def __init__(self, config: OpenClawGatewayConfig | None = None) -> None:
        self.config = config or OpenClawGatewayConfig.from_env()
        self._ids = count(1)

    def is_configured(self) -> bool:
        return bool(self.config.ws_url and self.config.gateway_token)

    async def send_chat(self, message: str, *, session_key: str | None = None) -> dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("OpenClaw gateway is not configured. Set OPENCLAW_WS_URL and OPENCLAW_GATEWAY_TOKEN.")

        session = session_key or self.config.session_key
        async with websockets.connect(self.config.ws_url, ping_interval=30, ping_timeout=20) as websocket:
            challenge = await self._read_challenge(websocket)
            hello = await self._connect(websocket, challenge)
            await self._request(websocket, "sessions.subscribe", {"key": session, "sessionKey": session})
            await self._request(websocket, "sessions.messages.subscribe", {"key": session})
            send_result = await self._send_user_message(websocket, session, message)
            reply = await self._wait_for_reply(websocket, session, ignore_text=message)
            return {
                "ok": True,
                "reply": reply,
                "session_key": session,
                "send_result": send_result,
                "server": ((hello.get("payload") or {}).get("server") or {}),
            }

    async def stream_chat(self, message: str, *, session_key: str | None = None):
        if not self.is_configured():
            raise RuntimeError("OpenClaw gateway is not configured. Set OPENCLAW_WS_URL and OPENCLAW_GATEWAY_TOKEN.")

        session = session_key or self.config.session_key
        async with websockets.connect(self.config.ws_url, ping_interval=30, ping_timeout=20) as websocket:
            challenge = await self._read_challenge(websocket)
            hello = await self._connect(websocket, challenge)
            await self._request(websocket, "sessions.subscribe", {"key": session, "sessionKey": session})
            await self._request(websocket, "sessions.messages.subscribe", {"key": session})
            send_result = await self._send_user_message(websocket, session, message)
            yield {
                "type": "started",
                "session_key": session,
                "send_result": send_result,
                "server": ((hello.get("payload") or {}).get("server") or {}),
            }

            latest_text = ""
            deadline = time.monotonic() + self.config.timeout_seconds
            while time.monotonic() < deadline:
                try:
                    raw = await asyncio.wait_for(websocket.recv(), timeout=max(0.2, deadline - time.monotonic()))
                except asyncio.TimeoutError:
                    break
                frame = self._decode(raw)
                if not frame:
                    continue
                event = str(frame.get("event") or frame.get("type") or "").lower()
                if "message" not in event and event not in {"chat", "agent"}:
                    continue
                payload = frame.get("payload") if isinstance(frame.get("payload"), dict) else frame
                frame_session = _deep_find(payload, {"sessionKey", "session_key", "key", "session"})
                if frame_session and str(frame_session) != session:
                    continue
                role = str(_deep_find(payload, {"role", "authorRole", "sender", "from"}) or "").lower()
                text = _deep_text(payload)
                if not text or text.strip() == message.strip():
                    continue
                if role and role not in {"assistant", "agent", "ai", "bot"}:
                    continue
                if text != latest_text:
                    latest_text = text
                    yield {"type": "delta", "text": latest_text}

                state = str(payload.get("state") or _deep_find(payload, {"state", "status"}) or "").lower()
                stop_reason = _deep_find(payload, {"stopReason", "stop_reason", "finishReason", "finish_reason"})
                if state in {"final", "done", "complete", "completed"} or stop_reason:
                    yield {"type": "final", "text": latest_text}
                    return

            yield {"type": "final", "text": latest_text}

    async def _read_challenge(self, websocket: Any) -> dict[str, Any]:
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=5)
        except asyncio.TimeoutError:
            return {}
        frame = self._decode(raw)
        return frame if frame and frame.get("event") == "connect.challenge" else {}

    async def _connect(self, websocket: Any, challenge: dict[str, Any]) -> dict[str, Any]:
        params: dict[str, Any] = {
            "minProtocol": 3,
            "maxProtocol": 3,
            "client": {
                "id": self.config.client_id,
                "version": "0.1.0",
                "platform": "python",
                "mode": self.config.client_mode,
            },
            "role": "operator",
            "scopes": ["operator.read", "operator.write"],
            "caps": [],
            "commands": [],
            "permissions": {},
            "auth": {"token": self.config.gateway_token},
            "locale": "zh-CN",
            "userAgent": "hyper-alpha-backend-openclaw/0.1.0",
            "device": self._build_device_signature(challenge),
        }
        if self.config.gateway_password:
            params["auth"]["password"] = self.config.gateway_password
        return await self._request(websocket, "connect", params)

    async def _send_user_message(self, websocket: Any, session: str, message: str) -> dict[str, Any]:
        candidates = [
            ("sessions.send", {"key": session, "message": message}),
            ("chat.send", {"sessionKey": session, "message": message, "idempotencyKey": str(uuid.uuid4())}),
        ]
        errors: list[str] = []
        for method, params in candidates:
            try:
                result = await self._request(websocket, method, params)
                return {"method": method, "response": result}
            except Exception as exc:
                errors.append(f"{method}: {exc}")
        raise RuntimeError("OpenClaw send failed: " + " | ".join(errors))

    async def _wait_for_reply(self, websocket: Any, session: str, *, ignore_text: str) -> str:
        deadline = time.monotonic() + self.config.timeout_seconds
        latest_text = ""
        while time.monotonic() < deadline:
            try:
                raw = await asyncio.wait_for(websocket.recv(), timeout=max(0.2, deadline - time.monotonic()))
            except asyncio.TimeoutError:
                break
            frame = self._decode(raw)
            if not frame:
                continue
            event = str(frame.get("event") or frame.get("type") or "").lower()
            if "message" not in event and event not in {"chat", "agent"}:
                continue
            payload = frame.get("payload") if isinstance(frame.get("payload"), dict) else frame
            frame_session = _deep_find(payload, {"sessionKey", "session_key", "key", "session"})
            if frame_session and str(frame_session) != session:
                continue
            role = str(_deep_find(payload, {"role", "authorRole", "sender", "from"}) or "").lower()
            text = _deep_text(payload)
            if not text or text.strip() == ignore_text.strip():
                continue
            if role and role not in {"assistant", "agent", "ai", "bot"}:
                continue
            latest_text = text

            # OpenClaw emits growing delta snapshots first, then a final chat
            # frame. Returning on the first delta truncates replies to titles.
            state = str(payload.get("state") or _deep_find(payload, {"state", "status"}) or "").lower()
            stop_reason = _deep_find(payload, {"stopReason", "stop_reason", "finishReason", "finish_reason"})
            if state in {"final", "done", "complete", "completed"} or stop_reason:
                return latest_text.strip()
        return latest_text.strip()

    async def _request(self, websocket: Any, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = str(next(self._ids))
        await websocket.send(json.dumps({"type": "req", "id": request_id, "method": method, "params": params}, ensure_ascii=False))
        deadline = time.monotonic() + min(self.config.timeout_seconds, 30)
        while time.monotonic() < deadline:
            raw = await asyncio.wait_for(websocket.recv(), timeout=max(0.2, deadline - time.monotonic()))
            frame = self._decode(raw)
            if not frame or str(frame.get("id") or "") != request_id:
                continue
            if frame.get("error") or frame.get("ok") is False:
                raise RuntimeError(_short_json(frame.get("error") or frame))
            return frame
        raise TimeoutError(f"OpenClaw request timed out: {method}")

    def _build_device_signature(self, challenge: dict[str, Any]) -> dict[str, Any]:
        private_key = self._load_or_create_device_key()
        public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        device_id = hashlib.sha256(public_bytes).hexdigest()
        payload = challenge.get("payload") if isinstance(challenge.get("payload"), dict) else challenge
        nonce = str(payload.get("nonce") or "") if isinstance(payload, dict) else ""
        signed_at = int(time.time() * 1000)
        scopes = ["operator.read", "operator.write"]
        sign_payload = "|".join(
            [
                "v2",
                device_id,
                self.config.client_id,
                self.config.client_mode,
                "operator",
                ",".join(scopes),
                str(signed_at),
                self.config.gateway_token,
                nonce,
            ]
        )
        return {
            "id": device_id,
            "publicKey": base64.b64encode(public_bytes).decode("ascii"),
            "signature": base64.b64encode(private_key.sign(sign_payload.encode("utf-8"))).decode("ascii"),
            "signedAt": signed_at,
            "nonce": nonce,
        }

    def _load_or_create_device_key(self) -> Ed25519PrivateKey:
        path = Path(self.config.device_key_path)
        if path.exists():
            private_key = load_pem_private_key(path.read_bytes(), password=None)
            if not isinstance(private_key, Ed25519PrivateKey):
                raise RuntimeError(f"{path} is not an Ed25519 private key")
            return private_key
        private_key = Ed25519PrivateKey.generate()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return private_key

    @staticmethod
    def _decode(raw: Any) -> dict[str, Any] | None:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None
