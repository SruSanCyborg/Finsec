"""Auth dependencies — Bearer API key (K) for CLI/CI, session/JWT (S) for Web.

The wire contract accepts `Authorization: Bearer <key>`. For the demo the key is
seeded (`demo-key`); production hashes and stores real keys in api_keys.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import SIRIUS_DEMO_API_KEY
from . import db

bearer = HTTPBearer(auto_error=False)


def _constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


async def require_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> str:
    """K-auth: a valid Bearer API key. Returns the key's project_id (or None)."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    key = credentials.credentials
    if not key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="empty bearer token")

    # Demo key
    if _constant_time_equal(key, SIRIUS_DEMO_API_KEY):
        return "demo"

    # Seeded keys in api_keys
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    row = await db.fetchrow(
        "SELECT project_id FROM api_keys WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > now())",
        key_hash,
    )
    if row:
        return str(row["project_id"])
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


async def get_current_project_id(credentials: str = Depends(require_api_key)) -> str:
    if credentials == "demo":
        from .config import SIRIUS_PROJECT_ID

        return SIRIUS_PROJECT_ID
    return credentials
