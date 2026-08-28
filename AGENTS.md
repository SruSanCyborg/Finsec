# sirius

A security & compliance linter **for money-handling code**. It scans API specs and SDK code before deployment, maps every finding to a specific compliance clause (PCI-DSS v4.0, RBI DPSC, DPDP 2023, GDPR), quantifies **money-at-risk in ₹**, emits a cryptographically signed report a CI pipeline can gate on, and proposes guardrailed autofixes through a dual-LLM design called **Cerebus**.

Built for a hackathon demo. The credibility strategy is deliberate: copy proven conventions wholesale — Semgrep (YAML rules, `--baseline-commit`, SARIF, inline suppression), Snyk (`--severity-threshold`, `--fail-on`, 0/1/2/3 exit codes, expiring ignores), TruffleHog (live secret validation), Simon Willison's dual-LLM pattern.

**Canonical spec:** [`docs/original-prd.md`](docs/original-prd.md) (588 lines — the full PRD, architecture, API spec, and per-surface design report).
Distilled: [`docs/system-overview.md`](docs/system-overview.md) · [`docs/cli-surface.md`](docs/cli-surface.md) · [`docs/decisions.md`](docs/decisions.md) · [`docs/handoff-to-auto.md`](docs/handoff-to-auto.md) · [`docs/revenue.md`](docs/revenue.md)

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

- **CLI is Ink (TypeScript + React-for-terminal)**, not Python Rich or Go Bubble Tea. Rationale: aesthetic parity with the PRD's ANSI mockups, `npx sirius scan` zero-install demo, and the local toolchain (Node 26 present; Python is 3.9.6 system-only with no uv/pipx). See [`docs/decisions.md`](docs/decisions.md).
- **The CLI is a pure client.** It builds against the mock server first and swaps to the real Core with one env var: `SIRIUS_API_URL` (or `--api-url`).
- **Exit codes are computed client-side** by `gate.ts` and cross-checked against the server's value. Deterministic, testable, works offline.

---

## Conventions no surface may violate

**Exit codes** (Snyk-modeled): `0` clean · `1` findings at/above threshold (*action needed, not an error*) · `2` CLI/execution failure (auth, network, parse) · `3` no supported target found. Escape hatch: `sirius scan … || true`.

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

**Rule IDs** are `SIR-SEC-NNN`, numbered in blocks of ten by category: `00x` secrets, `01x` injection, `02x` auth, `03x` pii, `04x` crypto, `05x` ratelimit, `06x` supplychain.

**Rulesets** (D-022, decided here — the PRD names them but never defines membership): `p/fintech-core` is the whole catalogue; `p/<category>` is one category. Any other name is an error, never a silent full scan.

**Suppression**, three layers: inline `# sirius-ignore: SIR-SEC-010` (Bandit `# nosec` lineage) · `.siriusignore` path globs · server-side `suppressions` rows with a mandatory `reason` and ISO-8601 `expires_at`.

**`compliance_ref`** is a JSON string array with colon namespacing: `["PCI-DSS:8.6.2","RBI-DPSC","DPDP:8"]`. Use **v4.0** PCI numbers — injection is `6.2.4` (not v3.2.1's `6.5.1`), MFA into the CDE is `8.4.2` (not `8.3.x`), hardcoded keys is `8.6.2`.

**Money is Indian-grouped.** `₹42,00,000` (lakh/crore, 2-2-3), never `₹4,200,000`. Use `Intl.NumberFormat('en-IN')`.

**Config precedence** (highest wins) — not stated in the PRD, decided here:
```
CLI flags > env (SIRIUS_*) > .siriuslintrc (nearest dir, walking up)
          > sirius.yaml (project root) > ~/.config/sirius/config.toml > defaults
```
`config.toml` holds auth/profile only (modeled on Stripe's). `.siriusignore` and inline ignores are result filters, not config.

---

## Running things

```bash
pnpm install
pnpm mock                      # Prism REST :4010 + WS frame replay :4011
pnpm --filter sirius build     # tsc → packages/cli/dist
pnpm --filter sirius test      # vitest
pnpm fixtures                  # regenerate contract/fixtures/demo.jsonl
pnpm contract:lint             # redocly lint
pnpm contract:types            # regenerate packages/cli/src/api/types.ts
node contract/mock/smoke.mjs   # assert the mock still matches the PRD mockup
pnpm rehearse                  # the scan/fix beat, in a real pty
pnpm rehearse:revenue          # the revenue beat, with per-beat timings
pnpm shell:check               # every slash command, dispatched by the shell
pnpm artifact                  # regenerate the published page from a live run
```

Against the live mock:

```bash
env SIRIUS_API_URL=http://localhost:4010 SIRIUS_WS_URL=http://localhost:4011 \
    SIRIUS_API_KEY=demo-key SIRIUS_PROJECT_ID=11111111-1111-4111-8111-111111111111 \
    node packages/cli/dist/cli.js scan contract/fixtures/chaos-repo
```

Fully offline, no backend at all:

```bash
node packages/cli/dist/cli.js scan contract/fixtures/chaos-repo \
     --replay contract/fixtures/demo.jsonl
```

`--replay` exists because the PRD's risk register calls WebSocket instability a stage risk. The same JSONL fixture format feeds the mock server, `--replay`, and the deterministic streaming tests — write it once. `SIRIUS_REPLAY_SPEED=0` replays instantly; `0.15` is a good pace for rehearsal.

## Status

| Area | State |
|---|---|
| Contract + mock backend | Done. `openapi.yaml` validates; `smoke.mjs` asserts the mockup totals |
| Local engine | Real. tree-sitter AST, 12 rules, fingerprints, money model |
| `sirius scan` | Done — streaming, paced, `--json`, `--sarif`, `--replay`, exit codes |
| Threat stage | Done — live secret validation, git archaeology, attack paths |
| `sirius fix` | Done — templates + a verifier that re-runs the rule; writes what it verified |
| `rules list\|show\|validate` | Done, from the compiled catalogue. `validate` checks the schema, the vocabularies and the clause numbers offline; `test` still needs a rule engine |
| `baseline`, `suppress` | Done, stored in `.sirius/` and applied by `scan` — including the totals |
| `report` | Done — ed25519-signed JSON carrying the compliance score, `--verify` gates on 0/1/2 |
| `init`, `login`, `logout` | Done — scaffolding and 0600 credential storage |
| `triage` | Done both ways — decisions to `.sirius/`, or PATCHed to the API. Driven in a pty |
| `doctor` | Done — reports against the mode the scan will actually run in, self-tests both engines, and fails on a signing key that is not 0600 |
| `badge` | Done — writes an SVG from the last scan, or prints the hosted URL when a project is set |
| `watch`, `explain` | Done |
| **`revenue detect\|eval\|explain`** | Done — held-out precision/recall, ₹-weighted, calibration, false-positive cost, and a per-record evidence ladder |
| **`revenue recover\|audit`** | Done — bounded workflow, 13 stopping rules, hash-chained signed trail |
| **`revenue watch`** | Done — re-runs on a batch or policy change and prints only what moved |
| **`revenue sweep`** | Done — the same evaluation over N seeded batches, `--save`/`--against` for regressions |
| **`reconcile`** | Done — 5-tier matcher over 3 sets of books, match rate + verified accuracy + exceptions |
| Tests | 546 passing |

**Where the API is still required:** `rules test` (needs a YAML rule
interpreter, not just an endpoint) and PDF reports. Everything else runs with no
backend at all.

**"Implemented" is not "works".** Seven features were listed Done here while
being unreachable in the configuration everything defaults to — `fix` rejected
its own local scans, `--validate-secrets` probed a redacted string, `rules`
asked a server for rules compiled into the binary, `baseline`/`suppress` wrote
to an API that is not running, `triage` called a local scan a replay and refused
to open it, and `doctor` ended "4 problems would stop a scan" on a machine that
scans fine. Each was found by *running* it, never by the suite — and the pty
rehearsal caught a regression the 363 green tests did not. Two habits follow:
`pnpm rehearse` drives the real shell in a real pty before believing any of
this, and a row here says what was verified, not what was written.

A first run on a real repo looks like:

```bash
sirius init --project <id>     # writes sirius.yaml + .siriusignore
sirius login --api-key <key>   # verifies, then stores at 0600
sirius scan .
sirius fix SIR-SEC-001
```

---

## The revenue surface

`scan` prices money at risk in **code**. `revenue` and `reconcile` price it in
**operations**, with no backend and no network: failed payments, abandoned
checkouts, ageing receivables, and three sets of books that disagree.

```bash
sirius revenue gen batch && sirius revenue detect batch
sirius revenue eval batch          # held-out metrics, incl. what being wrong cost
sirius revenue recover batch       # bounded workflow + signed audit trail
sirius reconcile books --gen && sirius reconcile books
```

Full design and the honest findings: [`docs/revenue.md`](docs/revenue.md).
Three rules this surface does not bend:

- **The target is uplift, not recovery.** Money that would have arrived anyway
  is subtracted, everywhere, including from the headline.
- **Capacity, not cost, is the constraint.** Records are chosen by expected
  value under a cap, because retry ratios, NACH limits and TRAI contact rules
  are real and an SMS costing ₹0.18 is not.
- **Refusing is a first-class action.** Holds, blocked actions and skipped
  records all produce audit entries; "considered and left alone" must be
  distinguishable from "never looked".
- **The thresholds belong to the project.** Capacity, budget, quiet hours,
  contact limits, retry caps and the cost model all sit in `sirius.yaml`
  (`revenue:`, scaffolded by `init`). A run under a project's own policy names
  what moved, and every rule quotes the limit *actually in force* — in the
  report and in the trail. The **basis** is not configurable: a team sets its
  threshold, not the obligation the threshold answers to.

Everything is simulated and says so. There is no `--execute`.

## Demo obligations

The CLI owns the two highest-value beats of the ~4-minute pitch:

1. **(60s) `sirius scan .`** — streaming findings with `₹42,00,000 at risk`. The PRD calls this "the wow moment." Time-to-first-finding must be under 10s.

   The `⚠ VERIFIED LIVE` badge needs a credential the provider will actually
   accept, and the fixture's key is a non-functional placeholder — so validation
   correctly reports `inactive` and the badge never appears. Export a Stripe
   **test** key as `SIRIUS_DEMO_STRIPE_KEY` and `pnpm rehearse` stages it into
   the temp copy, turns on `--validate-secrets`, and reports whether the badge
   fired. It refuses an `sk_live_` outright: the script sends whatever it is
   given to Stripe. Nothing is overstated by using test mode — the exposure
   model already prices a test key at a hundredth of a live one (`medium`,
   ~₹40,000), so the badge means what it says: *this credential works right now*.
2. **(45s) `sirius fix SIR-SEC-001`** — the Cerebus provenance panel (quarantined model → diff builder → verifier `✓ PASS`), then accept the diff. That panel *is* the security argument made visible.

A third beat now exists on the revenue side, rehearsed the same way
(`pnpm rehearse:revenue`, which checks eight beats land and prints each one's
duration):

3. **(45s) `/revenue detect` → `/revenue recover`** — records streaming with a
   gateway outage named, a shared-signal cluster held for review, then the agent
   working the queue and being *refused* by `quiet_hours`, `consent` and
   `mandate_cap` in front of the audience. Roughly 6s of terminal time, so the
   rest is narration. `--kind payment` shows the rails-and-failure-codes view;
   the default money ranking puts invoices on top.

Both must survive the presentation machine's terminal font (`₹`, braille spinner, box drawing) — there's an ASCII fallback behind `SIRIUS_ASCII=1`.

**Everything on the demo path is paced.** The work finishes in a tenth of a
second and writes fifty lines; without pacing a terminal paints once and the
audience sees the last screenful. `SIRIUS_SCAN_PACE` and `SIRIUS_REVENUE_PACE`
set it, `0` turns it off, and it is off automatically for `--json`, pipes and
CI — a pipeline must not pay deliberate delay to look good for nobody.

---

## Open questions blocking on `auto`

Do not invent answers to these alone; they are shared algorithms all four surfaces depend on.

- **Compliance-score formula** — arrives as `72.5`, renders as `72/100`. Weighting undefined.
- **Fingerprint algorithm** — drives baseline diffing, dedup, and suppression matching everywhere.
- **Money-at-risk heuristic table** — explicitly a heuristic, but no table or per-rule multipliers exist yet.
- **The K/S auth contradiction** — `triage`, `suppress`, `baseline`, and most of `rules` hit endpoints marked session/JWT-only, but the CLI authenticates with a Bearer API key. As specified those commands cannot work in CI.

Twelve smaller ambiguities have already been resolved unilaterally and are logged in [`docs/decisions.md`](docs/decisions.md) as proposals to the `auto` owner.
