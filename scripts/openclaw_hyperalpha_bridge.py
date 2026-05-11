#!/usr/bin/env python
"""
Relay OpenClaw gateway chat messages into Hyper Alpha's OpenClaw webhook.

Run this adapter near OpenClaw, for example on the same ECS host. It keeps the
OpenClaw WebSocket protocol out of Hyper Alpha's core backend and forwards only
normalized chat messages to /api/bot/openclaw/webhook.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import signal
import time
from dataclasses import dataclass, field
from itertools import count
from pathlib import Path
from typing import Any

import requests
import websockets
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
)


LOGGER = logging.getLogger("openclaw-hyperalpha-bridge")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _loads_json_env(name: str) -> dict[str, Any]:
    raw = _env(name)
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{name} must be valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise SystemExit(f"{name} must be a JSON object")
    return value


def _deep_get_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [_deep_get_text(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if not isinstance(value, dict):
        return ""

    for key in ("text", "message", "content", "input", "query", "prompt", "value"):
        text = _deep_get_text(value.get(key))
        if text:
            return text

    message = value.get("message")
    if isinstance(message, dict):
        text = _deep_get_text(message)
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


def _payload_from_frame(frame: dict[str, Any]) -> dict[str, Any]:
    for key in ("payload", "params", "data", "message"):
        value = frame.get(key)
        if isinstance(value, dict):
            return value
    return frame


def _frame_event_name(frame: dict[str, Any]) -> str:
    for key in ("event", "type", "method", "op"):
        value = frame.get(key)
        if isinstance(value, str):
            return value.lower()
    return ""


def _message_fingerprint(session_key: str, role: str, text: str, payload: dict[str, Any]) -> str:
    message_id = _deep_find(payload, {"id", "message_id", "messageId", "event_id", "eventId"})
    if message_id:
        raw = f"id:{message_id}"
    else:
        raw = f"{session_key}:{role}:{text}:{int(time.time() / 3)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class OpenClawMessage:
    text: str
    session_key: str
    chat_id: str
    role: str
    username: str
    user_id: str
    raw: dict[str, Any]


@dataclass
class BridgeConfig:
    openclaw_ws_url: str
    hyper_alpha_webhook_url: str
    hyper_alpha_bridge_token: str
    session_key: str = "agent:main:main"
    openclaw_gateway_token: str = ""
    openclaw_gateway_password: str = ""
    connect_method: str = "connect"
    connect_params: dict[str, Any] = field(default_factory=dict)
    client_id: str = "cli"
    client_mode: str = "cli"
    protocol_version: int = 3
    device_key_path: str = ".openclaw-device-key.pem"
    subscribe_methods: list[str] = field(default_factory=lambda: ["sessions.subscribe", "sessions.messages.subscribe"])
    reply_methods: list[str] = field(default_factory=lambda: ["sessions.send", "chat.send"])
    request_timeout_seconds: float = 20.0
    reconnect_seconds: float = 5.0
    dry_run: bool = False

    @classmethod
    def from_env(cls) -> "BridgeConfig":
        ws_url = _env("OPENCLAW_WS_URL")
        webhook_url = _env("HYPER_ALPHA_WEBHOOK_URL")
        bridge_token = _env("HYPER_ALPHA_BRIDGE_TOKEN")
        missing = [
            name
            for name, value in {
                "OPENCLAW_WS_URL": ws_url,
                "HYPER_ALPHA_WEBHOOK_URL": webhook_url,
                "HYPER_ALPHA_BRIDGE_TOKEN": bridge_token,
            }.items()
            if not value
        ]
        if missing:
            raise SystemExit(f"Missing required environment variables: {', '.join(missing)}")

        subscribe_methods = [
            item.strip()
            for item in _env("OPENCLAW_SUBSCRIBE_METHODS", "sessions.subscribe,sessions.messages.subscribe").split(",")
            if item.strip()
        ]
        reply_methods = [
            item.strip()
            for item in _env("OPENCLAW_REPLY_METHODS", "sessions.send,chat.send").split(",")
            if item.strip()
        ]

        return cls(
            openclaw_ws_url=ws_url,
            hyper_alpha_webhook_url=webhook_url,
            hyper_alpha_bridge_token=bridge_token,
            session_key=_env("OPENCLAW_SESSION_KEY", "agent:main:main"),
            openclaw_gateway_token=_env("OPENCLAW_GATEWAY_TOKEN"),
            openclaw_gateway_password=_env("OPENCLAW_GATEWAY_PASSWORD"),
            connect_method=_env("OPENCLAW_CONNECT_METHOD", "connect"),
            connect_params=_loads_json_env("OPENCLAW_CONNECT_PARAMS_JSON"),
            client_id=_env("OPENCLAW_CLIENT_ID", "cli"),
            client_mode=_env("OPENCLAW_CLIENT_MODE", "cli"),
            protocol_version=int(_env("OPENCLAW_PROTOCOL_VERSION", "3")),
            device_key_path=_env("OPENCLAW_DEVICE_KEY_PATH", ".openclaw-device-key.pem"),
            subscribe_methods=subscribe_methods,
            reply_methods=reply_methods,
            request_timeout_seconds=float(_env("OPENCLAW_REQUEST_TIMEOUT_SECONDS", "20")),
            reconnect_seconds=float(_env("OPENCLAW_RECONNECT_SECONDS", "5")),
            dry_run=_env_bool("OPENCLAW_BRIDGE_DRY_RUN"),
        )


class OpenClawHyperAlphaBridge:
    def __init__(self, config: BridgeConfig) -> None:
        self.config = config
        self._ids = count(1)
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._seen: set[str] = set()
        self._stop = asyncio.Event()
        self._websocket: Any = None

    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                await self._run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("OpenClaw bridge connection failed")

            if not self._stop.is_set():
                await asyncio.sleep(self.config.reconnect_seconds)

    def stop(self) -> None:
        self._stop.set()

    async def _run_once(self) -> None:
        LOGGER.info("Connecting OpenClaw gateway: %s", self.config.openclaw_ws_url)
        async with websockets.connect(self.config.openclaw_ws_url, ping_interval=30, ping_timeout=20) as websocket:
            self._websocket = websocket
            initial_frames, challenge = await self._read_initial_frames(websocket)
            receiver = asyncio.create_task(self._receive_loop(initial_frames))
            try:
                await self._openclaw_connect(challenge)
                await self._subscribe()
                await self._stop.wait()
            finally:
                receiver.cancel()
                await asyncio.gather(receiver, return_exceptions=True)
                self._websocket = None

    async def _read_initial_frames(self, websocket: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        initial_frames: list[dict[str, Any]] = []
        challenge: dict[str, Any] = {}
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=2.0)
        except asyncio.TimeoutError:
            return initial_frames, challenge

        frame = self._decode_frame(raw)
        if not frame:
            return initial_frames, challenge

        event = _frame_event_name(frame)
        if "challenge" in event or "challenge" in frame:
            challenge = frame.get("challenge") if isinstance(frame.get("challenge"), dict) else frame
            LOGGER.info("Received OpenClaw gateway challenge")
        else:
            initial_frames.append(frame)
        return initial_frames, challenge

    async def _openclaw_connect(self, challenge: dict[str, Any]) -> None:
        device = self._build_device_signature(challenge)
        scopes = ["operator.read", "operator.write"]
        params: dict[str, Any] = {
            "minProtocol": self.config.protocol_version,
            "maxProtocol": self.config.protocol_version,
            "client": {
                "id": self.config.client_id,
                "version": "0.1.0",
                "platform": "python",
                "mode": self.config.client_mode,
            },
            "role": "operator",
            "scopes": scopes,
            "caps": [],
            "commands": [],
            "permissions": {},
            "auth": {"token": self.config.openclaw_gateway_token},
            "locale": "zh-CN",
            "userAgent": "hyper-alpha-openclaw-bridge/0.1.0",
            "device": device,
        }
        if self.config.openclaw_gateway_password:
            params["auth"]["password"] = self.config.openclaw_gateway_password
        params.update({key: value for key, value in self.config.connect_params.items() if value not in (None, "")})

        params = {key: value for key, value in params.items() if value not in (None, "", {})}
        try:
            response = await self._request(self.config.connect_method, params)
            LOGGER.info("OpenClaw connect accepted: %s", self._short_json(response))
        except Exception:
            LOGGER.exception("OpenClaw connect request failed")
            raise

    def _build_device_signature(self, challenge: dict[str, Any]) -> dict[str, Any]:
        private_key = self._load_or_create_device_key()
        public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        device_id = hashlib.sha256(public_bytes).hexdigest()
        public_key = base64.b64encode(public_bytes).decode("ascii")

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
                self.config.openclaw_gateway_token,
                nonce,
            ]
        )
        signature = base64.b64encode(private_key.sign(sign_payload.encode("utf-8"))).decode("ascii")
        return {
            "id": device_id,
            "publicKey": public_key,
            "signature": signature,
            "signedAt": signed_at,
            "nonce": nonce,
        }

    def _load_or_create_device_key(self) -> Ed25519PrivateKey:
        path = Path(self.config.device_key_path)
        if path.exists():
            private_key = load_pem_private_key(path.read_bytes(), password=None)
            if not isinstance(private_key, Ed25519PrivateKey):
                raise RuntimeError(f"{path} does not contain an Ed25519 private key")
            return private_key

        private_key = Ed25519PrivateKey.generate()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(
            private_key.private_bytes(
                Encoding.PEM,
                PrivateFormat.PKCS8,
                NoEncryption(),
            )
        )
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        LOGGER.info("Created OpenClaw device key: %s", path)
        return private_key

    async def _subscribe(self) -> None:
        for method in self.config.subscribe_methods:
            params = self._subscribe_params(method)
            try:
                response = await self._request(method, params)
                LOGGER.info("Subscribed via %s: %s", method, self._short_json(response))
            except Exception as exc:
                LOGGER.warning("Subscribe method %s failed: %s", method, exc)

    def _subscribe_params(self, method: str) -> dict[str, Any]:
        if method == "sessions.messages.subscribe":
            return {"key": self.config.session_key}
        return {"sessionKey": self.config.session_key, "key": self.config.session_key}

    async def _receive_loop(self, initial_frames: list[dict[str, Any]]) -> None:
        for frame in initial_frames:
            await self._handle_frame(frame)

        assert self._websocket is not None
        async for raw in self._websocket:
            frame = self._decode_frame(raw)
            if frame:
                await self._handle_frame(frame)

    async def _handle_frame(self, frame: dict[str, Any]) -> None:
        request_id = str(frame.get("id") or "")
        if request_id and request_id in self._pending:
            future = self._pending.pop(request_id)
            if frame.get("error") or frame.get("ok") is False:
                future.set_exception(RuntimeError(self._short_json(frame["error"])))
            else:
                future.set_result(frame)
            return

        message = self._extract_message(frame)
        if not message:
            LOGGER.debug("Ignored OpenClaw frame: %s", self._short_json(frame))
            return

        fingerprint = _message_fingerprint(message.session_key, message.role, message.text, message.raw)
        if fingerprint in self._seen:
            return
        self._seen.add(fingerprint)
        if len(self._seen) > 2048:
            self._seen = set(list(self._seen)[-1024:])

        LOGGER.info("Forwarding OpenClaw message session=%s text=%r", message.session_key, message.text[:120])
        reply = await self._post_to_hyper_alpha(message)
        if reply:
            await self._send_reply(message.session_key, reply)

    def _extract_message(self, frame: dict[str, Any]) -> OpenClawMessage | None:
        payload = _payload_from_frame(frame)
        event_name = _frame_event_name(frame)
        role = str(_deep_find(payload, {"role", "sender", "from", "authorRole"}) or "").lower()
        source = str(_deep_find(payload, {"source", "origin"}) or "").lower()
        text = _deep_get_text(payload)

        if not text:
            return None
        if "message" not in event_name and role not in {"user", "human", "client"}:
            return None
        if role and role not in {"user", "human", "client"}:
            return None
        if "hyper-alpha" in source or "openclaw-bridge" in source:
            return None

        session_key = str(
            _deep_find(payload, {"sessionKey", "session_key", "session", "chat_id", "chatId", "conversation_id"})
            or self.config.session_key
        )
        username = str(_deep_find(payload, {"username", "name", "displayName", "display_name"}) or "openclaw")
        user_id = str(_deep_find(payload, {"userId", "user_id", "id"}) or username)
        return OpenClawMessage(
            text=text,
            session_key=session_key,
            chat_id=session_key,
            role=role or "user",
            username=username,
            user_id=user_id,
            raw=payload,
        )

    async def _post_to_hyper_alpha(self, message: OpenClawMessage) -> str:
        if self.config.dry_run:
            LOGGER.info("DRY RUN would POST to Hyper Alpha: %s", message.text)
            return "[dry-run] Hyper Alpha webhook was not called."

        def post() -> str:
            response = requests.post(
                self.config.hyper_alpha_webhook_url,
                headers={
                    "Authorization": f"Bearer {self.config.hyper_alpha_bridge_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "message": message.text,
                    "chat_id": message.chat_id,
                    "user": {
                        "id": message.user_id,
                        "username": message.username,
                    },
                    "metadata": {
                        "source": "openclaw",
                        "session_key": message.session_key,
                    },
                },
                timeout=self.config.request_timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            return str(data.get("reply") or data.get("message") or data.get("content") or "")

        return await asyncio.to_thread(post)

    async def _send_reply(self, session_key: str, reply: str) -> None:
        if self.config.dry_run:
            LOGGER.info("DRY RUN would send reply to OpenClaw: %r", reply[:120])
            return

        errors: list[str] = []
        for method in self.config.reply_methods:
            for params in self._reply_param_candidates(session_key, reply):
                try:
                    response = await self._request(method, params)
                    LOGGER.info("Sent reply via %s: %s", method, self._short_json(response))
                    return
                except Exception as exc:
                    errors.append(f"{method}: {exc}")
        raise RuntimeError("All OpenClaw reply methods failed: " + " | ".join(errors[-5:]))

    def _reply_param_candidates(self, session_key: str, reply: str) -> list[dict[str, Any]]:
        message = {
            "role": "assistant",
            "content": reply,
            "metadata": {"source": "hyper-alpha-openclaw-bridge"},
        }
        return [
            {"key": session_key, "message": message},
            {"key": session_key, "role": "assistant", "content": reply, "source": "hyper-alpha-openclaw-bridge"},
            {"key": session_key, "text": reply, "role": "assistant", "source": "hyper-alpha-openclaw-bridge"},
            {"sessionKey": session_key, "message": message},
        ]

    async def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if not self._websocket:
            raise RuntimeError("OpenClaw websocket is not connected")

        request_id = str(next(self._ids))
        frame = {"type": "req", "id": request_id, "method": method, "params": params}
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        await self._websocket.send(json.dumps(frame, ensure_ascii=False))
        return await asyncio.wait_for(future, timeout=self.config.request_timeout_seconds)

    @staticmethod
    def _decode_frame(raw: Any) -> dict[str, Any] | None:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            LOGGER.debug("Ignored non-JSON OpenClaw frame: %r", raw)
            return None
        if isinstance(value, dict):
            return value
        LOGGER.debug("Ignored non-object OpenClaw frame: %r", value)
        return None

    @staticmethod
    def _short_json(value: Any) -> str:
        text = json.dumps(value, ensure_ascii=False, default=str)
        return text if len(text) <= 500 else text[:497] + "..."


async def _amain() -> None:
    logging.basicConfig(
        level=_env("OPENCLAW_BRIDGE_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    bridge = OpenClawHyperAlphaBridge(BridgeConfig.from_env())

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, bridge.stop)
        except NotImplementedError:
            pass

    await bridge.run()


def main() -> None:
    asyncio.run(_amain())


if __name__ == "__main__":
    main()
