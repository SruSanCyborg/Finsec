"""WebSocket auth — accepts Bearer header (CLI) or ?token= (browser).

D-004: the WebSocket at /scans/{id}/stream takes the same
`Authorization: Bearer <key>` header on the upgrade request, with a
`?token=` query fallback for browsers, which cannot set headers.

Credentials accepted, in priority order:
  1. Clerk session JWT (browser `?token=` or CLI `Authorization: Bearer`)
  2. Project API key (`SIRIUS_API_KEY` / demo key)
"""

from __future__ import annotations

import hmac

from fastapi import WebSocket

from .config import SIRIUS_DEMO_API_KEY
from .clerk import verify_clerk_token


def _constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _looks_like_jwt(token: str) -> bool:
    # Clerk session JWTs are three base64url segments (header.payload.sig).
    return token.count(".") == 2 and not token.startswith("sk_")


async def _accept(token: str | None, header: str) -> bool:
    # 1) API key (demo/project) — constant-time compare.
    if token and _constant_time_equal(token, SIRIUS_DEMO_API_KEY):
        return True
    if header.startswith("Bearer "):
        key = header.removeprefix("Bearer ").strip()
        if key and _constant_time_equal(key, SIRIUS_DEMO_API_KEY):
            return True

    # 2) Clerk JWT — verify signature against Clerk JWKS.
    candidate = token
    if candidate is None and header.startswith("Bearer "):
        candidate = header.removeprefix("Bearer ").strip()
    if candidate and _looks_like_jwt(candidate):
        try:
            payload = await verify_clerk_token(candidate)
            if payload:
                return True
        except Exception:
            return False
    return False


async def ws_authenticate(websocket: WebSocket) -> bool:
    """True if the connection carries a valid credential (header or query)."""
    token = websocket.query_params.get("token")
    auth = websocket.headers.get("authorization", "")
    return await _accept(token, auth)
