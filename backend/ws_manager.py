"""
SSTG – WebSocket Connection Manager
Broadcasts real-time timetable events to all connected clients.

Events broadcast:
  - slot_moved       { draft_id, slot }
  - slot_locked      { draft_id, slot_id, is_locked }
  - draft_generated  { drafts: [...] }
  - draft_reshuffled { draft_id }
  - draft_activated  { draft_id }
  - draft_deleted    { draft_id }
  - user_joined      { username, count }
"""
import json
import logging
from typing import Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # draft_id -> set of (websocket, username)
        self._draft_rooms: Dict[str, List[dict]] = {}
        # global connections (dashboard etc.)
        self._global: List[dict] = []

    async def connect_global(self, websocket: WebSocket, username: str):
        await websocket.accept()
        conn = {"ws": websocket, "username": username}
        self._global.append(conn)
        logger.info(f"WS global connect: {username} ({len(self._global)} total)")

    async def connect_draft(self, websocket: WebSocket, draft_id: str, username: str):
        await websocket.accept()
        conn = {"ws": websocket, "username": username}
        if draft_id not in self._draft_rooms:
            self._draft_rooms[draft_id] = []
        self._draft_rooms[draft_id].append(conn)
        count = len(self._draft_rooms[draft_id])
        logger.info(f"WS draft {draft_id} connect: {username} ({count} viewers)")
        # Notify others in room
        await self._broadcast_draft(draft_id, {
            "event": "user_joined",
            "username": username,
            "viewers": count,
        }, exclude=websocket)

    def disconnect(self, websocket: WebSocket):
        # Remove from global
        self._global = [c for c in self._global if c["ws"] is not websocket]
        # Remove from all draft rooms
        for draft_id in list(self._draft_rooms.keys()):
            before = self._draft_rooms[draft_id]
            self._draft_rooms[draft_id] = [c for c in before if c["ws"] is not websocket]
            if not self._draft_rooms[draft_id]:
                del self._draft_rooms[draft_id]

    async def broadcast_draft_event(self, draft_id: str, event: dict):
        """Broadcast to everyone watching a specific draft."""
        await self._broadcast_draft(draft_id, event)

    async def broadcast_global_event(self, event: dict):
        """Broadcast to all globally connected clients."""
        dead = []
        for conn in self._global:
            try:
                await conn["ws"].send_text(json.dumps(event))
            except Exception:
                dead.append(conn)
        for d in dead:
            self._global.remove(d)

    async def _broadcast_draft(self, draft_id: str, event: dict, exclude: WebSocket = None):
        conns = self._draft_rooms.get(draft_id, [])
        dead = []
        for conn in conns:
            if conn["ws"] is exclude:
                continue
            try:
                await conn["ws"].send_text(json.dumps(event))
            except Exception:
                dead.append(conn)
        for d in dead:
            if d in self._draft_rooms.get(draft_id, []):
                self._draft_rooms[draft_id].remove(d)

    def viewer_count(self, draft_id: str) -> int:
        return len(self._draft_rooms.get(draft_id, []))

    def global_count(self) -> int:
        return len(self._global)


# Singleton instance — imported by routers
manager = ConnectionManager()
