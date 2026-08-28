# Project Structure & Monorepo Organization

SIRIUS GUI uses a `pnpm` monorepo structure to enforce strict separation of concerns between domain types, API protocols, design tokens, state management, and the application shell.

## Directory Layout

```
GUI_Sirius/
├── apps/
│   └── desktop/                  # Tauri + React Vite Application Shell
├── packages/
│   ├── types/                    # Shared TypeScript Domain Types
│   ├── design-system/            # CSS Design Tokens & Visual Language
│   ├── api/                      # Centralized HttpClient & WebSocket Client
│   ├── mock-api/                 # Development Mock Server & Handlers
│   ├── state/                    # Zustand Stores & Event Normalizers
│   └── utils/                    # Env Validators, Error Hierarchy & Formatters
├── docs/
│   └── architecture/             # System Architecture Specs & ADRs
├── AGENTS.md                     # Directives for AI Coding Agents
└── README.md                     # Root Setup Guide
```

## Layer Separation

1. **`packages/types`**: No runtime dependencies. Single source of truth for all domain entities.
2. **`packages/design-system`**: CSS variables for spectrum colors, typography, background grid, and glass surfaces.
3. **`packages/api`**: Consumes `types` and `utils`. Provides `HttpClient`, `SiriusApiClient`, and `SiriusWebSocketClient`.
4. **`packages/mock-api`**: Mock data provider matching Core API contracts.
5. **`packages/state`**: Decoupled Zustand stores (`app`, `session`, `scan`, `ui`).
6. **`apps/desktop`**: React application shell rendering routes and UI components.
