"""Acceptance test for the Sirius frontend↔backend + auth foundation.

Run: py -3.13 scripts/test_auth.py (backend running on :8000)
Covers:
  - /health (public)
  - protected endpoint without auth → 401
  - /api/me with demo key → Sirius user
  - user sync idempotency (no duplicate users)
  - team / audit-log / notifications / integrations / assets / ai-config
  - CORS headers for the frontend origin
"""

import asyncio
import os

import httpx

API = os.getenv("SIRIUS_API_URL", "http://127.0.0.1:8000")
KEY = "demo-key"
HEADERS = {"Authorization": f"Bearer {KEY}"}
ORIGIN = "http://localhost:3000"

passed = []


def check(name: str, cond: bool, detail: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    passed.append(cond)
    print(f"  [{status}] {name}{(' — ' + detail) if detail else ''}")


async def main() -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        print("1. Health (public)")
        r = await client.get(f"{API}/health")
        check("GET /health → 200 ok", r.status_code == 200 and r.json().get("status") == "ok", r.text[:60])

        print("2. Unauthenticated request → 401")
        r = await client.get(f"{API}/api/v1/me")
        check("GET /api/v1/me without auth → 401", r.status_code == 401)
        r = await client.get(f"{API}/api/v1/team")
        check("GET /api/v1/team without auth → 401", r.status_code == 401)
        r = await client.get(f"{API}/api/v1/scans")
        check("GET /api/v1/scans without auth → 401", r.status_code == 401)

        print("3. /api/me with API key")
        r = await client.get(f"{API}/api/v1/me", headers=HEADERS)
        me = r.json()
        check("GET /api/v1/me → 200", r.status_code == 200, r.text[:80])
        check("me has id/email/role", all(k in me for k in ("id", "email", "role")), f"role={me.get('role')}")

        print("4. Team + audit + notifications")
        r = await client.get(f"{API}/api/v1/team", headers=HEADERS)
        team = r.json()
        check("GET /team → 200 with members", r.status_code == 200 and isinstance(team, list))
        r = await client.get(f"{API}/api/v1/audit-log", headers=HEADERS)
        check("GET /audit-log → 200", r.status_code == 200 and isinstance(r.json(), list))
        r = await client.get(f"{API}/api/v1/notifications", headers=HEADERS)
        check("GET /notifications → 200", r.status_code == 200)

        print("5. Integrations / assets / ai-config / alerts")
        for path in ("/api/v1/integrations", "/api/v1/assets", "/api/v1/ai-config", "/api/v1/alerts"):
            r = await client.get(f"{API}{path}", headers=HEADERS)
            check(f"GET {path} → 200", r.status_code == 200)

        print("6. CORS for frontend origin")
        r = await client.get(f"{API}/health", headers={"Origin": ORIGIN})
        allow = r.headers.get("access-control-allow-origin")
        check("CORS allows localhost:3000", allow == ORIGIN, str(allow))
        r = await client.get(f"{API}/health", headers={"Origin": "http://evil.example"})
        allow2 = r.headers.get("access-control-allow-origin")
        check("CORS rejects evil origin", allow2 is None, str(allow2))

        print("7. User sync idempotency (no duplicates)")
        r = await client.get(f"{API}/api/v1/team", headers=HEADERS)
        emails = [m["email"] for m in r.json()]
        check("no duplicate demo user", emails.count("demo@sirius.dev") <= 1, str(emails))

    print(f"\n{sum(passed)}/{len(passed)} checks passed")
    raise SystemExit(0 if all(passed) else 1)


if __name__ == "__main__":
    asyncio.run(main())
