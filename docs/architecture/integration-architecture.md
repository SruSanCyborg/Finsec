# End-to-End Integration Architecture

## 1. Executive Summary

Phase 13 establishes formal cross-surface contracts, query key scoping, cache invalidation rules, WebSocket stream-to-query synchronization, authentication boundary protection, error normalization, and backend handoff specifications for the SIRIUS Desktop Command Center.

---

## 2. Cross-Surface User Lifecycle

```
[ LOGIN / ONBOARDING ]
        │
        ▼
  [ PROJECT SELECTION ] (projectId)
        │
        ▼
   [ SCAN LAUNCH ] (scanId)
        │
        ▼
 [ LIVE PROGRESS STREAM ] (ScanStreamEvent via WebSocket/Simulator)
        │
        ▼
  [ FINDINGS EXPLORER ] (findingId)
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
[ CEREBUS ANALYST ]   [ ATTACK PATH GRAPH ]   [ COMPLIANCE CONTROL ]
   (findingId)              (pathId)             (frameworkId/controlId)
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
                        [ TRIAGE ACTION ]
                               │
                        [ SUPPRESSION / BASELINE ]
                               │
                      [ SAFE REMEDIATION ]
                               │
                        [ RE-SCAN VERIFY ]
                               │
                      [ COMPLIANCE REFRESH ]
                               │
                       [ REPORT GENERATION ] (reportId)
                               │
                      [ PDF / SARIF EXPORT ] (SARIF 2.1.0 schema)
                               │
                   [ SETTINGS / INTEGRATIONS ]
```

---

## 3. Core Architectural Rules

1. **Client-Only Architecture**: Zero rule evaluation, finding fingerprinting, compliance scoring, money-at-risk estimation, attack path exploitability calculation, report assembling, or SARIF schema generation inside React components.
2. **Core API Source of Truth**: The FinSec Core API (or `MockApiService`) owns domain calculations and server state.
3. **Cross-Surface Identifiers**:
   - `projectId`: e.g. `'prj-finsec-core-01'` (PayKit Core API)
   - `scanId`: e.g. `'scan-109283'` (8F31)
   - `findingId`: e.g. `'fnd-88219'` (JWT Key Disclosure)
   - `ruleId`: e.g. `'SEC-JWT-004'`
   - `frameworkId`: e.g. `'pci-dss-4.0'`
   - `controlId`: e.g. `'6.3.1'`
   - `pathId`: e.g. `'ap-001'`
   - `reportId`: e.g. `'rep-8812'`
   - `baselineId`: e.g. `'bsl-101'`
   - `suppressionId`: e.g. `'sup-301'`
