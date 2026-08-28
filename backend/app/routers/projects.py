"""Projects + auth (API key mint/revoke, demo login)."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ..core import db
from ..core.config import SIRIUS_PROJECT_ID, SIRIUS_DEMO_API_KEY, SIRIUS_DEMO_EMAIL
from ..core.security import get_current_project_id
from ..schemas import ApiKeyCreate, ApiKeyOut, Project, ProjectCreate

router = APIRouter(tags=["projects"])


@router.get("/projects")
async def list_projects() -> list[Project]:
    rows = await db.fetch("SELECT * FROM projects ORDER BY created_at DESC")
    return [
        Project(
            id=str(r["id"]),
            tenant_id=str(r["tenant_id"]),
            name=r["name"],
            repo_url=r.get("repo_url"),
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.post("/projects", status_code=201)
async def create_project(body: ProjectCreate) -> Project:
    tenant_id = "00000000-0000-4000-8000-000000000000"
    row_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO projects (id, tenant_id, name, repo_url) VALUES ($1,$2,$3,$4)",
        row_id,
        tenant_id,
        body.name,
        body.repo_url,
    )
    return Project(id=row_id, tenant_id=tenant_id, name=body.name, repo_url=body.repo_url, created_at=datetime.now(timezone.utc).isoformat())


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/auth/token")
async def login(body: LoginBody) -> dict:
    # Demo: accept the seeded demo account. Real mode: verify against users table.
    if body.email.lower() == SIRIUS_DEMO_EMAIL and body.password == "Demo123!":
        return {
            "access_token": "demo-jwt",
            "token_type": "bearer",
            "expires_in": 604800,
        }
    raise HTTPException(status_code=401, detail="invalid credentials")


@router.post("/auth/api-keys", status_code=201)
async def create_api_key(body: ApiKeyCreate, project_id: str = Depends(get_current_project_id)) -> ApiKeyOut:
    secret = f"sl_{secrets.token_hex(24)}"
    row_id = str(uuid.uuid4())
    prefix = secret[:12]
    expires = datetime.now(timezone.utc) + timedelta(days=body.expires_days)
    await db.execute(
        """INSERT INTO api_keys (id, project_id, name, prefix, key_hash, scopes, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
        row_id,
        project_id,
        body.name,
        prefix,
        hashlib.sha256(secret.encode()).hexdigest(),
        body.scopes,
        expires,
    )
    return ApiKeyOut(
        id=row_id,
        name=body.name,
        prefix=prefix,
        scopes=body.scopes,
        expires_at=expires.isoformat(),
        created_at=datetime.now(timezone.utc).isoformat(),
        secret=secret,
    )


@router.get("/auth/api-keys")
async def list_api_keys(project_id: str = Depends(get_current_project_id)) -> list[ApiKeyOut]:
    rows = await db.fetch("SELECT * FROM api_keys WHERE project_id = $1 ORDER BY created_at DESC", project_id)
    return [
        ApiKeyOut(
            id=str(r["id"]),
            name=r["name"],
            prefix=r["prefix"],
            scopes=r["scopes"] or [],
            expires_at=r["expires_at"].isoformat() if r["expires_at"] else None,
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.delete("/auth/api-keys/{key_id}", status_code=204, response_class=Response)
async def revoke_api_key(key_id: str, project_id: str = Depends(get_current_project_id)) -> Response:
    await db.execute("DELETE FROM api_keys WHERE id = $1 AND project_id = $2", key_id, project_id)
    return Response(status_code=204)
