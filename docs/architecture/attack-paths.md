# Attack Paths & Security Graph Architecture

## Executive Overview

The Attack Paths workspace (`/attack-paths` and `/attack-paths?path=<pathId>`) renders how security weaknesses propagate from entry point APIs through intermediate microservices to high-value target assets (e.g. `Exposed Provider Credential` &rarr; `Unauthorized Transaction API` &rarr; `Financial Payment Ledger`).

---

## Core Security & Architectural Principles

1. **Strict Backend Ownership**: The frontend/GUI DOES NOT calculate attack paths, exploitability scores, relationship semantics, or risk. The FinSec Core API (or `MockAttackPathService`) is the single source of truth.
2. **Presentation Layer**: The GUI renders SVG nodes, directional edges, zoom/pan controls, path list, and node inspector.
3. **URL Search Parameter State**: Selected attack path state is synchronized with `?path=<pathId>` for shareable deep links.
4. **Accessibility First**: Accompanied by a parallel accessible keyboard-driven list (`AttackPathList`).
5. **Cerebus Context Integration**: Deep links to `/cerebus?finding=<findingId>` for AI security analysis.

---

## Component Hierarchy

```
AttackPathsView (/attack-paths)
 ├── AttackPathSummaryStrip (Total Paths, Critical, High, Target Assets)
 ├── AttackPathGraphView (SVG canvas with directional flow, zoom, pan, focus mode)
 │    └── AttackPathNodeView (Hexagon/Diamond/Rectangle node shapes by type)
 ├── AttackPathList (Parallel accessible keyboard-navigable path list)
 └── AttackPathInspector (Selected path metrics, entry point, target asset, exposure, CTAs)
```
