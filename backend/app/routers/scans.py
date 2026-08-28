"""Scans: create, list, get, cancel + live WebSocket stream.

Ports the CLI's scan lifecycle: POST /scans → 202 queued → worker runs the local
engine → findings stream over WS /scans/{id}/stream → scan.completed with
compliance score, money at risk, counts and exit code.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..core import db
from ..core.config import SIRIUS_PROJECT_ID
from ..core.security import get_current_project_id, require_api_key
from ..schemas import Finding, Scan, ScanCreate, SeverityCounts
from ..services import scanner
from ..services.rules_catalog import RULES_BY_ID

router = APIRouter(prefix="/scans", tags=["scans"])


def _row_to_scan(row) -> Scan:
    counts = SeverityCounts()
    if row.get("counts"):
        counts = SeverityCounts(**row["counts"])
    return Scan(
        id=str(row["id"]),
        project_id=str(row["project_id"]),
        status=row["status"],
        source=row.get("source") or "inline",
        trigger=row.get("trigger") or "manual",
        git_ref=row.get("git_ref"),
        commit_sha=row.get("commit_sha"),
        baseline_commit=row.get("baseline_commit"),
        compliance_score=float(row["compliance_score"]) if row.get("compliance_score") is not None else None,
        money_at_risk_inr=row.get("money_at_risk_inr"),
        counts=counts,
        exit_code=row.get("exit_code"),
        started_at=row.get("started_at").isoformat() if row.get("started_at") else None,
        finished_at=row.get("finished_at").isoformat() if row.get("finished_at") else None,
        created_at=row["created_at"].isoformat(),
    )


def _finding_row_to_schema(row) -> Finding:
    compliance_ref = row.get("compliance_ref") or []
    if isinstance(compliance_ref, str):
        compliance_ref = json.loads(compliance_ref)
    return Finding(
        id=str(row["id"]),
        scan_id=str(row["scan_id"]),
        file=row["file"],
        line=row["line"],
        end_line=row.get("end_line"),
        col=row.get("col"),
        severity=row["severity"],
        rule_id=row["rule_id"],
        category=row["category"],
        compliance_ref=compliance_ref,
        message=row["message"],
        snippet=row.get("snippet"),
        fingerprint=row.get("fingerprint"),
        baseline_state=row.get("baseline_state") or "new",
        validity=row.get("validity") or "unknown",
        money_at_risk_inr=row.get("money_at_risk_inr"),
        suppressed=row.get("suppressed") or False,
        triage_state=row.get("triage_state") or "open",
        fix_action=row.get("fix_action"),
        taint=row.get("taint"),
    )


@router.post("", status_code=202)
async def create_scan(
    body: ScanCreate,
    project_id: str = Depends(get_current_project_id),
) -> Scan:
    scan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Resolve target: explicit path, else a git clone (unsupported in demo), else CWD.
    target = body.target or os.getcwd()

    await db.execute(
        """INSERT INTO scans (id, project_id, status, source, trigger, git_ref, commit_sha,
                              baseline_commit, diff_aware, rulesets, severity_threshold, fail_on,
                              created_at, started_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)""",
        scan_id,
        project_id,
        "running",
        body.source,
        "manual",
        body.git_ref,
        body.commit_sha,
        body.baseline_commit,
        body.diff_aware,
        body.rulesets,
        body.severity_threshold,
        body.fail_on,
        now,
        now,
    )

    # Run the worker in the background; findings stream over WS.
    asyncio.create_task(_run_scan_worker(scan_id, project_id, target, body.rulesets))

    row = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    return _row_to_scan(row)


async def _run_scan_worker(scan_id: str, project_id: str, target: str, rulesets: list[str]) -> None:
    """Run the local engine and persist findings. Errors are non-fatal per file."""
    try:
        result = scanner.scan_directory(target, scan_id, rulesets)
        now = datetime.now(timezone.utc)

        for f in result.findings:
            rule = RULES_BY_ID.get(f.rule_id, {})
            category = f.category
            if category not in (
                "secrets", "auth", "injection", "pii", "crypto", "logging", "ratelimit", "supplychain"
            ):
                category = "logging"
            await db.execute(
                """INSERT INTO findings (id, scan_id, file, line, end_line, col, severity, rule_id,
                                         category, compliance_ref, message, snippet, fingerprint,
                                         baseline_state, validity, money_at_risk_inr, suppressed,
                                         triage_state, taint, fix_action)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)""",
                str(uuid.uuid4()),
                scan_id,
                f.file if getattr(f, "file", "") else "",
                f.line,
                f.end_line,
                f.col,
                f.severity,
                f.rule_id,
                category,
                json.dumps(f.compliance_ref),
                f.message,
                f.snippet,
                f.fingerprint or "",
                "new",
                f.validity,
                f.money_at_risk_inr,
                False,
                "open",
                f.taint,
                rule.get("fix_action") or f.fix_action,
            )

        await db.execute(
            """UPDATE scans SET status='completed', compliance_score=$2, money_at_risk_inr=$3,
                                exit_code=$4, finished_at=$5
               WHERE id=$1""",
            scan_id,
            result.compliance_score,
            result.money_at_risk_inr,
            result.exit_code,
            now,
        )
    except Exception as exc:  # worker failure → scan failed, not a 500
        await db.execute(
            "UPDATE scans SET status='failed', finished_at=now() WHERE id=$1", scan_id
        )
        print(f"scan worker failed: {exc}")


@router.get("")
async def list_scans(
    project_id: str = Depends(get_current_project_id),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    cursor: Optional[str] = Query(None),
) -> dict:
    rows = await db.fetch(
        """SELECT * FROM scans WHERE project_id = $1
           ORDER BY created_at DESC LIMIT $2""",
        project_id,
        limit,
    )
    return {
        "items": [_row_to_scan(r) for r in rows],
        "next_cursor": None,
        "total": len(rows),
    }


@router.get("/{scan_id}")
async def get_scan(scan_id: str, project_id: str = Depends(get_current_project_id)) -> Scan:
    row = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    if not row:
        raise HTTPException(status_code=404, detail="scan not found")
    return _row_to_scan(row)


@router.delete("/{scan_id}", status_code=202)
async def cancel_scan(scan_id: str, project_id: str = Depends(get_current_project_id)) -> dict:
    row = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    if not row:
        raise HTTPException(status_code=404, detail="scan not found")
    if row["status"] in ("completed", "failed", "canceled"):
        raise HTTPException(status_code=409, detail="scan is not running")
    await db.execute("UPDATE scans SET status='canceled', finished_at=now() WHERE id=$1", scan_id)
    return {"status": "canceled"}


@router.get("/{scan_id}/results")
async def get_scan_results(
    scan_id: str,
    project_id: str = Depends(get_current_project_id),
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    baseline_state: Optional[str] = Query(None),
    include_suppressed: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    cursor: Optional[str] = Query(None),
) -> dict:
    where = ["scan_id = $1"]
    args: list = [scan_id]
    if severity:
        where.append(f"severity = ${len(args) + 1}")
        args.append(severity)
    if category:
        where.append(f"category = ${len(args) + 1}")
        args.append(category)
    if baseline_state:
        where.append(f"baseline_state = ${len(args) + 1}")
        args.append(baseline_state)
    if not include_suppressed:
        where.append(f"suppressed = ${len(args) + 1}")
        args.append(False)

    rows = await db.fetch(
        f"SELECT * FROM findings WHERE {' AND '.join(where)} ORDER BY severity DESC, line ASC LIMIT {len(args) + 1}",
        *args,
    )
    total = await db.fetchval(
        f"SELECT count(*) FROM findings WHERE {' AND '.join(where)}",
        *args,
    )
    items = [_finding_row_to_schema(r) for r in rows[:limit]]
    return {"items": items, "next_cursor": None, "total": total}


# ---------------------------------------------------------------------------
# WebSocket stream — /scans/{id}/stream
# ---------------------------------------------------------------------------

@router.websocket("/{scan_id}/stream")
async def scan_stream(websocket: WebSocket, scan_id: str):
    """Live findings stream. Accepts ?token= fallback for browsers (D-004)."""
    token = websocket.query_params.get("token")
    from ..core.security import _constant_time_equal
    from ..core.config import SIRIUS_DEMO_API_KEY

    if token and not _constant_time_equal(token, SIRIUS_DEMO_API_KEY):
        await websocket.close(code=4401)
        return
    if not token:
        await websocket.close(code=4401)
        return

    await websocket.accept()

    scan = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    if not scan:
        await websocket.close(code=4404)
        return

    # Replay: if already completed, stream the stored findings then complete.
    if scan["status"] == "completed":
        findings = await db.fetch(
            "SELECT * FROM findings WHERE scan_id = $1 ORDER BY line ASC", scan_id
        )
        await websocket.send_json({
            "type": "scan.started",
            "scan_id": scan_id,
            "total_files": await db.fetchval(
                "SELECT count(DISTINCT file) FROM findings WHERE scan_id = $1", scan_id
            ),
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        for i, f in enumerate(findings):
            await websocket.send_json({
                "type": "file.scanning",
                "path": f["file"],
                "index": i + 1,
                "total": len(findings),
            })
            await websocket.send_json({
                "type": "finding",
                "finding": _finding_row_to_schema(f).model_dump(),
            })
            await asyncio.sleep(0.05)
        await websocket.send_json({
            "type": "scan.completed",
            "compliance_score": float(scan["compliance_score"]) if scan["compliance_score"] is not None else None,
            "money_at_risk_inr": scan["money_at_risk_inr"],
            "counts": scan["counts"] or {},
            "exit_code": scan["exit_code"],
        })
        await websocket.close()
        return

    if scan["status"] != "running":
        await websocket.close(code=4404)
        return

    # Live: poll for new findings and emit as they land.
    seen: set[str] = set()
    try:
        while True:
            findings = await db.fetch(
                "SELECT * FROM findings WHERE scan_id = $1 AND id != ALL($2::uuid[]) ORDER BY created_at",
                scan_id,
                list(seen),
            )
            for f in findings:
                seen.add(str(f["id"]))
                await websocket.send_json({
                    "type": "finding",
                    "finding": _finding_row_to_schema(f).model_dump(),
                })
            cur = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
            if cur and cur["status"] == "completed":
                await websocket.send_json({
                    "type": "scan.completed",
                    "compliance_score": float(cur["compliance_score"]) if cur["compliance_score"] is not None else None,
                    "money_at_risk_inr": cur["money_at_risk_inr"],
                    "counts": cur["counts"] or {},
                    "exit_code": cur["exit_code"],
                })
                break
            if cur and cur["status"] == "failed":
                await websocket.send_json({"type": "error", "code": "SIRIUS_ERR_SCAN", "detail": "scan failed"})
                break
            await asyncio.sleep(0.4)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
