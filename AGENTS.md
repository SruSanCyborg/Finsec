# AGENTS.md — Directives & Architectural Rules for Coding Agents

Welcome agent. You are working on **SIRIUS**, the desktop security command center GUI for `finsec-lint`.

Strictly follow these non-negotiable rules whenever modifying or expanding this codebase.

---

## 1. Core Architectural Mandate
- **SIRIUS GUI IS A CLIENT ONLY.**
- SIRIUS GUI **NEVER** independently:
  - scans source code
  - implements AST security rules
  - calculates compliance scores
  - calculates money-at-risk
  - executes Cerebus fix pipelines
  - invents security findings
  - directly modifies code repositories
  - implements backend business logic inside React components
- The **FinSec Core API** (or the development `MockApiService`) is the single source of truth for all domain data and calculations.

---

## 2. Shared Types & Contracts
- All domain structures MUST consume types exported from `@sirius/types`.
- DO NOT invent duplicate interfaces or types inside component files.
- If a new backend property is required, update `@sirius/types` and mark provisional fields clearly with `/* PROVISIONAL */`.

---

## 3. Design System & Styling Rules
- **All future UI must consume the SIRIUS design system (`@sirius/design-system` & `@sirius/ui`). Do not introduce hardcoded colors, arbitrary typography, duplicated buttons, duplicated modals, or local animation systems.**
- **NEVER hardcode hex/rgb color values** inside components or inline styles.
- Use CSS custom properties from `@sirius/design-system` (`var(--bg-void)`, `var(--color-cyan)`, `var(--color-violet)`, etc.).
- Follow the semantic color mapping:
  - **Emerald (`#4ADE80`)**: Safe / Passed / Verified / Compliant
  - **Teal (`#2DD4BF`)**: Info / In-progress / Low
  - **Cyan (`#38BDF8`)**: Primary brand / Medium / Active
  - **Indigo (`#818CF8`)**: High severity
  - **Violet (`#A78BFA`)**: Critical / Cerebus / Money-at-risk
- Money and counting values MUST use tabular monospace numerals (`.sirius-numeral-tabular` or `font-variant-numeric: tabular-nums`).

---

## 4. Shell, Navigation & Feature Organization Rules
- Feature screens MUST render inside the persistent `AppShell` container.
- Feature-specific components MUST live inside `apps/desktop/src/features/{feature_name}/` (e.g. `features/dashboard/`, `features/projects/`, `features/scans/`, `features/findings/`, `features/cerebus/`, `features/remediation/`). Do not pollute `@sirius/ui` with domain-specific cards or widgets.
- DO NOT invent custom local sidebars, top bars, or modal dialog overlays outside `AppShell` and `@sirius/ui`.
- Global keyboard shortcuts (`⌘K`, `⌘B`, `?`, `Esc`) MUST be registered centrally in `AppShell` or `useUIStore`.
- Onboarding state transitions MUST use `useAppStore.setLifecyclePhase()`. Do not bypass or hardcode local onboarding flags inside React components.

---

## 5. API, WebSocket & Scan Engine Rules
- **NEVER use raw `fetch()` or raw `new WebSocket()` directly in React components.**
- Always use the centralized `SiriusApiClient` from `@sirius/api` or TanStack Query hooks from `apps/desktop/src/api/queries.ts`.
- For real-time streaming events (e.g. live scan progress), use `SiriusWebSocketClient` or `MockScanSimulator` passing typed `ScanStreamEvent` objects through `useScanStore.processStreamEvent()`.
- Do NOT hardcode backend URLs anywhere in code. Consume environment variables (`VITE_API_URL`, `VITE_WS_URL`) via `getSiriusEnv()`.
- **Severity Threshold** (`critical`..`info`) and **Fail-On Predicate** (`all`, `new`, `verified-secrets`) MUST remain distinct configuration concepts in scan launcher and gate presentation.

---

## 6. Findings & Investigation Rules
- **Findings are API-owned data**: Zero local rule evaluation, fingerprint generation, compliance score calculation, or risk calculation inside React components.
- **URL Search Parameters**: Shareable filter state (`severity`, `baseline`, `validity`, `search`, `selected`) MUST be synchronized with URL query params.
- **Secret Protection**: All code snippets MUST pass through `redactSensitiveText()` before rendering. Never display raw credentials in the GUI.

---

## 7. Cerebus AI Security Analyst Rules
- **Cerebus is an Advisory Assistant**: Cerebus explains security findings, root causes, compliance implications, and proposes remediation steps. The FinSec Core API remains the single source of truth for findings, severities, compliance scores, and money at risk.
- **No Chain-of-Thought**: Internal reasoning tokens are NEVER displayed to the user; only structured user-facing analyst sections (`ANALYSIS`, `IMPACT`, `RECOMMENDATION`, `PROPOSED REMEDIATION`, `DIFF`).
- **Read-Only Diffs & No File Mutation**: Proposed code diffs (`DiffPreviewCard`) are strictly read-only evidence previews. Cerebus components MUST NOT execute file patch applications, git commits, or shell commands.
- **Credential Protection**: All code diffs and analyst explanations MUST pass through `redactSensitiveText()` before rendering to prevent credential leakage.

---

## 8. Remediation & Safe Fix Application Rules
- **Zero React File Mutation**: React components MUST NOT execute `fs.writeFile`, `git apply`, or shell commands directly. Patch application calls MUST route through the centralized API boundary (`SiriusApiClient` / `MockRemediationService`).
- **Verifier Pass Prerequisite**: Patch application MUST remain disabled unless `verifierStatus === 'passed'`. Failed or escalated patches CANNOT be applied automatically.
- **Stale File Blocking**: If the target source file was modified after the scan, patch application MUST be blocked with `FILE CHANGED SINCE SCAN` banner.
- **Human Approval Gate**: Patches are NEVER automatically applied. Explicit human confirmation via `FixApprovalModal` is mandatory.
- **Credential Protection**: All displayed diffs MUST pass through `redactSensitiveText()` before rendering to sanitize raw API keys and private tokens.

---

## 9. State Management Rules
- Use local React state (`useState`) strictly for local component UI state (e.g. search query, tab selection, modal toggles).
- Use Zustand stores from `@sirius/state` for cross-screen client state:
  - `useAppStore`: Active project/scan selection, onboarding phase, sidebar state.
  - `useSessionStore`: Auth credentials and active user profile.
  - `useScanStore`: Normalized real-time scan event state, console log buffer, pipeline stage, gate result.
  - `useUIStore`: Command palette, notifications, shortcuts sheet, and modals.
- Use **TanStack Query** (`@tanstack/react-query`) for all server state fetching and caching.

---

## 10. Testing & Quality Verification
- Every new feature or helper must include unit tests.
- Always run `npx pnpm typecheck`, `npx pnpm lint`, and `npx pnpm test` before concluding your task.

---

## 11. Attack Path & Security Graph Rules
- **Backend Graph Ownership**: The backend/FinSec Core API owns attack path generation, exploitability calculations, relationship semantics, risk exposure values, and path ranking.
- **Zero Frontend Path Calculation**: React components MUST NOT execute graph traversal algorithms to calculate exploitability or invent attack vectors.
- **URL State Synchronization**: Selected path state (`?path=<pathId>`) MUST be synchronized with URL query parameters for shareable deep links.
- **Parallel Accessibility**: Every visual SVG graph MUST be accompanied by a parallel accessible keyboard-driven list (`AttackPathList`).

---

## 12. Compliance & Security Posture Rules
- **Zero Frontend Compliance Calculations**: The backend/FinSec Core API owns compliance scores, framework coverages, control statuses, and evidence mapping. React components MUST NOT derive or calculate scores from findings.
- **Evidence Traceability**: Evidence provenance MUST display scan references and file locations.
- **Query Parameter State**: Selected framework and control state MUST be synchronized with URL query parameters (`/compliance?framework=<id>&control=<id>`).
- **Post-Remediation Invalidation**: Patch application MUST invalidate the `compliance-summary` and `compliance-controls` TanStack Query cache to refetch updated backend compliance evaluations.

---

## 13. Governance, Suppressions & Baseline Rules
- **Zero Frontend Fingerprint or Governance Engine**: The backend/FinSec Core API owns fingerprint matching, baseline state evaluations (`NEW`, `UNCHANGED`, `ABSENT`), suppression policy matching, finding triage status transitions, and audit history. React components MUST NOT calculate baseline differences or match suppression rules locally.
- **Suppression Non-Destruction**: Suppressed findings remain auditable in the database; GUI components render `SUPPRESSED` banners with deep links to suppression policies.
- **Explicit Risk Acceptance Confirmation**: Risk acceptance actions require explicit human confirmation (`Accept Risk` modal/alert) and audit justification notes.
- **Query Cache Invalidation**: Governance actions (`triageFinding`, `createSuppression`, `revokeSuppression`, `createBaseline`) MUST invalidate affected TanStack Query caches (`findings`, `suppressions`, `baselines`, `dashboard`, `compliance-summary`).
- **URL Parameter Synchronization**: Workspace state (`/suppressions?id=<id>` and `/baselines?id=<id>`) MUST synchronize with URL search parameters for shareable deep links.

---

## 14. Reports, Evidence & SARIF Export Rules
- **Zero Frontend Report Engine**: The backend/FinSec Core API owns report generation, report contents, report metadata, compliance calculations, finding truth, attack-path truth, money-at-risk, report verification, and export artifacts. React components MUST NOT assemble custom PDF or SARIF engines in the browser.
- **D-006 SARIF Level Mapping**: SARIF exports MUST map `critical`/`high` &rarr; `error`, `medium` &rarr; `warning`, `low`/`info` &rarr; `note`. `baseline_state` MUST map to `baselineState` (`new`, `unchanged`, `absent`).
- **API Download Boundaries**: Artifact downloads MUST route through API client abstractions (`downloadReportPdf`, `downloadReportSarif`) producing downloadable Blob objects.
- **Untrusted Report Content**: All code snippets and finding descriptions rendered in report previews MUST pass through `redactSensitiveText()` before rendering to sanitize raw API keys and private tokens.

---

## 15. Settings, Connection & Integration Rules
- **Zero Secret Rendering**: API keys, OAuth tokens, and webhook secrets MUST ALWAYS be masked after storage (`••••••••••••3A9F`). Secrets MUST NOT be rendered raw in React component state, network logs, or console output.
- **Backend Policy Ownership**: Security policy severity thresholds (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`) and build fail-on predicates (`all`, `new`, `verified-secrets`) are Core API properties. Settings mutations MUST invalidate affected TanStack Query caches (`findings`, `dashboard`, `compliance-summary`).
- **Session State Isolation**: Authentication and active user session state remain isolated in `useSessionStore`. Logout actions MUST route through `useSessionStore.clearSession()`.
- **URL Parameter Synchronization**: Settings section navigation (`/settings/:section` and `/settings?section=<id>`) MUST synchronize with URL parameters for shareable deep links.

---

## 16. System Integration, Cache Invalidation & Route Guarding Rules
- **Project Isolation**: All server state query keys MUST include `projectId` scoping (`['scans', projectId]`, `['findings', projectId]`, `['compliance-summary', projectId]`, `['suppressions', projectId]`, `['baselines', projectId]`, `['reports', projectId]`). Stale data from previous active projects MUST NEVER be displayed under a newly selected project.
- **WebSocket Stream Synchronization**: Scan streaming events update transient `ScanStore` state during scan execution. When a scan completes (`scan:completed`), `useScanStore.processStreamEvent()` MUST invalidate TanStack Query server caches (`scans`, `findings`, `dashboard`, `compliance-summary`, `baselines`).
- **Unified Domain Contracts**: All cross-surface transitions MUST consume unified identifier keys (`projectId`, `scanId`, `findingId`, `ruleId`, `frameworkId`, `controlId`, `pathId`, `reportId`). Feature components MUST NOT introduce ad-hoc fake IDs or local score/rule re-calculations.
- **Authentication Guarding**: Protected routes require valid `isAuthenticated` session state. Logging out via `useSessionStore.clearSession()` MUST clear stored tokens and redirect to onboarding/login.

---

## 17. Visual Polish, Motion & Hackathon Demo Rules
- **Design Token Discipline**: All visual values (colors, surface levels, glass opacity, border intensity, shadows, radius) MUST consume CSS custom properties from `@sirius/design-system`. Hardcoded hex values are strictly forbidden.
- **Meaningful Motion**: Micro-interactions MUST communicate state changes or live activity. Unnecessary floating particles or endless spinning animations are forbidden.
- **Tabular Numerals**: Money and security scores MUST use `.sirius-numeral-tabular` (`font-variant-numeric: tabular-nums`).
- **Deterministic Hackathon Walkthrough**: Demo Mode (`DemoModeModal`) provides a guided 9-step walkthrough of the PayKit Core API story without inventing fake backend state.







