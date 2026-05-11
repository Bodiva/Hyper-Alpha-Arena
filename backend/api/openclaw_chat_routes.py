"""Backend-owned OpenClaw chat APIs."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from services.openclaw_gateway_client import OpenClawGatewayClient, OpenClawGatewayConfig


router = APIRouter(prefix="/api/openclaw", tags=["OpenClaw Chat"])


class OpenClawChatRequest(BaseModel):
    message: str
    session_key: str | None = None


@router.get("/status")
def get_openclaw_gateway_status():
    config = OpenClawGatewayConfig.from_env()
    return {
        "configured": bool(config.ws_url and config.gateway_token),
        "ws_url": config.ws_url if config.ws_url else None,
        "session_key": config.session_key,
        "device_key_path": config.device_key_path,
    }


@router.post("/chat")
async def send_openclaw_chat(request: OpenClawChatRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    client = OpenClawGatewayClient()
    if not client.is_configured():
        raise HTTPException(
            status_code=503,
            detail="OpenClaw gateway is not configured. Set OPENCLAW_WS_URL and OPENCLAW_GATEWAY_TOKEN in the backend environment.",
        )

    try:
        return await client.send_chat(message, session_key=request.session_key)
    except RuntimeError as exc:
        detail = str(exc)
        status = 424 if "PAIRING_REQUIRED" in detail or "NOT_PAIRED" in detail or "pairing required" in detail else 502
        raise HTTPException(status_code=status, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenClaw chat failed: {exc}") from exc


@router.post("/chat/stream")
async def stream_openclaw_chat(request: OpenClawChatRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    client = OpenClawGatewayClient()
    if not client.is_configured():
        raise HTTPException(
            status_code=503,
            detail="OpenClaw gateway is not configured. Set OPENCLAW_WS_URL and OPENCLAW_GATEWAY_TOKEN in the backend environment.",
        )

    def encode_event(event: str, payload: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    async def events():
        try:
            async for item in client.stream_chat(message, session_key=request.session_key):
                yield encode_event(str(item.get("type") or "message"), item)
        except Exception as exc:
            detail = str(exc)
            event = "pairing_required" if "pairing required" in detail.lower() else "error"
            yield encode_event(event, {"type": event, "detail": detail})

    return StreamingResponse(events(), media_type="text/event-stream")
