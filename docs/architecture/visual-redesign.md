# SIRIUS Visual Architecture: Editorial Security Command Center

This document outlines the visual system, design tokens, component architecture, and design decisions governing the **SIRIUS Editorial Security Command Center** GUI redesign.

---

## 1. Visual Philosophy

SIRIUS transitions from a conventional "dark mode cyber security dashboard" to an **editorial security intelligence workspace**.

### Reference Mental Model
- **Linear** (clean typography, generous whitespace, pill controls, minimal noise)
- **Raycast** (focused command palette, crisp borders, restrained micro-interactions)
- **Premium Security Intelligence Operations** (editorial visual hierarchy, tabular numeric clarity, high-contrast metric hero cards)

### Non-Negotiable Visual Rules
1. **Hierarchy over decoration**: Layout geometry and type scale guide user focus; decorative glow and endless gradients are eliminated.
2. **Whitespace over density**: Standardized 8px..48px spacing scale allows operational data room to breathe.
3. **One dominant visual element per section**: Hero metric cards establish immediate focal clarity before granular details.
4. **Color communicates meaning**: Forest emerald (`#0E6B4A` / `#10B981`) serves as the single dominant brand identity. Severity indicator colors are restrained, quiet, and meaningful.

---

## 1.5. Visual Identity Correction — SIRIUS Editorial System

### Palette Philosophy
The SIRIUS interface is designed around an **Apple-like, editorial command center identity**. Rainbow color drift (unrelated purple, magenta, cyan, blue, pink accents) is eliminated in favor of a tightly controlled palette:
- **Primary Brand**: Deep Forest Emerald (Day: `#0E6B4A`, Night: `#10B981`)
- **Neutrals**: Warm Charcoal and Soft Off-White (Day), Graphite and Dark Charcoal (Night)
- **Restrained Accents**: Purposeful, non-decorative severity and status tints.

### Day Palette
- **Canvas**: Warm neutral off-white (`#F3F4F1`)
- **Surface**: Pure White (`#FFFFFF`)
- **Elevated Surface**: Very slightly warm off-white (`#FAFBF9`)
- **Primary**: Deep Forest Emerald (`#0E6B4A`)
- **Primary Interactive / Hover**: Saturated Emerald (`#0B563B`)
- **Primary Soft**: Light Mint Tint (`#E6F4ED`)
- **Typography**: Near-black charcoal (`#111827`), secondary muted charcoal (`#4B5563`)
- **Borders**: Subtle warm gray (`#E5E7EB`)

### Night Palette
- **Canvas**: Near-black graphite (`#0D0E11`) — strictly non-blue
- **Surface**: Dark neutral charcoal (`#15171C`)
- **Elevated Surface**: Slightly lighter charcoal (`#1C1F26`)
- **Primary**: Bright Emerald (`#10B981`)
- **Primary Soft**: Dark Emerald Tint (`rgba(16, 185, 129, 0.12)`)
- **Typography**: Near-white (`#F9FAFB`), cool-neutral gray (`#9CA3AF`)
- **Borders**: Subtle neutral gray (`rgba(255, 255, 255, 0.1)`)

### Severity Treatment
Security severities provide clear operational meaning without creating a rainbow UI:
- **Critical**: Rose/Red (`var(--color-red)`) with subtle background tint and icon.
- **High**: Amber (`var(--color-amber)`).
- **Medium**: Mint (`var(--color-mint)`).
- **Low / Info**: Muted Neutral (`var(--color-text-secondary)`).

### Typography Hierarchy
Native system typography stack preferred on macOS:
`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif`
- Monospace (`ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace`) strictly reserved for code, file paths, hashes, rule IDs, and tabular numerals.

### Elevation & Shadow Scale
Controlled elevation system:
- **Level 0 (Flat)**: `--color-bg-canvas`
- **Level 1 (Card Elevation)**: `var(--shadow-small)` (`0 1px 2px 0 rgba(0, 0, 0, 0.04)`)
- **Level 2 (Floating Panel)**: `var(--shadow-medium)` (`0 4px 12px -2px rgba(0, 0, 0, 0.05)`)
- **Level 3 (Modal / Overlay)**: `var(--shadow-large)` (`0 16px 32px -4px rgba(0, 0, 0, 0.08)`)

### Radius System Scale
- **`--radius-xs`**: `4px` (Tags / Code chips)
- **`--radius-sm`**: `6px` (Badges / Small inputs)
- **`--radius-md`**: `8px` (Buttons / Standard inputs)
- **`--radius-lg`**: `12px` (Dropdowns / Floating popovers)
- **`--radius-xl`**: `16px` (Standard cards / Panels)
- **`--radius-2xl`**: `24px` (Hero cards / Modals)
- **`--radius-pill`**: `9999px` (Status chips / Pill buttons)

### Iconography Rules
- Lucide React icon suite used exclusively.
- Consistent 14px–18px optical sizing.
- Neutral default icon colors; emerald for primary actions.

### Gradient Rules
- Decorative AI rainbow gradients removed.
- Brand gradient strictly restrained to primary forest emerald: `linear-gradient(135deg, var(--color-primary) 0%, #10B981 100%)`.

---

## 2. Color Palette & Token System

All components consume semantic CSS custom properties exported from `@sirius/design-system` (`tokens.css`).

### Semantic Color Scale

| Token | Day Theme Value | Semantic Meaning |
|---|---|---|
| `--color-bg-canvas` | `#F2F4F1` | Outer desktop workspace canvas |
| `--color-bg-surface` | `#FFFFFF` | Primary application surface |
| `--color-bg-surface-elevated` | `#F8FAF8` | Raised card & panel surface |
| `--color-bg-surface-subtle` | `#EFF2EE` | Subtle background tint / table rows |
| `--color-text-primary` | `#111513` | High-contrast body & heading text |
| `--color-text-secondary` | `#4A5450` | Secondary description text |
| `--color-text-muted` | `#7C8580` | Metadata, labels, and captions |
| `--color-border` | `#E2E7E3` | Primary structural border |
| `--color-border-subtle` | `#ECEFEA` | Hairline dividers and quiet borders |
| `--color-primary` | `#0E6B4A` | Editorial Forest Emerald (Primary action) |
| `--color-primary-soft` | `#DFF4EA` | Soft mint primary background tint |
| `--color-primary-deep` | `#063F2C` | Deep emerald text accent |
| `--color-cyan` | `#28C7D9` | Active state / Medium severity |
| `--color-violet` | `#8B6CF6` | High severity / Cerebus AI assistant |
| `--color-magenta` | `#D56CE1` | Critical severity / Security alert |

---

## 3. Spacing Scale

SIRIUS enforces a strict geometric spacing scale:

$$\text{Scale} = \{ 8, 12, 16, 20, 24, 32, 40, 48 \}\text{px}$$

Defined via CSS custom properties:
- `--space-xs`: `8px`
- `--space-sm`: `12px`
- `--space-md`: `16px`
- `--space-lg`: `20px`
- `--space-xl`: `24px`
- `--space-2xl`: `32px`
- `--space-3xl`: `40px`
- `--space-4xl`: `48px`

---

## 4. Typography System & Tabular Numerals

- **Display & Body Font**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- **Code & Numeric Font**: `JetBrains Mono`, `monospace`

### Tabular Numeric Rule
All monetary values, risk exposure figures, finding counts, and compliance scores MUST consume `.sirius-numeral-tabular` (`font-variant-numeric: tabular-nums` and `JetBrains Mono`). This guarantees vertical alignment across scan runs and financial tables.

---

## 5. Card System & Hero Metric Card

Cards feature subtle borders (`#E2E7E3`), soft backgrounds, large border radii (`16px`/`24px`), and minimal elevation shadows.

### Reusable Card Variants
- `Card`: Default surface container (`--radius-xl` / 16px).
- `HeroMetricCard` / `HeroCard`: Dominant section card featuring soft mint background (`#DFF4EA`), 44px tabular metrics, trend badge, and optional action buttons.
- `HeroPostureCard`: Dominant posture hero card with `PostureScoreRing` radial score visualization.
- `MetricCard`: Compact numerical metric card.
- `InsightCard`: Editorial callout card with primary left accent border.
- `ListCard`: Bordered container for structured data rows.
- `InspectorCard`: Detail view panel format.

---

## 6. Button & Status Systems

### Buttons (`@sirius/ui`)
- **Primary**: Pill geometry (`--radius-pill`), forest green (`#0E6B4A`), white text, hover lift, active press scale (`0.98`).
- **Secondary**: Pill geometry, white background, soft border (`#E2E7E3`), dark text.
- **Ghost**: Pill geometry, transparent background, soft hover tint.
- **Destructive**: Pill geometry, soft red tint, red text.
- **Icon Buttons**: Circular (`--radius-pill`) compact triggers.

### Status Chips (`StatusChip`)
Semantic status indicators use **icon + label + color chip pill** to ensure accessibility and clarity without relying on color alone:
- `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`
- `VERIFIED`, `ACTIVE`, `FAILED`, `CONNECTED`, `HEALTHY`, `AT RISK`, `RUNNING`, `QUEUED`, `COMPLETED`

---

## 7. Motion System & Micro-Interactions

Controlled motion communicates state transitions without visual noise:
- `motion.fast`: `140ms` ease-out (button presses, dropdown triggers)
- `motion.base`: `200ms` ease-out (page entrances, card hover lifts)
- `motion.slow`: `320ms` ease-out (modal entrances, drawer slides)

All animation variants are exported from `@sirius/design-system` (`motion.ts`).

---

## 8. Day & Night Theme Architecture

Day mode is established as the default active theme:
- Canvas: `#F2F4F1`
- Surface: `#FFFFFF`
- Primary: `#0E6B4A`

The token system is structured with `:root` and `[data-theme="dark"]` overrides so a complete Night theme can map seamlessly without component modifications in future phases.

---

## 9. External Component Library Strategy

SIRIUS maintains its internal design system (`@sirius/design-system` and `@sirius/ui`) as the single source of truth. Patterns from modern libraries (shadcn/ui, Origin UI, Tremor) are selectively adapted into pure `@sirius/ui` primitives rather than installing redundant UI frameworks.

---

## 10. Application Shell, Sidebar & TopBar Architecture

### Application Canvas Geometry
- **Outer Canvas**: Off-white workspace background (`--color-bg-canvas`, `#F2F4F1`) with 16px padding.
- **Application Window Frame**: Interior surface container (`--color-bg-surface`, `#FFFFFF`) featuring 24px border radius (`--radius-2xl`), subtle border (`#E2E7E3`), and soft elevation shadow (`var(--shadow-large)`).

### Quiet Categorized Sidebar
- **Dimensions**: 230px expanded, 64px collapsed.
- **Categorized Sections**:
  - `COMMAND`: Dashboard, Projects, Scans
  - `SECURITY`: Findings, Attack Paths
  - `REPORTS & GOVERNANCE`: Reports
  - `SYSTEM`: Settings
- **Active Navigation Indicator**: 3.5px rounded green vertical indicator bar on left edge, soft mint background (`#DFF4EA`), strong green text (`#0E6B4A`).
- **Footer**: Live connection status indicator (`● CORE GATEWAY CONNECTED` / `● MOCK ENVIRONMENT`).

### Quiet Command TopBar
- **Height**: 64px.
- **Left**: Route title breadcrumbs (`SIRIUS / Security Posture`).
- **Center/Left**: `GlobalSearch` command pill control ("Search or jump to...", `⌘K` trigger, opens CommandPalette).
- **Right**: StatusPulse, Notification IconAction button with badge count, Help IconAction button, User Avatar ProfileMenu.

---

## 11. Dashboard Visual System & Posture Hierarchy

The Dashboard immediately answers **"How secure is my project?"** within 3 seconds using an asymmetrical posture hierarchy:

### Posture Visual Anchor
1. **HeroPostureCard** (Dominant Visual Anchor #1):
   - 52px tabular security score (`72 / 100` or active project compliance score).
   - Supporting posture statement ("Strong posture — 1 Critical finding requires immediate remediation").
   - `PostureScoreRing` radial ring visualization.
2. **Supporting KPI Cards**:
   - `MoneyAtRiskCard`: Formatted monetary exposure (`$1.45M`) with tabular numerals.
   - `ComplianceCard`: SOC 2 / PCI-DSS compliance frameworks and percentage ring.
   - `SeverityOverviewCard`: Total open vulnerabilities and stacked distribution bar.
3. **Posture & Findings Trend Chart**:
   - Clean SVG line chart with forest primary gradient fill.
4. **Activity Panels**:
   - `RecentScansPanel` & `RecentFindingsPanel`.
5. **Recommended Next Actions**:
   - Cerebus remediation quick action card.

### Motion & Entrance Stagger
- Framer Motion container with 40ms stagger between sections on initial mount (< 400ms total).
- Card hover micro-interaction: `translateY(-1px)` lift with soft border highlight.

---

## 12. Projects & Project Detail Workspace Redesign

### Projects Grid (`ProjectsGridView.tsx` & `ProjectCard.tsx`)
- **Header**: Eyebrow `PROJECTS`, Title `Protected Codebases`, supporting description, primary action button `[Connect Project]`, secondary action `[Import Workspace]`.
- **Card Geometry**: Editorial row/card hybrid surface featuring left status accent rail (`3.5px solid var(--color-primary)` or `var(--color-violet)` for At Risk), tabular score counter (`72/100`), money at risk ticker (`$1.45M`), open critical/high findings badges, branch indicator, and hover lift.
- **Filter Bar**: Search input with `Search` icon and clear button, tab pills (`All`, `At Risk`, `Healthy`), sort dropdown (`Compliance`, `Money at Risk`, `Project Name`).
- **Empty States**: Clear messaging for "NO PROJECTS YET" vs "NO MATCHING WORKSPACES FOUND" with a "Clear Filters" action.

### Project Detail Workspace (`ProjectDetailView.tsx`)
- **Posture Hero**: Posture hero card featuring security score anchor (`72/100`), exposure ticker (`$1.45M`), critical findings warning, and last scan timestamp.
- **Header Actions**: Primary `[Run Security Scan]`, secondary `[Generate Report]`, `[View Findings]`, and `[Settings]`.
- **Navigation Tabs**: Clean tab bar (`Overview`, `Scans History`, `Findings Inventory`) with quiet underline indicator.

---

## 13. Scans History & Live Scan Command Deck Redesign

### Scans Operations Timeline (`ScansHistoryView.tsx`)
- **Header**: Eyebrow `SCANS`, Title `Security Scan Operations`, primary action `[Run Security Scan]`.
- **Timeline List Rows**: Clean `ListCard` rows displaying `StatusChip` (`COMPLETED`, `RUNNING` with subtle pulse, `FAILED`), scan ID, project name, branch/commit hash, duration in tabular format, critical finding badges, and total findings pill.
- **Filter Bar**: Search input, tabs (`All`, `Completed`, `Running`, `Failed`), sort dropdown (`Newest`, `Oldest`, `Most Findings`, `Longest Duration`).

### Live Scan Command Deck (`ScanDetailView.tsx`)
- **Header**: Live analysis title, status chip, scan ID, commit hash, and tabular live elapsed timer (`00:42`).
- **Progress Hero**: Progress bar (0-100%), files analyzed counter (`1,420 / 1,420 Files`), findings count.
- **Pipeline Visualizer**: Stages (`Prepare` → `Index` → `Analyze` → `Map` → `Finalize`).
- **Split Console & Findings Grid**:
  - `LiveConsole`: Refined security console with dark technical surface (`#07080B`), monospace log events, timestamps, and category filter buttons.
  - `LiveFindingStream`: Live finding cards with arrival animation (<800ms delay), severity chips, and redacted snippets.
- **Gate Outcome Summary Bar**: Displays `GATE PASSED` (emerald) or `GATE BLOCKED` (violet) with satisfied action bar (`Scan Again`, `View Findings Inventory`, `Analyze with Cerebus`).

---

## 14. Findings Explorer & Investigation Inspector Redesign

### Findings Inventory Workspace (`FindingsExplorerView.tsx`)
- **Header**: Eyebrow `FINDINGS`, Title `Findings Inventory`, primary actions `[Generate Technical Report]`, `[Refresh Inventory]`.
- **Severity Summary Strip**: Interactive severity pills (`All`, `Critical`, `High`, `Medium`, `Low`, `Info`) using semantic colors.
- **Search & Filter Controls**: Search input with clear button, selects for Baseline (`New`, `Unchanged`), Validity (`Verified Live`), Group By (`Severity`, `Category`, `Rule ID`), Sort By (`Highest Severity`, `Newest`, `Oldest`, `Rule ID`, `File`).
- **Active Filter Chips**: Compact filter pills with `Clear All` button.

### Master-Detail Split Grid Layout
- **Left Panel (`FindingsList.tsx` & `FindingRow.tsx`)**: ~38% width list view. Each row displays `StatusChip` severity on top, title, rule ID badge, file location, `VERIFIED LIVE` badge, and status pills. Selected row features a `4px solid var(--color-primary)` left indicator rail and background elevation. Supports keyboard navigation (`ArrowUp`/`ArrowDown`).
- **Right Inspector (`FindingDetailView.tsx` & `SourceCodeViewer.tsx`)**: ~62% width detail inspector panel:
  - Header: Finding ID (`#FIN-SEC-001`), SeverityChip, Status badge (`OPEN`, `RESOLVED`, `IGNORED`), Baseline badge (`NEW`), location.
  - Primary Action: `[Analyze with Cerebus AI]` (primary button with violet/cyan AI identity) + triage buttons (`Resolve`, `Accept Risk`, `Suppress`).
  - Active Suppression & Accepted Risk Banners.
  - Technical Rationale section.
  - Metadata Grid: Governance baseline & Financial Exposure (`MoneyTicker`).
  - `SourceCodeViewer`: Dark code surface (`#07080B`), monospace font (`JetBrains Mono`), line numbers gutter, target line highlighted with left accent rail, redacted sensitive tokens (`sk_live_••••••••`), copy location trigger.
  - Triage Audit History timeline.

---

## 15. Intelligence Layer Redesign (Cerebus, Attack Paths, Compliance, Governance)

### Cerebus AI Security Analyst (`CerebusWorkspaceView.tsx`)
- **Visual Identity**: Primary accent VIOLET (`var(--color-violet)`), supporting accent CYAN (`var(--color-cyan)`), system status EMERALD (`var(--color-emerald)`).
- **Header**: `CEREBUS INTELLIGENCE` eyebrow, title `Cerebus Analyst Workspace`, context badge (`Context: fnd-88219` or `Project: finsec-core`), status pulse (`READY` / `ANALYZING`), and minimal `Clear Session` CTA.
- **Empty State**: Editorial intelligence card when no finding context is active ("Understand the security story behind a finding.") detailing capabilities (Root Cause Analysis, Technical Impact, Attack Path Context, Remediation Context).
- **Analyzing State**: `ANALYZING` pulse indicator with violet/cyan aura and stage progress banner ("Evaluating vulnerability impact & synthesizing remediation...").
- **Message Cards & Sections**: User context vs structured Cerebus analyst reports (`ANALYSIS & ROOT CAUSE`, `TECHNICAL IMPACT`, `RECOMMENDED ACTION`, `MAPPED CONTROL REFERENCES`).
- **Read-Only Diff Preview**: Dark technical surface (`var(--color-bg-technical)`), line gutters, token redaction (`redactSensitiveText()`).
- **Inspector**: Right panel (`CerebusContextPanel`) with compact `InspectorCard` layout, rule ID, severity, file location, risk exposure (`MoneyTicker`), and mapped compliance controls.

### Attack Paths & Security Graph (`AttackPathsView.tsx`)
- **Visual Identity**: Dark technical canvas (`var(--color-bg-technical)`), directional SVG edges with marker arrows, directional node shapes (finding polygon, asset/database rect, entry/credential circle).
- **Header & Summary**: `ATTACK PATHS` eyebrow, `Attack Paths & Security Graph` title, interactive severity filter strip (`AttackPathSummaryStrip`) for Total Paths, Critical, High, Entry Points, and Target Assets.
- **Canvas Viewport (`AttackPathGraphView.tsx`)**: SVG canvas with zoom, pan, focus mode toggle, background grid motif (`url(#grid)`), halo effect on selected node, and connected-path highlight.
- **Node Color Mapping**: Semantic tokens (`var(--color-cyan)` for entry/credential, `var(--color-violet)` for identity/auth/high/critical, `var(--color-emerald)` for database/asset).
- **Accessible Path List (`AttackPathList.tsx`)**: Parallel keyboard-driven list for screen readers and quick keyboard navigation.
- **Path Inspector (`AttackPathInspector.tsx`)**: Path title, entry point, target asset, financial exposure ticker, selected node details, and `Explain Attack Path with Cerebus` CTA.

### Compliance & Security Posture (`ComplianceView.tsx`)
- **Visual Identity**: Emerald + neutral theme. Authoritative, auditable posture assurance layout.
- **Header**: `COMPLIANCE` eyebrow, `Compliance & Security Posture` title, framework search, status filter (`All Controls`, `Failing Only`, `Passing Only`), `[Generate Compliance Report]` CTA.
- **Posture Hero (`ComplianceHeroScore.tsx`)**: `ScoreRing` (authoritative backend score `72.5/100`), posture trend badge (`STABLE`/`IMPROVING`), Evaluated, Passing, Failing, Partial summary grid, Executive Narrative statement.
- **Framework Cards (`ComplianceFrameworkCards.tsx`)**: Cards for PCI DSS 4.0, SOC 2, ISO 27001 with framework scores and gap counters.
- **Control Matrix (`ComplianceControlList.tsx`)**: Clean data table with generous row height, subtle borders, `PASS`/`FAIL`/`PARTIAL` badges.
- **Control Inspector (`ComplianceControlInspector.tsx`)**: Requirement specification, evidence provenance (source location, scan reference), affected findings list with navigation, Cerebus explanation CTA, Remediation CTA.

### Governance & Policy (`SuppressionsView.tsx`, `BaselinesView.tsx`, `PolicySettings.tsx`)
- **Visual Identity**: Controlled, deliberate, auditable governance interface with forest emerald + amber risk accents.
- **Finding Suppressions (`SuppressionsView.tsx`)**: `GOVERNANCE` eyebrow, `Finding Suppressions Policy` title, status tabs (`Active`, `Revoked`, `All`), policy data table, `Create Suppression Policy` modal dialog, and `SuppressionInspector`.
- **Repository Baselines (`BaselinesView.tsx`)**: `GOVERNANCE` eyebrow, `Repository Baselines & Delta Governance` title, `Active Baseline Hero Strip` with `NEW`, `UNCHANGED`, `ABSENT` counters, baselines table, and right inspector panel with "View New Findings" CTA.
- **Security Policy Settings (`PolicySettings.tsx`)**: High-level policy configuration cards (Scan Fail Severity Threshold, Build Fail-On Predicate), unsaved changes indicator + discard button, and permissive policy danger warning banner.

---

## 16. Application Completion Phase (Remediation, Reports, Settings, Integrations)

### Remediation & Safe Fix Workspace (`RemediationWorkspaceView.tsx`)
- **Header**: Eyebrow `REMEDIATION`, Title `Remediation Workspace`, back button, finding title, rule ID, severity chip, status pulse.
- **Safety Banner (`FixSafetyBanner.tsx`)**: Clear states for `PASSED` (Human approval required), `FAILED` (Application blocked: verification failed), `ESCALATED` (Manual review required), and `STALE` (Application blocked: file changed since scan).
- **Diff Reviewer (`DiffReviewer.tsx`)**: Dark technical surface (`var(--color-bg-technical)`), line numbers, `+` additions (emerald) and `-` deletions (violet) markers, hunk navigation, copy path trigger.
- **Verification Panel (`FixVerificationPanel.tsx`)**: Static analysis, secret scan, policy check, and regression verifier statuses.
- **Fix Application Progress (`FixApplyProgressCard.tsx`)**: 4-stage progress tracker (`Prepare Patch` → `Create Atomic Backup` → `Apply Hunk Patch` → `Re-Verify Repository`), success summary, `[Run Verification Scan]` CTA.
- **Human Gate Confirmation (`FixApprovalModal.tsx`)**: Explicit confirmation modal displaying target file, rule ID, backup path, and atomic commit notice.

### Reports & Security Evidence (`ReportsView.tsx`)
- **Header**: Eyebrow `REPORTS`, Title `Reports & Security Evidence`, real-time search, `[Generate Security Report]` CTA.
- **Report Inventory (`ReportList.tsx`)**: Editorial rows with report title, type badge, scan ID reference, status pill (`READY`, `GENERATING`, `FAILED`), PDF & SARIF export CTAs.
- **Publication Cover & Preview (`ReportPreview.tsx`)**: Reading-first publication layout with sticky section navigation (`Overview`, `Executive Posture`, `Findings`, `Attack Paths`, `Compliance`, `Remediation`).
- **Report Inspector (`ReportSidebarInspector.tsx`)**: Right panel with document metadata, digital signature, PDF & SARIF download buttons.
- **Generation Modal (`GenerateReportDialog.tsx`)**: Modal dialog for configuring report type, target scan, project, and framework.

### System Settings & Integrations (`SettingsView.tsx`)
- **Header**: Eyebrow `SETTINGS & SYSTEM`, Title `Settings & Integrations Workspace`.
- **Navigation (`SettingsNav.tsx`)**: Left sidebar for 8 settings categories (`General`, `Account`, `Connection`, `Projects`, `Policies`, `Integrations`, `Notifications`, `Advanced`).
- **Integrations (`IntegrationsView.tsx`)**: Integrations control center grid with status pills, configuration dialog (`IntegrationConfigDialog`), and copyable CI/CD automation YAML snippet (`var(--color-bg-technical)`).
- **Account & Session (`AccountSettings.tsx`)**: Authenticated user session profile (avatar, name, email, role, session ID, authority) with `Terminate Session & Log Out` trigger.
- **Alert Preferences (`NotificationSettings.tsx`)**: Toggle cards for critical vulnerability alerts, scan completion summaries, compliance score degradation, and money-at-risk breach alerts with instant save.

---

## 17. DAY / NIGHT THEME SYSTEM (Phase 6)

### Token Architecture
- **Theme Selector Attribute**: `[data-theme="day"]` vs `[data-theme="night"]` on `document.documentElement`.
- **Day Palette**: Warm off-white canvas (`#F2F4F1`), clean white surface (`#FFFFFF`), forest emerald primary (`#0E6B4A`), deep charcoal typography (`#111513`), soft borders (`#E2E7E3`).
- **Night Palette**: Deep near-black canvas (`#0A0B10`), deep charcoal surface (`#12141C`), brightened emerald primary (`#10B981`), high-contrast near-white typography (`#F4F5F7`), low-opacity borders (`rgba(255, 255, 255, 0.12)`).
- **Technical Surfaces**: `--color-bg-technical` remains dark in Day mode (`#07080B`) and deepens in Night mode (`#050608`), preserving code readability without white inversion.

### Theme State & Persistence
- **Single Source of Truth**: Managed centrally by `useUIStore` (`themeMode`, `setThemeMode`, `toggleThemeMode`).
- **Local Persistence**: Key `sirius_theme` in `localStorage`.
- **TopBar Control**: Sun/Moon icon button with tooltip (`Switch to Night Mode` / `Switch to Day Mode`).
- **Settings Control**: Appearance & Visual System card in `GeneralSettings.tsx` with instant synchronized state.

### Motion & Accessibility
- **Transitions**: 200–320ms smooth color transitions on background, text, border, and shadows.
- **Reduced Motion**: Honored via `@media (prefers-reduced-motion: reduce)` disabling CSS transitions immediately.

---

## 18. Layout & Composition System (Phase 2 Correction)

### Spacing Rhythm & Tokens
SIRIUS enforces a disciplined 10-step spacing scale to eliminate arbitrary whitespace:
- **`--space-2xs` (`4px`)**: Micro icon/text offsets and badge gaps.
- **`--space-xs` (`8px`)**: Internal element gaps and tight list item spacing.
- **`--space-sm` (`12px`)**: Sub-card element gaps and control label spacing.
- **`--space-md` (`16px`)**: Standard card internal padding and component gaps.
- **`--space-lg` (`20px`)**: Elevated card padding and toolbar element gaps.
- **`--space-xl` (`24px`)**: Major section grid gaps and primary card padding.
- **`--space-2xl` (`32px`)**: Page content section separation and hero card padding.
- **`--space-3xl` (`40px`)**: Page container outer margins.
- **`--space-4xl` (`48px`)**: Major empty state and error view vertical padding.
- **`--space-5xl` (`64px`)**: Hero layout composition spacing.

### Content-Driven Card Sizing Philosophy
- Accidental vertical stretching (`min-height` overrides, forced `flex: 1` on empty cards, `justify-content: space-between` on sparse items) is eliminated.
- Cards auto-size to their actual content height with purposeful internal gaps (`gap: 12px` / `gap: 16px`).
- Card padding is standardized:
  - Small Cards: `16px` (`--space-md`)
  - Normal Cards: `20px` (`--space-lg`)
  - Hero Cards: `24px`..`32px` (`--space-xl`..`--space-2xl`)

### Unified Control Toolbar Architecture
Search inputs, filter pills/tabs, and sorting dropdowns are integrated into single 40px–48px control strip containers (`var(--color-bg-surface)` + `var(--color-border)`), preventing floating, disconnected controls.

---

## 19. Screen-by-Screen Visual Art Direction (Phase 3A)

### Art Direction Philosophy
Phase 3A establishes tailored visual art direction for each screen while ensuring 100% cohesion under the **SIRIUS Editorial Security Command Center** visual identity:

1. **Dashboard (`/dashboard`)**: Flagship posture command screen. Dominant anchor: `HeroPostureCard` (~2/3 width) + `MoneyAtRiskCard` (~1/3 width). Supporting KPI cards (`ComplianceCard`, `SeverityOverviewCard`), line trend chart, and activity panels.
2. **Projects (`/projects`)**: Professional asset inventory. Integrated 44px control strip (Search + Status Tabs + Sort Dropdown), compact cards with left status accent rail (`3.5px solid var(--color-primary)` or `var(--color-red)`).
3. **Project Detail (`/projects/:id`)**: Project-focused investigation workspace. Clear workspace header, security score hero, branch indicator, and immediate `[Run Security Scan]` CTA.
4. **Scans (`/scans`)**: Operations timeline workspace. Compact `ListCard` rows displaying status chips (`COMPLETED`, `RUNNING`, `FAILED`), monospace commit hashes, tabular durations, and primary `[Launch Security Scan]` CTA.
5. **Live Scan (`/scans/:id`)**: Live operational command deck. Real-time elapsed timer, 5-stage pipeline visualizer, dark technical log console (`#07080B`), and clear `GATE PASSED` / `GATE BLOCKED` banner.
6. **Findings (`/findings`)**: Master-detail investigation workspace. Left inventory list (~38% width) with `4px solid var(--color-primary)` active indicator rail + right detail inspector panel (~62% width).
7. **Finding Detail (`/findings/:id`)**: Deep technical investigation panel. Monospace code viewer (`JetBrains Mono`), line numbers gutter, redacted secret tokens (`sk_live_••••••••`), and primary `[Remediate with Cerebus AI]` CTA.
8. **Attack Paths (`/attack-paths`)**: Analytical security graph workspace. Full-viewport SVG graph centerpiece, directional marker edges, halo selection, accessible parallel path list, and path inspector.
9. **Cerebus (`/cerebus`)**: Intelligent security analyst workspace. Structured analyst report cards (`ANALYSIS`, `TECHNICAL IMPACT`, `RECOMMENDATION`, `READ-ONLY DIFF`), violet accent identity, and context panel.
10. **Compliance (`/compliance`)**: Compliance control center. Authoritative `ScoreRing` (`72.5/100`), framework cards (PCI DSS, SOC 2, ISO 27001), control matrix table with `PASS`/`FAIL` badges, and evidence inspector.
11. **Governance (`/governance/*`)**: Policy-oriented governance center. Policy tabs (`Suppressions`, `Baselines`, `Policies`), baseline hero strip (`NEW`, `UNCHANGED`, `ABSENT`), clean modal dialogs, and threshold policy controls.
12. **Remediation (`/remediation`)**: High-risk safety workflow. Safety banner (`HUMAN APPROVAL REQUIRED`), dark hunk diff reviewer, 4-stage patch progress card, and explicit confirmation modal (`FixApprovalModal`).
13. **Reports (`/reports`)**: Document-oriented publication workspace. Report list, reading-first publication cover preview with sticky section links, and direct PDF / SARIF 2.1.0 download triggers.
14. **Settings (`/settings/*`)**: Quiet system configuration workspace. 8-category sidebar navigation, concise setting cards, and instant Day/Night theme toggles.
15. **Integrations (`/settings/integrations`)**: Integration control center. Clean provider cards, status pills, and copyable CI/CD YAML step snippet.
16. **Account (`/settings/account`)**: User session profile. Authenticated identity, role authority, session ID, and terminate session action.
17. **Notifications (`NotificationPanel.tsx`)**: Operational inbox drawer. Categorized severity notifications, timestamps, unread indicator dots, and clear all trigger.
18. **Global Consistency Audit**: 100% brand emerald identity, zero decorative rainbow color drift, Apple-like system typography, geometric spacing scale (`--space-2xs`..`--space-5xl`), and high-contrast Day/Night mode execution.

---

## 20. Visual Forensics, Cross-Screen Consistency & Cerebus Color Correction (Phase 3B)

### Cerebus Color System Re-centering
- Removed all decorative purple/violet visual identity overrides (`var(--color-violet)`, `rgba(139, 108, 246, ...)`, `boxShadow: var(--glow-violet)`) from Cerebus workspace components (`CerebusWorkspaceView.tsx`, `CerebusMessageCard.tsx`, `CerebusContextPanel.tsx`, `VerificationStatusCard.tsx`, `CerebusComposer.tsx`).
- Re-centered Cerebus's visual language strictly on **SIRIUS Forest Emerald (`#0E6B4A` Day / `#10B981` Night)** + **Warm Graphite/Charcoal Neutrals**.
- Cerebus differentiation is maintained purely through structured analyst report layouts, section header icons (`ANALYSIS & ROOT CAUSE`, `TECHNICAL IMPACT`, `RECOMMENDED ACTION`, `PROPOSED REMEDIATION`), technical dark code surfaces (`#07080B`), and clear typography — without creating a purple AI bubble.

### Graph & Metric Color Synchronization
- **Attack Path Graph (`AttackPathNodeView.tsx` & `AttackPathSummaryStrip.tsx`)**: Aligned critical path counts/nodes to semantic rose red (`var(--color-red)`), high-risk path counts to semantic amber (`var(--color-amber)`), medium risk to mint (`var(--color-mint)`), and entry/total paths to brand primary emerald (`var(--color-primary)`).
- **Dashboard & Finding Detail**: Replaced leftover violet accent icons in `FindingDetailView.tsx` (technical risk → amber, financial exposure → primary emerald), `DashboardHeader.tsx` (Ask Cerebus → primary emerald), `MoneyAtRiskCard.tsx` (icon & badge → primary emerald), and `RecentFindingsPanel.tsx` (header icon → semantic red, exposure badge → primary emerald).
- **ScoreRing (`ScoreRing.tsx`)**: Replaced cyan gradient end-stop with `var(--color-primary-deep)` and updated negative delta text to semantic red (`var(--color-red)`).
- **CommandPalette (`CommandPalette.tsx`)**: Replaced cyan/violet icon overrides and active hover highlights with SIRIUS primary emerald soft tint (`var(--color-primary-soft)`).
- **Fix Safety Banner (`FixSafetyBanner.tsx`)**: Aligned verification status banners with semantic red (`failed`), amber (`escalated`), and emerald (`passed`).

### Quality & Verification Matrix
- **Typecheck**: `npx pnpm typecheck` passed (0 errors across all 9 workspace packages).
- **Lint**: `npx pnpm lint` passed (0 warnings/errors).
- **Unit & Integration Tests**: `npx pnpm test` passed (55 test files, 76/76 tests passed).
- **Production Build**: `npx pnpm build` completed successfully in 1.36s.
