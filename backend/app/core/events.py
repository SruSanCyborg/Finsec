"""Live event hub — broadcasts scan events to connected web clients.

CLI scans and web-initiated scans both go through the same worker; the worker
pushes every event here, and every open WebSocket connection gets it.
Two channels: per-scan (`/scans/{id}/stream`) and global (`/events`).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket

# scan_id -> set of connected websockets
_connections: dict[str, set[WebSocket]] = {}
# global (all events) connections
_global_connections: set[WebSocket] = set()
_lock = asyncio.Lock()


async def connect(scan_id: str, ws: WebSocket) -> None:
    async with _lock:
        _connections.setdefault(scan_id, set()).add(ws)


async def disconnect(scan_id: str, ws: WebSocket) -> None:
    async with _lock:
        conns = _connections.get(scan_id)
        if conns:
            conns.discard(ws)
            if not conns:
                _connections.pop(scan_id, None)


async def connect_global(ws: WebSocket) -> None:
    async with _lock:
        _global_connections.add(ws)


async def disconnect_global(ws: WebSocket) -> None:
    async with _lock:
        _global_connections.discard(ws)


async def broadcast(scan_id: str, event: dict[str, Any]) -> None:
    """Send an event to every WS connected to this scan + every global listener."""
    async with _lock:
        conns = list(_connections.get(scan_id, set())) + list(_global_connections)
    if not conns:
        return
    payload = json.dumps(event, default=str)
    for ws in conns:
        try:
            await ws.send_text(payload)
        except Exception:
            if ws in _global_connections:
                await disconnect_global(ws)
            else:
                await disconnect(scan_id, ws)
