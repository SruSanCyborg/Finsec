"""Seed the demo workspace: tenant, project, demo user, demo API key.

Idempotent — safe to run on every boot (uses ON CONFLICT DO NOTHING).
"""

from __future__ import annotations

import hashlib

from .core import db
from .core.config import SIRIUS_DEMO_API_KEY, SIRIUS_PROJECT_ID

TENANT_ID = "00000000-0000-4000-8000-000000000000"
DEMO_USER_ID = "00000000-0000-4000-8000-000000000001"


async def seed() -> None:
    await db.execute(
        """INSERT INTO tenants (id, name) VALUES ($1,'Sirius Demo')
           ON CONFLICT (id) DO NOTHING""",
        TENANT_ID,
    )
    await db.execute(
        """INSERT INTO projects (id, tenant_id, name) VALUES ($1,$2,'Sirius Line Demo')
           ON CONFLICT (id) DO NOTHING""",
        SIRIUS_PROJECT_ID,
        TENANT_ID,
    )
    await db.execute(
        """INSERT INTO users (id, tenant_id, email, name, role, mfa)
           VALUES ($1,$2,'demo@siriusline.io','Aarav Mehta','owner',FALSE)
           ON CONFLICT (id) DO NOTHING""",
        DEMO_USER_ID,
        TENANT_ID,
    )
    await db.execute(
        """INSERT INTO api_keys (id, project_id, name, prefix, key_hash, scopes)
           VALUES ($1,$2,'demo-key','demo-key', $3, ARRAY['admin'])
           ON CONFLICT (key_hash) DO NOTHING""",
        "00000000-0000-4000-8000-000000000002",
        SIRIUS_PROJECT_ID,
        hashlib.sha256(SIRIUS_DEMO_API_KEY.encode()).hexdigest(),
    )
    exists = await db.fetchval("SELECT 1 FROM policies WHERE project_id = $1", SIRIUS_PROJECT_ID)
    if not exists:
        await db.execute("INSERT INTO policies (project_id) VALUES ($1)", SIRIUS_PROJECT_ID)
