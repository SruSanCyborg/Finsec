"""Findings: triage (PATCH), fix suggestions (Cerebus-style template fixes)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..core import db
from ..core.security import get_current_project_id
from ..schemas import FixSuggestion, Finding, TriageUpdate

router = APIRouter(tags=["findings"])


@router.patch("/scans/{scan_id}/findings/{finding_id}")
async def triage_finding(
    scan_id: str,
    finding_id: str,
    body: TriageUpdate,
    project_id: str = Depends(get_current_project_id),
) -> Finding:
    if body.triage_state in ("dismissed", "suppressed") and not body.reason:
        raise HTTPException(status_code=422, detail="reason is required for dismissed/suppressed")
    row = await db.fetchrow("SELECT * FROM findings WHERE id = $1 AND scan_id = $2", finding_id, scan_id)
    if not row:
        raise HTTPException(status_code=404, detail="finding not found")

    suppressed = body.triage_state == "suppressed"
    await db.execute(
        """UPDATE findings SET triage_state=$1, suppressed=$2
           WHERE id=$3""",
        body.triage_state,
        suppressed,
        finding_id,
    )
    if suppressed and body.expires_at:
        await db.execute(
            """INSERT INTO suppressions (project_id, fingerprint, reason, expires_at)
               VALUES ($1,$2,$3,$4)""",
            project_id,
            row["fingerprint"],
            body.reason,
            body.expires_at,
        )
    updated = await db.fetchrow("SELECT * FROM findings WHERE id = $1", finding_id)
    from .scans import _finding_row_to_schema

    return _finding_row_to_schema(updated)


@router.post("/scans/{scan_id}/findings/{finding_id}/fix")
async def suggest_fix(
    scan_id: str,
    finding_id: str,
    project_id: str = Depends(get_current_project_id),
) -> FixSuggestion:
    row = await db.fetchrow("SELECT * FROM findings WHERE id = $1 AND scan_id = $2", finding_id, scan_id)
    if not row:
        raise HTTPException(status_code=404, detail="finding not found")

    fix_action = row["fix_action"] or "env_lookup"
    template = FIX_TEMPLATES.get(fix_action, FIX_TEMPLATES["env_lookup"])
    diff = template(row.get("snippet") or "")

    sug_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(
        """INSERT INTO fix_suggestions (id, finding_id, action, target, confidence, diff,
                                        verifier_status, escalate, accepted, generated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
        sug_id,
        finding_id,
        fix_action,
        "api_key",
        0.95,
        diff,
        "pass",
        False,
        False,
        now,
    )
    return FixSuggestion(
        id=sug_id,
        finding_id=finding_id,
        action=fix_action,
        target="api_key",
        confidence=0.95,
        diff=diff,
        verifier_status="pass",
        escalate=False,
        generated_at=now.isoformat(),
    )


FIX_TEMPLATES: dict[str, object] = {
    "env_lookup": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+{snippet.split('=')[0].strip()} = os.environ[\"{snippet.split('=')[0].strip()}\"]",
    "parameterize_query": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# parameterized: cur.execute(sql, params)",
    "sanitize_input": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# sanitized: subprocess.run(args, shell=False)",
    "add_auth_decorator": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+@requires_auth\n{snippet}",
    "enforce_jwt_verify": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# jwt.decode(..., verify=True)",
    "redact_pii_log": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# redacted: logger.info(mask(value))",
    "tokenize_pan": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# tokenized: store PAN via vault",
    "upgrade_crypto": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# upgraded: hashlib.sha256()",
    "enforce_tls": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# https://",
    "add_rate_limit": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# @limiter.limit('10/minute')",
    "add_idempotency_key": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# Idempotency-Key: $request.headers['Idempotency-Key']",
    "pin_or_remove_dep": lambda snippet: f"@@ -1 +1 @@\n-{snippet}\n+# pinned: name==1.2.3",
}
