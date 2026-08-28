# SIRIUS Desktop GUI

**SIRIUS** is the desktop security command center GUI for `finsec-lint`.

Built as a high-performance desktop application using **Tauri 2.0**, **React 18**, **TypeScript**, **Vite**, **Zustand**, and **TanStack Query**.

---

## 🎨 Visual Identity & Aesthetic North Star

- **Dark Void Palette**: Deep void base (`#0A0B10`), dark glass surfaces (`rgba(18, 20, 28, 0.75)`), and spectrum accents (Cyan, Violet, Magenta, Emerald).
- **Tabular Precision**: Monospace tabular numerals (`.sirius-numeral-tabular`) for all security scores, money-at-risk, and telemetry metrics.
- **Client-Only Architecture**: Zero client-side score, fingerprint, or rule calculations. Core API / `MockApiService` is the single source of truth.

---

## 🎬 Hackathon Guided Walkthrough Demo Mode

SIRIUS features a built-in, deterministic 9-step guided presentation mode:

1. Click **"Demo Walkthrough"** in the top bar (or press `⌘K` &rarr; `"Launch Hackathon Demo Walkthrough"`).
2. Follow the 9-step narrative:
   - **Dashboard**: Primary Security Posture Score (72.5/100) & Money-at-Risk ($185,000)
   - **Scan**: Real-time WebSocket streaming console with live AST discovery
   - **Findings**: Critical JWT signing key exposure (`fnd-88219`) with redacted credentials
   - **Cerebus AI Analyst**: Structured 5-section AI explanation without prompt tokens
   - **Attack Path**: Multi-hop exploit graph (API Gateway &rarr; JWT Disclosure &rarr; Prod DB)
   - **Compliance**: PCI DSS Requirement 6.3.1 posture mapping
   - **Remediation**: Verified patch diff, verifier status `PASSED`, and human approval gate
   - **Reports**: Audit-ready report preview and SARIF 2.1.0 JSON artifact download
   - **Reset**: Restore demo state deterministically.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **Package Manager**: `pnpm` (`v11.x`)

### Development & Verification Commands

```bash
# Install dependencies
pnpm install

# Start local development server (React + Vite Web Mode)
pnpm dev

# Run strict TypeScript typecheck (0 errors)
pnpm typecheck

# Run ESLint check (0 errors)
pnpm lint

# Run unit test suite (Vitest - 72/72 passing)
pnpm test

# Build production bundle
pnpm build
```

---

## 🏛️ Monorepo Architecture

- `apps/desktop`: Tauri desktop shell & React Vite frontend application.
- `packages/types`: Shared domain models and Core API contract definitions.
- `packages/design-system`: Visual identity CSS design tokens, color spectrum, and signature motifs.
- `packages/api`: Centralized HTTP API Client & WebSocket streaming abstraction.
- `packages/mock-api`: Development mock server implementing Core API contracts.
- `packages/state`: Logical Zustand stores (`appStore`, `sessionStore`, `scanStore`, `uiStore`).
- `packages/utils`: Zod environment validation, structured error hierarchy, and formatters.
- `docs/architecture`: Detailed architectural decision documentation.

For agent guidelines, refer to [AGENTS.md](./AGENTS.md).
