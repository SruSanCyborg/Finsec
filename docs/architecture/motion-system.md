# Motion & Micro-Interaction System Architecture

## 1. Executive Summary

SIRIUS GUI uses a disciplined motion system where visual transitions communicate state changes, live execution progress, or attention hierarchy without superfluous decorative animation.

---

## 2. Motion System Principles

1. **Restraint & Purpose**: Every transition must communicate state, live telemetry, or user interaction.
2. **Speed & Control**: Micro-interactions complete within 150ms–250ms (`--transition-fast`, `--transition-smooth`). Page entrances complete within 200ms–280ms.
3. **Tabular Numerals**: Numeric counters use `.sirius-numeral-tabular` preventing layout jitter during metric updates.
4. **Reduced Motion Compliance**: Respects `prefers-reduced-motion: reduce` by disabling non-essential movements while preserving functional state clarity.

---

## 3. Micro-Interaction Token Matrix

| Interaction | Trigger / State | Visual Response | Duration / Easing |
| :--- | :--- | :--- | :--- |
| **Sidebar Nav Item** | Hover & Active | 1px horizontal shift, cyan active rail glow (`rgba(56, 189, 248, 0.15)`) | 150ms ease-out |
| **Primary Button** | Hover / Press | Slight brightness scale, 0.98 press transform | 120ms ease-out |
| **Card Hover** | Hover | Subtle border intensity increase, `translateY(-1px)` | 160ms ease-out |
| **Status Pulse** | Live Execution | Ambient pulse ring scale animation | 2.0s cubic-bezier loop |
| **Command Palette** | `⌘K` Press | Backdrop dimming, scale 0.98 &rarr; 1.00 fade-in entrance | 180ms ease-out |
| **Cerebus Section** | AI Response | Sequential 40ms staggered section entrance | 240ms cubic-bezier |
| **Copy Snippet** | Button Click | Icon transition to `CheckCircle2` ("Copied ✓") with 2.5s auto-revert | Immediate |
| **Page Route Change** | Navigation | Opacity fade-in with 4px vertical rise | 200ms ease-out |
