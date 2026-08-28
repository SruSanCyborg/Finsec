# Reports, Export & Security Evidence Architecture

## Executive Overview

The Reports surface (`/reports` and `/reports/:reportId`) provides audit-ready security intelligence generation, structured document previews, PDF download, SARIF 2.1.0 download, and cross-surface generation triggers from Dashboard, Scan Detail, Compliance, and Findings Explorer.

---

## Core Security & Architectural Principles

1. **Strict Backend Ownership**: THE FRONTEND MUST NEVER GENERATE THE AUTHORITATIVE PDF OR CONSTRUCT THE SARIF 2.1.0 SCHEMA IN REACT. Report contents, overall scores, compliance calculations, finding truth, attack-path truth, money-at-risk, report verification, and export artifacts are owned by the FinSec Core API (or `MockReportService`).
2. **D-006 SARIF Mapping Rules**:
   - `critical` / `high` &rarr; SARIF `error`
   - `medium` &rarr; SARIF `warning`
   - `low` / `info` &rarr; SARIF `note`
   - `baseline_state` &rarr; SARIF `baselineState`: `new`, `unchanged`, `absent`.
3. **Artifact Download Boundaries**: PDF and SARIF downloads route through the API abstraction (`mockApiService.downloadReportPdf` / `mockApiService.downloadReportSarif`) producing downloadable Blob artifacts.
4. **URL Search Parameter State**: `/reports/:reportId` deep links enable shareable report inspection.

---

## Component Hierarchy

```
ReportsView (/reports & /reports/:reportId)
 ├── ReportList (Data table listing ID, Title, Type, Status READY/GENERATING/FAILED, Exports)
 ├── ReportPreview (Structured document preview surface with sticky section navigation)
 │    ├── Section 1: Executive Security Posture & Financial Exposure
 │    ├── Section 2: Technical Findings Evidence & Source Locations
 │    ├── Section 3: Critical Attack Propagation Paths
 │    ├── Section 4: Regulatory Compliance Audit Evidence
 │    └── Section 5: Safe Remediation Verification Summary
 ├── ReportSidebarInspector (Right panel with Metadata, Verification signature, Download PDF/SARIF CTAs)
 └── GenerateReportDialog (Modal for generating Executive, Technical, or Compliance reports)
```
