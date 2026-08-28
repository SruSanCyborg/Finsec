# Color System & Spectrum Specification

## Primary 5-Stop Spectrum

| Stop | Hex Code | Semantic Role |
| :--- | :--- | :--- |
| **Emerald** | `#4ADE80` | Safe / Passed / Verified / Compliant |
| **Teal** | `#2DD4BF` | Information / In-progress / Low severity |
| **Cyan** | `#38BDF8` | Primary Brand / Medium severity / Active / Links |
| **Indigo** | `#818CF8` | High severity / Secondary emphasis |
| **Violet** | `#A78BFA` | Critical severity / Cerebus AI / Money-at-Risk |

## Surface & Void Background Tokens

- `--bg-void`: `#0A0B10`
- `--bg-surface`: `#12141C`
- `--bg-raised`: `#1A1D28`
- `--bg-grid`: `#14161F`
- `--border-hairline`: `rgba(255,255,255,0.06)`
- `--border-subtle`: `rgba(255,255,255,0.12)`

## Severity Color Mapping

- **Critical**: Violet (`#A78BFA`), violet glow, violet border tint (`rgba(167, 139, 250, 0.4)`).
- **High**: Indigo (`#818CF8`), indigo border tint.
- **Medium**: Cyan (`#38BDF8`), cyan border tint.
- **Low**: Teal (`#2DD4BF`), teal border tint.
- **Info**: Muted (`#9CA3B0`), subtle gray tint.
