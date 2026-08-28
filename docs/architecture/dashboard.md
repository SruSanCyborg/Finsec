# Dashboard Architecture (`/dashboard`)

The Security Command Dashboard provides a continuous security posture overview for finsec-lint workspaces.

## Information Architecture

```
┌──────────────────────────────────────────────────────────┐
│ DashboardHeader                                          │
│ - Title & active context (project • branch)              │
│ - StatusPulse (Core Gateway connection)                  │
│ - Quick Action buttons ([Run Scan], [View Findings])     │
├─────────────────┬───────────────────┬────────────────────┤
│ ComplianceCard  │ SeverityOverview  │ MoneyAtRiskCard    │
│ - ScoreRing 94  │ - Stacked bar     │ - MoneyTicker      │
│ - Delta +4.5    │ - Interactive     │ - Risk exposure    │
│ - Frameworks    │   severity breakdown│ - Violet glow    │
├─────────────────┴───────────────────┴────────────────────┤
│ SecurityPostureChart                                     │
│ - Minimal SVG finding trend chart over recent scans      │
├──────────────────────────┬───────────────────────────────┤
│ RecentScansPanel         │ RecentFindingsPanel           │
│ - Scan execution rows    │ - Top critical/high findings  │
│ - StatusPulse & duration │ - SeverityChip & file paths   │
├──────────────────────────┴───────────────────────────────┤
│ RecommendationsPanel                                     │
│ - Priority security action cards                         │
└──────────────────────────────────────────────────────────┘
```

## Data Integration & Rules

- Uses TanStack Query `useDashboardDataQuery()` consuming `SiriusApiClient` / `MockApiService`.
- **Zero frontend security math**: All compliance scores, money-at-risk valuations, and finding counts originate from the server/mock layer.
- Components are located in `apps/desktop/src/features/dashboard/`.
