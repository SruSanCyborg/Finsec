"""Workspace endpoints: integrations, alerts, assets, attack paths, AI config.

These were mock-only on the frontend; this gives the backend the same surface so
the web console can switch to real mode without UI changes.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..core import db
from ..core.clerk import get_current_user

router = APIRouter(tags=["workspace"])


# ---- integrations -----------------------------------------------------------

@router.get("/integrations")
async def list_integrations(user: dict = Depends(get_current_user)) -> list[dict]:
    rows = await db.fetch("SELECT * FROM integrations ORDER BY name")
    out = []
    for r in rows:
        out.append({
            "id": str(r["id"]),
            "name": r["name"],
            "category": r["category"],
            "description": r["description"] or "",
            "connected": bool(r["connected"]),
            "events": r["events"] or 0,
        })
    return out


@router.patch("/integrations/{integration_id}")
async def toggle_integration(
    integration_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
) -> dict:
    row = await db.fetchrow("SELECT * FROM integrations WHERE id = $1", integration_id)
    if not row:
        raise HTTPException(status_code=404, detail="integration not found")
    connected = not bool(row["connected"])
    await db.execute(
        "UPDATE integrations SET connected = $1 WHERE id = $2", connected, integration_id
    )
    return {"id": str(integration_id), "connected": connected}


# ---- alerts ----------------------------------------------------------------

@router.get("/alerts")
async def list_alerts(user: dict = Depends(get_current_user)) -> list[dict]:
    rows = await db.fetch("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50")
    out = []
    for r in rows:
        out.append({
            "id": str(r["id"]),
            "title": r["title"],
            "severity": r["severity"],
            "recipient": r["recipient"] or "",
            "phone": r["phone"] or "",
            "policy": r["policy"] or "",
            "status": r["status"],
            "triggeredAt": r["created_at"].isoformat(),
            "acknowledgedAt": r["acknowledged_at"].isoformat() if r.get("acknowledged_at") else None,
            "findingKey": r.get("finding_key"),
            "transcript": r.get("transcript") or [],
            "durationSec": r["duration_sec"] or 0,
        })
    return out


@router.patch("/alerts/{alert_id}")
async def update_alert(
    alert_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
) -> dict:
    row = await db.fetchrow("SELECT * FROM alerts WHERE id = $1", alert_id)
    if not row:
        raise HTTPException(status_code=404, detail="alert not found")
    status = body.get("status")
    if status:
        await db.execute("UPDATE alerts SET status = $1 WHERE id = $2", status, alert_id)
        if status in ("acknowledged", "resolved"):
            await db.execute(
                "UPDATE alerts SET acknowledged_at = now() WHERE id = $1", alert_id
            )
    return {"id": str(alert_id), "status": status or row["status"]}


# ---- assets ----------------------------------------------------------------

@router.get("/assets")
async def list_assets(user: dict = Depends(get_current_user)) -> list[dict]:
    rows = await db.fetch("SELECT * FROM assets ORDER BY name")
    out = []
    for r in rows:
        out.append({
            "id": str(r["id"]),
            "name": r["name"],
            "kind": r["kind"],
            "criticality": r["criticality"] or 1,
            "exposure": r["exposure"] or "internal",
        })
    return out


# ---- attack paths ----------------------------------------------------------

@router.get("/attack-paths")
async def attack_paths(user: dict = Depends(get_current_user)) -> dict:
    rows = await db.fetch("SELECT * FROM attack_paths ORDER BY probability DESC LIMIT 10")
    paths = []
    for r in rows:
        paths.append({
            "id": str(r["id"]),
            "name": r["name"],
            "nodeIds": r.get("node_ids") or [],
            "probability": float(r["probability"]) if r.get("probability") is not None else 0,
            "impactUsd": r["impact_usd"] or 0,
            "techniques": r.get("techniques") or [],
            "blocked": bool(r["blocked"]),
        })
    return {"paths": paths}


# ---- AI config -------------------------------------------------------------

@router.get("/ai-config")
async def ai_config(user: dict = Depends(get_current_user)) -> dict:
    row = await db.fetchrow("SELECT * FROM ai_config ORDER BY created_at DESC LIMIT 1")
    if not row:
        return {"endpoint": "", "token": "", "model": "sirius-selflearning-v1", "autoTriage": False}
    return {
        "endpoint": row["endpoint"] or "",
        "token": row["token"] or "",
        "model": row["model"] or "sirius-selflearning-v1",
        "autoTriage": bool(row["auto_triage"]),
    }


@router.post("/ai-config")
async def save_ai_config(body: dict, user: dict = Depends(get_current_user)) -> dict:
    await db.execute(
        """INSERT INTO ai_config (endpoint, token, model, auto_triage)
           VALUES ($1,$2,$3,$4)""",
        body.get("endpoint", ""),
        body.get("token", ""),
        body.get("model", "sirius-selflearning-v1"),
        bool(body.get("autoTriage", False)),
    )
    return {"ok": True}
