# Coherent Demo Data Model

## 1. Executive Summary

This document defines the single coherent synthetic story and mock data relationship hierarchy used across SIRIUS GUI demo workflows.

---

## 2. Coherent Synthetic Story: PayKit Core API

- **Primary Project**: `prj-finsec-core-01` (`PayKit Core API`)
- **Secondary Project**: `prj-vault-service-02` (`Vault Key Service`)
- **Repository URL**: `https://github.com/finsec/core-gateway.git`
- **Target Branch**: `main`
- **Active Compliance Framework**: `pci-dss-4.0` (PCI DSS 4.0 Financial Security Standard)
- **Compliance Score**: `72.5 / 100`

---

## 3. Mock Entity Relationship Hierarchy

```
Project: prj-finsec-core-01 (PayKit Core API)
 ├── Active Scan: scan-109283 (Commit: 8F31, Branch: main, Gate Result: FAILED)
 │    ├── Finding: fnd-88219 (JWT Key Hardcoded, Severity: CRITICAL, Money-at-Risk: $125,000)
 │    │    ├── Rule: SEC-JWT-004 (Hardcoded JWT Signing Secrets)
 │    │    ├── Compliance Mapping: pci-dss-4.0 / Control 6.3.1 (Crypto Key Protection)
 │    │    ├── Attack Path: ap-001 (Internet Gateway → JWT Discloser → Prod DB Access)
 │    │    ├── Remediation Fix Proposal: fix-88219 (Environment Secret Substitution)
 │    │    └── Governance State: Baseline State NEW, Triage State OPEN
 │    │
 │    ├── Finding: fnd-88220 (Unencrypted Credit Card PAN in Log Buffer, Severity: HIGH, Money-at-Risk: $45,000)
 │    │    ├── Rule: FIN-PCI-603 (PCI DSS Log Sanitization Requirement)
 │    │    ├── Compliance Mapping: pci-dss-4.0 / Control 3.4.1 (PAN Redaction)
 │    │    └── Governance State: Baseline State UNCHANGED
 │    │
 │    └── Finding: fnd-88221 (Stale AWS KMS Key Rotation Policy, Severity: MEDIUM, Money-at-Risk: $15,000)
 │         ├── Rule: AWS-KMS-002 (KMS Annual Key Rotation)
 │         └── Governance State: Baseline State UNCHANGED, Suppressed in sup-301
 │
 ├── Reports:
 │    ├── rep-8812: Executive Security & Financial Risk Briefing (PDF & SARIF 2.1.0)
 │    └── rep-8813: Technical Vulnerability Audit & Code Evidence (PDF & SARIF 2.1.0)
 │
 └── Integrations:
      ├── int-01: GitHub Cloud & Enterprise (CONNECTED)
      ├── int-02: Jira Cloud Defect Tracking (CONNECTED)
      └── int-04: Slack DevSecOps Notification Channel (CONNECTED)
```
