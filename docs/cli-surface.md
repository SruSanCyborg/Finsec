# sirius — the CLI surface

Everything the `cli` branch needs. Read [`system-overview.md`](system-overview.md) first for the contract and vocabularies; this document covers only the terminal client.

**The CLI is a pure HTTP/WS client.** It never loads YAML rules locally, never walks an AST, never calls Cerebus. Every command maps to Core API calls.

> One stated exception exists in the PRD: the pre-commit hook is described as a "fast local secret scan, gitleaks-style, sub-second, no network." That implies a local fast path somewhere, but the PRD never says the CLI binary hosts it. Treat as out of scope until `auto` decides.

---

## 1. Command tree

```
sirius
├── login / logout                 # OAuth device flow → ~/.config/sirius/config.toml
├── init                           # scaffold sirius.yaml + .siriuslintrc
├── scan [path]                    # main; streaming findings
│   ├── --diff --baseline <sha>    # diff-aware (Semgrep-style)
│   ├── --severity-threshold <lvl> # gate level (Snyk-style)
│   ├── --fail-on <all|new|verified-secrets>
│   ├── --config <file> --ruleset <p/...>
│   ├── --json | --sarif <file>    # machine modes / GitHub upload
│   ├── --validate-secrets         # opt-in live key check (rate-limited)
│   ├── --no-color                 # + honors NO_COLOR env
│   └── --report <pdf|json>        # signed artifact
├── fix [finding-id] [--all] [--apply]   # Cerebus diffs, interactive accept/reject
├── triage                         # interactive TUI: keyboard-driven finding review
├── watch                          # re-scan on file change (like `stripe listen`)
├── rules [list|show|validate|test]
├── suppress <rule> --reason "…" --expires 2026-09-01
├── baseline set|show
├── report [scan-id] --format pdf
└── badge                          # print compliance badge URL/markdown
```

Added by [`decisions.md`](decisions.md): global `--api-url`, `--project`, and `scan --replay <fixture.jsonl>`.

| Command | Endpoints | Notes |
|---|---|---|
| `login` | `POST /auth/token`, `POST /auth/api-keys` | Device-flow endpoints **do not exist** in the API table — blocked, see decisions |
| `logout` | `DELETE /auth/api-keys/{id}` or local-only | Scope undecided |
| `init` | `GET/POST /projects`, `GET/PUT /projects/{id}/policy` | Writes `sirius.yaml` + `.siriuslintrc`; no template content specified in the PRD |
| `scan` | `POST /scans` → `WS /scans/{id}/stream` → `GET /scans/{id}/results`; `GET /scans/{id}` for polling fallback; `POST …/validate-secret` when `--validate-secrets` | §2 below |
| `fix` | `POST /scans/{id}/findings/{fid}/fix` | Rule-id resolution via `.sirius/last-scan.json` |
| `triage` | `GET /scans/{id}/results`, `PATCH /scans/{id}/findings/{fid}` | **S-auth only** — see the K/S contradiction |
| `watch` | repeated `POST /scans` + WS; `DELETE /scans/{id}` to cancel superseded scans | debounce unspecified |
| `rules` | `GET /rules`, `GET /rules/{id}`, `POST /rules/validate`, `POST /rules` | `test` has **no endpoint** |
| `suppress` | `GET/POST /suppressions` | **S-auth only** |
| `baseline` | `GET/POST /baselines` | **S-auth only** |
| `report` | `GET /scans/{id}/report` | Tree says `--format pdf`, API says `pdf\|json\|sarif` |
| `badge` | `GET /projects/{id}/badge.svg` | Public, no auth |

**The K/S auth contradiction.** `scan`, `fix`, `report`, and secret validation accept **K** (Bearer API key). But `triage`, `suppress`, `baseline`, and most of `rules` hit endpoints marked **S** (session/JWT only). As specified those four commands cannot work in CI with an API key. Logged as blocked on `auto`.

---

## 2. `scan` in depth

### Flags

`[path]` positional · `--diff` · `--baseline <sha>` (→ `baseline_commit`; Semgrep's `--baseline-commit`, "only show results not found in this commit hash") · `--severity-threshold <low|medium|high|critical>` · `--fail-on <all|new|verified-secrets>` · `--config <file>` · `--ruleset <p/...>` (→ `rulesets[]`) · `--json` · `--sarif <file>` · `--validate-secrets` · `--no-color` · `--report <pdf|json>`.

Body fields with no stated flag: `project_id`, `source`, `git_ref`, `commit_sha`, `diff_aware`, `policy_id` — resolution rules in [`decisions.md`](decisions.md) D-008.

### Streaming lifecycle

1. `POST /scans` → **202** + `scan_id`, status `queued`
2. `scan.started` — worker flips to `running`
3. interleaved for the duration: `file.scanning` · `finding` · `progress` · `error` (per-file, non-fatal)
4. `scan.completed` — carries `compliance_score`, `counts`, `exit_code`

WS close **4401** on auth failure. Fallback: poll `GET /scans/{id}`.

**Money-at-risk arrives per-finding** (`money_at_risk_inr` on the frame). The footer total (`₹51,20,000`) appears in no frame and is *not* the sum of the displayed findings — it's a scan-level aggregate over all findings. Read it from `GET /scans/{id}` or accumulate across every finding received, not just the rendered ones.

`compliance_score` arrives as `72.5` and renders as `72/100` — rounding rule unstated; floor it.

### Rendering tiers

The mockup shows three densities:

- **Full card** (critical with a secret): glyph + severity + rule id + message; `file:line` left with compliance refs right-aligned; code frame; underline annotation; fix hint with a runnable command
- **Medium card** (critical, injection): same minus the annotation; fix hint has no command
- **Compact** (high): header + location/compliance line only, no code frame

Glyphs: `✗` critical, `▲` high; footer legend adds `●` critical, `▲` high, `■` medium, `○` low, and `·` for `info` (our addition). Severity words are **uppercase and column-padded** (`CRITICAL`, `HIGH    `) so rule ids align. Secret literals are **truncated with an ellipsis**: `"sk_live_51H8xR2eZv…"` — never print a full key, even a test one. Compliance refs join with ` · ` and use section signs (`DPDP §8`).

### Gating

Footer prints the verdict. Per [D-003](decisions.md), `--severity-threshold` sets the bar and `--fail-on` selects the predicate; the PRD's mockup conflates them. Server-side `policies` inputs that also gate: `fail_on_severity` (default `high`), `max_new_findings`, `require_no_verified_secrets` (default `true`), `min_compliance_score`. Per the PRD: **only live secrets flip the CI gate** — most secrets found in old commits are already revoked, which is the whole economic argument for validity checking.

---

## 3. Exit codes

| Code | Meaning (verbatim from the PRD) |
|---|---|
| `0` | clean, no findings at/above threshold |
| `1` | findings at/above threshold ("action needed," not an error) |
| `2` | CLI/execution failure (bad auth, network, parse) |
| `3` | no supported target found |

Modeled on Snyk: "0: success (scan completed), no vulnerabilities found; 1: action_needed (scan completed), vulnerabilities found; 2: failure, try to re-run the command; 3: failure, no supported projects detected."

Escape hatch, verbatim: **`sirius scan … || true`**.

Undecided: whether per-file `SIRIUS_ERR_PARSE` frames escalate to `2` (the mockup implies they're non-fatal — treat them as warnings), and what a canceled scan returns.

---

## 4. Config layering

| Artifact | Role | Lineage |
|---|---|---|
| `sirius.yaml` | project rules/policy | — |
| `.siriuslintrc` | per-dir overrides | eslintrc |
| `~/.config/sirius/config.toml` | auth | Stripe's `config.toml` |
| `.siriusignore` | path globs | gitignore |
| `# sirius-ignore: SIR-SEC-010` | inline suppression | Bandit `# nosec` / Ruff `# noqa: CODE` |
| `--config <file>` | explicit override | — |
| server `suppressions` | rule/path/fingerprint + reason + `expires_at` | `.snyk` |

**Precedence is not stated anywhere in the PRD.** Decided in [`../AGENTS.md`](../AGENTS.md): flags > env > `.siriuslintrc` > `sirius.yaml` > `config.toml` > defaults.

Also undecided upstream: whether `.siriusignore` filters client-side (files never uploaded) or server-side; and whether inline `# sirius-ignore` findings still arrive over WS with `suppressed: true` (the DDL has a `suppressed BOOLEAN` column, which suggests yes — the worker must evaluate inline ignores since the CLI never parses code).

---

## 5. The ANSI mockups

These are the visual spec. Reproduce component-for-component.

### `sirius scan .`

```
  ╭──────────────────────────────────────────────────────────────╮
  │  sirius v0.4.0   ·   Sirius Compliance Scanner           │
  │  project: paykit-api   ·   ruleset: p/fintech-core (52 rules) │
  ╰──────────────────────────────────────────────────────────────╯

  ⠹  Scanning 128 files ····································  86%   ▐████████▏

  ✗ CRITICAL  SIR-SEC-001  Hardcoded Stripe secret key
     src/config.py:14                          PCI-DSS 8.6.2 · DPDP §8
     14 │  STRIPE_KEY = "sk_live_51H8xR2eZv…"
        │               ╰── secret · ⚠ VERIFIED LIVE · ₹42,00,000 at risk
     ↳ fix: env_lookup   run  sirius fix SIR-SEC-001

  ✗ CRITICAL  SIR-SEC-010  SQL built with string formatting
     src/ledger.py:88                          PCI-DSS 6.2.4 · CWE-89
     88 │  cur.execute("SELECT * FROM txns WHERE id = %s" % uid)
     ↳ fix: parameterize_query

  ▲ HIGH      SIR-SEC-030  PAN written to application log
     src/webhooks.py:52                        PCI-DSS 3.4.1 · GDPR Art.5

  ────────────────────────────────────────────────────────────────
   Findings   ● 2 critical   ▲ 5 high   ■ 9 medium   ○ 3 low
   Secrets    1 verified-live · 1 inactive
   Money@risk ₹51,20,000        Compliance score  72/100  ▐███████▏
   Exit 1 · gate: fail-on=high → BLOCKED
  ────────────────────────────────────────────────────────────────
```

### `sirius fix SIR-SEC-001`

```
  ╭─ Cerebus fix · SIR-SEC-001 ──────────────────────────────────╮
  │ quarantined model → { action: env_lookup, target: api_key }  │
  │ diff builder      → template: env_lookup                     │
  │ verifier          → re-ran SIR-SEC-001 → ✓ PASS             │
  ╰──────────────────────────────────────────────────────────────╯

   src/config.py
   ─────────────────────────────────────────────
   14 │ - STRIPE_KEY = "sk_live_51H8xR2eZv…"
   14 │ + STRIPE_KEY = os.environ["STRIPE_API_KEY"]
       + .env.example  →  STRIPE_API_KEY=

   Apply this fix?   [y] accept   [n] skip   [e] edit   [a] all
```

### Component decomposition

**Scan view**

1. **`<Banner/>`** — rounded box `╭─╮│╰╯`, 2-space left indent, ~62 wide. Two lines: `sirius v{version}   ·   Sirius Compliance Scanner` and `project: {name}   ·   ruleset: {p/...} ({n} rules)`.
2. **`<ScanProgress/>`** — braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) + `Scanning {total} files ` + dot-leader run of `·` + right-aligned `{pct}%` + block bar `▐████████▏` with half-block caps. Driven by `progress`/`file.scanning`.
3. **`<FindingCard/>`** —
   - `<SeverityBadge/>`: glyph + padded uppercase severity, color from the token table
   - rule id + message
   - location line: `{file}:{line}` left, compliance refs right-aligned
   - `<CodeFrame/>`: `{lineno} │  {source}` — number gutter, `│` rule, two spaces
   - `<UnderlineAnnotation/>`: continuation gutter, then a `╰──` elbow column-aligned to the offending token, carrying `secret · ⚠ VERIFIED LIVE · ₹42,00,000 at risk`. **Alignment needs `col`, which is missing from the WS frame** — see [D-005](decisions.md)
   - `<FixHint/>`: `↳ fix: {action}` + optional `   run  sirius fix {RULE-ID}`
4. **`<Summary/>`** — `────` rules (~64 wide) around four rows: counters · secrets validity · money-at-risk + score meter · gate verdict.

**Fix view**

5. **`<CerebusPanel/>`** — rounded box with an inline title in the top border, exactly three `label → value` rows with labels padded to a common width. `✓ PASS` in `--success #04B575`. The `fail`/`escalated` branch is not mocked but must render.
6. **`<DiffView/>`** — filename header, `─────` rule, gutter-numbered `-`/`+` lines sharing a line number, plus an un-numbered addendum line for template side-effects (`+ .env.example → STRIPE_API_KEY=`).
7. **`<ApplyPrompt/>`** — `[y] accept  [n] skip  [e] edit  [a] all`. `[a]` ≡ `--all`; `[e]` behavior decided in [D-012](decisions.md).

---

## 6. Terminal behavior

Verbatim from the PRD: "Respect `NO_COLOR`, detect TTY (auto-switch to plain when piped), and honor `--json` machine mode."

- `NO_COLOR` env **and** `--no-color` flag
- TTY detection via `process.stdout.isTTY` → plain renderer when piped; **never** emit spinners or cursor escapes to a pipe
- `--json` forces machine mode and suppresses Ink entirely
- `--sarif <file>` writes a real file consumable by `github/codeql-action/upload-sarif@v3`
- `SIRIUS_ASCII=1` (our addition) swaps every box-drawing/braille/`₹` glyph for ASCII

**The plain renderer is a second, unmocked spec.** Every mockup is hard-coded to ~64 columns with right-aligned compliance refs. Decide the narrow/plain layout deliberately — one line per finding:

```
CRITICAL SIR-SEC-001 src/config.py:14 Hardcoded Stripe secret key [PCI-DSS:8.6.2]
```

Read `process.stdout.columns`; degrade below ~70.

**Frame throttling.** ~128 files stream past in the demo. Re-rendering the whole Ink tree per `file.scanning` frame is the known Ink performance sharp edge. Buffer frames and commit React state on a ~60–100ms tick; findings append to a `<Static>` region so only the progress row re-renders.

---

## 7. Distribution

From the PRD: `npm i -g sirius` · `brew install sirius` · `pipx install sirius` · `curl … | sh` single-binary · Docker `sirius/cli` · **`npx sirius scan` for a zero-install demo**.

Only npm/npx is in scope for the two-day build; it is also the demo path.

Distribution-adjacent artifacts the CLI feeds: `sirius/scan-action@v1` (GitHub Action), a GitLab CI template, and a pre-commit hook.

---

## 8. Demo obligations

The CLI owns **105 of the ~240 demo seconds**.

**Beat 2 — (60s) live scan.** "`sirius scan .` — streaming findings, color-coded, PCI/RBI/DPDP clauses, a **VERIFIED LIVE** Stripe test key with ₹ money-at-risk. **This is the wow moment.**"

Must hold up: time-to-first-finding <10s · the `⚠ VERIFIED LIVE` badge and `₹42,00,000 at risk` strings are what judges remember · every glyph survives the presentation terminal · `--replay` works with the network unplugged.

**Beat 3 — (45s) Cerebus fix.** "`sirius fix SIR-SEC-001` — show quarantined→diff→verifier PASS, accept the diff."

Must hold up: the three-line provenance panel renders even with the LLM down (deterministic templates + a cached suggestion per demo finding) · `✓ PASS` appears · `[y]` visibly writes the file · rule-id resolution works without a scan id.

Beat 4 (CI gate) runs this same CLI inside the Action with `severity_threshold: high`, `fail_on: verified-secrets`, `sarif: sirius.sarif`, `diff_aware: true`.

---

## 9. Known gaps

Beyond the twelve resolved in [`decisions.md`](decisions.md), these remain open and are deliberately deferred:

- **Output truncation** — the mockup shows 3 of 19 findings. How many render, ordered by what, and is there a `--limit`? Not stated.
- **Pagination reconciliation** — how `GET /scans/{id}/results` pages interact with findings already delivered over WS, and how duplicates are suppressed.
- **`baseline_state` is never rendered** despite `--fail-on new` depending on it.
- **Reconnect/resume semantics** — does a mid-scan WS reconnect replay findings from index 0?
- **Timeouts** — no default scan timeout, no `--timeout` flag.
- **`watch`** — debounce interval, ignore globs, full vs incremental re-scan, cancel-in-flight vs queue, exit behavior.
- **`triage` vs `fix` overlap** — the GUI keymap (`j/k` move, `a` accept, `d` dismiss, `f` fix, `s` suppress, `/` filter) is the model, but `PATCH …/findings/{fid}` maps to accept/dismiss/suppress states that have **no column in the `findings` DDL** (only `suppressed BOOLEAN`).
- **`report`** — where the file lands, and whether the CLI verifies the detached JWS locally. The PRD assigns live signature verification to the web dashboard, but it is a natural CLI beat.
- **`suppress`** — whether it writes server-side or to a local `.snyk`-style file, and how it interacts with `.siriusignore` and inline ignores.
- **`baseline set`** — from HEAD or a given sha, and where fingerprints are computed (must be server-side; the CLI has no engine).
- **Housekeeping commands** — no `version`, `doctor`, `completion`, `--verbose/--quiet/--debug` are specified.
- **Telemetry** — not mentioned at all. For a security tool the right answer is an explicit "none," and that should be stated rather than left silent.
