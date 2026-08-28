# Hackathon Demo Walkthrough Mode Architecture

## 1. Executive Summary

Phase 14 introduces a lightweight, deterministic guided **Hackathon Demo Mode** accessible via the TopBar (`"Demo Walkthrough"`) or Command Palette (`⌘K` &rarr; `"Launch Hackathon Demo Walkthrough"`).

---

## 2. Guided Hackathon Storyline (PayKit Core API)

The walkthrough guides presenters through a 9-step narrative using the single synthetic project (`prj-finsec-core-01` / `PayKit Core API`):

1. **Step 1: Executive Security Dashboard (`/dashboard`)**: Primary Security Posture Score (72.5/100) and Money-at-Risk ($185,000).
2. **Step 2: Launch AST Security Scan (`/scans/new`)**: Configure AST scan against branch `main`.
3. **Step 3: Live Scan Streaming Console (`/scans/scan-109283`)**: Real-time WebSocket streaming console emitting AST discovery and gate failure alert.
4. **Step 4: Findings Explorer (`/findings/fnd-88219`)**: Inspect critical JWT signing private key disclosure (`fnd-88219`) with redacted credentials.
5. **Step 5: Cerebus AI Security Analyst (`/cerebus/fnd-88219`)**: Structured 5-section AI explanation without raw prompt tokens.
6. **Step 6: Attack Path Graph (`/attack-paths/ap-001`)**: Multi-hop exploit graph (API Gateway &rarr; JWT Disclosure &rarr; Production DB Access).
7. **Step 7: Compliance Posture (`/compliance/pci-dss-4.0`)**: PCI DSS Requirement 6.3.1 automated posture mapping.
8. **Step 8: Verified Remediation (`/remediation/fnd-88219`)**: Safe patch preview, verifier status `PASSED`, and human approval gate.
9. **Step 9: Audit Reports & SARIF 2.1.0 Export (`/reports/rep-8812`)**: Audit-ready report preview and SARIF 2.1.0 download.

---

## 3. Demo Modal Controls
- **Next Step CTA**: Navigates deterministically to the next feature surface.
- **Restart Walkthrough**: Restores step 1 and resets active demo indicators.
- **Exit Walkthrough**: Dismisses guided overlay while preserving active user state.
