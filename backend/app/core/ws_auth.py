"""WebSocket auth — accepts Bearer header (CLI) or ?token= (browser).

D-004: the WebSocket at /scans/{id}/stream takes the same
`Authorization: Bearer <key>` header on the upgrade request, with a
`?token=` query fallback for browsers, which cannot set headers.
"""

from __future__ import annotations

import hmac

from fastapi import WebSocket

from .config import SIRIUS_DEMO_API_KEY


def _constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


async def ws_authenticate(websocket: WebSocket) -> bool:
    """True if the connection carries a valid credential (header or query)."""
    token = websocket.query_params.get("token")
    if token and _constant_time_equal(token, SIRIUS_DEMO_API_KEY):
        return True
    auth = websocket.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        key = auth.removeprefix("Bearer ").strip()
        if key and _constant_time_equal(key, SIRIUS_DEMO_API_KEY):
            return True
    return False
