"""Push a local scan of a sample repo into the Core API (→ Neon).

Bridges the CLI's local engine to the hosted backend: scans the target with the
same engine the web uses, POSTs the findings to /api/v1/scans/ingest, and the
backend stores them in Neon + broadcasts live events over WebSocket so the web
console updates in real time.

Usage:
    py -3.13 scripts/cli_push.py [target] [--api http://127.0.0.1:8000/api/v1] [--key demo-key]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# allow `python scripts/cli_push.py` from anywhere in the repo
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

import httpx  # noqa: E402

from app.services.engine import compliance_score, fingerprint  # noqa: E402
from app.services.scanner import scan_directory  # noqa: E402

DEFAULT_API = os.getenv("SIRIUS_API_URL", "http://127.0.0.1:8000/api/v1")
DEFAULT_KEY = os.getenv("SIRIUS_DEMO_API_KEY", "demo-key")
DEFAULT_PROJECT = os.getenv("SIRIUS_PROJECT_ID", "11111111-1111-4111-8111-111111111111")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan a repo locally and push results to the Core API")
    parser.add_argument("target", nargs="?", default=str(REPO_ROOT / "sample-repo"),
                        help="directory to scan (default: sample-repo/)")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--key", default=DEFAULT_KEY)
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--json", action="store_true", help="print the report JSON to stdout")
    args = parser.parse_args()

    target = Path(args.target).resolve()
    if not target.is_dir():
        print(f"✗ target not found: {target}", file=sys.stderr)
        sys.exit(2)

    print(f"✦ sirius push · scanning {target} …")

    # Same engine the backend web scans use (CLI parity).
    result = scan_directory(target, "cli-local")
    payload = {
        "target": str(target),
        "source": "git",
        "rulesets": ["p/fintech-core"],
        "compliance_score": result.compliance_score,
        "money_at_risk_inr": result.money_at_risk_inr,
        "exit_code": result.exit_code,
        "counts": result.counts,
        "findings": [
            {
                "rule_id": f.rule_id,
                "severity": f.severity,
                "category": f.category,
                "message": f.message,
                "file": f.file if getattr(f, "file", "") else f"sample-repo/{f.line}",
                "line": f.line,
                "col": f.col,
                "snippet": f.snippet,
                "compliance_ref": f.compliance_ref,
                "money_at_risk_inr": f.money_at_risk_inr,
                "fix_action": f.fix_action,
                "fingerprint": f.fingerprint or fingerprint(f.rule_id, "", f.snippet),
            }
            for f in result.findings
        ],
    }

    if args.json:
        print(json.dumps(payload, indent=2))

    print(
        f"  findings: {len(result.findings)} · score: {result.compliance_score} · "
        f"money: ₹{result.money_at_risk_inr:,} · exit: {result.exit_code}"
    )

    # Push to the Core API → Neon + live events.
    r = asyncio.run(_push(args.api, args.key, args.project, payload))
    if r.status_code not in (200, 201):
        print(f"✗ push failed: {r.status_code} {r.text}", file=sys.stderr)
        sys.exit(1)
    scan = r.json()
    print(f"✓ pushed scan {scan['id']} → Neon (score {scan.get('compliance_score')}, "
          f"money ₹{scan.get('money_at_risk_inr'):,})")
    print(f"  report: {args.api}/scans/{scan['id']}/report?format=pdf")


async def _push(api: str, key: str, project: str, payload: dict) -> httpx.Response:
    async with httpx.AsyncClient(timeout=60) as client:
        return await client.post(
            f"{api}/scans/ingest",
            headers={"Authorization": f"Bearer {key}"},
            json={**payload, "project_id": project},
        )


if __name__ == "__main__":
    main()
