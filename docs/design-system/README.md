# SIRIUS Design System Documentation

SIRIUS is a security command center desktop GUI for `finsec-lint`.

Its visual language is inspired by **Linear**, **Raycast**, **Warp**, and **Vercel**, with a unique signature five-stop Spectrum:

$$\text{Emerald} \rightarrow \text{Teal} \rightarrow \text{Cyan} \rightarrow \text{Indigo} \rightarrow \text{Violet}$$

## Design Philosophy

- **Client Only**: The design system is strictly presentational and interfaces with FinSec Core API contracts.
- **Semantic Colors**: Colors communicate severity, compliance state, and AI execution. They are not arbitrary decoration.
- **Precise Geometry**: Sharper edges for security surfaces, soft glass blur for overlay modals.
- **Tabular Numerals**: Money and security counts use monospace tabular numerals to prevent layout jitter during live animations.

## Documentation Index

1. [Color System](./colors.md) — 5-Stop spectrum, background void, and semantic mappings.
2. [Typography Hierarchy](./typography.md) — Display, Body, Code, and Tabular numerals.
3. [Motion & Transitions](./motion.md) — Timings, spring curves, and reduced-motion accessibility.
4. [Component Library](./components.md) — Primitives (`Button`, `Card`, `Modal`) and SIRIUS components (`SeverityChip`, `ScoreRing`, `MoneyTicker`, `StatusPulse`).
