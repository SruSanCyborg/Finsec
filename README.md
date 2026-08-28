# Sirius

Continuous security & compliance for fintech: **continuous security for money that moves.**

Next.js web console + FastAPI Core API (Neon PostgreSQL). CLI, Web, and Automation
are all clients of one Core API — the backend is the source of truth for data
and permissions.

## Architecture

```
                    Clerk
                     │
                     ▼
              User Authentication
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
    Sirius Web              Sirius CLI (future)
          │                     │
          │ HTTPS               │ HTTPS
          ▼                     ▼
              Sirius Backend (FastAPI)
                     │
                     ▼
           Neon PostgreSQL
```

- The browser **never** talks to Neon — only to the Core API.
- The backend verifies the authenticated Clerk session/token on every protected
  request. Browser-sent `userId`/`email`/`role` claims are never trusted.
- Users are keyed by `clerk_user_id` (unique); email is not the primary identity.

## Repository layout

```
src/              Next.js web console (App Router, Tailwind, Clerk)
backend/          FastAPI Core API (asyncpg → Neon)
scripts/          cli_push.py (local scan → API), test_auth.py, e2e_pipeline.py
sample-repo/      deliberately-vulnerable fixture the scanner can chew on
```

## 1. Installing dependencies

```bash
# Frontend (Node ≥ 22, pnpm)
pnpm install

# Backend (Python 3.12/3.13 — 3.14 has no prebuilt wheels for asyncpg/pydantic)
cd backend
py -3.13 -m pip install -r requirements.txt
cd ..
```

## 2. Creating a Clerk application

1. Go to https://dashboard.clerk.com → **Add application**.
2. Name it "sirius", enable **Email + password** (or Google/GitHub as needed).
3. Copy the **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`).

## 3. Configuring Clerk environment variables

Frontend (`.env.local`, copy from `.env.example`):

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

The publishable key is safe for the browser. **Never** put the secret key in the
frontend.

## 4. Configuring backend environment variables

Backend (`backend/.env`, copy from `backend/.env.example`):

```env
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
CLERK_SECRET_KEY=sk_test_...          # server-side only
SIRIUS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SIRIUS_PROJECT_ID=11111111-1111-4111-8111-111111111111
SIRIUS_DEMO_API_KEY=demo-key
```

`CLERK_SECRET_KEY` enables Clerk session-token verification on protected routes.
Without it, the backend falls back to `demo-key` API-key auth (mock mode).

## 5. Configuring the database

The backend creates all tables automatically on boot (15+ tables, idempotent
`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migrations). Just point
`DATABASE_URL` at your Neon instance. The demo workspace (tenant, project,
`demo@sirius.dev` user, `demo-key` API key) is seeded on every start.

## 6. Starting the backend

```bash
cd backend
py -3.13 -m uvicorn app.main:app --reload   # http://localhost:8000
```

Interactive docs: http://localhost:8000/docs

## 7. Starting the frontend

```bash
pnpm build        # production build (compiles Tailwind first)
pnpm start        # http://localhost:3000
```

To connect the frontend to the backend, add to `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1
```

## 8. Testing /health

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

The web console shows a small **API** status pill in the top bar (green =
connected, red = offline).

## 9. Testing authentication

```bash
# Unauthenticated → 401
curl -i http://localhost:8000/api/v1/me | head -1
# HTTP/1.1 401 Unauthorized

# With the demo key → the Sirius user
curl -H "Authorization: Bearer demo-key" http://localhost:8000/api/v1/me
```

With Clerk configured, sign in at `/login`; the frontend attaches the Clerk
session token to every API request (`Authorization: Bearer <clerk-session-jwt>`),
and the backend verifies it against Clerk's JWKS before mapping to the Sirius
user.

## 10. Testing /api/me

```bash
curl -H "Authorization: Bearer demo-key" http://localhost:8000/api/v1/me
```

```json
{
  "id": "…",
  "clerkUserId": null,
  "name": "Aarav Mehta",
  "email": "demo@sirius.dev",
  "avatarUrl": null,
  "role": "owner"
}
```

With a Clerk session: `clerkUserId` is populated and the user is created on
first access (idempotent — never duplicated).

## 11. Full acceptance run

```bash
py -3.13 scripts/test_auth.py        # 16 checks: health, 401s, me, team, CORS, sync
py -3.13 scripts/e2e_pipeline.py     # local scan → Neon → reports → live WS events
py -3.13 scripts/cli_push.py         # scan sample-repo/ and push to Neon
```

## CLI authentication architecture (foundation)

The future `sirius login` flow — **the CLI never holds the Clerk secret**:

```text
CLI                 Backend               Browser/Web
 │ request login ──▶  │                      │
 │ ◀── session/device id │                    │
 │ opens browser ────────────────────────────▶│
 │                    │  Clerk auth          │
 │                    │ ◀── session token ───│
 │                    │  verify + sync user  │
 │ ◀── CLI credential │                      │
 │ store securely     │                      │
```

- **Clerk** handles the user's identity (browser session).
- **The Sirius backend** issues a Sirius-specific credential to the CLI after
  the user authorizes in the browser (device-flow), which the CLI stores in OS
  secure storage (Windows Credential Manager / macOS Keychain / Linux Secret
  Service).
- The backend's `/auth/api-keys` endpoint already mints scoped, expiring,
  revocable keys — the CLI credential will be an extension of that.

## Demo credentials

`demo@sirius.dev` / `Demo123!` (owner). The demo key is `demo-key`.

## Notes

- Dev mode (`pnpm dev`) has a known Next 14.2.35 + pnpm issue with the dev CSS
  loader; Tailwind is pre-compiled (`pnpm build:css`) and the app runs in
  production mode (`pnpm start`).
- Server secrets (CLERK_SECRET_KEY, DATABASE_URL) are never exposed to the
  browser and never logged.
