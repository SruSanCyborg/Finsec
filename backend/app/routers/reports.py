"""Reports: GET /scans/{id}/report?format=pdf|json|sarif — the PDF generator.

The PDF is written by hand (port of the CLI's engine/pdf.ts): text, horizontal
rules, page breaks, no renderer, no dependency. The signature covers the JSON
payload; the PDF is a layout of it.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse, PlainTextResponse

from ..core import db
from ..core.config import SIRIUS_BASE_URL
from ..core.security import get_current_project_id
from ..schemas import Report
from ..services.report_pdf import report_to_pdf

router = APIRouter(tags=["reports"])


def _build_report_document(scan_row, findings: list) -> dict:
    """The canonical report payload — what a verifier signs/checks byte-for-byte."""
    compliance_refs: list[str] = []
    for f in findings:
        refs = f.get("compliance_ref") or []
        if isinstance(refs, str):
            try:
                refs = json.loads(refs)
            except json.JSONDecodeError:
                refs = []
        for r in refs:
            if r not in compliance_refs:
                compliance_refs.append(r)

    counts = scan_row.get("counts") or {}
    if isinstance(counts, str):
        try:
            counts = json.loads(counts)
        except json.JSONDecodeError:
            counts = {}

    return {
        "scan_id": str(scan_row["id"]),
        "scanned_at": scan_row.get("finished_at").isoformat() if scan_row.get("finished_at") else None,
        "root": "repository scan",
        "source": scan_row.get("source") or "local",
        "tool": {"name": "sirius", "version": "0.4.0"},
        "summary": {
            "findings": len(findings),
            "counts": counts,
            "money_at_risk_inr": scan_row.get("money_at_risk_inr") or 0,
            "compliance_score": float(scan_row["compliance_score"]) if scan_row.get("compliance_score") is not None else None,
            "files_scanned": None,
        },
        "compliance_refs": compliance_refs,
        "findings": [
            {
                "rule_id": f["rule_id"],
                "severity": f["severity"],
                "file": f["file"],
                "line": f["line"],
                "message": f.get("message"),
                "compliance_ref": json.loads(f["compliance_ref"]) if isinstance(f.get("compliance_ref"), str) else (f.get("compliance_ref") or []),
                "money_at_risk_inr": f.get("money_at_risk_inr") or 0,
                "fingerprint": f.get("fingerprint"),
            }
            for f in findings
        ],
        "attestation": {
            "algorithm": "sha256",
            "key_id": "sirius-local",
            "signed_at": datetime.now(timezone.utc).isoformat(),
            "payload_sha256": "",
        },
    }


@router.get("/scans/{scan_id}/report")
async def get_report(
    scan_id: str,
    format: str = "json",
    project_id: str = Depends(get_current_project_id),
):
    scan = await db.fetchrow("SELECT * FROM scans WHERE id = $1", scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="scan not found")
    finding_rows = await db.fetch(
        "SELECT * FROM findings WHERE scan_id = $1 ORDER BY severity DESC, line ASC", scan_id
    )
    findings = [dict(r) for r in finding_rows]

    document = _build_report_document(dict(scan), findings)
    payload = json.dumps(document, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(payload.encode()).hexdigest()
    document["attestation"]["payload_sha256"] = digest

    # persist the report row
    report_id = None
    try:
        from ..core import db as _db

        report_id = await _db.fetchval(
            """INSERT INTO reports (scan_id, format, uri, jws_signature, signed_at)
               VALUES ($1,$2,$3,$4,now()) RETURNING id""",
            scan_id,
            format,
            f"{SIRIUS_BASE_URL}/api/v1/scans/{scan_id}/report?format={format}",
            digest,
        )
    except Exception:
        pass

    if format == "pdf":
        pdf = report_to_pdf(document)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="sirius-report-{scan_id[:8]}.pdf"'},
        )
    if format == "sarif":
        sarif = _build_sarif(scan_id, findings)
        return JSONResponse(sarif)
    return JSONResponse(document)


def _build_sarif(scan_id: str, findings: list) -> dict:
    rules: dict = {}
    for f in findings:
        rules.setdefault(f["rule_id"], {"id": f["rule_id"], "name": f["rule_id"]})
    results = []
    for f in findings:
        level = "error" if f["severity"] in ("critical", "high") else "warning" if f["severity"] == "medium" else "note"
        results.append(
            {
                "ruleId": f["rule_id"],
                "level": level,
                "message": {"text": f.get("message", "")},
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {"uri": f["file"]},
                            "region": {"startLine": f["line"]},
                        }
                    }
                ],
            }
        )
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {"driver": {"name": "sirius", "version": "0.4.0", "rules": list(rules.values())}},
                "results": results,
            }
        ],
    }


@router.get("/scans/{scan_id}/report/json")
async def get_report_json(scan_id: str, project_id: str = Depends(get_current_project_id)):
    return await get_report(scan_id, "json", project_id)


@router.get("/scans/{scan_id}/report/pdf")
async def get_report_pdf(scan_id: str, project_id: str = Depends(get_current_project_id)):
    return await get_report(scan_id, "pdf", project_id)
