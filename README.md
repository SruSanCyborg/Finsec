# Sirius Line (Finsec — Web branch)

Continuous security & compliance for fintech: **continuous security for money that moves.**

Next.js web console for the Sirius Line platform — fix-the-leak scanning, money-at-risk
quantification, 3D attack paths, voice call alerts, audit-ready compliance, team RBAC,
and a self-learning AI console (model connects later).

## Quick start

```bash
pnpm install
cp .env.example .env.local   # add your Clerk keys
pnpm dev          # http://localhost:3000
```

**Auth:** Clerk-powered sign-in/sign-up (`/login`, `/signup`). The browser only ever
sees the publishable key; `CLERK_SECRET_KEY` stays server-side for route protection.
The five Sirius roles (Owner, Admin, Security Analyst, Developer/Member, Viewer) map
to Clerk organization roles of the same name — assign them from the Clerk dashboard
or via invitations.

**Demo preview:** the landing page's "View live demo" button seeds the local mock
workspace and opens the dashboard without a Clerk account.

## Modes

| Mode | How | Notes |
|---|---|---|
| Mock (default) | leave `NEXT_PUBLIC_API_URL` empty | Full app runs locally; data persists in `localStorage`; scans/alerts simulate live |
| Real | set `NEXT_PUBLIC_API_URL` to the FastAPI Core API | Same UI; streams become WebSockets; the backend verifies Clerk session tokens |

> Neon PostgreSQL is only ever accessed by the backend — never from this client.

## Real backend (FastAPI + Neon PostgreSQL)

The Core API lives in [`backend/`](backend/README.md). It owns the schema (15
tables), the scan engine, the money-at-risk model, and the hand-written PDF
report generator — all ports of the CLI engine so every surface agrees.

```bash
cd backend
py -3.13 -m pip install -r requirements.txt
cp .env.example .env        # Neon connection string already filled for the demo
py -3.13 -m uvicorn app.main:app --reload   # http://localhost:8000
```

Then in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1
```

The API is seeded with a demo project (`demo-key`) and accepts
`demo@siriusline.io / Demo123!` at `/api/v1/auth/token`. Interactive docs at
`http://localhost:8000/docs`.

## Landing experience

The landing page is a cinematic, scroll-driven demonstration of the security loop:
a persistent full-viewport 3D system (React Three Fiber) shows an autonomous agent
generating a ₹18.5L transfer, then walks through context → behaviour (94% deviation) →
policy (₹5L cap) → decision (BLOCKED) → escalation (call alert) → resolution →
autonomy, synced by GSAP ScrollTrigger and ending in a dashboard reveal.

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm typecheck` — strict TS, zero errors
- `pnpm lint`

## Docs

- [`docs/SIRIUS_FEATURES.md`](docs/SIRIUS_FEATURES.md) — full feature spec
- [`docs/SIRIUS_OPENCODE_PROMPT.md`](docs/SIRIUS_OPENCODE_PROMPT.md) — build prompt / architecture brief

## Structure

```
src/
  app/            # route groups: (auth) Clerk shell · (app) sidebar shell · landing
  components/     # ui primitives · layout (sidebar/topbar) · three (R3F scenes + landing) · landing
  lib/            # api facade → mock store · clerk providers · landing story/quality
  types/          # domain model
  middleware.ts   # Clerk route protection
```

Stack: Next.js 14 · TypeScript · Tailwind · Clerk · Framer Motion (UI) · GSAP (cinematic) ·
Three.js/R3F (3D) · Recharts (analytics) · Sonner.
