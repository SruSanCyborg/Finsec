# sirius

**A security & compliance linter for money-handling code.**

Most linters tell you a line is wrong. `sirius` tells you which clause it breaks,
what it could cost in rupees, and hands a CI pipeline a signed report it can gate
on. It runs entirely on your machine — no backend, no network, no account.

```
  ✗ CRITICAL  SIR-SEC-001  Hardcoded payment-provider secret key
     src/config.py:14                          PCI-DSS 8.6.2 · DPDP §8
     14 │  STRIPE_KEY = "sk_live_51H8xR2eZv…"
        │               ╰── secret · ⚠ VERIFIED LIVE · ₹42,00,000 at risk
     ↳ fix: env_lookup   run  sirius fix SIR-SEC-001
```

---

## What it actually does

Money leaks in two places. `sirius` prices both.

```mermaid
flowchart LR
    subgraph CODE["In the code"]
        A1["scan<br/>tree-sitter AST + taint"] --> A2["13 rules<br/>mapped to clauses"]
        A2 --> A3["₹ money at risk"]
    end
    subgraph OPS["In the operations"]
        B1["revenue<br/>failed payments,<br/>abandoned checkouts,<br/>ageing invoices"] --> B2["ranked by<br/>expected recovery"]
        B2 --> B3["₹ uplift, net of<br/>what would have<br/>arrived anyway"]
    end
    subgraph PROOF["Provable afterwards"]
        C1["ed25519-signed report"] --> C2["RFC 6962 Merkle ledger"]
        C2 --> C3["--verify gates CI"]
    end
    CODE --> PROOF
    OPS --> PROOF
```

| | Command | Answers |
|---|---|---|
| **Code** | `sirius scan .` | Which lines break which clause, and what the exposure is worth |
| **Operations** | `sirius revenue` · `sirius reconcile` | Which money is recoverable, and what it costs to chase |
| **Proof** | `sirius report` · `sirius ledger` | That the report is unaltered, and that the log was never rewritten |

---

## Quick start

Requires **Node ≥ 22** and `pnpm`.

```bash
pnpm install
pnpm --filter sirius build
```

Scan the bundled vulnerable fixture:

```bash
node packages/cli/dist/cli.js scan contract/fixtures/chaos-repo
```

```
 ────────────────────────────────────────────────────────────────
  Findings   ✗ 2 critical   ▲ 2 high   ■ 2 medium
  Money@risk ₹89,30,000     Compliance 60/100
  Scanned    3 files
  Source     local engine · tree-sitter AST analysis
  Exit 1     severity≥high, fail-on=all → BLOCKED
 ────────────────────────────────────────────────────────────────
```

Run with no arguments for the interactive shell — every command works as
`sirius x` and as `/x` inside it:

```bash
node packages/cli/dist/cli.js
```

On a real project:

```bash
sirius init --project <id>     # writes sirius.yaml + .siriusignore
sirius scan .
sirius fix SIR-SEC-001
sirius report --output report.json
```

---

## How a scan works

Nothing here calls out to a service. The parser, the rules, the taint analysis
and the money model are all local.

```mermaid
flowchart TD
    F["files<br/>.py .js .ts + manifests"] --> P["tree-sitter parse"]
    P --> T["taint analysis<br/>intra- and inter-procedural"]
    T --> R["13 compiled rules"]
    R --> POL{"policy layer"}
    POL -->|"inline # sirius-ignore"| DROP["withheld"]
    POL -->|".siriusignore / exclude:"| DROP
    POL -->|"suppressions with<br/>reason + expiry"| DROP
    POL -->|"baseline: unchanged"| DROP
    POL --> FIND["findings"]
    FIND --> V["--validate-secrets<br/>ask the provider"]
    V --> M["money model<br/>base x reachability x persistence"]
    M --> G{"gate<br/>severity-threshold x fail-on"}
    G -->|clean| E0["exit 0"]
    G -->|"findings at/above"| E1["exit 1"]
    FIND --> A["attack paths<br/>entry to target"]
```

**Taint tracking is the difference between a grep and a scanner.** A query built
one statement above the sink is invisible to shape-matching:

```python
q = "SELECT * FROM accounts WHERE id = %s" % request.args["id"]
cur.execute(q)                    # SIR-SEC-010, traced back to request.args
```

And interpolating a module constant is *not* an injection, so it is not reported:

```python
cur.execute(f"SELECT count(*) FROM {TABLE}")   # no finding
```

---

## The fix pipeline

`sirius fix` shows the provenance of every change before it touches a file. The
verifier re-runs the rule against the patched source — a fix is only accepted if
the rule that produced the finding no longer matches.

```mermaid
flowchart LR
    FIND["finding"] --> SEL["template selector"]
    SEL --> DIFF["diff builder"]
    DIFF --> VER{"verifier<br/>re-runs the rule"}
    VER -->|"no match"| PASS["✓ PASS"]
    VER -->|"still matches"| FAIL["✗ FAIL — not offered"]
    PASS --> APP{"applicability"}
    APP -->|"machine-applicable"| AUTO["applied"]
    APP -->|"maybe-incorrect<br/>has-placeholders"| SKIP["shown, skipped<br/>--unsafe-fixes to apply"]
```

```
  ╭─ Cerebus fix · SIR-SEC-001 ──────────────────────────────────────────────╮
  │ template selector → env_lookup → target STRIPE_KEY                       │
  │ diff builder      → template: env_lookup                                 │
  │ verifier          → re-ran SIR-SEC-001, no match — nothing would select   │
  │                     it again → ✓ PASS                                     │
  │ applicability     → machine-applicable — applied without asking          │
  ╰──────────────────────────────────────────────────────────────────────────╯
```

The applicability tiers follow rustc's model, the one `cargo clippy --fix` uses:
only **machine-applicable** changes are applied without being asked for.

---

## The revenue surface

`scan` prices money at risk in code. `revenue` prices it in operations — failed
payments, abandoned checkouts, ageing receivables — and `reconcile` matches three
sets of books that disagree.

```bash
sirius revenue gen batch && sirius revenue detect batch
sirius revenue eval batch          # held-out metrics, including what being wrong cost
sirius revenue recover batch       # bounded workflow + signed audit trail
sirius reconcile books --gen && sirius reconcile books
```

```mermaid
flowchart TD
    B["batch of records"] --> S["score<br/>L2 logistic + calibration"]
    S --> RANK["rank by expected recovery<br/>score x amount x recovery share"]
    RANK --> CAP{"capacity cap<br/>not a cost cap"}
    CAP --> ACT["work the queue"]
    ACT --> RULES{"stopping rules"}
    RULES -->|"quiet_hours"| REF["refused — logged"]
    RULES -->|"consent — DPDP 2023 §6"| REF
    RULES -->|"mandate_cap — NPCI NACH"| REF
    RULES -->|"contact_frequency — TRAI"| REF
    RULES -->|"budget · retry cap · hold"| REF
    RULES -->|"allowed"| DO["simulated action"]
    DO --> TRAIL["hash-chained, signed audit trail"]
    REF --> TRAIL
```

Four rules this surface does not bend:

- **The target is uplift, not recovery.** Money that would have arrived anyway is
  subtracted everywhere, including from the headline.
- **Capacity, not cost, is the constraint.** Retry ratios, NACH limits and TRAI
  contact rules are real; an SMS costing ₹0.18 is not.
- **Refusing is a first-class action.** "Considered and left alone" must be
  distinguishable from "never looked", so refusals produce audit entries too.
- **The thresholds belong to the project.** Capacity, budget, quiet hours and the
  cost model live in `sirius.yaml`. The *basis* is not configurable: a team sets
  its threshold, not the obligation the threshold answers to.

Everything is simulated and says so. There is no `--execute`.

---

## Proof

A signature says a report was not altered. It says nothing about whether a
*different* report was signed in its place, or an inconvenient one deleted. That
is what the ledger is for.

```mermaid
flowchart LR
    SCAN["scan"] --> REP["report<br/>canonical JSON"]
    REP --> SIG["ed25519 signature<br/>key_id = fingerprint(public key)"]
    SIG --> LED["append-only Merkle log<br/>RFC 6962"]
    LED --> I["report --verify<br/>inclusion proof in log(n) hashes"]
    LED --> C["ledger verify<br/>every prefix consistent"]
```

```bash
sirius report --output report.json
sirius report --verify report.json --key <fingerprint>
sirius ledger verify
```

`key_id` is **derived** from the embedded public key and checked, never read as a
label — otherwise anyone could re-sign a rewritten report, keep the legitimate
fingerprint, and have the verifier vouch for them. Without `--key`, a passing
verify says *unmodified*; it does not say *by whom*, and it prints that in as many
words.

---

## Rules

`SIR-SEC-NNN`, numbered in blocks of ten by category. Every rule ships with a
planted example on disk in `contract/fixtures/rule-gallery/`, beside a correct
counterpart doing the same job — so the fixture proves both that the rule fires
and that it leaves good code alone.

| Rule | Severity | What | Clauses |
|---|---|---|---|
| `SIR-SEC-001` | critical | Hardcoded payment-provider secret key | PCI-DSS 8.6.2 · RBI DPSC · DPDP §8 · CWE-798 |
| `SIR-SEC-002` | high | High-entropy string in source or config | PCI-DSS 8.6.2 · DPDP §8 |
| `SIR-SEC-010` | critical | SQL built with string formatting | PCI-DSS 6.2.4 · RBI DPSC · CWE-89 |
| `SIR-SEC-011` | critical | OS command built from user input | PCI-DSS 6.2.4 · CWE-78 |
| `SIR-SEC-020` | high | Route missing an authentication decorator | PCI-DSS 8.4.2 · RBI DPSC |
| `SIR-SEC-021` | critical | JWT decoded without signature verification | PCI-DSS 8.4.2 · PCI-DSS 8.3.1 · RBI DPSC |
| `SIR-SEC-030` | high | PAN, Aadhaar, or other PII written to logs | PCI-DSS 3.4.1 · DPDP §8 · GDPR Art.5 |
| `SIR-SEC-031` | critical | Full PAN stored unmasked | PCI-DSS 3.5.1 · PCI-DSS 3.4.1 · RBI DPSC |
| `SIR-SEC-040` | medium | Weak hash algorithm | PCI-DSS 6.2.4 · PCI-DSS 3.6.1 · RBI DPSC |
| `SIR-SEC-041` | high | Cardholder data sent over plain HTTP | PCI-DSS 4.2.1 · RBI DPSC |
| `SIR-SEC-050` | medium | Money-movement endpoint without a rate limit | PCI-DSS 6.2.4 · RBI DPSC |
| `SIR-SEC-051` | medium | Money-movement POST without an idempotency key | — |
| `SIR-SEC-060` | high | Dependency declared outside the registry | PCI-DSS 6.3.2 |

PCI numbers are **v4.0**: injection is `6.2.4` (not v3.2.1's `6.5.1`), MFA into the
CDE is `8.4.2`, hardcoded keys are `8.6.2`.

```bash
sirius rules list                       # the whole catalogue, by category
sirius rules show SIR-SEC-010           # clauses, fix action, suppression token
sirius rules validate my-rule.yaml      # schema, vocabularies, clause numbers
sirius rules test my-rule.yaml          # run it against an annotated fixture
sirius explain SIR-SEC-001              # where the ₹ figure comes from
sirius explain score                    # how the compliance score is calculated
```

Rules fire on **Python, JavaScript and TypeScript**. Three rules that match the
Python decorator idiom (`@app.route`) declare `python` only, rather than
advertising a language they would quietly do nothing in.

---

## Commands

```mermaid
flowchart TD
    subgraph FIND["find"]
        scan --> triage
        triage --> fix
        scan --> explain
        scan --> watch
    end
    subgraph POLICY["decide"]
        baseline
        suppress
        rules
    end
    subgraph PROVE["prove"]
        report --> ledger
        report --> badge
    end
    subgraph MONEY["operations"]
        revenue --> reconcile
    end
    subgraph SETUP["set up"]
        init --> doctor
        login
    end
```

| Command | What it does |
|---|---|
| `scan [path]` | Stream findings, price them, gate on them |
| `fix <rule>` | Apply a verified fix, showing its provenance |
| `triage` | Decide about each finding, one keypress each — inline in the shell |
| `watch [path]` | Re-scan on file change |
| `explain [rule\|score]` | Where a number came from |
| `rules list\|show\|validate\|test` | The catalogue, offline |
| `baseline` · `suppress` | What is already accepted, and what is excused |
| `report` · `ledger` · `badge` | Signed proof, its history, and an SVG |
| `revenue` · `reconcile` | The operations side |
| `init` · `login` · `doctor` | Scaffolding, credentials, and a pre-flight check |

Start with `sirius doctor` — it reports against the mode the scan will actually
run in, self-tests both engines, and ends with the command to run next.

---

## Using it in CI

Exit codes follow Snyk's convention:

| Code | Meaning |
|---|---|
| `0` | Clean |
| `1` | Findings at or above the threshold — **action needed, not an error** |
| `2` | CLI or execution failure (bad flag, auth, parse) |
| `3` | No supported target found |

```bash
sirius scan . --severity-threshold high --fail-on all --sarif results.sarif
```

`1` and `2` are deliberately distinct: a pipeline must be able to tell a blocked
gate from a typo. The escape hatch, if you are not ready to block, is
`sirius scan . || true` — and because a malformed flag exits `2`, that hatch will
not silently swallow one.

Useful flags:

| Flag | Effect |
|---|---|
| `--json` · `--sarif <file>` | Machine output; `--json` owns stdout |
| `--severity-threshold <level>` | `critical` `high` `medium` `low` `info` |
| `--fail-on <predicate>` | `all` · `new` · `verified-secrets` |
| `--diff` | Only findings not in the baseline |
| `--validate-secrets` | Ask the provider whether a credential is live (read-only) |
| `--ruleset p/<name>` | `p/fintech-core` is everything; `p/<category>` is one |
| `--replay <file>` | Replay a recorded run — no engine, no network |

---

## Configuration

Precedence, highest first:

```
CLI flags  >  env (SIRIUS_*)  >  .siriuslintrc (nearest dir, walking up)
           >  sirius.yaml (project root)  >  ~/.config/sirius/config.toml  >  defaults
```

`sirius init` scaffolds `sirius.yaml` with comments explaining each threshold —
including which numbers are yours to set and which are not. An unrecognised key
is reported rather than ignored, because a misspelled gate key means the gate
silently does not exist.

Three suppression layers, all of which change the totals as well as the list:

```python
API_KEY = "..."   # sirius-ignore: SIR-SEC-001
```

```bash
sirius suppress SIR-SEC-002 --reason "test fixture, not a live key" --expires 2026-12-31
echo "vendor/" >> .siriusignore
```

Suppressions require a reason and an ISO-8601 expiry, and an expired one restores
the finding with a notice.

---

## Terminal behaviour

Everything is laid out against the real terminal width — tables take their columns
from the content, and the nominated column gives way when a row does not fit.
Money is never shortened: a clipped sentence announces itself, a clipped rupee
figure does not.

| Variable | Effect |
|---|---|
| `SIRIUS_ASCII=1` | Full ASCII output — `₹` becomes `Rs.`, box drawing becomes `+-\|` |
| `NO_COLOR=1` | No colour (the standard convention) |
| `SIRIUS_SCAN_PACE` · `SIRIUS_REVENUE_PACE` | Output pacing in ms; `0` disables |
| `SIRIUS_REPLAY_SPEED` | Replay speed; `0` is instant |

Pacing is off automatically for `--json`, pipes and CI — a pipeline must not pay
deliberate delay to look good for nobody.

---

## Development

```bash
pnpm install
pnpm --filter sirius build       # tsc → packages/cli/dist
pnpm --filter sirius test        # vitest — 829 tests
pnpm mock                        # Prism REST :4010 + WS replay :4011
pnpm contract:lint               # redocly lint
pnpm rehearse                    # drive the real shell in a real pty
pnpm shell:check                 # every slash command, dispatched by the shell
```

| Path | What |
|---|---|
| `packages/cli/` | The CLI — Ink + TypeScript |
| `packages/cli/src/engine/` | Parser, rules, taint, money model, signing, ledger |
| `packages/cli/src/revenue/` | Scoring, capacity, policy, audit trail |
| `contract/` | OpenAPI spec, mock server, and the fixtures |
| `contract/fixtures/rule-gallery/` | One planted example per rule, beside a clean counterpart |
| `docs/` | PRD, system overview, CLI spec, and the decision log |

### Things this project takes seriously

**"Implemented" is not "works".** Several features were once listed as done while
being unreachable in the configuration everything defaults to. Every one was found
by *running* the binary, never by the test suite. Two habits follow: `pnpm rehearse`
drives the real shell in a real pty before anything is believed, and a status row
says what was verified rather than what was written.

**A test that has not been seen to fail has not been shown to test anything.**
Regression tests here are checked by reverting the fix and watching them go red.

**Layout gives way; content does not.** A column may narrow, a row may stack, a
value may wrap. Nothing is shortened into something that still reads as a valid
value.

---

## Documentation

- [`AGENTS.md`](AGENTS.md) — orientation for contributors; start here
- [`docs/system-overview.md`](docs/system-overview.md) — architecture, contract, rules
- [`docs/cli-surface.md`](docs/cli-surface.md) — the CLI specification
- [`docs/revenue.md`](docs/revenue.md) — the revenue model and its honest findings
- [`docs/decisions.md`](docs/decisions.md) — every decision, with the reasoning
- [`docs/original-prd.md`](docs/original-prd.md) — the full original PRD

---

## Status

| Area | State |
|---|---|
| Local engine | Real — tree-sitter AST, 13 rules, taint tracking, money model |
| `scan` · `fix` · `triage` · `watch` | Done, streaming, paced, with exit codes |
| `rules` · `baseline` · `suppress` | Done, fully offline |
| `report` · `ledger` · `badge` | Done — ed25519 signing, RFC 6962 Merkle log |
| `revenue` · `reconcile` | Done — held-out metrics, bounded recovery, signed trail |
| Tests | 829 passing |

**The API is required for nothing.** The CLI began as a pure client of a REST
contract and still speaks it, but every command works with no backend running.

---

<sub>Fintech compliance scanning, priced in rupees.</sub>
