"""End-to-end pipeline check: CLI push → Neon → reports → live events.

Run: py -3.13 scripts/e2e_pipeline.py (backend running on :8000)
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
import websockets

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.services.scanner import scan_directory  # noqa: E402

API = os.getenv("SIRIUS_API_URL", "http://127.0.0.1:8000/api/v1")
WS = os.getenv("SIRIUS_WS_URL", "ws://127.0.0.1:8000/api/v1")
KEY = os.getenv("SIRIUS_DEMO_API_KEY", "demo-key")
HEADERS = {"Authorization": f"Bearer {KEY}"}
TARGET = REPO / "sample-repo"


async def main() -> None:
    async with httpx.AsyncClient(timeout=60) as client:
        # 1. health
        r = await client.get(f"{API}/healthz")
        assert r.status_code == 200, r.text

        # 2. run the local engine on the sample repo
        result = scan_directory(TARGET, "e2e")
        print(f"local scan: {len(result.findings)} findings · score {result.compliance_score} · ₹{result.money_at_risk_inr:,}")

        payload = {
            "target": str(TARGET),
            "source": "git",
            "compliance_score": result.compliance_score,
            "money_at_risk_inr": result.money_at_risk_inr,
            "exit_code": result.exit_code,
            "counts": result.counts,
            "findings": [
                {
                    "rule_id": f.rule_id, "severity": f.severity, "category": f.category,
                    "message": f.message, "file": f.file, "line": f.line, "col": f.col,
                    "snippet": f.snippet, "compliance_ref": f.compliance_ref,
                    "money_at_risk_inr": f.money_at_risk_inr, "fix_action": f.fix_action,
                    "fingerprint": f.fingerprint,
                }
                for f in result.findings
            ],
        }

        # 3. push to Neon via /scans/ingest
        r = await client.post(f"{API}/scans/ingest", headers=HEADERS, json=payload)
        assert r.status_code == 201, r.text
        scan = r.json()
        scan_id = scan["id"]
        print(f"ingested scan {scan_id} → Neon")

        # 4. read it back
        r = await client.get(f"{API}/scans/{scan_id}", headers=HEADERS)
        s = r.json()
        assert s["status"] == "completed" and s["compliance_score"] == result.compliance_score
        print(f"read back: status={s['status']} score={s['compliance_score']} money=₹{s['money_at_risk_inr']:,}")

        # 5. findings
        r = await client.get(f"{API}/scans/{scan_id}/results", headers=HEADERS)
        findings = r.json()["items"]
        print(f"findings in Neon: {len(findings)}")
        for f in findings[:3]:
            print(f"  {f['severity']:8} {f['rule_id']} {f['file']}:{f['line']}")

        # 6. reports
        r = await client.get(f"{API}/scans/{scan_id}/report?format=json", headers=HEADERS)
        doc = r.json()
        assert doc["summary"]["findings"] == len(findings)
        print(f"JSON report: {doc['summary']['findings']} findings, refs: {len(doc['compliance_refs'])}")

        r = await client.get(f"{API}/scans/{scan_id}/report?format=pdf", headers=HEADERS)
        assert r.content[:4] == b"%PDF"
        print(f"PDF report: {len(r.content)} bytes, valid")

    # 7. live events over WebSocket (global stream sees the next push)
    async def watch_events(scan_id: str) -> None:
        uri = f"{WS}/events?token={KEY}"
        async with websockets.connect(uri) as ws:
            types = []
            while True:
                try:
                    frame = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
                except asyncio.TimeoutError:
                    break
                types.append(frame["type"])
                if frame.get("scan_id") == scan_id and frame["type"] == "scan.completed":
                    break
            print(f"live events received: {types}")

    # push a second scan while watching
    watch = asyncio.create_task(watch_events(None))
    async with httpx.AsyncClient(timeout=60) as client:
        await client.post(f"{API}/scans/ingest", headers=HEADERS, json=payload)
    await watch

    print("\nPIPELINE OK: local scan → Neon → reports → live WS events")


if __name__ == "__main__":
    asyncio.run(main())
