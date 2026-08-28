# Sirius Line — Feature Specification (Web Surface)

> Continuous security & compliance for fintech. This document is the source of truth
> for what the web application ships (and what is stubbed for later).

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion (UI transitions) · GSAP (cinematic/scroll/counters) · Three.js / React Three Fiber (3D network + attack-path scenes) · Recharts (analytics) · Sonner (toasts)
**Backend:** FastAPI Core API (planned) with Neon PostgreSQL — *browser never touches Neon directly*.
**Demo mode:** Fully functional with a local mock API (localStorage-persisted). Set `NEXT_PUBLIC_API_URL` to go real.

---

## 1. Authentication & Session
- [x] Login with email/password (demo: `demo@siriusline.io` / `Demo123!`)
- [x] Signup → email verification (mock token flow)
- [x] Forgot password → reset token → set new password
- [x] JWT-style session token (cookie + storage), expiry handling
- [x] Middleware-protected routes (`/dashboard`, `/scans`, … → redirect `/login?next=…`)
- [x] Logged-in users bounced away from `/login`, `/signup`
- [x] Logout + session-expired handling
- [x] MFA status surfaced per member (enforcement lands with real backend)

## 2. Teams, Invites & RBAC (5 roles)
- [x] Members list with role, title, MFA badge, on-call flag
- [x] Invite by email (bulk paste) with role pre-selection
- [x] Pending invites → revoke
- [x] Change member roles, toggle on-call rotation, remove member
- [x] Roles: **Owner · Admin · Security Analyst · Developer (Member) · Viewer** with permission matrix:
  - Owner: everything incl. workspace reset/delete
  - Admin: team, keys, settings, scans, findings, alerts, reports, AI config
  - Analyst: scans, findings triage, alerts, reports
  - Member: run scans
  - Viewer: read-only
- [x] UI buttons/actions gated by `can(role, perm)`

## 3. API Keys
- [x] Scoped keys (`scans:read`, `findings:write`, `admin`, …)
- [x] Create with expiry (30/90/365d), secret shown **once** with copy
- [x] Revoke, last-used tracking, prefix display

## 4. Dashboard & Analytics
- [x] KPI cards with GSAP count-up: money-at-risk, open findings, MTTR, coverage
- [x] 90-day money-at-risk area trend
- [x] Findings-by-severity donut + by-category bars (Recharts)
- [x] Live activity feed (call alerts + latest findings)

## 5. Scans
- [x] Scan types: Full stack · Quick · Targeted · Third-party · Drift
- [x] New scan modal (type, target, name)
- [x] Scan list with status/progress
- [x] **Live scan detail**: streaming progress bar, engine console log, findings arriving in real time (mock WebSocket; real mode = WS)
- [x] Critical findings auto-trigger a call alert mid-scan

## 6. Findings
- [x] Table + filters (severity, status, asset, search)
- [x] Detail: description, evidence, remediation, CVSS, exploitability, mapped controls, SLA, timeline
- [x] Status flow open → in progress → resolved; suppress with reason
- [x] Categories: SAST, secrets, IAST, config, dependency, drift, DLP, API

## 7. Money-at-Risk
- [x] Total exposure, money-mover exposure, removable-by-fixing-top-6
- [x] Exposure trend + per-asset bars
- [x] Ranked top financial risks

## 8. Attack Paths (3D)
- [x] React Three Fiber graph: internet → edge → app → data layers
- [x] Animated attack pulses on active edges, node selection, orbit controls
- [x] Node inspector: inbound/outbound techniques
- [x] Ranked paths with probability, impact $, MITRE techniques, blocked state
- [x] WebGL error-boundary fallback

## 9. Compliance
- [x] PCI DSS 4.0, SOC 2, ISO 27001, GDPR, NIST CSF
- [x] Scores computed live from finding→control mapping
- [x] Animated score rings, control-level pass/partial/fail breakdown

## 10. Call Alerts (Voice Escalation)
- [x] Alert console: ringing → delivered → acknowledged / escalated / resolved
- [x] Auto ring→deliver simulation, escalation re-routing
- [x] Transcript viewer (Twilio Voice integration point)
- [x] Manual "trigger test call" to any member
- [x] Policies: critical-on-money-mover, secrets page-owner, drift digest

## 11. Reports
- [x] Executive / Technical / Compliance types with framework + range selection
- [x] Generating → ready lifecycle, notifications
- [x] Real HTML export (download) rendered from live data

## 12. AI Model (self-learning — connect later)
- [x] GUI console with endpoint/token/model config (owner/admin gated)
- [x] Auto-triage toggle, planned-capability overview
- [x] Documented integration contract (`POST /triage`) — no fake intelligence

## 13. Settings
- [x] Alert policy rules (toggles, severity floors)
- [x] Suppressions (add/remove with reasons & expiry)
- [x] Integrations: Slack, Jira, PagerDuty, GitHub, Twilio, AWS (connect/disconnect)
- [x] Danger zone: reset demo workspace (owner)

## 14. Platform
- [x] Audit log of every security-relevant action (filterable)
- [x] Notification center + bell dropdown (live)
- [x] Responsive (mobile drawer sidebar) · dark fintech theme
- [x] Landing page: GSAP hero timeline, scroll reveals, stat counters, Three.js network background
- [ ] Real FastAPI Core API + Neon PostgreSQL (architecture ready)
- [ ] WebSocket live streams from real engine
- [ ] Real voice calls via Twilio
- [ ] Self-learning model training/serving
