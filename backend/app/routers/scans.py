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

    # Resolve target: explicit path, else the sample repo when present, else CWD.
    target = body.target
    if not target:
        repo_root = Path(__file__).resolve().parents[3]  # backend/app/routers → repo root
        sample = repo_root / "sample-repo"
        target = str(sample) if sample.is_dir() else os.getcwd()

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


@router.post("/ingest", status_code=201)
async def ingest_scan(
    body: dict,
    project_id: str = Depends(get_current_project_id),
) -> Scan:
    """Accept pre-computed scan results (from the CLI's local engine) and store
    them in Neon. The CLI pushes its local report here; the web reads the same
    rows. Body: { target?, rulesets?, findings: [...], compliance_score, money_at_risk_inr, counts, exit_code }
    """
    from ..core import events

    findings_in = body.get("findings", [])
    scan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    counts = body.get("counts") or {}
    score = body.get("compliance_score")
    money = body.get("money_at_risk_inr", 0)
    exit_code = body.get("exit_code", 0)
    source = body.get("source", "inline")
    rulesets = body.get("rulesets") or ["p/fintech-core"]
    target = body.get("target", "cli local scan")

    await db.execute(
        """INSERT INTO scans (id, project_id, status, source, trigger, rulesets,
                              compliance_score, money_at_risk_inr, exit_code,
                              created_at, started_at, finished_at)
           VALUES ($1,$2,'completed',$3,'ci',$4,$5,$6,$7,$8,$8,$8)""",
        scan_id,
        project_id,
        source,
        rulesets,
        score,
        money,
        exit_code,
        now,
    )

    await events.broadcast(scan_id, {
        "type": "scan.started", "scan_id": scan_id, "total_files": len({f.get("file") for f in findings_in}),
        "ts": now.isoformat(),
    })

    for f in findings_in:
        finding_id = str(uuid.uuid4())
        rule_id = f.get("rule_id", "SIR-SEC-000")
        category = f.get("category", "logging")
        if category not in ("secrets", "auth", "injection", "pii", "crypto", "logging", "ratelimit", "supplychain"):
            category = "logging"
        await db.execute(
            """INSERT INTO findings (id, scan_id, file, line, end_line, col, severity, rule_id,
                                     category, compliance_ref, message, snippet, fingerprint,
                                     baseline_state, validity, money_at_risk_inr, suppressed,
                                     triage_state, taint, fix_action)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)""",
            finding_id,
            scan_id,
            f.get("file", ""),
            f.get("line", 0),
            f.get("end_line"),
            f.get("col"),
            f.get("severity", "medium"),
            rule_id,
            category,
            json.dumps(f.get("compliance_ref", [])),
            f.get("message", rule_id),
            f.get("snippet"),
            f.get("fingerprint") or "",
            f.get("baseline_state", "new"),
            f.get("validity", "unknown"),
            f.get("money_at_risk_inr", 0),
            False,
            "open",
            f.get("taint"),
            f.get("fix_action"),
        )
        row = await db.fetchrow("SELECT * FROM findings WHERE id = $1", finding_id)
        await events.broadcast(scan_id, {
            "type": "finding",
            "finding": _finding_row_to_schema(row).model_dump(),
        })

    await events.broadcast(scan_id, {
        "type": "scan.completed",
        "scan_id": scan_id,
        "compliance_score": score,
        "money_at_risk_inr": money,
        "counts": counts,
        "exit_code": exit_code,
        "ts": now.isoformat(),
    })

    row = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    return _row_to_scan(row)


async def _run_scan_worker(scan_id: str, project_id: str, target: str, rulesets: list[str]) -> None:
    """Run the local engine and persist findings. Errors are non-fatal per file."""
    from ..core import events

    try:
        await events.broadcast(scan_id, {
            "type": "scan.started", "scan_id": scan_id, "total_files": 0,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        result = scanner.scan_directory(target, scan_id, rulesets)
        now = datetime.now(timezone.utc)

        for f in result.findings:
            rule = RULES_BY_ID.get(f.rule_id, {})
            category = f.category
            if category not in (
                "secrets", "auth", "injection", "pii", "crypto", "logging", "ratelimit", "supplychain"
            ):
                category = "logging"
            finding_id = str(uuid.uuid4())
            await db.execute(
                """INSERT INTO findings (id, scan_id, file, line, end_line, col, severity, rule_id,
                                         category, compliance_ref, message, snippet, fingerprint,
                                         baseline_state, validity, money_at_risk_inr, suppressed,
                                         triage_state, taint, fix_action)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)""",
                finding_id,
                scan_id,
                f.file or "unknown",
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
            # live event → web console
            row = await db.fetchrow("SELECT * FROM findings WHERE id = $1", finding_id)
            await events.broadcast(scan_id, {
                "type": "finding",
                "finding": _finding_row_to_schema(row).model_dump(),
            })
            await events.broadcast(scan_id, {
                "type": "progress",
                "scanned": 1, "total": result.file_count,
                "findings_so_far": result.findings.index(f) + 1,
            })

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
        await events.broadcast(scan_id, {
            "type": "scan.completed",
            "scan_id": scan_id,
            "compliance_score": result.compliance_score,
            "money_at_risk_inr": result.money_at_risk_inr,
            "counts": result.counts,
            "exit_code": result.exit_code,
            "ts": now.isoformat(),
        })
    except Exception as exc:  # worker failure → scan failed, not a 500
        await db.execute(
            "UPDATE scans SET status='failed', finished_at=now() WHERE id=$1", scan_id
        )
        await events.broadcast(scan_id, {"type": "error", "code": "SIRIUS_ERR_SCAN", "detail": str(exc)})
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
        f"SELECT * FROM findings WHERE {' AND '.join(where)} ORDER BY severity DESC, line ASC LIMIT {limit}",
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
    """Live findings stream via the event hub. Accepts Bearer header or ?token=."""
    from ..core import events
    from ..core.ws_auth import ws_authenticate

    if not await ws_authenticate(websocket):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    await events.connect(scan_id, websocket)

    scan = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    if not scan:
        await events.disconnect(scan_id, websocket)
        await websocket.close(code=4404)
        return

    # Replay stored findings first (so a late joiner sees history), then keep
    # the socket open for live events pushed by the worker via the hub. Once a
    # scan.completed frame is sent, close so clients (the CLI) can exit.
    completed_sent = False
    try:
        if scan["status"] == "completed":
            findings = await db.fetch(
                "SELECT * FROM findings WHERE scan_id = $1 ORDER BY line ASC", scan_id
            )
            await websocket.send_json({
                "type": "scan.started",
                "scan_id": scan_id,
                "total_files": len({f["file"] for f in findings}),
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
                await asyncio.sleep(0.02)
            await websocket.send_json({
                "type": "scan.completed",
                "compliance_score": float(scan["compliance_score"]) if scan["compliance_score"] is not None else None,
                "money_at_risk_inr": scan["money_at_risk_inr"],
                "counts": scan["counts"] or {},
                "exit_code": scan["exit_code"],
            })
            completed_sent = True

        # Keep the connection open only while the scan is still running; the
        # hub relays live worker events. Close once the scan completes.
        while not completed_sent:
            cur = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
            if cur and cur["status"] in ("completed", "failed", "canceled"):
                if cur["status"] == "completed":
                    await websocket.send_json({
                        "type": "scan.completed",
                        "compliance_score": float(cur["compliance_score"]) if cur["compliance_score"] is not None else None,
                        "money_at_risk_inr": cur["money_at_risk_inr"],
                        "counts": cur["counts"] or {},
                        "exit_code": cur["exit_code"],
                    })
                completed_sent = True
                break
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    finally:
        await events.disconnect(scan_id, websocket)
        try:
            await websocket.close()
        except Exception:
            pass
