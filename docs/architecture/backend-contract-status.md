# Backend Contract Status Inventory

## 1. Executive Summary

This inventory tracks every GUI API dependency, endpoint path, HTTP method, request/response contract shape, and implementation status (`FINAL`, `PROVISIONAL`, `BLOCKED`).

---

## 2. Endpoint Contract Inventory

| Feature Domain | Endpoint / Operation | Method | Request / Response Shape | Status | Provisional Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication** | `POST /api/v1/auth/token` | POST | `{ email, password }` &rarr; `{ token, user }` | `PROVISIONAL` | K/S Token Authority assumption vs OAuth Device Flow (ADR 003). |
| **Projects** | `GET /api/v1/projects` | GET | `void` &rarr; `Project[]` | `FINAL` | Project list with compliance score and repository URL. |
| **Projects** | `GET /api/v1/projects/:id` | GET | `void` &rarr; `Project` | `FINAL` | Project detail lookup. |
| **Scans** | `GET /api/v1/scans` | GET | `?projectId=<id>` &rarr; `Scan[]` | `FINAL` | Filtered by project scope. |
| **Scans** | `POST /api/v1/scans` | POST | `{ projectId, branch, severityThreshold, failOn }` &rarr; `Scan` | `FINAL` | Initiates backend scan pipeline. |
| **Scans (WebSocket)** | `ws://api.finsec.dev/v1/scans/stream` | WS | `ScanStreamEvent` frames | `FINAL` | Typed `scan:started`, `scan:progress`, `scan:completed` events. |
| **Findings** | `GET /api/v1/findings` | GET | `?projectId=<id>&scanId=<id>` &rarr; `Finding[]` | `FINAL` | API-owned findings array. |
| **Cerebus Analyst** | `POST /api/v1/cerebus/analyze` | POST | `{ findingId, query, projectId }` &rarr; `CerebusAnalysisResponse` | `FINAL` | Structured 5-section analyst response without internal reasoning tokens. |
| **Remediation** | `GET /api/v1/remediation/:findingId` | GET | `void` &rarr; `FixProposal` | `FINAL` | Diff preview and verifier status (`passed`, `failed`). |
| **Remediation** | `POST /api/v1/remediation/apply` | POST | `{ findingId }` &rarr; `FixResult` | `FINAL` | Safe patch application; blocked if verifier fails or file changed. |
| **Attack Paths** | `GET /api/v1/attack-paths` | GET | `?projectId=<id>` &rarr; `AttackPath[]` | `FINAL` | Backend-owned exploitability graph nodes and edges. |
| **Compliance** | `GET /api/v1/compliance/summary` | GET | `?projectId=<id>` &rarr; `ComplianceSummary` | `FINAL` | Backend-calculated framework coverage and posture scores. |
| **Governance** | `POST /api/v1/triage` | POST | `{ findingId, status, notes }` &rarr; `Finding` | `FINAL` | Finding triage state transition. |
| **Governance** | `POST /api/v1/suppressions` | POST | `{ ruleId, reason, scope }` &rarr; `Suppression` | `FINAL` | Policy suppression creation. |
| **Governance** | `POST /api/v1/baselines` | POST | `{ projectId, scanId }` &rarr; `Baseline` | `FINAL` | Baseline snapshot capture. |
| **Reports** | `POST /api/v1/reports/generate` | POST | `{ type, projectId, scanId }` &rarr; `Report` | `FINAL` | Assembles PDF & SARIF 2.1.0 metadata. |
| **Reports** | `GET /api/v1/reports/:id/download/pdf` | GET | `void` &rarr; `Blob` (PDF) | `FINAL` | Downloadable PDF document Blob. |
| **Reports** | `GET /api/v1/reports/:id/download/sarif` | GET | `void` &rarr; `Blob` (SARIF 2.1.0) | `FINAL` | Downloadable SARIF Blob with D-006 mapping. |
| **Settings** | `GET /api/v1/settings` | GET | `void` &rarr; `WorkspaceSettings` | `PROVISIONAL` | Workspace settings and security policy persistence. |
| **Settings** | `POST /api/v1/settings/test-connection` | POST | `void` &rarr; `{ success, latencyMs, message }` | `PROVISIONAL` | API Gateway connection diagnostic test. |
| **Integrations** | `GET /api/v1/integrations` | GET | `void` &rarr; `Integration[]` | `FINAL` | Integration cards and connection status badges. |
