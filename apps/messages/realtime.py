from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[int, Set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        connections = self.active_connections.get(user_id)
        if not connections:
            return

        connections.discard(websocket)
        if not connections:
            self.active_connections.pop(user_id, None)

    def has_active_connections(self, user_id: int) -> bool:
        return bool(self.active_connections.get(user_id))

    def connected_user_ids(self) -> Set[int]:
        return set(self.active_connections.keys())

    async def send_to_user(self, user_id: int, payload: dict) -> None:
        stale_connections = []

        for websocket in list(self.active_connections.get(user_id, set())):
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(user_id, websocket)

    async def broadcast_to_users(
        self,
        user_ids: Iterable[int],
        payload: dict,
        exclude_user_id: int | None = None,
    ) -> None:
        for user_id in set(user_ids):
            if exclude_user_id is not None and user_id == exclude_user_id:
                continue
            await self.send_to_user(user_id, payload)


connection_manager = ConnectionManager()
