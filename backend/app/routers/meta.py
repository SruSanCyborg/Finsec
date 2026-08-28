"""Meta + identity + team + audit + notifications endpoints.

GET /health          — public liveness (no auth)
GET /api/v1/me       — current authenticated Sirius user
GET /api/v1/team     — members of the tenant
POST /api/v1/team/invite — invite by email + role
PATCH /api/v1/team/{id}   — update role/on-call/status
GET /api/v1/audit-log     — tenant audit trail
GET /api/v1/notifications — user notifications
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..core import db
from ..core.clerk import get_current_user
from ..schemas import Role

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health() -> dict:
    """Public liveness probe — no auth required."""
    try:
        await db.fetchval("SELECT 1")
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=503, detail="database unreachable")


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    """Current authenticated Sirius user."""
    return {
        "id": str(user["id"]),
        "clerkUserId": user.get("clerk_user_id"),
        "name": user.get("name") or "",
        "email": user.get("email") or "",
        "avatarUrl": user.get("avatar_url"),
        "role": user.get("role") or "member",
    }


def _member_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "name": row.get("name") or "",
        "email": row.get("email") or "",
        "role": row.get("role") or "member",
        "clerkUserId": row.get("clerk_user_id"),
        "avatarUrl": row.get("avatar_url"),
        "mfa": bool(row.get("mfa")),
        "onCall": bool(row.get("on_call")),
        "title": row.get("title") or "",
        "phone": row.get("phone"),
        "status": row.get("status") or "active",
        "joinedAt": row.get("created_at").isoformat() if row.get("created_at") else None,
    }


@router.get("/team")
async def list_team(user: dict = Depends(get_current_user)) -> list[dict]:
    tenant_id = user.get("tenant_id") or "00000000-0000-4000-8000-000000000000"
    rows = await db.fetch(
        "SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at", tenant_id
    )
    return [_member_out(r) for r in rows]


class InviteBody:
    emails: list[str]
    role: Role = "member"


@router.post("/team/invite")
async def invite(
    body: dict,
    user: dict = Depends(get_current_user),
) -> dict:
    tenant_id = user.get("tenant_id") or "00000000-0000-4000-8000-000000000000"
    emails = body.get("emails", [])
    role = body.get("role", "member")
    created = 0
    for email in emails:
        exists = await db.fetchval(
            "SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2", tenant_id, email
        )
        if exists:
            continue
        await db.execute(
            """INSERT INTO users (tenant_id, email, name, role, status)
               VALUES ($1,$2,$3,$4,'invited')""",
            tenant_id, email, email.split("@")[0], role,
        )
        created += 1
    await db.execute(
        """INSERT INTO audit_log (tenant_id, actor, action, target, meta)
           VALUES ($1,$2,'team.invite',$3,$4)""",
        tenant_id, user.get("id"), ", ".join(emails), {"count": created},
    )
    return {"invited": created}


@router.patch("/team/{member_id}")
async def update_member(
    member_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
) -> dict:
    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", member_id)
    if not row:
        raise HTTPException(status_code=404, detail="member not found")
    fields = []
    args = []
    for key, col in (
        ("role", "role"),
        ("onCall", "on_call"),
        ("status", "status"),
        ("title", "title"),
        ("phone", "phone"),
    ):
        if key in body:
            fields.append(f"{col} = ${len(args) + 1}")
            args.append(body[key])
    if fields:
        fields.append("updated_at = now()")
        await db.execute(
            f"UPDATE users SET {', '.join(fields)} WHERE id = ${len(args) + 1}",
            *args, member_id,
        )
    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", member_id)
    return _member_out(dict(row))


@router.delete("/team/{member_id}", status_code=204, response_class=Response)
async def remove_member(member_id: str, user: dict = Depends(get_current_user)) -> Response:
    await db.execute("DELETE FROM users WHERE id = $1", member_id)
    return Response(status_code=204)


@router.get("/audit-log")
async def audit_log(
    user: dict = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
    tenant_id = user.get("tenant_id") or "00000000-0000-4000-8000-000000000000"
    rows = await db.fetch(
        "SELECT * FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2",
        tenant_id, limit,
    )
    out = []
    for r in rows:
        out.append({
            "id": str(r["id"]),
            "at": r["created_at"].isoformat(),
            "actor": str(r["actor"]) if r.get("actor") else "system",
            "action": r["action"],
            "target": r.get("target") or "",
            "meta": r.get("meta"),
        })
    return out


@router.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)) -> list[dict]:
    rows = await db.fetch(
        "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
        user["id"],
    )
    out = []
    for r in rows:
        out.append({
            "id": str(r["id"]),
            "at": r["created_at"].isoformat(),
            "title": r["title"],
            "body": r["body"],
            "kind": r["kind"],
            "read": bool(r["read"]),
        })
    return out


@router.post("/notifications/read")
async def mark_read(body: dict, user: dict = Depends(get_current_user)) -> dict:
    await db.execute(
        "UPDATE notifications SET read = TRUE WHERE user_id = $1", user["id"]
    )
    return {"ok": True}
