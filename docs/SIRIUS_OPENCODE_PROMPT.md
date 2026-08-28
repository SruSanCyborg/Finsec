# Sirius Line — OpenCode Build Prompt (Web Application)

Read this document completely, inspect the existing repository, then implement or extend the Sirius Line web application exactly as specified. Do not replace working functionality unnecessarily — extend it. Build incrementally and keep the architecture ready to connect to the real FastAPI Core API.

## Context

Sirius Line is a continuous security & compliance platform for fintech teams ("continuous security for money that moves"). The web app is the operator console: it consumes the Core API (FastAPI + Neon PostgreSQL), adds auth, analytics, live scan streaming, findings triage, compliance posture, money-at-risk quantification, attack-path visualization, voice call alerts, team RBAC, and a self-learning AI console (model connects later).

**Non-negotiable architecture rule:** the browser never connects to Neon PostgreSQL. All data access goes through the API layer; Neon credentials live only in the backend.

## Stack

- Next.js 14+ App Router, TypeScript, Tailwind CSS
- Framer Motion — normal UI transitions (modals, dropdowns, page/list reveals, finding streams)
- GSAP — cinematic work only: hero timeline, scroll reveals (ScrollTrigger), dashboard counters
- Three.js + React Three Fiber (+ drei) — security-network background and attack-path 3D graph; keep it subtle and performance-conscious; dynamic import `ssr:false`; wrap in an error boundary with a graceful fallback
- Recharts for analytics charts, lucide-react icons, sonner toasts
- Mock API mode by default; real mode via `NEXT_PUBLIC_API_URL` (identical surface, WS for streams)

## Build these features

### 1. Authentication
Login/signup, email verification, forgot/reset password, JWT-style session (cookie for middleware + storage), protected route groups via middleware, expired-session handling, logout. Demo credentials auto-fill button. No user enumeration on reset.

### 2. Teams & RBAC
Members list, invite flow (bulk emails + role), pending invites with revoke, role changes, on-call rotation toggles, remove member. Five roles — Owner, Admin, Security Analyst, Developer (Member), Viewer — with a real permission matrix gating every mutating action (`can(role, perm)`).

### 3. API keys
Scoped, expiring, revocable keys. Secret revealed exactly once after creation with copy-to-clipboard.

### 4. Dashboard & analytics
KPI cards (GSAP count-up): money-at-risk, open findings, MTTR, coverage. Money-at-risk trend, severity donut, category bars, live activity feed.

### 5. Scans + live streaming
Scan types (full/quick/targeted/third-party/drift), new-scan modal, scan list, and a live detail page: progress bar, engine console, findings streaming in one-by-one, completion summary. Critical findings emitted mid-scan trigger call alerts. Design the client as a subscription (`stream(id, {onProgress,onLog,onFinding,onDone}) → unsubscribe`) so mock interval and real WebSocket are interchangeable.

### 6. Findings
Filterable table (severity/status/asset/search), rich detail (evidence, remediation, CVSS, exploitability, mapped controls, SLA, timeline), status workflow, suppression with reason. Categories: SAST, secrets, IAST, config, dependency, drift, DLP, API.

### 7. Money-at-risk
Exposure totals, trend, per-asset bars, top removable risks. All dollar figures derived from findings.

### 8. Attack paths (3D)
Layered graph internet→edge→app→data in React Three Fiber; animated pulses on active edges; clickable nodes with inspector (inbound/outbound MITRE techniques); ranked paths with probability, impact USD, blocked state.

### 9. Compliance
PCI DSS 4.0, SOC 2, ISO 27001, GDPR, NIST CSF. Scores computed from finding→control mappings, animated rings, control-level breakdown.

### 10. Call alerts (voice escalation)
Alert console with lifecycle ringing→delivered→acknowledged/escalated/resolved, escalation re-routing, transcript viewer (Twilio integration point), manual test-call trigger, escalation policy explanation.

### 11. Reports
Executive/technical/compliance types, framework + range selection, generating→ready lifecycle with notification, downloadable export rendered from live data.

### 12. AI console (connect later — do not fake it)
Config UI for model endpoint/token/model-id + auto-triage toggle, capability roadmap, documented integration contract (e.g. `POST {endpoint}/triage` with `{finding_id, context}` → `{rank, anomaly, playbook}`). While unconfigured, everything remains deterministic rule-based.

### 13. Settings & audit
Alert policy toggles, suppression management, integrations (Slack/Jira/PagerDuty/GitHub/Twilio/AWS), audit log of every action, notification center with live bell dropdown, danger zone (owner-only workspace reset).

### 14. Landing page
GSAP hero timeline + scroll reveals + stat counters, Three.js network particle background, features grid, pipeline ("commit to phone call"), CTA with demo credentials.

## Quality bar

- Dark fintech aesthetic; consistent design tokens; monospace for IDs/keys
- Responsive (mobile drawer nav), accessible labels, keyboard focus states
- Optimistic-feeling UI with toasts for every mutation; loading and empty states everywhere
- Type-safe domain model (`src/types`), single API facade (`src/lib`), localStorage-persisted mock store
- `pnpm build` and `tsc --noEmit` must pass with zero errors

## Demo credentials

`demo@siriusline.io` / `Demo123!` (owner). Seed data: 8 assets, 16 findings, scans, alerts, audit history, team of 5 with 2 pending invites, 3 API keys, reports, integrations.
