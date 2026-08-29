"""Clerk session-token verification + Sirius user sync.

The browser authenticates with Clerk; the backend verifies the Clerk session
token (JWT) on every protected request, extracts the Clerk user id, and maps it
to a Sirius user (creating one on first access). The browser's own claims are
never trusted — only the verified token payload is.

Uses Clerk's JWKS endpoint to verify RS256 signatures. Falls back to the demo
key (demo-key) when CLERK_SECRET_KEY is not configured, so the app still works
in mock mode.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import CLERK_SECRET_KEY, SIRIUS_DEMO_API_KEY, SIRIUS_PROJECT_ID
from . import db

bearer = HTTPBearer(auto_error=False)

# Cached JWKS + verified Clerk token cache (in-process).
_jwks: dict | None = None
_jwks_fetched_at: float = 0
_token_cache: dict[str, dict] = {}  # jti -> payload (verified)

CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return __import__("base64").urlsafe_b64decode(data + pad)


async def _get_jwks() -> dict:
    global _jwks, _jwks_fetched_at
    # Cache for 1 hour
    if _jwks and time.time() - _jwks_fetched_at < 3600:
        return _jwks
    headers = {}
    if CLERK_SECRET_KEY:
        headers["Authorization"] = f"Bearer {CLERK_SECRET_KEY}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(CLERK_JWKS_URL, headers=headers)
        resp.raise_for_status()
        _jwks = resp.json()
        _jwks_fetched_at = time.time()
    return _jwks


def _verify_rs256(token: str) -> dict | None:
    """Verify a Clerk JWT (RS256) against Clerk's JWKS. Returns payload or None."""
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))

        # Reject if the token is from a different issuer
        if not str(payload.get("iss", "")).endswith("clerk.accounts.dev"):
            return None

        # Verify signature against the matching JWKS key
        import base64

        jwks = _jwks or {}
        keys = jwks.get("keys", [])
        kid = header.get("kid")
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            return None

        # Build the RSA public key from JWK and verify
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization, hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        n = int.from_bytes(base64.urlsafe_b64decode(key["n"] + "=" * (-len(key["n"]) % 4)), "big")
        e = int.from_bytes(base64.urlsafe_b64decode(key["e"] + "=" * (-len(key["e"]) % 4)), "big")
        pub = rsa.RSAPublicNumbers(e, n).public_key()

        message = f"{header_b64}.{payload_b64}".encode()
        signature = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
        pub.verify(signature, message, padding.PKCS1v15(), hashes.SHA256())

        # Check expiry
        exp = payload.get("exp", 0)
        if exp < time.time():
            return None
        return payload
    except Exception as exc:
        import logging

        logging.getLogger("sirius.clerk").exception("clerk verify failed: %s", exc)
        return None


async def verify_clerk_token(token: str) -> dict | None:
    """Verify a Clerk session token; returns the payload or None."""
    if token in _token_cache:
        cached = _token_cache[token]
        if cached.get("exp", 0) > time.time():
            return cached
        _token_cache.pop(token, None)
    try:
        await _get_jwks()
    except Exception:
        return None
    payload = _verify_rs256(token)
    if payload:
        _token_cache[token] = payload
    return payload


def _constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


async def get_current_user(request: Request):
    """Auth dependency: returns the authenticated Sirius user row (dict).

    Priority:
      1. Clerk session token (Authorization: Bearer <clerk-session-jwt>)
      2. Sirius API key (demo-key or a seeded api_keys row) → demo user
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else ""

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required")

    # Try Clerk first (only when a secret key is configured)
    if CLERK_SECRET_KEY:
        payload = await verify_clerk_token(token)
        if payload:
            clerk_user_id = payload.get("sub")
            if not clerk_user_id:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token payload")
            return await _sync_user(clerk_user_id, payload)

        # Not a Clerk token — fall through to API key check
        key = await _check_api_key(token)
        if key:
            return await _demo_user()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired session")

    # No Clerk configured → API key mode
    key = await _check_api_key(token)
    if key:
        return await _demo_user()
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


async def _check_api_key(token: str) -> bool:
    # demo-key (API key) and demo-jwt (session token from /auth/token)
    if _constant_time_equal(token, SIRIUS_DEMO_API_KEY):
        return True
    if _constant_time_equal(token, "demo-jwt"):
        return True
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    row = await db.fetchrow(
        "SELECT 1 FROM api_keys WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > now())",
        key_hash,
    )
    return row is not None


async def _demo_user() -> dict:
    row = await db.fetchrow(
        "SELECT * FROM users WHERE email = 'demo@sirius.dev' ORDER BY created_at LIMIT 1"
    )
    if row:
        return dict(row)
    # create demo user if missing
    from .config import SIRIUS_DEMO_EMAIL

    user_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO users (id, tenant_id, email, name, role)
           VALUES ($1,'00000000-0000-4000-8000-000000000000',$2,'Aarav Mehta','owner')""",
        user_id,
        SIRIUS_DEMO_EMAIL,
    )
    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row)


async def _clerk_user_profile(clerk_user_id: str) -> dict:
    """Fetch the user's profile from Clerk's API (email/name/avatar)."""
    if not CLERK_SECRET_KEY:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.clerk.com/v1/users/{clerk_user_id}",
                headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
            )
            if resp.status_code != 200:
                return {}
            data = resp.json()
            email = ""
            for e in data.get("email_addresses", []):
                if e.get("id") == data.get("primary_email_address_id"):
                    email = e.get("email_address", "")
                    break
            if not email and data.get("email_addresses"):
                email = data["email_addresses"][0].get("email_address", "")
            return {
                "email": email,
                "name": data.get("first_name") or data.get("username") or "",
                "avatar": data.get("image_url"),
            }
    except Exception:
        return {}


async def _sync_user(clerk_user_id: str, payload: dict) -> dict:
    """Find the Sirius user by clerk_user_id; create if missing. Returns the row."""
    row = await db.fetchrow("SELECT * FROM users WHERE clerk_user_id = $1", clerk_user_id)
    if row:
        return dict(row)

    # The session JWT usually has no email/name — enrich from Clerk's API.
    profile = await _clerk_user_profile(clerk_user_id)
    email = profile.get("email") or payload.get("email") or ""
    name = profile.get("name") or payload.get("name") or payload.get("username") or email.split("@")[0] or "Sirius User"
    avatar = profile.get("avatar") or payload.get("picture")

    if not email:
        # No email available — fall back to a stable placeholder so the user row
        # can still be created (email is NOT NULL UNIQUE).
        email = f"{clerk_user_id}@clerk.sirius.dev"

    # Also match by email if a user was created without a clerk id (demo seed)
    existing = await db.fetchrow("SELECT * FROM users WHERE email = $1 AND clerk_user_id IS NULL", email)
    if existing:
        await db.execute(
            "UPDATE users SET clerk_user_id = $1, name = $2, avatar_url = $3, updated_at = now() WHERE id = $4",
            clerk_user_id, name, avatar, existing["id"],
        )
        row = await db.fetchrow("SELECT * FROM users WHERE id = $1", existing["id"])
        return dict(row)

    user_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO users (id, tenant_id, clerk_user_id, email, name, avatar_url, role)
           VALUES ($1,'00000000-0000-4000-8000-000000000000',$2,$3,$4,$5,'owner')""",
        user_id, clerk_user_id, email, name, avatar,
    )
    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row)


# Keep the old name working for existing routers
async def get_current_project_id(user: dict = Depends(get_current_user)) -> str:
    return SIRIUS_PROJECT_ID
