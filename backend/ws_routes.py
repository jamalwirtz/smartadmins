"""
SSTG – WebSocket Routes
Real-time timetable collaboration via WebSockets.

Endpoints:
  WS /ws/draft/{draft_id}?token=<jwt>   – Watch a specific draft room
  WS /ws/global?token=<jwt>             – Global dashboard updates
"""
import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from config import get_settings
from ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


def _decode_token(token: str) -> str:
    """Decode JWT and return username, or 'anonymous' on failure."""
    try:
        from security import decode_token
        payload = decode_token(token)
        return payload.get("sub", "anonymous")
    except Exception:
        return "anonymous"


@router.websocket("/ws/draft/{draft_id}")
async def ws_draft(
    websocket: WebSocket,
    draft_id: str,
    token: str = Query(default=""),
):
    username = _decode_token(token) if token else "viewer"
    await manager.connect_draft(websocket, draft_id, username)
    try:
        while True:
            # Keep connection alive; clients can send ping messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"WS draft {draft_id} disconnect: {username}")
        # Notify remaining viewers
        await manager.broadcast_draft_event(draft_id, {
            "event": "user_left",
            "username": username,
            "viewers": manager.viewer_count(draft_id),
        })


@router.websocket("/ws/global")
async def ws_global(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    username = _decode_token(token) if token else "viewer"
    await manager.connect_global(websocket, username)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"WS global disconnect: {username}")
