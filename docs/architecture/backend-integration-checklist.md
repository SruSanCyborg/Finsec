# Backend Integration Handoff Checklist

## 1. Executive Summary

This checklist outlines the exact requirements for backend developers connecting the FinSec Core API engine to replace the development `MockApiService`.

---

## 2. Integration Requirements Checklist

### 2.1 Authentication & Session
- [ ] Provide `POST /api/v1/auth/token` returning JWT/session token and user payload.
- [ ] Accept `Authorization: Bearer <token>` on all protected endpoints.
- [ ] Mask all stored API keys, OAuth tokens, and secrets in JSON responses (`••••••••••••3A9F`).

### 2.2 Scans & Real-Time Streaming
- [ ] Implement `ws://api.finsec.dev/v1/scans/stream` supporting typed WebSocket events (`scan:started`, `scan:progress`, `scan:completed`, `scan:failed`).
- [ ] Include `scanId`, `projectId`, `percentComplete`, `findingsFound`, and `stage` in progress events.

### 2.3 Findings & Cerebus AI Analyst
- [ ] Return findings array under `GET /api/v1/findings?projectId=<id>&scanId=<id>`.
- [ ] Ensure finding properties match `@sirius/types` (`id`, `ruleId`, `severity`, `status`, `baselineState`, `location`, `codeSnippet`, `moneyAtRisk`).
- [ ] Cerebus endpoint `POST /api/v1/cerebus/analyze` MUST return 5 structured sections (`ANALYSIS`, `IMPACT`, `RECOMMENDATION`, `PROPOSED REMEDIATION`, `DIFF`) without internal reasoning tokens.

### 2.4 Remediation Safety Gate
- [ ] Block patch application when target file modified since scan (`FILE CHANGED SINCE SCAN`).
- [ ] Block patch application when verifier check status is `failed` or `escalated`.

### 2.5 Attack Paths & Compliance Posture
- [ ] Compute attack paths and exploitability scores on backend; GUI renders read-only SVG graph and accessible keyboard list.
- [ ] Calculate PCI DSS 4.0 and SOC 2 Type II compliance scores and framework control mapping on backend.

### 2.6 Reports & SARIF 2.1.0 Export
- [ ] PDF download endpoint `GET /api/v1/reports/:id/download/pdf` must return `application/pdf` Blob.
- [ ] SARIF download endpoint `GET /api/v1/reports/:id/download/sarif` must return `application/json` Blob adhering to D-006 SARIF severity mapping (`critical`/`high` &rarr; `error`, `medium` &rarr; `warning`, `low`/`info` &rarr; `note`).
