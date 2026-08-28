"""Governance: suppressions, baselines, policies. Plus rules + meta."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..core import db
from ..core.config import SIRIUS_PROJECT_ID
from ..core.security import get_current_project_id
from ..schemas import Baseline, BaselineCreate, Rule, RuleValidateIn, RuleValidateOut, Suppression, SuppressionCreate
from ..services.rules_catalog import RULES, RULES_BY_ID

router = APIRouter(tags=["governance"])


def _suppression_from_row(row) -> dict:
    return {
        "id": str(row["id"]),
        "project_id": str(row["project_id"]),
        "rule_id": row.get("rule_id"),
        "path_glob": row.get("path_glob"),
        "fingerprint": row.get("fingerprint"),
        "reason": row["reason"],
        "expires_at": row.get("expires_at").isoformat() if row.get("expires_at") else None,
        "created_by": str(row["created_by"]) if row.get("created_by") else None,
    }


# ---- suppressions ----------------------------------------------------------

@router.get("/suppressions")
async def list_suppressions(project_id: str = Depends(get_current_project_id)) -> list[Suppression]:
    rows = await db.fetch("SELECT * FROM suppressions WHERE project_id = $1 ORDER BY created_at DESC", project_id)
    return [Suppression(**{k: v for k, v in _suppression_from_row(r).items() if v is not None}) for r in rows]


@router.post("/suppressions", status_code=201)
async def create_suppression(body: SuppressionCreate) -> Suppression:
    row_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO suppressions (id, project_id, rule_id, path_glob, fingerprint, reason, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
        row_id,
        body.project_id,
        body.rule_id,
        body.path_glob,
        body.fingerprint,
        body.reason,
        body.expires_at,
    )
    row = await db.fetchrow("SELECT * FROM suppressions WHERE id = $1", row_id)
    return Suppression(**{k: v for k, v in _suppression_from_row(row).items() if v is not None})


# ---- baselines -------------------------------------------------------------

@router.get("/baselines")
async def list_baselines(project_id: str = Depends(get_current_project_id)) -> list[Baseline]:
    rows = await db.fetch("SELECT * FROM baselines WHERE project_id = $1 ORDER BY created_at DESC", project_id)
    out = []
    for r in rows:
        fps = r.get("fingerprints") or []
        if isinstance(fps, str):
            fps = json.loads(fps)
        out.append(
            Baseline(
                id=str(r["id"]),
                project_id=str(r["project_id"]),
                commit_sha=r["commit_sha"],
                fingerprints=fps,
                created_at=r["created_at"].isoformat(),
            )
        )
    return out


@router.post("/baselines", status_code=201)
async def create_baseline(body: BaselineCreate) -> Baseline:
    fingerprints: list = []
    if body.scan_id:
        rows = await db.fetch("SELECT fingerprint FROM findings WHERE scan_id = $1", body.scan_id)
        fingerprints = [r["fingerprint"] for r in rows if r["fingerprint"]]
    row_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO baselines (id, project_id, commit_sha, scan_id, fingerprints)
           VALUES ($1,$2,$3,$4,$5)""",
        row_id,
        body.project_id,
        body.commit_sha,
        body.scan_id,
        json.dumps(fingerprints),
    )
    return Baseline(
        id=row_id,
        project_id=body.project_id,
        commit_sha=body.commit_sha,
        fingerprints=fingerprints,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


# ---- policy ----------------------------------------------------------------

@router.get("/projects/{project_id}/policy")
async def get_policy(project_id: str) -> dict:
    row = await db.fetchrow("SELECT * FROM policies WHERE project_id = $1", project_id)
    if not row:
        return {
            "project_id": project_id,
            "fail_on_severity": "high",
            "max_new_findings": 0,
            "require_no_verified_secrets": True,
            "min_compliance_score": 0,
        }
    return {
        "project_id": project_id,
        "fail_on_severity": row["fail_on_severity"],
        "max_new_findings": row["max_new_findings"],
        "require_no_verified_secrets": row["require_no_verified_secrets"],
        "min_compliance_score": float(row["min_compliance_score"]),
    }


@router.put("/projects/{project_id}/policy")
async def put_policy(project_id: str, body: dict) -> dict:
    await db.execute(
        """INSERT INTO policies (project_id, fail_on_severity, max_new_findings,
                                 require_no_verified_secrets, min_compliance_score)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (project_id) DO UPDATE SET
             fail_on_severity = EXCLUDED.fail_on_severity,
             max_new_findings = EXCLUDED.max_new_findings,
             require_no_verified_secrets = EXCLUDED.require_no_verified_secrets,
             min_compliance_score = EXCLUDED.min_compliance_score""",
        project_id,
        body.get("fail_on_severity", "high"),
        body.get("max_new_findings", 0),
        body.get("require_no_verified_secrets", True),
        body.get("min_compliance_score", 0),
    )
    return await get_policy(project_id)


# ---- rules -----------------------------------------------------------------

@router.get("/rules")
async def list_rules(project_id: str = Depends(get_current_project_id)) -> list[Rule]:
    return [Rule(**r) for r in RULES]


@router.get("/rules/{rule_id}")
async def get_rule(rule_id: str) -> Rule:
    rule = RULES_BY_ID.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="rule not found")
    return Rule(**rule)


@router.post("/rules/validate")
async def validate_rule(body: RuleValidateIn) -> RuleValidateOut:
    errors: list[dict] = []
    text = body.yaml_body
    if "rule:" not in text:
        errors.append({"path": "$", "message": "missing `rule:` root key"})
    if "SIR-SEC-" not in text:
        errors.append({"path": "$.rule.id", "message": "rule id must be SIR-SEC-NNN"})
    if "severity:" not in text:
        errors.append({"path": "$.rule.severity", "message": "missing severity"})
    if "match:" not in text:
        errors.append({"path": "$.rule.match", "message": "missing match block"})
    return RuleValidateOut(valid=len(errors) == 0, errors=errors)


# ---- meta ------------------------------------------------------------------

@router.get("/healthz")
async def healthz() -> dict:
    try:
        await db.fetchval("SELECT 1")
        return {"status": "ok", "version": "0.4.0"}
    except Exception:
        raise HTTPException(status_code=503, detail="database unreachable")


@router.get("/readyz")
async def readyz() -> dict:
    return await healthz()
