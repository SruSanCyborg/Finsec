# Sirius Line — Core API (FastAPI + Neon PostgreSQL)

The single source of truth. CLI, GUI, Web and Automation are all clients of this
API; **none talk to the scan engine or the database directly**.

## Quick start

Requires Python 3.12/3.13 (3.14 has no prebuilt asyncpg/pydantic wheels yet).

```bash
cd backend
py -3.13 -m pip install -r requirements.txt
cp .env.example .env        # add your Neon connection string (already filled for demo)
py -3.13 -m uvicorn app.main:app --reload   # http://localhost:8000
```

On boot the app connects to Neon, applies the 15-table schema, and seeds the
demo workspace (tenant, project, `demo-key` API key, demo user).

Docs: http://localhost:8000/docs · Health: http://localhost:8000/api/v1/healthz

## The golden rule

> One Core API is the single source of truth. CLI, GUI, Web, and Automation are
> all CLIENTS. None talk to the scan engine or the Cerebus guardrail directly.

- The browser never sees a Neon connection string — it only talks REST + WS here.
- The scan engine (regex/entropy rules + the money model) is a port of the CLI's
  local engine so hosted scans and local scans agree on the same repository.
- The PDF report generator is a port of the CLI's hand-written PDF writer
  (`engine/pdf.ts`): no renderer, no dependency, WinAnsi-safe `Rs.` output.

## Endpoints (REST, prefix `/api/v1`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` · `/readyz` | — | liveness/readiness |
| POST | `/auth/token` | — | demo login (returns JWT) |
| POST/GET/DELETE | `/auth/api-keys` | K | mint / list / revoke project API keys |
| GET/POST | `/projects` | —/K | list / create projects |
| POST | `/scans` | K | create a scan → **202**, runs the engine in background |
| GET/DELETE | `/scans/{id}` | K | status / cancel |
| GET | `/scans/{id}/results` | K | findings (paginated, filterable) |
| WS | `/scans/{id}/stream` | K | live findings stream (`?token=` for browsers, close 4401) |
| GET | `/scans/{id}/report?format=json\|pdf\|sarif` | K | signed report; **PDF written by hand** |
| POST | `/scans/{id}/findings/{fid}/fix` | K | template fix suggestion (verifier `pass`) |
| PATCH | `/scans/{id}/findings/{fid}` | K | triage accept/dismiss/suppress |
| GET/POST | `/suppressions` · `/baselines` | K | governance |
| GET/PUT | `/projects/{id}/policy` | K | quality-gate policy |
| GET | `/rules` · `/rules/{id}` · POST `/rules/validate` | K | the 13-rule catalogue |

Auth **K** = `Authorization: Bearer <api-key>` (seeded `demo-key`).

## WebSocket frames

`scan.started` · `file.scanning` · `finding` · `progress` · `scan.completed`
(`compliance_score`, `money_at_risk_inr`, `counts`, `exit_code`) · `error`.

## Testing

```bash
py -3.13 e2e_smoke.py     # health → auth → rules → scan → findings → PDF
```

## Structure

```
backend/
  app/
    main.py            # FastAPI app, lifespan: schema apply + seed
    core/              # config, db pool, schema DDL, security
    routers/           # scans, findings, governance, reports, projects
    services/          # scanner engine, rules catalogue, PDF writer
    schemas.py         # Pydantic models (mirror openapi.yaml)
  requirements.txt
  .env.example
```
