# Suppressions, Baselines & Triage Governance Architecture

## Executive Overview

The Governance system encompasses Suppressions Management (`/suppressions`), Repository Baselines & Delta Governance (`/baselines`), Finding Triage status transitions (`open`, `fixed`, `ignored`), Audit History tracking, and query cache invalidation across dependent security workspaces (`findings`, `dashboard`, `compliance`, `attack-paths`).

---

## Core Security & Governance Principles

1. **Strict Backend Ownership**: THE FRONTEND MUST NEVER COMPUTE FINGERPRINTS, BASELINE MATCHES, BASELINE COMPARISONS (`NEW`/`UNCHANGED`/`ABSENT`), OR SUPPRESSION POLICY ENFORCEMENT. The FinSec Core API (or `MockGovernanceService`) is the single source of truth for all governance evaluations.
2. **Suppression Non-Destruction**: Suppressing a finding hides it from actionable queues according to policy but retains full evidence auditability.
3. **Explicit Human Risk Acceptance**: Risk acceptance requires explicit confirmation and records author justification notes in audit history.
4. **Post-Action Query Cache Invalidation**: Triage, suppression creation, suppression revocation, and baseline capture invalidate affected TanStack Query caches (`findings`, `suppressions`, `baselines`, `dashboard`, `compliance-summary`).
5. **URL Search Parameter State**: `/suppressions?id=<suppressionId>` and `/baselines?id=<baselineId>` sync state with URL query parameters for shareable deep links.

---

## Workspace Routes & Component Hierarchy

```
SuppressionsView (/suppressions)
 ├── Filter Toolbar (ALL, ACTIVE, REVOKED)
 ├── Suppressions Data Table (Policy ID, Rule ID, Scope, Status, Expiry)
 ├── SuppressionInspector (Right panel with Justification, Affected Findings, Revoke CTA)
 └── CreateSuppressionDialog (Modal for creating suppressions with rule, scope, reason, expiry)

BaselinesView (/baselines)
 ├── Active Baseline Hero Strip (Scan reference, Comparison counters NEW: 7, UNCHANGED: 118, ABSENT: 5)
 ├── Baselines Data Table (Baseline ID, Branch, Scan, Status, Date)
 ├── BaselineInspector (Right panel with Author context and "View New Findings" CTA)
 └── CreateBaselineDialog (Modal for capturing scan as reference baseline)

FindingDetailView Contextual Triage Action Menu
 ├── Actions: [Resolve Finding] [Accept Risk] [Suppress] [Reopen]
 ├── Banners: Active Suppression Warning Banner & Accepted Risk Banner
 └── Panels: Governance Status Panel & Triage Audit History
```
