# Application Shell & Onboarding Architecture

SIRIUS desktop GUI establishes a persistent frame (`AppShell`) providing navigation, route shells, global top bar, command palette, notification center, and keyboard shortcut registry.

## Application Lifecycle & Onboarding Flow

```
[BootSplash (~1.2s)]
       │
       ▼
[WelcomeScreen] (Product overview & value props)
       │
       ▼
[AuthScreen] (API Key, OAuth device flow, SSO tabs)
       │
       ▼
[ConnectProjectScreen] (Project & Git repository selection)
       │
       ▼
[FirstScanPrimerScreen] (Educational output flow explanation)
       │
       ▼
[AppShell / Ready State] (Persistent Application Frame)
```

## Shell Layout Architecture

```
┌──────────────────────────────────────────────────────────┐
│ TopBar (Breadcrumbs, ProjectSelector, StatusPulse, ⌘K)   │
├───────────────┬──────────────────────────────────────────┤
│               │                                          │
│ Sidebar       │ Main Content Area                        │
│ - Navigation  │ - RouteFrame / Feature Pages             │
│ - Expanded /  │                                          │
│   Collapsed   │                                          │
│ - User Avatar │                                          │
│               │                                          │
└───────────────┴──────────────────────────────────────────┘
```

## Global Overlay Stack & Shortcut Registry

- `⌘K` / `Ctrl+K`: Opens ⌘K GlassModal Command Palette.
- `⌘B` / `Ctrl+B`: Toggles Sidebar Expand / Collapse state.
- `?`: Opens Keyboard Shortcuts Reference Sheet.
- `Escape`: Closes topmost open overlay (`CommandPalette`, `NotificationDrawer`, `ShortcutsSheet`, `GlassModal`).
