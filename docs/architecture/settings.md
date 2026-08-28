# Settings, Connections & Integrations Architecture

## Executive Overview

The Settings Workspace (`/settings` and `/settings/:section`) provides workspace configuration, API connection diagnostics, secret key rotation, operational policy gating persistence, integrations control center, notification alert preferences, and advanced system diagnostics.

---

## Core Security & Architectural Boundaries

1. **Zero Secret Exposure**: API keys, webhook URLs, and OAuth tokens are ALWAYS masked after storage (`••••••••••••3A9F`). Secrets are NEVER rendered raw in component state, network logs, or UI analytics.
2. **Backend Policy Ownership**: Security policy severity thresholds (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`) and build fail-on predicates (`all`, `new`, `verified-secrets`) persist via TanStack Query mutations and invalidate affected queries (`findings`, `dashboard`, `compliance-summary`).
3. **Session Ownership**: Session state remains strictly in `useSessionStore`. Account settings render authenticated user details read-only; Logout invokes `useSessionStore.clearSession()`.
4. **URL Navigation State**: Deep links enable direct section navigation (`/settings/general`, `/settings/account`, `/settings/connection`, `/settings/projects`, `/settings/policies`, `/settings/integrations`, `/settings/notifications`, `/settings/advanced`).

---

## Settings Component Hierarchy

```
SettingsView (/settings & /settings/:section)
 ├── SettingsNav (Left navigation sidebar for 8 settings sections)
 ├── GeneralSettings (Workspace name, default branch, timezone, date format)
 ├── AccountSettings (Authenticated user session profile & Logout CTA)
 ├── ConnectionSettings (API Gateway status, test connection CTA, API key masking & rotation modal)
 ├── ProjectSettings (Target codebase repository & default scan settings)
 ├── PolicySettings (Severity threshold & build fail-on predicate selector)
 ├── IntegrationsView (Control center grid, status pills, and CI CLI snippet generator)
 │    ├── IntegrationCard (Individual tool integration status card)
 │    └── IntegrationConfigDialog (Modal for configuring/connecting/disconnecting integrations)
 ├── NotificationSettings (Alert preference toggles with immediate save)
 └── AdvancedSettings (System diagnostics & Danger Zone confirmation modal)
```
