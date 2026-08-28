# finsec-lint

A security & compliance linter for money-handling code.

Scans API specs and SDK code before deployment, maps each finding to a specific compliance clause (PCI-DSS v4.0, RBI DPSC, DPDP 2023, GDPR), quantifies money-at-risk in ₹, and emits a signed report a CI pipeline can gate on.

```
  ✗ CRITICAL  FIN-SEC-001  Hardcoded Stripe secret key
     src/config.py:14                          PCI-DSS 8.6.2 · DPDP §8
     14 │  STRIPE_KEY = "sk_live_51H8xR2eZv…"
        │               ╰── secret · ⚠ VERIFIED LIVE · ₹42,00,000 at risk
     ↳ fix: env_lookup   run  finsec fix FIN-SEC-001
```

## Layout

| Path | What |
|---|---|
| `contract/` | The OpenAPI spec and mock server — shared truth for all four surfaces |
| `packages/cli/` | The `finsec` CLI (Ink + TypeScript) |
| `docs/` | PRD, system overview, CLI spec, decision log |

## Getting started

```bash
pnpm install
pnpm mock                                            # REST mock :4010, WS mock :4011
FINSEC_API_URL=http://localhost:4010 pnpm cli scan .
```

## Documentation

- [`AGENTS.md`](AGENTS.md) — orientation for contributors and AI agents; start here
- [`docs/system-overview.md`](docs/system-overview.md) — architecture, contract, rules, Cerebus
- [`docs/cli-surface.md`](docs/cli-surface.md) — the CLI spec
- [`docs/decisions.md`](docs/decisions.md) — decision log
- [`docs/finsec-lint-prd.md`](docs/finsec-lint-prd.md) — the full original PRD

## Status

Hackathon build. The `cli` branch is active; `auto` (Core API + worker + Cerebus), `web`, and `gui` are separate surfaces.
