# Remediation & Safe Fix Application Architecture (`/findings/:findingId/remediation`)

SIRIUS implements a strict **Human-in-the-Loop Safe Patch Application** model. The desktop GUI operates exclusively as a presentation client; React components NEVER mutate local filesystem code directly.

## Remediation Workspace Lifecycle

```
[Finding Detail / Cerebus Proposal]
       │
       ▼
[Remediation Workspace /findings/:findingId/remediation]
       │
       ├─▶ FixSafetyBanner (Safety statement / Blocked status)
       ├─▶ DiffReviewer (Stats +4/-2, Hunk nav, Line numbers, Redaction)
       ├─▶ FixVerificationPanel (Static Analysis, Secret Scan, Policy, Regression)
       │
       ▼
[Human Confirmation Modal (FixApprovalModal)]
       │
       ▼
[FixApplyProgressCard]
  1. PREPARING (Validate proposal payload)
  2. BACKUP CREATED (.sirius/backups/target.ts.bak)
  3. APPLYING PATCH (Atomic hunk insertion via API boundary)
  4. REVERIFYING (Core scanner re-verification)
  5. APPLIED & RESOLVED (Finding status updated to resolved)
```

## Non-Negotiable Safety Rules

1. **Zero React File Mutation**: React components MUST NOT call `fs.writeFile`, `git apply`, or execute shell commands directly.
2. **Verifier Pass Prerequisite**: The `Approve & Apply Fix` CTA is strictly DISABLED unless `verifierStatus === 'passed'`.
3. **Stale File Protection**: If the target source file changed post-scan, patch application is BLOCKED with `FILE CHANGED SINCE SCAN` banner.
4. **Human Approval Gate**: Patches are NEVER automatically applied. Explicit confirmation via `FixApprovalModal` is required.
5. **Atomic Backup & Post-Verification**: Backups are created prior to mutation, and the repository posture is re-verified after patch application.
