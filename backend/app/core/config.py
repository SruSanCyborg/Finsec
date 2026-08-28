"""Application configuration.

Everything is read from environment variables with sensible defaults for local
development. Neon credentials live ONLY here (backend .env), never in the
browser client.
"""

from __future__ import annotations

import os

# The canonical name — reads DATABASE_URL from a backend/.env (via python-dotenv
# in main.py) or the process environment.
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_KZ3CkFl4PpeM@ep-fancy-glitter-aem24sf2-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
)

# CORS: the web console (Next.js on :3000). Comma-separated list.
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("SIRIUS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

API_V1_PREFIX: str = "/api/v1"

# Seed values (dev convenience). Override in production.
SIRIUS_PROJECT_ID: str = os.getenv("SIRIUS_PROJECT_ID", "11111111-1111-4111-8111-111111111111")
SIRIUS_DEMO_API_KEY: str = os.getenv("SIRIUS_DEMO_API_KEY", "demo-key")
SIRIUS_DEMO_EMAIL: str = os.getenv("SIRIUS_DEMO_EMAIL", "demo@siriusline.io")

# Hosted report/badge base — used when a project is configured.
SIRIUS_BASE_URL: str = os.getenv("SIRIUS_BASE_URL", "http://localhost:8000")

# Simple bearer-token auth for the demo. In production this is a real key store
# (hashed), but the wire contract (Authorization: Bearer <key>) is identical.
AUTH_MODE: str = os.getenv("SIRIUS_AUTH_MODE", "api-key")
