# Typography System

SIRIUS employs three font families:

1. **Display / Headings**: Inter Display (`.sirius-display-xl`, `.sirius-display`, `.sirius-heading-1..3`)
2. **Body / UI**: Inter (`.sirius-body-lg`, `.sirius-body`, `.sirius-body-sm`, `.sirius-caption`, `.sirius-label`)
3. **Code / Monospace**: JetBrains Mono (`.sirius-mono-lg`, `.sirius-mono`, `.sirius-mono-sm`)

## Tabular Monospace Numerals (`.sirius-numeral-tabular`)

Money-at-risk tickers, compliance scores, finding counters, and timestamps MUST use tabular numerals:

```css
font-family: var(--font-code);
font-variant-numeric: tabular-nums;
letter-spacing: -0.02em;
```

This guarantees that digit widths remain fixed during real-time value updates and count animations.
