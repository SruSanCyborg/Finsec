# Query Cache Invalidation Matrix

## 1. Executive Summary

This document specifies the exact TanStack Query cache invalidation triggers across SIRIUS GUI mutation workflows.

---

## 2. Invalidation Matrix

| User Mutation / Event | Trigger Mechanism | Affected Query Keys | Purpose & Result |
| :--- | :--- | :--- | :--- |
| **Start Scan** | `useCreateScanMutation` | `['scans']`, `['projects']` | Updates scan history list and project active scan state. |
| **Scan Stream Complete Event** | `processStreamEvent('scan:completed')` | `['scans']`, `['findings']`, `['dashboard']`, `['compliance-summary']`, `['baselines']` | Refetches finished scan findings, updated posture scores, and baseline states. |
| **Triage Finding Action** | `useTriageFindingMutation` | `['findings']`, `['finding']`, `['dashboard']`, `['compliance-summary']` | Updates finding triage status (`ACKNOWLEDGED`, `IN_TRIAGE`, `RESOLVED`, `FALSE_POSITIVE`) and metrics. |
| **Create Suppression** | `useCreateSuppressionMutation` | `['suppressions']`, `['findings']`, `['finding']`, `['compliance-summary']`, `['dashboard']` | Applies policy rule suppressions and refetches affected finding compliance mapping. |
| **Revoke Suppression** | `useRevokeSuppressionMutation` | `['suppressions']`, `['findings']`, `['finding']`, `['compliance-summary']`, `['dashboard']` | Restores suppressed finding visibility. |
| **Create Baseline Snapshot** | `useCreateBaselineMutation` | `['baselines']`, `['findings']`, `['scans']`, `['dashboard']` | Captures baseline fingerprint set (`NEW`, `UNCHANGED`, `ABSENT`). |
| **Apply Remediation Patch** | `useApplyFixMutation` | `['findings']`, `['finding']`, `['fix-proposal']`, `['compliance-summary']`, `['attack-paths']`, `['dashboard']` | Applies safe patch, updates verifier state, and invalidates compliance & attack path graphs. |
| **Save Security Policy** | `useUpdateSettingsMutation` | `['settings']`, `['findings']`, `['dashboard']`, `['compliance-summary']` | Persists severity thresholds (`CRITICAL`..`INFO`) and build fail-on predicates. |
| **Generate Report** | `useGenerateReportMutation` | `['reports']`, `['report']` | Refetches report list with newly assembled PDF & SARIF export metadata. |
| **Connect / Disconnect Integration** | `useConnectIntegrationMutation` / `useDisconnectIntegrationMutation` | `['integrations']`, `['settings']` | Refetches tool integration connection status badges. |

---

## 3. Project Scoping Rules

To prevent cross-project stale data leakage when switching projects:
- Scans: `['scans', projectId]`
- Findings: `['findings', projectId, scanId]`
- Compliance Summary: `['compliance-summary', projectId]`
- Suppressions: `['suppressions', projectId]`
- Baselines: `['baselines', projectId]`
- Reports: `['reports', projectId]`
