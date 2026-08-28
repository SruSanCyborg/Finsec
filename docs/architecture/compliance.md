# Compliance & Security Posture Architecture

## Executive Overview

The Compliance workspace (`/compliance` and `/compliance?framework=<id>&control=<id>`) provides security governance, framework coverage breakdown (`PCI DSS 4.0`, `SOC 2`, `ISO 27001`), control evaluation tables (`ComplianceControlList`), evidence provenance inspector (`ComplianceControlInspector`), and executive posture narratives.

---

## Core Security & Architectural Principles

1. **Strict Backend Ownership**: THE FRONTEND MUST NEVER CALCULATE THE COMPLIANCE SCORE, CONTROL PASS RATE, OR FRAMEWORK COVERAGE. The FinSec Core API (or `MockComplianceService`) is the single source of truth for computed compliance scores (e.g. `72.5/100`) and control statuses (`pass`, `fail`, `partial`).
2. **Evidence Traceability & Provenance**: Evidence displays scan references (`Scan 8F31`), file locations (`src/middleware/auth.ts:42`), and finding IDs (`FIN-SEC-001`).
3. **URL Search Parameter State**: Selected framework and control state are synchronized with `?framework=<id>&control=<id>` for shareable deep links.
4. **Cerebus Context Integration**: Deep links to `/cerebus?finding=<findingId>` for compliance control explanation.
5. **Post-Remediation Refetching**: Remediating a finding invalidates the `compliance-summary` and `compliance-controls` TanStack Query cache to refetch updated backend compliance evaluations.

---

## Component Hierarchy

```
ComplianceView (/compliance)
 ├── ComplianceHeroScore (Hero score ring 72.5/100, trend badge, executive narrative)
 ├── ComplianceFrameworkCards (Framework selection cards PCI DSS 4.0, SOC 2, ISO 27001)
 ├── ComplianceControlList (Control ID, title, status PASS/FAIL/PARTIAL, affected findings)
 └── ComplianceControlInspector (Requirement description, evidence provenance, Cerebus/Remediation CTAs)
```
