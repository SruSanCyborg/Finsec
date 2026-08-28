# Findings Explorer & Investigation Inspector (`/findings`)

The Findings Explorer is the investigation surface where security engineers analyze security vulnerabilities, secret leaks, compliance control mappings, and financial exposure.

## Master-Detail Workspace Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ FINDINGS EXPLORER HEADER & SUMMARY STRIP                   │
│ [All] [Critical 3] [High 11] [Medium 14] [Low 5] [Info 2]   │
├─────────────────────────────────────────────────────────────┤
│ Search   Baseline   Validity   Group By   Sort By           │
├──────────────────────────────┬──────────────────────────────┤
│ FINDINGS LIST                │ FINDING DETAIL INSPECTOR     │
│                              │                              │
│ ◆ CRITICAL FIN-SEC-001       │ Hardcoded Provider Key       │
│   src/config/auth.ts:42      │ Location: auth.ts:42         │
│   NEW · VERIFIED LIVE        │ Source Code Viewer           │
│                              │ (with secret redaction)      │
│ ◇ HIGH FIN-PCI-603           │ Description & Risk           │
│   src/payment.ts:104         │ Compliance: PCI DSS 6.3.1    │
│                              │ Exposure: $1,450,000         │
│                              │ Metadata Grid                │
│                              │ [← Previous] [Next →]        │
└──────────────────────────────┴──────────────────────────────┘
```

## Primary Principles

1. **Investigation Surface**: Master-detail split layout allowing seamless exploration without losing filter context.
2. **URL State Synchronization**: Filters (`severity`, `baseline`, `validity`, `project`, `scan`, `search`, `sortBy`, `groupBy`, `selected`) are reflected in search params so URLs are shareable.
3. **Secret Redaction**: All source code snippets pass through `redactSensitiveText()` before rendering to prevent accidental credential leakage (`sk_live_••••••••`).
4. **Pure Client Mandate**: All severity counts, compliance mappings, and risk metrics originate from server/mock API. Zero frontend rule calculations.
5. **Phase 5 Scope Boundary**: Investigation and evidence inspection only. No Cerebus automated remediation or triage mutation actions in Phase 5.
