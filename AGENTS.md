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

**Every command works both ways.** `sirius x` and `/x` are the same command, and
`parity.test.ts` fails the build if either list grows without the other. Four
entries are shell-only and each says why in that file: `cd` (a one-shot process
cannot change its parent's directory), `clear`, `exit`, and `help` (commander
already provides `--help`). Nothing is CLI-only. This drifted three times —
`revenue stress`, `rules test`, `ledger` — each caught by a person rather than
by the build, which is why the check exists instead of a fourth fix by hand.

**Rule IDs** are `SIR-SEC-NNN`, numbered in blocks of ten by category: `00x` secrets, `01x` injection, `02x` auth, `03x` pii, `04x` crypto, `05x` ratelimit, `06x` supplychain.

Every rule ships with **one planted example on disk**, in
`contract/fixtures/rule-gallery/`, each beside a correct counterpart doing the
same job. Six rules once had none — they worked in the test that asserted them
and had never been run against a file. The gallery found three real defects the
first time it was pointed at the engine. `chaos-repo` stays the demo fixture and
its totals do not move; coverage goes in the gallery. See D-028.

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
pnpm --filter sirius build && \
  node packages/cli/dist/cli.js scan contract/fixtures/rule-gallery   # every rule, once
pnpm rehearse                  # the scan/fix beat, in a real pty
pnpm rehearse:revenue          # the revenue beat, with per-beat timings
pnpm shell:check               # every slash command, dispatched by the shell
pnpm artifact                  # regenerate the published page from a live run
pnpm artifact:check            # fail if the published figures no longer match
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
| Local engine | Real. tree-sitter AST, 13 rules, taint tracking (intra- and inter-procedural), fingerprints, money model. `rule-gallery` fires every one, in Python **and JavaScript** |
| `sirius scan` | Done — streaming, paced, `--json`, `--sarif`, `--replay`, exit codes |
| Threat stage | Done — live secret validation, git archaeology, attack paths |
| `sirius fix` | Done — templates + a verifier that re-runs the rule; writes what it verified |
| `rules list\|show\|validate\|test` | Done, from the compiled catalogue. `validate` checks schema, vocabularies and clause numbers offline; `test` runs a YAML rule against an annotated fixture |
| `baseline`, `suppress` | Done, stored in `.sirius/` and applied by `scan` — including the totals |
| `report` | Done — ed25519-signed JSON carrying the compliance score, `--verify` gates on 0/1/2 and binds `key_id` to the key. `--key` pins the signer; without it a pass says *unmodified*, never *by whom*. `--format pdf` writes the page itself, no renderer |
| `ledger` | Done — RFC 6962 Merkle log of every report. `--verify` proves inclusion; `ledger verify` proves the history only ever appended. The leaf covers the whole entry, so the metadata an auditor reads is chained too |
| `init`, `login`, `logout` | Done — scaffolding and 0600 credential storage |
| `triage` | Done — inline in the shell, one keypress per finding, revisable; or full-screen standalone. Decisions to `.sirius/`, or PATCHed to the API |
| `doctor` | Done — reports against the mode the scan will actually run in, self-tests both engines, and fails on a signing key that is not 0600 |
| `badge` | Done — writes an SVG from the last scan, or prints the hosted URL when a project is set |
| `watch`, `explain` | Done — `explain score` derives the compliance figure and works the example against the last scan |
| **`revenue detect\|eval\|explain`** | Done — held-out precision/recall, ₹-weighted, calibration, false-positive cost, and a per-record evidence ladder |
| **`revenue recover\|audit`** | Done — bounded workflow, 13 stopping rules, hash-chained signed trail |
| **`revenue watch`** | Done — re-runs on a batch or policy change and prints only what moved |
| **`revenue sweep`** | Done — the same evaluation over N seeded batches, `--save`/`--against` for regressions |
| **`revenue stress`** | Done — six distribution shifts applied to the generator; the money edge holds in 3 of 6, the compliance rule in 6 of 6 |
| **`reconcile`** | Done — 5-tier matcher over 3 sets of books, match rate + verified accuracy + exceptions |
| Tests | 829 passing |

**The API is required for nothing.** `rules test` and PDF reports were the last
two holdouts and both reasons were wrong. `rules test` — it did not need an
endpoint, it needed something able to *run* a rule document. `engine/rule-
interpreter.ts` is that, at an honest size: regex and entropy in full, a
metavariable subset of `pattern` (`$X` matches one node, `"..."` any string),
and a named `unsupported` list for anything outside the subset, which fails the
run rather than passing it. And a PDF is a text format with a byte-offset table
at the end, whose fourteen base fonts every reader already has — no renderer, no
rasteriser, no dependency. See D-034 and D-035.

**"Implemented" is not "works".** Seven features were listed Done here while
being unreachable in the configuration everything defaults to — `fix` rejected
its own local scans, `--validate-secrets` probed a redacted string, `rules`
asked a server for rules compiled into the binary, `baseline`/`suppress` wrote
to an API that is not running, `triage` called a local scan a replay and refused
to open it, and `doctor` ended "4 problems would stop a scan" on a machine that
scans fine. `SIR-SEC-060` belongs on that list too: the demo replay streamed a
supply-chain finding the engine had no rule for, and six more rules had never
been run against a file at all. Each was found by *running* it, never by the
suite — and the pty rehearsal caught a regression the 363 green tests did not. Two habits follow:
`pnpm rehearse` drives the real shell in a real pty before believing any of
this, and a row here says what was verified, not what was written.

**Two cold reviews, and what a green suite still hid.** 748 tests passed while
all of this was true, none of it caught by any of them:

- A signed report or audit trail could be rewritten, re-signed with a fresh
  keypair keeping the legitimate `key_id`, and the verifier answered `OK` and
  printed the *trusted* fingerprint over the *attacker's* key. The docstring
  even told auditors to pin `key_id` — the one field the forger had most reason
  to copy (D-046).
- Eleven of thirteen rules gated on tree-sitter's Python node names, so a
  JavaScript file with SQL injection, command injection, MD5 over a PAN and a
  card number in a log came back clean — while `rules show` advertised
  `javascript, typescript` and `doctor` advertised `go`, which no rule declares
  (D-048).
- `--validate-secrets` repriced findings and left the footer total alone, so one
  scan printed six findings summing to ₹53,60,000 under a total of ₹89,30,000
  (D-047's sibling; `money-agrees.test.ts`).
- A directory with nothing scannable in it reported `100/100 · PASSED · exit 0`
  — a perfect score for a scan that opened nothing.
- A mistyped flag exited 1, the code reserved for *findings found*, so
  `sirius scan . || true` swallowed the typo and went green having scanned
  nothing (D-050).
- At 64 columns the footer rendered `₹89,30,000` as `₹89,30,00`, and the Cerebus
  panel cut `nothing would select it again` at 120 columns with fifty spare
  (D-047).
- `SIRIUS_ASCII=1`, documented here as the projector fallback, did not convert
  `₹` anywhere on the scan surface — while `doctor`'s glyph self-test rendered
  `Rs.42,00,000` through a different code path and passed (D-049).

Every one was found by running the binary and testing the *negative* case. So a
third habit: a regression test that has not been *seen to fail* has not been
shown to test anything. The first `ink-width.test.tsx` passed against the
unfixed code, because `ink-testing-library`'s fake stdout hard-codes
`columns = 100`.

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

1. **(60s) `sirius scan .`** — streaming findings, the PRD's "wow moment." Time-to-first-finding must be under 10s.

   **Two figures are on screen and they are not the same number.** The first
   finding line carries `₹42,00,000` — SIR-SEC-001 alone, the PRD's famous
   figure, and it lands within a second. The footer totals `₹89,30,000` across
   all six findings. Narrating "forty-two lakh" over a screen reading eighty-nine
   is an avoidable stumble: lead with the finding, close on the total.

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

Both must survive the presentation machine's terminal font (`₹`, braille
spinner, box drawing) — there's an ASCII fallback behind `SIRIUS_ASCII=1`, and
it is checked by asserting that *no non-ASCII byte survives* a scan or a
`doctor` run, in both directions. It used to be checked by `doctor`'s glyph
sample, which rendered through a different path from the scanner it vouched for
and so passed while the scanner emitted nine rupee signs (D-049).

**And its width.** Every view is laid out through `ui/kit.ts` against the real
terminal width: tables take their columns from the content, the nominated column
gives way when the row does not fit, and notes wrap under their row rather than
extending it. `revenue eval` was 217 columns and `recover` 205 — on a projector
that wraps into the row beneath and stops being a table, while every character
is still present, so nothing fails. `render-width.test.ts` checks 60/80/100/120
and colour. See D-032.

**`/triage` runs inline, in a panel above the prompt.** It asks a question with
a few answers, and a question is not a reason to take the terminal: the
transcript stays visible, the scan you are triaging is still above it, and one
keypress decides. `k` walks back to anything already answered — the queue holds
every finding, not only the open ones — and deciding again replaces the old
answer and says `(was accepted)` rather than looking like a first decision. `u`
undoes, because *accepted*, *dismissed* and *suppressed* are three claims and
none of them means "not looked at yet". `/triage --decided` lists what you
chose without reopening the queue.

**Full-screen commands hand over rather than refuse.** `/triage` and `/watch`
draw their own UI, so the shell unmounts, gives them the real terminal, and
takes it back with the transcript intact when they exit — the way `git` hands
over to `$EDITOR`. Not a split: splitting means a pty, a terminal emulator and a
native dependency, which is a multiplexer built for two commands. While a child
holds the terminal the shell stops treating Ctrl-C as its own, or the keystroke
that quits the child would end the session.

**The handover waits for the unmount instead of guessing at it.** Ink's teardown
is asynchronous; a `setTimeout(30)` in its place meant the child sometimes
started while the shell still held stdin in raw mode with a listener attached,
and the two competed for the same keystrokes. That was the `/watch`-after-
`/triage` flake: the shell kept painting, because painting never needed stdin,
and never took another keystroke — not even end-of-input. It now awaits
`waitUntilExit()`, releases stdin explicitly before the child and hands it back
after. Eight isolated cycles and two full `shell:check` runs, all green.

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
