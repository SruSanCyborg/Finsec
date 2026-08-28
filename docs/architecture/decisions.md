# Architectural Decision Records (ADRs)

## ADR 001: Selection of Tauri + React + Vite Stack
- **Context**: SIRIUS desktop security command center requires a lightweight, memory-efficient desktop shell.
- **Decision**: Use Tauri with a React + TypeScript + Vite frontend.
- **Consequences**: Fast startup time, native OS integration capability, low memory footprint compared to Electron.

## ADR 002: Monorepo Architecture with pnpm Workspaces
- **Context**: Need to enforce strict architectural separation between domain types, design system, API protocol, state, and UI shell.
- **Decision**: Adopt pnpm workspaces with `@sirius/*` package namespace.
- **Consequences**: Component code cannot directly import utilities or write raw API calls without going through explicit package boundaries.

## ADR 003: Pure Client Role for SIRIUS GUI
- **Context**: Prevent duplication of security rules or calculation logic inside the desktop GUI.
- **Decision**: SIRIUS GUI is strictly a client to the FinSec Core API. All scan executions, compliance score calculations, and risk valuations remain server-side.
- **Consequences**: GUI components remain clean, presentational, and decoupled from security rule evaluation logic.

## ADR 004: Application Shell & Onboarding State Machine
- **Context**: SIRIUS requires a deterministic onboarding flow (Boot → Welcome → Auth → Connect Project → First Scan Primer) and persistent application frame (`AppShell`).
- **Decision**: Manage onboarding lifecycle deterministically inside `@sirius/state` (`useAppStore`) and encapsulate global overlays (⌘K Command Palette, Notification Drawer, Keyboard Shortcuts Sheet) in a single root manager.
- **Consequences**: Fast onboarding recovery, predictable overlay stacking, and clean separation between shell infrastructure and feature routes.

## ADR 005: Feature Component Modularization & TanStack Query Layer
- **Context**: Dashboard and Projects screens require rich server data fetching, loading skeletons, empty states, and error handling.
- **Decision**: Feature components live inside `apps/desktop/src/features/{feature_name}/` and consume TanStack Query hooks (`useDashboardDataQuery`, `useProjectsQuery`, `useProjectQuery`) connected to `SiriusApiClient` / `MockApiService`.
- **Consequences**: Clean feature encapsulation, presentation-only UI components, automatic background refetching, and zero duplicated mock data.

## ADR 006: Live Scan Command Deck & Mock Stream Replay Engine
- **Context**: SIRIUS requires a real-time scan command deck (`/scans/:scanId`) with progress hero, stage visualizer, live console, finding arrival stream, and deterministic mock event replay.
- **Decision**: Encapsulate deterministic stream simulation in `packages/mock-api/src/scan-simulator.ts` emitting typed `ScanStreamEvent` objects, normalized via `useScanStore`. Keep severity threshold and fail-on gate predicate distinct.
- **Consequences**: Realistic live scan command deck demo, zero AST scanning in React, clean separation between live ephemeral stream state and persisted TanStack Query scan records.

## ADR 007: Master-Detail Investigation Workspace & Secret Redaction
- **Context**: Security engineers need a dense investigation workspace (`/findings`) with shareable filter context, source code evidence inspection, and strict credential protection.
- **Decision**: Implement a master-detail split layout synchronized with URL search params (`severity`, `baseline`, `validity`, `search`, `selected`) and enforce automated credential redaction (`redactSensitiveText`) on all code evidence snippets before rendering.
- **Consequences**: Deep investigation workflow, shareable view URLs, keyboard navigation support, and zero credential leakage in the GUI.

## ADR 008: Cerebus AI Security Analyst Workspace & Read-Only Remediation Proposer
- **Context**: Security engineers need an AI security analyst (`/cerebus`) that understands active finding context, explains root cause/technical impact/compliance controls, and presents read-only code remediation proposals without executing file mutations.
- **Decision**: Encapsulate Cerebus analysis in `MockCerebusService` / `useCerebusMutation()`, prohibit chain-of-thought token displays in favor of structured analyst sections (`ANALYSIS`, `IMPACT`, `RECOMMENDATION`), enforce read-only code diff previews (`DiffPreviewCard`) with credential redaction, and display verifier status cards.
- **Consequences**: Deep AI security analyst experience, zero unvetted repository mutations, zero credential leakage, and clean separation between AI advisory logic and authoritative core security data.

## ADR 009: Remediation Lifecycle & Safe Human-in-the-Loop Fix Application
- **Context**: SIRIUS needs a dedicated Remediation Workspace (`/findings/:findingId/remediation`) with diff review, core verifier checks, human confirmation modal, safe application progress, backup confirmation, and stale file protection.
- **Decision**: Separate `proposalStatus` from `verifierStatus`, enforce `verifierStatus === 'passed'` as a prerequisite for application, mandate explicit human approval via `FixApprovalModal`, route patch application through the API boundary (`MockRemediationService` / `SiriusApiClient`), and perform post-application re-verification.
- **Consequences**: Safe remediation lifecycle, zero React file mutations, zero unverified patch applications, robust backup & rollback handling, and finding status resolution.

### ADR 010: Attack Path Security Graph Inspector & Path Selection State
- **Status**: Accepted
- **Context**: Attack path visualization requires presenting multi-hop attack propagation from entry point credentials to financial database targets without placing security rule graph traversal logic in client React components.
- **Decision**: The FinSec Core API / `MockAttackPathService` owns graph generation, node semantics, and risk exposure values. The GUI renders SVG nodes (`AttackPathNodeView`) and directional edges (`AttackPathGraphView`) with full URL query param synchronization (`/attack-paths?path=<pathId>`) and a parallel accessible list (`AttackPathList`).

---

### ADR 011: Compliance & Security Posture Backend Ownership & Evidence Traceability
- **Status**: Accepted
- **Context**: Compliance posture presentation requires displaying framework coverage, control pass/fail states, and evidence provenance without performing score calculations in React.
- **Decision**: The FinSec Core API / `MockComplianceService` owns all compliance calculations, overall scores, control statuses, and framework mappings. The GUI strictly renders hero score rings (`ComplianceHeroScore`), framework cards (`ComplianceFrameworkCards`), control tables (`ComplianceControlList`), and evidence provenance (`ComplianceControlInspector`) with query parameter state (`/compliance?framework=<id>&control=<id>`).

---

### ADR 012: Governance Lifecycle, Baseline Comparison & Suppression Policy Boundaries
- **Status**: Accepted
- **Context**: Finding triage (`open`, `fixed`, `ignored`), baseline comparisons (`NEW`, `UNCHANGED`, `ABSENT`), and suppression enforcement must operate securely without executing fingerprinting algorithms in the client browser.
- **Decision**: The FinSec Core API / `MockGovernanceService` owns all fingerprint matching, baseline state evaluations, suppression policy enforcement, finding lifecycle transitions, and audit history records. The GUI strictly renders triage menus (`FindingDetailView`), suppression management (`SuppressionsView`), baseline comparisons (`BaselinesView`), and invalidates TanStack Query caches (`findings`, `suppressions`, `baselines`, `dashboard`, `compliance-summary`) upon user action.

---

### ADR 013: Report Generation Engine Ownership & SARIF 2.1.0 Schema Export
- **Status**: Accepted
- **Context**: Security intelligence reports (Executive, Technical, Compliance) and SARIF 2.1.0 export artifacts must reflect authoritative Core API assessments without constructing custom reporting engines inside React.
- **Decision**: The FinSec Core API / `MockReportService` owns report generation, report contents, report metadata, compliance calculations, finding truth, attack-path truth, money-at-risk, report verification, and export artifacts. The GUI strictly renders configuration modals (`GenerateReportDialog`), structured document previews (`ReportPreview`), right inspector panels (`ReportSidebarInspector`), and triggers downloads via API abstractions (`downloadReportPdf`, `downloadReportSarif`) adhering strictly to D-006 SARIF severity and baseline mapping rules.

---

### ADR 014: Settings Configuration Architecture & Integration Secret Protection
- **Status**: Accepted
- **Context**: Desktop settings configuration, security policies, API connection testing, and tool integrations (GitHub, GitLab, Jira, Slack, PagerDuty) must operate cleanly while guaranteeing secret protection.
- **Decision**: The FinSec Core API / `MockSettingsService` owns settings persistence, policy evaluation, connection testing, and integration OAuth state. Secrets (API keys, webhook tokens) are strictly masked (`••••••••••••3A9F`) and never rendered raw. Policy updates invalidate TanStack Query caches (`findings`, `dashboard`, `compliance-summary`). Session logout operates exclusively through `useSessionStore.clearSession()`.

---

### ADR 015: End-to-End Integration, Cross-System Contracts & Query Isolation
- **Status**: Accepted
- **Context**: The desktop command center contains 12 interconnected feature surfaces (Dashboard, Projects, Scans, Findings, Cerebus, Remediation, Attack Paths, Compliance, Governance, Reports, Settings) that must function as one unified application without stale cross-project data leaks or duplicated client-side state.
- **Decision**: All feature surfaces consume unified domain identifiers (`projectId`, `scanId`, `findingId`, `ruleId`, `frameworkId`, `controlId`, `pathId`, `reportId`). All TanStack Query hooks explicitly scope queries by `projectId` (`['scans', projectId]`, `['findings', projectId]`, `['compliance-summary', projectId]`, etc.) to guarantee instant data refresh when switching active projects. WebSocket scan streaming updates transient Zustand state during scanning and invalidates TanStack Query server keys upon `scan:completed`.




- **Consequences**: Interactive visual risk exploration, deep-linkable path investigation, zero graph-traversal logic in the browser, and consistent cross-platform attack propagation representation.
