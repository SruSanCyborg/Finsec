# finsec-lint

A security & compliance linter **for money-handling code**. It scans API specs and SDK code before deployment, maps every finding to a specific compliance clause (PCI-DSS v4.0, RBI DPSC, DPDP 2023, GDPR), quantifies **money-at-risk in ₹**, emits a cryptographically signed report a CI pipeline can gate on, and proposes guardrailed autofixes through a dual-LLM design called **Cerebus**.

Built for a hackathon demo. The credibility strategy is deliberate: copy proven conventions wholesale — Semgrep (YAML rules, `--baseline-commit`, SARIF, inline suppression), Snyk (`--severity-threshold`, `--fail-on`, 0/1/2/3 exit codes, expiring ignores), TruffleHog (live secret validation), Simon Willison's dual-LLM pattern.

**Canonical spec:** [`docs/finsec-lint-prd.md`](docs/finsec-lint-prd.md) (588 lines — the full PRD, architecture, API spec, and per-surface design report).
Distilled: [`docs/system-overview.md`](docs/system-overview.md) · [`docs/cli-surface.md`](docs/cli-surface.md) · [`docs/decisions.md`](docs/decisions.md)

---

## The golden rule (verbatim, non-negotiable)

> **One Core API is the single source of truth. CLI, GUI, Web, and Automation are all CLIENTS. None talk to the scan engine or the Cerebus guardrail directly.**

What this means in practice:

- No surface imports the scan engine, tree-sitter, YAML rule evaluation, or an LLM SDK. All four speak **only** REST + WebSocket over `/api/v1`.
- Cerebus has exactly **one caller: the scan worker**. Its `/internal/cerebus/*` endpoints are not public. Clients reach fixes only via `POST /api/v1/scans/{id}/findings/{fid}/fix`.
- Logic that must never be duplicated client-side: compliance score, money-at-risk, attack-path graph, report signing.
- The OpenAPI spec in `contract/openapi.yaml` is frozen shared truth. Contract changes land on `main` first; surface branches rebase. Conflicts are resolved by **versioning** (`/api/v1` vs `/api/v2`), never by forking.

---

## Branch ownership

| Branch | Owns | Stack |
|---|---|---|
| `main` | OpenAPI contract + mock server + docs | YAML, Prism, `ws` |
| **`cli`** | **The CLI (this repo's current focus)** | **Ink + TypeScript** |
| `auto` | Core API + scan worker + Cerebus + GitHub Action/CI templates | FastAPI, tree-sitter, Python |
| `web` | Marketing site + dashboard | Next.js + Tailwind |
| `gui` | Desktop app | Tauri + React |

`gui` is the most cuttable surface; the web dashboard carries the visual story if time runs short.

---

## Locked decisions

- **CLI is Ink (TypeScript + React-for-terminal)**, not Python Rich or Go Bubble Tea. Rationale: aesthetic parity with the PRD's ANSI mockups, `npx finsec scan` zero-install demo, and the local toolchain (Node 26 present; Python is 3.9.6 system-only with no uv/pipx). See [`docs/decisions.md`](docs/decisions.md).
- **The CLI is a pure client.** It builds against the mock server first and swaps to the real Core with one env var: `FINSEC_API_URL` (or `--api-url`).
- **Exit codes are computed client-side** by `gate.ts` and cross-checked against the server's value. Deterministic, testable, works offline.

---

## Conventions no surface may violate

**Exit codes** (Snyk-modeled): `0` clean · `1` findings at/above threshold (*action needed, not an error*) · `2` CLI/execution failure (auth, network, parse) · `3` no supported target found. Escape hatch: `finsec scan … || true`.

**Vocabularies** (from the DDL — these are the wire contract, do not drift):

| Field | Values |
|---|---|
| `status` | `queued` `running` `completed` `failed` `canceled` |
| `severity` | `critical` `high` `medium` `low` `info` |
| `category` | `secrets` `auth` `injection` `pii` `crypto` `logging` `ratelimit` `supplychain` |
| `baseline_state` | `new` `unchanged` `absent` (SARIF-aligned) |
| `validity` | `verified_live` `inactive` `unknown` (secrets only) |
| `verifier_status` | `pass` `fail` `escalated` |
| `source` / `trigger` | `upload` `git` `inline` / `manual` `ci` `webhook` `schedule` |

**Rule IDs** are `FIN-SEC-NNN`, numbered in blocks of ten by category: `00x` secrets, `01x` injection, `02x` auth, `03x` pii, `04x` crypto, `05x` ratelimit, `06x` supplychain.

**Suppression**, three layers: inline `# finsec-ignore: FIN-SEC-010` (Bandit `# nosec` lineage) · `.finsecignore` path globs · server-side `suppressions` rows with a mandatory `reason` and ISO-8601 `expires_at`.

**`compliance_ref`** is a JSON string array with colon namespacing: `["PCI-DSS:8.6.2","RBI-DPSC","DPDP:8"]`. Use **v4.0** PCI numbers — injection is `6.2.4` (not v3.2.1's `6.5.1`), MFA into the CDE is `8.4.2` (not `8.3.x`), hardcoded keys is `8.6.2`.

**Money is Indian-grouped.** `₹42,00,000` (lakh/crore, 2-2-3), never `₹4,200,000`. Use `Intl.NumberFormat('en-IN')`.

**Config precedence** (highest wins) — not stated in the PRD, decided here:
```
CLI flags > env (FINSEC_*) > .finseclintrc (nearest dir, walking up)
          > finsec.yaml (project root) > ~/.config/finsec/config.toml > defaults
```
`config.toml` holds auth/profile only (modeled on Stripe's). `.finsecignore` and inline ignores are result filters, not config.

---

## Running things

```bash
pnpm mock                    # Prism REST mock :4010 + WS frame-replay mock :4011
pnpm --filter cli build      # tsc → packages/cli/dist
pnpm --filter cli test       # vitest + ink-testing-library

FINSEC_API_URL=http://localhost:4010 node packages/cli/dist/cli.js scan .
node packages/cli/dist/cli.js scan . --replay contract/fixtures/demo.jsonl   # no network at all
```

`--replay` exists because the PRD's risk register calls WebSocket instability a stage risk. The same JSONL fixture format feeds the mock server, `--replay`, and the deterministic streaming tests — write it once.

---

## Demo obligations

The CLI owns the two highest-value beats of the ~4-minute pitch:

1. **(60s) `finsec scan .`** — streaming findings with a `⚠ VERIFIED LIVE` Stripe *test* key and `₹42,00,000 at risk`. The PRD calls this "the wow moment." Time-to-first-finding must be under 10s.
2. **(45s) `finsec fix FIN-SEC-001`** — the Cerebus provenance panel (quarantined model → diff builder → verifier `✓ PASS`), then accept the diff. That panel *is* the security argument made visible.

Both must survive the presentation machine's terminal font (`₹`, braille spinner, box drawing) — there's an ASCII fallback behind `FINSEC_ASCII=1`.

---

## Open questions blocking on `auto`

Do not invent answers to these alone; they are shared algorithms all four surfaces depend on.

- **Compliance-score formula** — arrives as `72.5`, renders as `72/100`. Weighting undefined.
- **Fingerprint algorithm** — drives baseline diffing, dedup, and suppression matching everywhere.
- **Money-at-risk heuristic table** — explicitly a heuristic, but no table or per-rule multipliers exist yet.
- **The K/S auth contradiction** — `triage`, `suppress`, `baseline`, and most of `rules` hit endpoints marked session/JWT-only, but the CLI authenticates with a Bearer API key. As specified those commands cannot work in CI.

Twelve smaller ambiguities have already been resolved unilaterally and are logged in [`docs/decisions.md`](docs/decisions.md) as proposals to the `auto` owner.
