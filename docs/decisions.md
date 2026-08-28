# Decision log (ADRs)

Decisions taken while building the `cli` surface. Anything touching the shared contract is a **proposal to the `auto` branch owner**, not a unilateral change to shared truth — but it is what the CLI implements today so that work never stalls waiting for an answer.

---

## D-001 — CLI stack: Ink (TypeScript + React-for-terminal)

**Status:** accepted.

Chosen over the PRD's two stated alternatives.

| | Ink (chosen) | Python Rich/Textual | Go Bubble Tea |
|---|---|---|---|
| Mockup parity | Highest — the PRD's ANSI mockups are the agent-CLI idiom, and that idiom is Ink | Close; different default box glyphs | Precise, via Lip Gloss |
| Language unity | Diverges from the Python worker | **Single language with worker/Core** | Third language in the stack |
| Distribution | `npm`, **`npx sirius scan` zero-install demo**, Docker | `pipx`, Docker; no `npx` | Best single-binary story |
| Local toolchain | **Node v26.5.0, pnpm 11.18 ready** | **Python 3.9.6 system-only, no uv/pipx** | Go not installed |
| PRD support | §7 and §13 both name Ink explicitly | named as "acceptable fallback" | named as "the alternative" |

The deciding factors were the `npx` demo beat (only Ink gets it free) and that the Python path required installing a modern Python + packaging toolchain before hour one of a two-day build. The real cost accepted: the CLI is TypeScript while the worker is Python, so the client is generated from the OpenAPI spec rather than sharing Pydantic models.

Ink 7.1.1 requires Node ≥22 and React ≥19.2.0; both satisfied.

---

## D-002 — The CLI computes its own exit code

**Status:** accepted. **Contract impact:** `POST /scans` gains `severity_threshold` and `fail_on`.

The PRD has `scan.completed` carry a server-computed `exit_code`, but `--severity-threshold` and `--fail-on` are CLI flags and server-side `policies` rows also gate. Nobody owned the number.

The CLI sends both flags up, and computes its own exit code locally in `gate.ts` from the findings it received. The server's `exit_code` is a cross-check — a mismatch logs a warning, it does not change the result.

Rationale: the CLI must produce a correct exit code against the mock, offline, under `--replay`, and with `--json` piped. A pure local function is deterministic and unit-testable as a truth table; deferring to the server makes CI behavior depend on a service being right.

---

## D-003 — `--severity-threshold` and `--fail-on` are different axes

**Status:** accepted.

The PRD's mockup footer prints `gate: fail-on=high`, but `--fail-on` is documented as `<all|new|verified-secrets>` while severity levels belong to `--severity-threshold`. The mockup conflates two flags.

Resolution: `--severity-threshold` sets the **bar** (which severities count). `--fail-on` selects the **predicate** (all findings / only `baseline_state=new` / only `validity=verified_live`). The footer renders both honestly:

```
Exit 1 · gate: severity≥high, fail-on=verified-secrets → BLOCKED
```

Note `--fail-on`'s value set intentionally diverges from Snyk's own `all|upgradable|patchable` — sirius redefines it, and that is fine as long as it is consistent.

---

## D-004 — WebSocket auth

**Status:** accepted. **Contract impact:** documented in `openapi.yaml`.

The PRD specifies only the `4401` close code for WS auth failure, not how credentials are presented.

`Authorization: Bearer <key>` header on the upgrade request. `?token=` query-param fallback for browser clients, which cannot set headers on a WebSocket handshake.

---

## D-005 — `col` must be added to the `finding` WS frame

**Status:** proposed, with a fallback shipped.

The `╰──` underline annotation in the scan mockup points at a specific column of the offending line. `findings.col` exists in the DDL but is **absent from the WS `finding` frame schema**, so the CLI cannot align the elbow.

Requested: add `col` (and `end_line`) to the frame. Until then the CLI locates the matched token inside `snippet` by search, and degrades to a non-aligned annotation line if that fails. Never crash over it.

---

## D-006 — Severity → SARIF level mapping

**Status:** accepted.

SARIF 2.1.0 has three levels; sirius has five severities. The PRD never specifies the collapse.

| sirius | SARIF |
|---|---|
| `critical`, `high` | `error` |
| `medium` | `warning` |
| `low`, `info` | `note` |

`baseline_state` passes through unchanged — `new|unchanged|absent` are already SARIF's exact `baselineState` tokens, which is evidently why the DDL uses them.

---

## D-007 — Rule-id → finding resolution via a last-scan cache

**Status:** accepted.

The demo script invokes `sirius fix SIR-SEC-001` — a **rule id**, with no scan id — but the endpoint is `POST /scans/{id}/findings/{fid}/fix`, keyed by two UUIDs.

Every scan writes `.sirius/last-scan.json` (scan id, project id, and the finding index: id, rule id, file, line). `fix` resolves the rule id against it. Multiple findings for one rule → prompt to pick, or `--all` to walk them in order. `.sirius/` is gitignored.

---

## D-008 — Project id and source resolution

**Status:** accepted.

`POST /scans` requires `project_id`, but `sirius scan .` takes only a path.

Resolution order: `--project` flag → `sirius.yaml` → `SIRIUS_PROJECT_ID` → a clear error pointing at `sirius init`.

For getting code to the server, `source` defaults to `upload`: tar the working tree, filtered by `.siriusignore` and `.gitignore`, with a size cap and a progress line. Use `source: git` when the tree is clean and a remote is configured. (The PRD's §2.4 threat model requires path-traversal guards on uploaded archives — that is the server's job, but the CLI should not construct pathological archives either.)

---

## D-009 — `SIRIUS_API_URL` / `--api-url`

**Status:** accepted.

The plan requires the CLI to work against a mock from hour one and swap to the real Core later, but the PRD specifies no way to point it anywhere. `SIRIUS_API_URL` env var, `--api-url` flag override. Default is the production URL.

---

## D-010 — `--replay <fixture.jsonl>` is a first-class flag

**Status:** accepted.

The PRD's risk register prescribes "pre-scan the repo and replay" as the WebSocket-instability fallback but gives no affordance for it.

`--replay` reads a recorded JSONL frame timeline and drives the exact same renderer with no network at all. This is demo insurance *and* the deterministic test harness — **one fixture format, three consumers** (WS mock server, `--replay`, streaming tests).

---

## D-011 — `info` severity presentation

**Status:** accepted.

`info` exists in the DB enum but the mockup gives it no glyph, no color token, and no footer counter. Glyph `·`, color `--text-muted #8a8f98`, omitted from the footer counter row unless at least one is present.

---

## D-012 — `[e] edit` in the fix prompt

**Status:** accepted, with a defined degradation.

Behavior is unspecified in the PRD. Opens `$EDITOR` on the proposed patch, then re-submits the edited patch for verification before applying — the verifier, not the model, is the safety net, so an edited patch must be re-verified. If this proves fiddly inside the two-day window, it degrades to an explicit "not implemented" message rather than shipping half-working.

---

## D-013 — Fix application safety

**Status:** accepted.

Applying a diff is the only place the CLI mutates the user's files, so:

- Interactive confirmation by default; `--apply` for non-interactive, `--all --apply` as the CI form.
- **Never auto-apply** when `verifier_status` is `fail` or `escalated`. The PRD mocks only the `✓ PASS` branch; the failure branch gets a visible escalation state.
- The API returns a diff against a **snippet**, not the file. Re-locate the hunk by content, abort if the file changed since the scan, back up before writing.

---

## D-015 — Triage needs a state field the DDL does not have

**Status:** accepted. **Contract impact:** adds `TriageState`, `TriageUpdate`, and `PATCH /scans/{id}/findings/{fid}`.

The PRD lists a triage endpoint as "accept/dismiss/suppress" but never gives it a request body, and the `findings` table has only a `suppressed BOOLEAN` — which can represent one of those three verbs, not three.

Resolution: a `triage_state` enum of `open | accepted | dismissed | suppressed`, with `suppressed` derived from `triage_state == "suppressed"` so the existing boolean and the gate logic keep working unchanged. `reason` is required when moving to `dismissed` or `suppressed`; an optional `expires_at` mirrors the `.snyk`-style expiry already used by the suppressions table.

Why the distinction is worth having: `accepted` ("real, we will fix it") and `dismissed` ("false positive") are opposite judgements that a single boolean flattens into the same value. Losing that distinction destroys the audit trail a compliance tool exists to produce.

**Two behaviors decided alongside it:**

- **Triage decisions are optimistic in the UI** — the row updates immediately and rolls back if the PATCH fails, with the failure surfaced and the command exiting non-zero. Reviewing a hundred findings behind a spinner is not review.
- **`f` in triage prints the fix command rather than launching it.** Nesting one full-screen Ink app inside another reliably corrupts the terminal, and the demo cannot afford that.

---

## D-014 — Renamed from `finsec-lint` to `sirius`

**Status:** accepted. **Contract impact:** breaking, including rule IDs.

The product and the command are now **`sirius`**. The rename was taken all the way through, including the rule identifiers, in full knowledge that this diverges from [`original-prd.md`](original-prd.md).

| Was | Now |
|---|---|
| `finsec` (command, npm package) | `sirius` |
| `finsec-lint` (product) | `sirius` |
| `FIN-SEC-001` … `FIN-SEC-060` | `SIR-SEC-001` … `SIR-SEC-060` |
| `FIN_ERR_*` | `SIRIUS_ERR_*` |
| `FINSEC_*` env vars | `SIRIUS_*` |
| `finsec.yaml` | `sirius.yaml` |
| `.finseclintrc` | `.siriuslintrc` |
| `.finsecignore` | `.siriusignore` |
| `~/.config/finsec/config.toml` | `~/.config/sirius/config.toml` |
| `# finsec-ignore: FIN-SEC-010` | `# sirius-ignore: SIR-SEC-010` |
| `.finsec/` state dir | `.sirius/` |
| `X-FinSec-Signature` / `-Event` / `-Delivery` | `X-Sirius-Signature` / `-Event` / `-Delivery` |
| `finsec.dev` | `sirius.dev` |
| `finsecFingerprint` (SARIF) | `siriusFingerprint` |
| banner `finsec-lint · FinSec Compliance Scanner` | `sirius · Fintech Compliance Scanner` |

**Two things deliberately did not change.** The **numbering scheme** is untouched — still blocks of ten by category (`00x` secrets, `01x` injection, `02x` auth, `03x` pii, `04x` crypto, `05x` ratelimit, `06x` supplychain), so `SIR-SEC-010` is the same rule `FIN-SEC-010` was. And **compliance clause references are untouched**: PCI-DSS `8.6.2`, `6.2.4`, `8.4.2`, `3.4.1`, `3.5.1`, RBI DPSC, DPDP §8, GDPR Art.5 are external standards and have nothing to do with our branding.

**`original-prd.md` was left exactly as received** and still says `finsec-lint` throughout. It is the source research artifact; rewriting it would misrepresent what was actually delivered. Read it with this table in hand. It was renamed from `finsec-lint-prd.md` to `original-prd.md` so the filename does not carry a dead brand, but not one byte of its content was touched.

**The cost, stated plainly:** whoever owns `auto` is building the rule engine, the YAML rule catalog, and the Cerebus fix templates against `FIN-SEC-*`. Those IDs appear 137 times across the PRD, the rule catalog table, both ANSI mockups, and the demo script. This rename has to be communicated before that work hardens, or the CLI and the engine will disagree about every rule id. That is a coordination task, not a code task, and it is not done.

---

## D-016 — The shell draws its own text selection

**The bind.** A terminal cannot serve two masters with one mouse. Enable SGR
mouse reporting and the wheel scrolls the transcript, but the terminal stops
doing click-drag-to-copy, because every button event now belongs to us. Leave it
disabled and selection works natively, but the wheel scrolls the terminal's
empty scrollback instead of our transcript — the alternate screen has none.
Alternate scroll (`?1007h`) is the usual escape hatch, and it was tried; it did
not work in the terminal this is actually demoed in.

Both halves were shipped in turn and both were rejected in use, correctly: a
scroll wheel that does nothing and a terminal you cannot copy out of are each
broken in their own way.

**Resolution.** Capture the mouse *and* implement the selection. `?1002h`
(button-event tracking, which reports motion while a button is held) plus
`?1006h` (SGR coordinates). Press starts a selection, motion extends it, release
copies the range to the system clipboard and shows `copied N lines` in the
footer. The selection is rendered in inverse video, so it looks like a
selection. This is the same answer the mainstream agent CLIs reach, for the same reason.

**Consequences, including the unflattering ones.**

- Selection is **line-granular**, not character-granular. Dragging across part of
  a line copies the whole line. Character granularity is possible and is not
  built; the transcript is log output, and whole lines are what people paste.
- Copying needs an external tool: `pbcopy`, `wl-copy`, `xclip`, or `clip`. Where
  none exists the drag still highlights but cannot copy, and says so rather than
  failing silently. `sirius doctor` reports this as a warning up front.
- A click that never moves copies **nothing**. Clicking to focus a window must
  not overwrite whatever the user had on their clipboard.
- The terminal's own selection is still reachable by holding the modifier the
  terminal reserves for it (fn on Apple Terminal, Option in iTerm2), and
  `SIRIUS_NO_MOUSE=1` releases the mouse entirely.

**Two bugs this exposed, both worth keeping in mind.** The mouse regex captured
the button and the `M`/`m` flag but *not* the row — good enough for a wheel that
only needs a direction, useless for a drag, so every drag resolved to one line.
And a drag arrives as a burst of motion events that the terminal delivers in a
single stdin chunk, so handling only the first match of the chunk drops most of
the drag and most of the scroll. Both are pinned by `test/selection.test.tsx`.

**Verification.** The component tests drive real SGR byte sequences through real
stdin. They cannot prove a real terminal is put into drag reporting and taken
back out, so `pnpm probe:mouse` runs the shell under `script(1)` in a real pty,
performs a real drag, and asserts `?1002h`/`?1006h` go on, the drag copies,
nothing leaks into the prompt, and `?1002l`/`?1049l` restore on exit.

---

## D-017 — The local engine is paced, and the verdict comes last

**Found by rehearsing, not by testing.** A full-screen rehearsal of the demo
showed the scan jumping straight from the spinner to the attack paths. No
findings, no summary, no gate verdict — the two things the pitch is built on
were simply not on screen. Every test was green, because every test asserted on
strings the renderer *returned*, and the renderer was returning them correctly.

**Cause.** The hosted path streams over a WebSocket, so findings arrive spread
over time and a terminal paints between them. The local engine has no such gap:
on a three-file fixture it emits every frame in the same millisecond. The shell
buffers on a 60ms tick, so the whole scan landed in one flush, the viewport
painted once, and everything above the last screenful was scrolled past without
ever being drawn. It was all in the transcript, and all invisible.

**Fixes, in order of how much they matter.**

1. **Pace the local engine** (`engine/pace.ts`). ~260ms between findings, ~45ms
   for progress frames, ~90ms lead. Structural frames are not delayed — dead air
   that shows nothing new. This is not decoration: it restores the behaviour the
   streamed path gets for free. Off for `--json`, `--sarif`, pipes, and
   non-TTYs, so a CI run pays nothing; `SIRIUS_SCAN_PACE` overrides, `0` disables.
2. **Pace the threat report too.** It is written after the stream ends, so frame
   pacing does not cover it; a single write of twenty lines scrolled nineteen of
   them past. Emitted block by block, split on blank lines, because an attack
   path reads as a unit.
3. **Move the summary after the threat stage.** It is the conclusion — gate
   verdict, total at risk, what was actually scanned — and it was being printed
   before twenty lines of attack paths that pushed it off the top. The last
   thing on screen should be the thing the reader acts on. This exposed the
   mirror-image bug in piped output, where the threat report then preceded the
   findings it names by rule id, so the findings list was split out
   (`renderFindingList`) and printed first.

**Wrapping, same rehearsal.** `basis`, `anchor`, and the `--validate-secrets`
note were single unwrapped lines and were being cut with an ellipsis at the
right edge — losing, respectively, the reasoning behind a rupee figure, its
public anchor, and the name of the flag being recommended. Those are the lines a
reader stops on. One shared `wrapText` now lives in `src/wrap.ts`; the three
private copies that had accumulated are gone. The `Scanned` path is elided from
the **left**, since `/Applications/Sanjay/personal/…` is the half that carries
no information.

**The lesson, again.** This is the fifth defect here that a green suite did not
see, and it has the same shape as the other four: the code was right and the
experience was broken. `scripts/rehearse.sh` now drives the shell in a real pty
and prints the transcript, so "run it and look at it" is one command.

---

## D-018 — Response runs locally, and the panel does not claim a model ran

**`sirius fix` did not work.** Not "worked against a backend nobody has" —
did not work at all. The local engine saves its scan with the id `replay`, and
`fix` rejected `replay` outright, so the default configuration could never reach
the Response stage. The demo's second beat, and the *Response* leg the track
requires, existed only on paper.

**A local fix builder** (`engine/fix.ts`) now produces the same `FixSuggestion`
shape the API returns, so the panel, diff view, apply prompt and verifier gate
are one code path and cannot drift. Four templates: `env_lookup`,
`parameterize_query` (percent, `.format`, and f-strings), `redact_pii_log`,
`add_auth_decorator`. Every template rewrites exactly one line and returns
nothing when it does not recognise what it was handed — a wrong patch to
money-handling code is worse than no patch.

**What is real and what is not, stated in the panel.** The PRD's Cerebus is a
dual-LLM design. No LLM runs here, so the first stage is labelled `template
selector`, not `quarantined model`. Printing a model name that never ran, in a
panel whose entire purpose is showing the provenance of an edit to someone's
payment code, would be the one lie this product cannot afford.

**The verifier, however, is entirely real, and it earns its keep.** The patch is
applied in memory, the file re-parsed (`parseSource`), and the *same rule*
re-run. `✓ PASS` means the rule no longer fires. It immediately caught a bad
template: `redact_pii_log` wrapped the format string rather than the data —
`log.info(redact("card %s", card.get("number")))` — which reads as a fix and
redacts nothing. It also exposed a **rule** bug: SIR-SEC-030 had no exemption
for redaction, so it could never be satisfied by its own remediation. SIR-SEC-031
already had the equivalent check; 030 now does too.

**Two bugs in how `fix` finds its scan.**

1. `scan <path>` writes the cache *inside the target*; `fix` looked only in the
   working directory. The documented two-command sequence failed outright.
2. Fixing that naively made it worse. Searching for the newest cache below the
   cwd found a scan in a directory nobody had named — and `fix` **rewrote the
   source files there**. A rehearsal caught it modifying the committed fixtures.
   The guard is not a better search: an explicit `--target` wins, the shell
   passes the path it actually scanned, and a search is announced as a search
   before anything is written.

**Interactive children cannot prompt.** The full-screen shell spawns commands
with `stdio: ['ignore', …]`, so the apply prompt inside `/fix` could never
receive a keystroke — it hung, and the `y` went into the shell's own input box.
`fix --dry-run` renders the proposal and stops; the shell asks
`apply this fix? [y/N]` itself and re-runs with `--apply`. Deterministic
templates mean the second run rebuilds the identical patch.

---

## D-019 — Fixes speak the project's vocabulary; validation reads the file

Two loose ends from D-018, both of which turned out to be worse than "weak".

### `add_auth_decorator` was three bugs, not one

It inserted `@require_auth` unconditionally. In increasing order of severity:

1. A project without `require_auth` gets a file that fails at import.
2. The rule's own pattern matches `requires_auth`, **not** `require_auth`, so
   the fix could not clear the finding it claimed to fix. The verifier caught
   this and reported `fail` — which is the guardrail working, but a fix that can
   never pass should not be offered at all.
3. It placed the decorator **above** the routing decorator. Decorators apply
   bottom-up, so `@login_required` above `@bp.route` means the router registers
   the *undecorated* function and the authentication never runs. A security fix
   that silently disables the protection it advertises is the worst thing in
   this codebase to date.

Now: `engine/conventions.ts` finds the decorator the project already uses and
the import that provides it; the fix declines outright when there is none,
saying so ("adding authentication here is a design decision"); and the decorator
goes immediately above the definition, inside every routing decorator, which is
also how the project's own authenticated routes are written.

**A fourth bug fell out of fixing those.** The verifier validated the patched
source *including* the added imports, but only the diff hunk was written to
disk — so the `✓ PASS` was earned by code that never reached the file. The local
path now writes the exact text that was verified, after checking the file has
not changed since. Applied and verified are the same bytes or nothing happens.

### `--validate-secrets` could never verify anything

It probed `finding.snippet`, which is **redacted** — `sk_live_51H8…` — because a
finding is rendered, logged, and written to SARIF, and a full credential must
not travel through any of those. Every probe therefore saw a truncated literal
and returned `unknown`, reported as "no verdict", which reads like the
provider's fault rather than ours.

Validation now reads the credential from the file at the finding's line, uses it
once against the provider's own read-only endpoint, and never returns it. It
also runs **while findings stream** rather than in the threat stage afterwards,
because `⚠ VERIFIED LIVE` belongs on the line naming the file, not in a footnote
twenty lines below it.

**And the figure now follows the verdict.** A credential the provider has just
refused is not worth its transaction ceiling: ×0.15, leaving disclosure and
rotation, never zero — the key was still published and is still in the history.
On the demo fixture this reads honestly as ₹42,00,000 unchecked → ₹6,30,000
once Stripe refuses it, and that drop is a better story than a staged green tick.

**On demoing `VERIFIED LIVE`.** The fixture key is fake, so the honest output is
`not accepted`. A real Stripe **test** key (`sk_test_…`) matches the same probe
and returns a genuine `verified_live` against `/v1/balance`; supply one at demo
time if that beat is wanted. Nothing in the repo fakes it, and the tests inject
the provider at the fetch boundary rather than carrying a credential — a test
suite that shipped a real key to make itself pass would have recreated the exact
problem this tool exists to find.

---

## D-020 — The rest of the commands run without a backend

A sweep of every command with no API running, prompted by `fix` and
`--validate-secrets` both turning out to be dead. Four more were: `rules`,
`baseline`, `suppress`, and `report`. All had the same cause — written when the
CLI was a pure client, never revisited when the local engine landed and became
the default. The status table called them all Done.

**`rules list|show`** now answers from the compiled catalogue
(`engine/catalog.ts`). A compliance linter that cannot say what it checks for,
or which clause each check maps to, is asking to be taken on faith. `show`
prints no `yaml_body` and invents none: the PRD's rules are YAML documents,
these are compiled AST matchers, and it says so. `validate` and `test` still
need the API and still say so.

**`baseline` and `suppress`** now write to `.sirius/` beside the code —
reviewable in a pull request, which is where an exception granted to a security
finding ought to be argued. The old comment said fingerprints were "computed
server-side — the CLI has no engine"; it has one, and it is what produces them.

This exposed the real gap: the gate already knew how to act on `baseline_state`
and the renderers knew how to show it, but **nothing ever set it**. So
`baseline set` recorded a floor no scan read, and `--fail-on new` blocked on
findings that were not new. `engine/policy.ts` bridges it as a stream
transformer — suppressed findings are withheld *before* rendering, because a
finding that is printed and then silently uncounted is the worst of both. The
adoption story works end to end now: six known findings pass, a new leak blocks.

Two safety choices worth stating. A suppression with several fields set must
match on **all** of them — OR-ing them would make `--path tests/**` silence a
rule everywhere. And an entry with no criteria matches nothing rather than
everything.

**`report` is now genuinely signed.** It previously downloaded a report and, on
finding a signature, printed that it had *not* checked it — no public key was
published anywhere. A signature nobody can verify is decoration. It is now
built from the last scan, signed ed25519 with a key at `~/.config/sirius/`
(0600, generated on first use), and `sirius report --verify` checks it: exit 0
clean, 1 modified, 2 unusable — which is a CI gate. The verify output states
what it proves (unmodified since signing) and what it does not (identity —
the key travels inside the file, so pin `key_id`).

The scan cache had to grow to support this: it held only what `fix` needed to
resolve a rule id, so a report built from it was silently stripped of messages,
clause references and figures. `schema_version` went to 2 so a stale cache is
rejected rather than producing an empty compliance document.

## D-021 — `triage` runs on a local scan, and `doctor` stops crying wolf

Two commands were still written for the pure-client era, and running them with
no API showed it.

**`triage` refused to open.** With no project configured it found the local
scan, saw `scan_id: "replay"`, and said "the last scan was a replay, so there is
nothing on the server to triage". It was not a replay — local scans were simply
*filed* under that sentinel. They now get a real id, `local-<12 hex>`, prefixed
so anything printing it (a report filename, `doctor`, a support paste) says at a
glance that no server issued it. Every check that keyed off the sentinel now
reads `source` instead. That included `fix`, whose `const local = cache.scan_id
=== 'replay'` sent it to the API the moment the id changed — caught by the pty
rehearsal, not by the suite.

**Triage now has two backends and one screen.** Hosted: PATCH per decision, as
before. Local: decisions go to `.sirius/triage.json`, and `dismissed` and
`suppressed` *also* write a suppression, scoped to the fingerprint when there is
one and otherwise to that file — never the rule across the repo. `accepted` is
recorded and silences nothing, because an acknowledged risk is still a risk and
must keep failing the gate. Without that second write the screen would record a
judgement nothing ever reads, which is the same fault in a new place.

**The completion frame was still counting what the policy withheld.**
Suppressing a critical removed it from the list and left it in every total: the
headline counts, the money figure, and the compliance score — the one number a
pipeline might gate on. `applyPolicy` now corrects the frame as it passes,
recomputing the score through the same function the engine uses rather than
subtracting a penalty, since it is not linear in the counts.

**`.sirius/` carries two kinds of thing**, so a `.gitignore` is written into it
on first use: the baseline, suppressions and triage decisions are arguments a
team makes about its own risk and belong in review; `last-scan.json` is a
per-machine cache and does not.

**`doctor` ended "4 problems would stop a scan"** on a machine that scans
perfectly well — missing credentials, no project id, an unreachable API and a
dead WebSocket, none of which a local scan touches. Those are now stated as
facts, not failures, and only checked as failures when a project is configured.
It probes the local engine instead: parse a known-bad snippet, run the rules,
assert one fires. That path is WASM loaded at runtime, so a bad install fails at
the first parse — previously mid-demo. Skipping the two network probes when
nothing is configured also took the command from 13s to 0.08s.

---

## D-022 — Authoring a rule, and publishing a badge, without a backend

The three commands left over from the sweep, plus the config knob that turned
out to be wired to nothing.

**`rules validate` posted the file to the API** to be told whether
`severity: hgih` is a typo. Almost everything worth checking about a rule is a
convention this repo owns: the `SIR-SEC-NNN` numbering blocks, the category and
severity vocabularies, the fix-action list, and the PCI-DSS clause numbers v4.0
retired. `engine/rule-schema.ts` checks those here, in the same second the file
is saved. Two checks are not conventions but safety: a `validity_check` must be
`GET`/`HEAD` over TLS, because it calls a third party with someone's leaked
credential and a `POST` could move money with the key it is testing.

Invalid now exits **1**, not 2. A rule file with a typo is the answer to the
question asked, the same way findings are; exit 2 is the CLI itself failing, and
a pipeline that cannot tell those apart treats a typo as a broken agent. The
output states what was checked and what was not: whether a pattern matches what
its author thinks is semantics, and that still needs a rule engine. When a
project is configured the server is asked as well and its errors are merged.

**`badge` required an account** for the one artefact a README wants. It now
draws the SVG from the last scan's score — Shields' flat style, written out by
hand because a badge is forty lines of markup, plus the Shields endpoint JSON so
a team can get Shields' own rendering of the same three fields. A committed
badge is also more honest than a hosted one: it changes only when someone scans
and commits, so it cannot claim a score for code that was never scanned.

That needed the score, which the cache did not hold — so `schema_version` is now
**3** with a `summary` block: counts, money, compliance score, files scanned, as
the scan reported them. Cached rather than recomputed, so the badge and the
signed report show the figure the developer saw. Which also closed a hole: the
signed compliance report had no compliance score in it at all.

**`rulesets:` was scaffolded into every `sirius.yaml` and read by nobody.** The
local engine ran all twelve rules whatever it said, and `--ruleset` was accepted
and dropped on the floor by both `scan` and `rules list` (literally
`(!flags.ruleset || true)`). It errs toward noise rather than silence, which is
why no missing finding ever caught it. The PRD names `p/fintech-core` and
`p/secrets` without defining membership, so: the core set is everything, and
`p/<category>` selects one category. An unknown name is an error listing what
exists — a ruleset that quietly means "all rules" is how a team believes it
narrowed a scan it did not.

**`sirius init` no longer tells you to go get a project id** before your first
scan. Scans run locally; hosted history is a later choice.

**And one found by the sweep itself: `sirius rules list | head -1` ended in a
Node stack trace.** The reader closes the pipe, the next write fails with
EPIPE, and an unhandled stream error takes the process down loudly — reachable
from nearly every command, since they all write more than one line. Handled at
the entry point now. The test drives a real shell pipeline, because building
one inside the test process proves nothing: the test process then holds the
CLI's stdout open and EPIPE never happens. It was written passing against the
broken code before it was written passing against the fix.

---

## D-023 — A second surface: money at risk in operations, not only in code

The scanner reads code. This reads what the code did — failed payments,
abandoned checkouts, ageing receivables, and three sets of books that disagree.
Same CLI, same vocabulary, no backend. Design and findings in
[`docs/revenue.md`](revenue.md); the decisions worth recording here are the ones
that were tempting to get wrong.

**The target is uplift, not recovery.** `recoverable AND NOT self_heals`. A
payment the customer would have retried tomorrow is not revenue anybody
recovered, and a model trained on recovery learns to chase precisely those
because they are the easiest positives in the data. Everything downstream
follows: the counterfactual is computed up front on the same records, and
"would have arrived anyway" is subtracted from the headline rather than
mentioned in a footnote.

**Labels live in a separate file.** `records.jsonl` for the detector,
`truth.jsonl` for the scorer. Leakage is structurally impossible rather than a
matter of discipline, which is the only version that still holds a month later.

**Capacity, not cost, sets the operating point.** With an SMS at ₹0.18 and a
recovery worth ₹2,000, expected value says chase everything — arithmetically
correct, operationally impossible, and the behaviour that gets a merchant's
retry privileges revoked. Records are chosen by expected value under a cap.

**The comparison is capacity-matched, and the model does not win it.** Across
eight seeds, expected-value ranking runs level with sorting by amount: +0.3% at
20% capacity. When amounts span a hundredfold and probabilities span threefold,
size is already most of the answer. The report says so. What the policies do not
share is the forbidden-touches column — the heuristics retry fraud rings and
message customers with open disputes; the agent touches none. That column was
added because the evaluation caught the *agent* retrying a `risk_block`: a low
probability is not a prohibition.

**Naive Bayes, and told so.** Chosen because every step prints as a sentence
somebody can disagree with. It is overconfident, so a two-parameter Platt shrink
is fitted on train and the calibration table reports what is left.

**Refusing is a first-class action.** Executed, blocked and skipped all produce
audit entries. The trail is hash-chained and the head is ed25519-signed with the
same key as compliance reports; alteration, deletion, reordering and appending
are each caught and named. It says the run was simulated, and there is no
`--execute` — an agent that can spend real money needs more than a flag.

**Stopping rules are data, with their basis attached**, at framework level
(NPCI, TRAI, DPDP §6) and never invented clause numbers. They are configured
policy, not legal advice, and the numbers are a compliance team's to change.

**Reconciliation reports three numbers, never one.** Match rate, value-weighted
match rate, and — where the true links exist — how many pairings were *correct*.
A match rate alone rewards pairing things off boldly. Real books have no answer
key and the report says so instead of inventing the one figure nobody can check.

**Institutions are fictional; rails are not.** UPI, NACH and their failure modes
are real infrastructure. Generating outage records against a real gateway's name
would produce a document that reads as a claim about that company.

---

## D-024 — Severity is blast radius, not pattern confidence

A hardcoded `sk_test_` key was rated **critical** and priced at **₹40,000**. Both
halves came from the same finding, and they disagreed by two orders of
magnitude: the exposure model already weighted test mode at ×0.01 (`test mode
moves no real money; flagged for hygiene`), while the rule gave every provider
pattern the rule's own severity.

Severity is what the gate acts on, so `--severity-threshold high` failed a build
over a test fixture exactly as hard as over a credential that can move ₹42 lakh.
That is not a strict linter, it is one that gets switched off in a week.

Test-mode patterns are now marked, rated `medium`, and say so in the message
("test mode, so no money moves, but it is still a credential in source"). It is
still a finding — PCI-DSS 8.6.2 does not carve out an exception for the
credentials that are inconvenient to rotate. `Razorpay key` was one pattern
matching both `rzp_live_` and `rzp_test_`, so a test key there was priced as a
money-mover; it is now two patterns with two weights.

**The demo's `⚠ VERIFIED LIVE` badge follows from the same honesty.** The
fixture's key is a non-functional placeholder, so validation asks Stripe, is
told no, and reports `inactive` — the tool working, and the headline badge never
appearing. `pnpm rehearse` now stages a real Stripe **test** key from
`SIRIUS_DEMO_STRIPE_KEY` into the temp copy and turns validation on, then
reports whether the badge fired. Three properties matter:

- the key never touches the repo, only the staged copy that is deleted after;
- an `sk_live_` value is **refused with exit 2** — the script sends whatever it
  is given to Stripe, and that is not a thing to do with a key that moves money;
- nothing is overstated, because test mode is already priced at a hundredth. The
  badge means exactly what it says: this credential is accepted right now.

A faked badge would have been easier and would have made every other number on
the screen worth less.

---

## D-025 — A limit nobody can set is not policy

Every stopping rule in the recovery agent was documented as "configured policy,
not legal advice — the numbers are a compliance team's to change", and the only
way to change one was to edit `policy.ts`. That is a constant with a good
comment.

`sirius.yaml` grew a `revenue:` block: capacity, budget, quiet hours and their
timezone, contacts per day, retry and re-presentment caps, cooldowns, the
circuit breaker, and the cost model including the annoyance charge. Every field
optional, so an existing file keeps working and a team pins only the numbers it
argues about. Rupees in the file, paise in the engine. Bounds are enforced when
the file is read, naming the file, rather than clamped three layers down.

Two consequences that were not obvious until the feature existed:

**A run under someone's policy says so.** The banner names what moved
(`contacts/day 1 · quiet hours {"from":20,"to":10}`). Obeying a config file
silently is how a number nobody remembers setting ends up explaining a result
nobody expected.

**The rules had to stop reciting the defaults.** With a static `RULES` table, a
run under `contacts_per_day: 1` refused an action and explained it with "at most
two messages to one party in a rolling day" — the report contradicting the
policy it had just enforced, and worse, writing that contradiction into
`rule_says` in the audit trail, which is the sentence an auditor reads months
later. `rulesFor(limits)` interpolates the numbers in force; the table is
memoised per limits object because `check` runs per proposed action.

What is **not** configurable is the `basis`. A project sets its threshold; it
does not get to edit the obligation the threshold answers to.

---

## D-026 — One batch is an anecdote

`revenue sweep` exists because its absence was felt three times. Every model
change during development needed the same answer — is it better, and on how many
batches — and each time that meant writing a throwaway script. A tool whose
author keeps improvising the same measurement is a tool missing a command.

**The rows are the point, not the mean.** A mean edge of +2.0% built from eight
agreeing batches is a different claim from the same mean built from five wins
and three losses. The table prints both, and says so out loud when they
disagree.

**`--against` reports what got worse.** Tightening capacity to 5% buys +2.2pp of
edge over the heuristics and costs 19.7pp of recall; the summary line reads "1
better, 5 worse" rather than leading with the improvement. Measures where lower
is better — calibration error, forbidden touches — are marked, because a table
where every arrow means the same thing will eventually be read wrong.

**It refuses to compare two different experiments.** Runs over different seeds
or different batch sizes still print their deltas, above a warning saying the
difference is not a comparison. Silently subtracting them would produce a number
that reads exactly like a result, which is the dangerous kind of wrong.

This is also the answer to a problem this repo hit twice in one session: figures
in `docs/revenue.md` and in the published artifact were transcribed by hand from
a terminal and went stale as soon as the model changed. A sweep is
`--json`-able and reproducible from a seed, so the numbers can be regenerated
rather than remembered.

---

---

## Blocked on the `auto` branch

Not ours to decide. Tracked here so no one re-derives them.

1. **Compliance-score formula.** Arrives as `72.5`, renders `72/100`. Severity-weighted? Category coverage? Both the CLI footer meter and the web gauge depend on it.
2. **Fingerprint algorithm.** Drives baseline diffing, dedup, and suppression matching across all four surfaces. Presumably rule id + path + normalized snippet hash, deliberately line-number-insensitive — but it must be defined once, server-side.
3. **Money-at-risk model.** Explicitly a heuristic table per the PRD, but no table, no per-rule multipliers, and only one `money_at_risk_model` value (`provider_key`) is named.
4. **The K/S auth contradiction.** `PATCH /scans/{id}/findings/{fid}` (triage), `GET/POST /rules`, `POST /rules/validate`, `GET/POST /suppressions`, `GET/POST /baselines`, and `GET/PUT /projects/{id}/policy` are marked **S = session/JWT only**, but `sirius triage`, `suppress`, `baseline`, and `rules` are CLI commands authenticating with **K = Bearer API key**. As specified, those commands cannot work in CI. Either those endpoints accept `K`, or the command tree is wrong.
5. **Device-flow endpoints.** `login` is specified as "OAuth device flow" but no `/auth/device/code` or `/auth/device/token` endpoints exist in the API table. Also unstated: the `config.toml` schema, the env var name for an API key in CI, and profile support.
6. **`rules test`** has no backing endpoint and would require either a local engine (violating the golden rule) or a new endpoint.
7. **Pagination convention** for `GET /scans/{id}/results` and `GET /scans` — cursor vs offset, param names, envelope shape — and how paginated results reconcile with findings already delivered over WebSocket.
## D-027 — Supply chain reads manifests, and says what it actually saw

`SIR-SEC-060` was in the PRD's rule table and in `demo.jsonl` and in no build.
`--replay` streamed a supply-chain finding a live scan could not produce.

**It is the one rule that does not walk an AST.** Everything else in the engine
is tree-sitter, because that is the whole claim to a low false-positive rate.
`requirements.txt` is a line format and `package.json` is data; neither has a
tree worth walking, so supply chain gets its own narrow path rather than a fake
one. Secrets already make this concession, for the same reason — a credential is
a lexical fact, and so is a dependency declaration.

**It reports what a manifest states about itself, not what the rule is called.**
The PRD's name is "dependency with install script/obfuscation", and knowing
whether a *dependency* runs an install script means fetching that package's
manifest from the registry. A scan makes no network calls. So the rule names the
three facts it can actually establish offline — an install hook in the project's
own manifest, a dependency resolved from outside the registry, and a floating
range — and each finding says which one it saw.

**A floating range is only a finding when nothing pins it.** `^4.17.21` under a
lockfile resolves to one version with an integrity hash; the same line without
one resolves to whatever the registry serves that morning. Without this gate the
rule flags every caret in every `package.json` it ever sees, which is not a
detector, it is a migration.

The lockfile is searched for *up* the tree, stopping at `.git`. A pnpm or yarn
workspace keeps one lockfile at the root and a `package.json` per package, so
checking only the sibling directory calls every package in every monorepo
unlocked. pip records integrity inline, so `--hash=` is that ecosystem's lock.

**`package.json` is parsed as JSON, not scanned as lines.** The line-oriented
version reported `"sirius": "./dist/cli.js"` under `bin` as a dependency
resolved outside the registry, on this repository. A `"key": "value"` pair looks
identical everywhere in a JSON file and only its position says what it means. A
manifest that will not parse produces no findings at all: a broken
`package.json` is the build's problem, and guessing at one from half a file is
how a scanner loses trust.

**Severity is per finding, not per rule.** An install hook and a non-registry
dependency are `high`; a floating pin is `low`, priced through the exposure
model at `local` reachability rather than by writing a smaller number inline.
The demo replay shows `SIR-SEC-060` as `low`, the PRD's table says `high`, and
both are right about different instances of it.

---

## D-028 — Every rule gets one example, on disk

Six rules had no example anywhere. Nothing in any fixture tripped
`SIR-SEC-002`, `011`, `021`, `031`, `040` or `041`, so they shipped, were unit
tested against hand-written snippets, and were never once run end to end against
a file. That is the same shape as the seven features listed Done while being
unreachable, and it hid for the same reason: a rule that fires in the test
asserting it looks exactly like a rule that works.

`contract/fixtures/rule-gallery/` plants one of each. **It is a second fixture,
not an extension of the demo one.** `chaos-repo` has three planted findings at
line numbers that `demo.jsonl`, `smoke.mjs` and the handoff doc all reference,
and a footer figure of ₹89,30,000 the demo narration is built around. Adding six
findings to it to improve coverage would have renegotiated a beat that has to
survive a stage, in exchange for something a separate directory gives for free.

**Every planted flaw sits beside a correct counterpart doing the same job** —
bound parameters next to formatted SQL, a verified JWT next to an unverified
one, a truncated PAN next to a full one. The test asserts the exact lines, so a
rule that starts flagging the correct version fails the build. A fixture of pure
positives can only ever measure recall.

Pointed at the engine once, it found three defects:

- **`SIR-SEC-021` matched `verify=False` only.** PyJWT's documented way to skip
  verification is `options={"verify_signature": False}` — a dict key, so the
  name is followed by a quote before the colon. The rule missed the spelling
  almost every real codebase uses, which is to say it missed the vulnerability.
- **`SIR-SEC-030` flagged `card["number"][-4:]`.** PCI-DSS 3.3.1 explicitly
  permits the first six and last four digits. Telling a team doing exactly the
  right thing that it is leaking a PAN is the false positive that gets a linter
  switched off, and it was sitting in the fixture as a deliberate true negative.
- **`SIR-SEC-031` counted one flaw twice.** A class-body assignment matched both
  as the assignment and as the statement wrapping it: two findings sharing one
  fingerprint, doubled in the counts and in the money, and collapsing back to a
  single row in every baseline. Findings are now deduplicated by fingerprint in
  the scanner, because that is what a fingerprint means.

**A test now fails if the replay claims a rule the engine does not ship.** That
is the check that would have caught `SIR-SEC-060` on the day it appeared. The
reverse is not asserted: the replay describes a sixteen-file fictional
repository and need not exhaust the catalogue.

---
## D-029 — Logistic regression, because naming interactions broke naive Bayes

The detector was naive Bayes on odds: a prior, one likelihood ratio per feature,
contributions summed as though the features were independent. They are not.
`rail` and `failure_code` are strongly correlated — a NACH mandate fails for
different reasons than a card does — so the same fact was counted twice.

**Amount was not a feature at all.** Ten categorical features, none of them the
amount, so the predicted probability was independent of how much the record was
for. Expected value is probability × amount × share, so ranking by expected
value collapsed toward ranking by amount, and the model agreed with the
spreadsheet heuristic because nothing in it could disagree.

**Naming the interactions made naive Bayes worse, not better.** Adding
`failure×rail` alongside `failure` and `rail` makes it count one correlated fact
three times. That is what forced the estimator change rather than a preference
for a fashionable model: logistic regression learns one joint set of
coefficients, so a correlated pair shares the weight instead of each claiming
all of it.

**Nothing downstream changed.** A coefficient is a contribution to the log-odds,
exactly as log(likelihood ratio) was, so `exp(coefficient)` goes into the same
`lr` field, `scoreRecord` sums the same logs, and the evidence ladder still
reads `failure=psp_degraded ×4.2`. The model stayed as legible as it was.

**The first logistic version was worse than what it replaced** — +10.1% at 3%
capacity against naive Bayes's +24.5% — and the diagnosis was three separate
mistakes, all of them visible in the fitted model rather than guessed at:

- L2 was chosen against a single held-in fifth. A few dozen rows scoring six
  candidates picks whichever one that fifth happened to like; it landed on 0.1,
  the second-heaviest shrinkage in the grid, and flattened the strongest weight
  in the model to ×1.19 — flat enough that expected value collapsed onto amount
  again. Four folds fixed it.
- Plain gradient descent is the wrong optimiser for one-hot features whose
  frequencies differ by two orders of magnitude. AdaGrad gives each feature its
  own effective step.
- It stopped on a loss delta, which a small step satisfies whether or not the
  fit is anywhere near the optimum. It reported "converged" at 301 iterations.
  Stopping on the gradient norm fixed it, and then large batches turned out to
  need six thousand iterations rather than two.

**Calibration is now kept only when it helps.** Platt scaling was a clear win
over naive Bayes, which is reliably overconfident. A regularised logistic fit
arrives close to calibrated, and a second sigmoid on top made held-out
calibration error *worse*: 8.9% against 6.6%. The fitted curve is scored against
the identity on rows outside the calibration fit, and the identity wins when
Platt has not earned its place.

The first version of that check scored both on a fifth of the rows the curve had
been fitted to, which picks the fitted curve every time and changed nothing at
all. A validation fold that was part of the fit is not a validation fold.

**The honest ledger.** Better at four capacities of five (+22.9% vs +20.4% at
3%, +10.2% vs +7.7% at 5%, +1.5% vs +1.1% at 20%, +1.2% vs +0.9% at 40%), better
calibrated across seeds (6.2% vs 7.7%), worse at 10% capacity (+2.1% vs +3.2%),
and worse on the single headline batch — ₹16,425 of net and four points of
precision. The sweep is the measurement and the batch is the anecdote (D-026),
so this ships; the anecdote is printed beside it rather than dropped.

One temptation refused: an earlier, *unconverged* fit scored higher on the sweep
than the converged one (+27.0% against +22.9% at 3% capacity) — early stopping
acting as extra regularisation. Keeping it would have been choosing a training
hyperparameter by its score on the held-out metric, which is the thing this
whole surface exists to not do.

---
## D-030 — Injection is a dataflow question, not a shape

The injection rules matched a shape: an interpolation inside the argument of an
`execute` call. That shape is neither necessary nor sufficient, and both halves
were demonstrable in four lines of ordinary Flask.

**It missed the ordinary spelling.** Real injection is written across
statements, and there is nothing to match at the sink:

```python
account = request.args["account"]
q = "SELECT … WHERE account = '%s'" % account
cur.execute(q)                                  # ← no interpolation here
```

**And it fired where nothing untrusted could reach.**
`cur.execute(f"SELECT count(*) FROM {TABLE}")` was reported as attacker-
controlled SQL on a line where the only name is a module constant.

`engine/taint.ts` answers the actual question — does a value the attacker
controls reach this call — with the smallest analysis that can: intra-
procedural, flow-ordered, over assignments within a file. Sources are
request-shaped (`request.args`, `req.body`, `sys.argv`, stdin). `os.environ` is
deliberately not a source: an environment variable is operator input, and
treating deployment configuration as hostile flags every correct application.

**The direction of caution is the design.** The analysis *adds* proof where it
can and never withdraws a finding for lack of it. It cannot follow a value into
another function, through a container, or across a file, so "no path found" is a
limit of the pass and not a certificate. A finding with a proven path is
upgraded — message, `tainted` tag, and the hops rendered under the code frame —
and a finding without one stands exactly as it did. An injection scanner that
goes quiet when it cannot prove harm is worse than one that never looked.

The single exception is narrow and stated: a name bound **once, at module level,
to a literal** is a constant, and interpolating it is not a finding. Bound twice,
it is a variable again and the finding returns.

**`Finding` gains `taint`**, a nullable string: the source, then each assignment
the value passed through, in order. Same treatment as `col` and `triage_state`
(§3 of the handoff) — added to `contract/openapi.yaml` first, so the field the
CLI renders is a field the Core API can populate. Its absence is documented in
the schema as *not* a claim of safety, because a consumer reading a null there
would otherwise be entitled to assume one.

What it buys, on the gallery fixture: the three-statement injection that was
previously invisible is caught and traced, and the module-constant query that
was previously a critical finding is gone. The demo fixture's totals do not
move — ₹89,30,000, score 60 — because the chaos repo's injection was already
matched on shape and is matched still.

---
## D-031 — The handover waits for the unmount instead of guessing at it

`/triage` and `/watch` draw their own full-screen UI, so the shell unmounts,
gives them the real terminal, and takes it back when they exit. The unmount was
followed by `setTimeout(30)`, with a comment saying it was one tick for Ink to
restore raw mode and detach its stdin listener.

Ink's teardown is asynchronous and takes as long as it takes. On a loaded
machine, or after a session with real scrollback behind it, thirty milliseconds
is not enough — so the child started while the parent still held stdin in raw
mode with a listener attached, both processes read the same descriptor, and when
the parent's teardown finally ran it paused the stream underneath the running
child.

**Every symptom followed from that, including the ones that made it hard to
find.** It was intermittent because it was a race against a fixed guess. The
shell kept painting perfectly, because painting never depended on stdin — only
reading did. It ignored end-of-input, because a paused stream never emits
`end`. And it grew more likely in longer sessions, not because rendering a large
transcript is slow (it is not: mounting with two thousand lines costs 8.5ms) but
because more transcript means more teardown, which widens the window.

Two hypotheses were measured and discarded before this one, and both are worth
recording so nobody spends the afternoon on them again: transcript length is not
the cost, and Ink is not handing back a torn-down renderer — its "render() was
called again" warning appears in none of the failing transcripts.

The fix is to stop guessing. `await instance.waitUntilExit()` is the signal the
sleep was approximating, and it resolves exactly when Ink has let go. stdin is
then released explicitly — raw mode off, stream paused — before the child
spawns, and handed back after, because Ink acquires raw mode when it mounts but
will not resume a stream somebody else paused.

Measured rather than declared fixed: eight isolated `/triage` → `q` → `/watch`
cycles, all eight green, against roughly half failing before. Then two complete
`shell:check` runs, twenty-one assertions each, no failures and no command
reporting an error. A flake needs a sample, not a green run.

---
## D-032 — Output that fits the terminal it is printed on

Every table in the string renderers was assembled from `padEnd`/`padStart` at
the call site — sixty-four of them in the revenue renderer alone — and none of
them knew how wide the terminal was. Measured rather than guessed at:

| view | widest line | after |
|---|---|---|
| `revenue eval` | 217 | 80 |
| `revenue recover` | 205 | 80 |
| `reconcile` | 193 | 80 |
| `revenue detect` | 118 | 80 |
| `revenue stress` | 116 | 80 |

`detect` and `recover` are demo beats. At two hundred columns on a projector the
table wraps into the row beneath it and stops being a table, and nothing about
the output *fails* when that happens — every character is still there, in the
wrong place. That is why this needed a test rather than an eye.

`ui/kit.ts` holds the primitives the call sites could not enforce for
themselves. Inspired by termcn's actual lesson — composable primitives with
tokens, rather than each caller inventing a layout — not by copying its
components, which are Ink/OpenTUI React and would mean rewriting renderers that
work.

**Width is what you can see, not what `String.length` says.** A cell that has
already been coloured carries escape bytes that occupy no columns, so padding it
pads the escapes. Nothing does that today: `rupee`, `bar` and `glyph` all return
plain text, which is the only reason the tables ever lined up. It is one commit
away at all times, and it would fail invisibly in colour while looking perfect
in a pipe — which is where every test looks. `visibleWidth`, `padVisible` and
`truncate` count columns, and `truncate` walks the string rather than slicing
it, so an escape is never cut in half.

**A row that does not fit loses something on purpose.** `table()` takes the
column widths from the content, and when the total exceeds the terminal the
column the caller nominated is cut back to its floor and then truncated. The
money and the verdicts stay whole; the prose gives way. Notes moved out of the
row entirely and sit under it, hung two columns in.

**A word longer than the line is a breaking problem, not a wrapping one.** The
recovery trail's path under a temp directory is a hundred and fifty characters
with no spaces in it, and a wrapper that only breaks at spaces emitted it whole
and overflowed by exactly its own length.

**`doctor` was the worst of them, at 172 columns**, which is the command a
person runs *because* something looks wrong — its longest hint, the sentence
explaining what to do about a problem, ran off the side of the terminal
reporting the problem. Its detail and hint now wrap under the label, at a gutter
measured from the head's visible width rather than guessed at, because the
status mark carries colour and a guess put every continuation four columns left
of the text it continued.

`render-width.test.ts` renders every view at 60, 80, 100 and 120 columns and in
colour, and asserts nothing overflows — plus one case that the narrowest layout
still contains `INFEASIBLE`, `this detector` and `perfect foresight`, because a
table that fits by dropping its own findings has not been fixed.

Two things deliberately left alone. The Ink components in `ui/*.tsx` already
lay themselves out and are not rewritten to share an abstraction with the string
renderers. And pastel's file-routed commands are a framework decision, not a
visual one; commander is working and replacing it would be churn.

---
## D-033 — The opening screen, and help that answers "where do I start"

Four things the shell's first screen got wrong, all visible in one screenshot at
80 columns.

**The header reflowed onto a second line.** `sirius v0.4.0  scanning
/Applications/… · no sirius.yaml · local engine` is ninety-odd columns and the
header had no wrap mode, so Ink broke it in half, pushed the viewport down a row
and left a dangling half-sentence above the transcript. It truncates now.

**And it said the same thing twice.** The wordmark printed the session context
one line below the header printing the session context. The header keeps it —
that copy stays put when the banner scrolls away — and the wordmark no longer
takes a context at all.

**The hints lost their endings.** A transcript row is one screen line and
renders `truncate-end`, so "Hold fn for the terminal's own selection" ended at
"Hold fn for the …" — the half with the instruction in it. They are wrapped at
insert time now, into as many rows as they need.

**`/clear` deleted the wordmark.** It set the transcript to empty, and since the
banner is transcript lines, clearing the screen removed the only thing on it
that said what the program was. It restores the opening screen instead.

**Help is grouped by intent, not sorted by name.** Twenty commands in one
alphabetical list tells you what each command is and nothing about which to run
— and "where do I start" is the only question a new user actually has. Four
groups in the order you meet them, each opening with the path through it:
`/scan .` → `/triage` → `/fix`, and so on. The summaries did not change; the
grouping is the whole change. Anything a group forgets is still listed under
"the shell itself", because a command that exists and appears in no help is
worse than one filed in the wrong place.

`scripts/artifact/sirius-map.html` is the same four groups as a page, with the
flows drawn out and a column for what each command hands back. Hand-authored,
so unlike the revenue page it is committed rather than generated.

---
## D-034 — `rules test` needed an interpreter, not an endpoint

The last command that still answered "not implemented", and the reason it gave
had drifted from the truth: *"it needs a rule-execution endpoint the API does
not expose yet."* No endpoint would have helped. Nothing anywhere could **run**
a rule document — the engine's thirteen rules are compiled TypeScript matchers,
and `rules validate` checks a YAML rule's structure while explicitly saying it
has no opinion on whether the patterns match.

`engine/rule-interpreter.ts` is the missing piece, at a size it can defend:

| clause | support |
|---|---|
| `regex` | full, per line |
| `entropy: { min_bits }` | full — Shannon bits over the string literals on the line, not the line itself, because prose clears 3.5 bits comfortably |
| `pattern` | a metavariable subset: `$X` matches one node, `"..."` any string literal, everything else must match |
| `pattern-either` | any alternative |
| `patterns` | all of them |

**It is not Semgrep, and the `unsupported` list is how it says so.** A clause
outside the subset is named and *fails the run*. Returning "no findings" for a
pattern nobody executed is the failure mode that makes a rule tester worse than
having none: the author reads a green result and ships a rule that fires on
nothing. Two things are refused outright for the same reason — a pattern of
nothing but metavariables, which would match every node in any file, and a
regex that does not compile.

**The fixture annotates its own expectations**, Semgrep-style, because this
project's whole method is copying good conventions: `# sirius-test: <id>` says
the next line must match, `# sirius-ok: <id>` says it must not. The fixture
reads on its own and reviewing it is reviewing the rule — and a rule that fires
on everything fails, because the `ok` lines fail.

The tokeniser had one bug worth recording: with the identifier alternative
first, the `f` of an f-string matched as its own token, so `f"…"` arrived as two
tokens and every f-string came out one token longer than the pattern written to
catch it. The length check then rejected it before any comparison happened. The
string alternatives come first now.

`contract/fixtures/rules/` holds two runnable examples in the PRD's own format —
one regex, one AST — each with its fixture. Both are numbered into free slots
(`SIR-SEC-003`, `SIR-SEC-012`), because `validate` correctly refuses an id that
already belongs to a compiled rule, and an example that fails validation is not
an example.

`rules validate` used to close by saying the semantic check "needs the rule
engine". It exists now, so it points at `sirius rules test` instead.

---
## D-035 — A PDF is a text format, so write one

`report --format pdf` answered "PDF reports need the hosted renderer", and with
`rules test` fixed it was the last thing in the CLI that needed a backend at
all. It never needed one either.

A PDF is a text format with a table of byte offsets at the end, and the fourteen
base fonts are guaranteed present in every conforming reader — so a document
made of text and horizontal rules needs no font embedding, no rasteriser and no
dependency. `engine/pdf.ts` is about two hundred lines against a hosted service
and a network round trip, for a document the scan already holds every value of.

**Deliberately narrow**: text, rules, page breaks. No images, no embedded fonts,
no compression. That is the whole of what a compliance report is, and every
feature left out is one that cannot be subtly wrong.

**Two things in a PDF have to be exactly right, and both fail as "the file opens
but is empty" rather than as an error.** The xref offsets, because a reader
seeks by them instead of scanning — so they are taken while writing the body,
never computed afterwards. And string escaping, because an unescaped `)` ends
the literal early and every object after it is garbage. Both are asserted
directly: the test walks the xref table and checks each offset lands on the
object it claims.

**The encoding forces one substitution and it is stated rather than hidden.**
WinAnsiEncoding has no ₹, so rupees are written `Rs.` with Indian grouping
intact — `Rs.42,00,000`, the same number the terminal shows as `₹42,00,000`.
Reaching for a similar-looking glyph would quietly change a currency symbol in a
signed compliance document. Characters outside the encoding become `?` for the
same reason: a byte the reader cannot map draws a glyph nobody can predict.

**The PDF is not the signed artefact, and says so on itself.** The signature
covers the report payload, and a verifier needs that payload byte for byte. The
page carries the key id and the payload digest so the two can be compared by
eye, and points at `--format json` for the file that can actually be checked. A
compliance document that implies its own signature is verifiable when it is not
would be worse than one with no signature line at all.

One thing the tests caught: `wrapToWidth` split on whitespace and rejoined with
single spaces, so `Compliance score  60/100` lost a space it was never asked to
touch. A line that already fits is now returned untouched — a wrapper should lay
text out, not edit it.

---
## D-036 — `--diff` was accepted, stored, echoed, and wired to nothing

Documented as "only report findings absent from the baseline". It was parsed
into the config and reported back in the JSON envelope as `diff_aware`, and no
code anywhere acted on it — so a scan of an unchanged tree against its own
baseline reported all twenty findings it had already accepted and exited 1,
which is the exact opposite of the flag's promise.

Same shape as `--ruleset`, which was also scaffolded, documented and wired to
nothing (D-022). Both err toward *more* output, and a flag that errs toward more
output is never caught by a missing result — nobody files a bug because a
scanner showed them something.

It was almost invisible from the outside, too. `baseline_state` was being
computed correctly and `--fail-on new` was gating on it correctly, so the
machinery around the flag all worked. Only the flag itself did nothing, which is
why "baseline is applied by scan" read as true in the status table.

**Withheld, not filtered afterwards**, through the same path suppression uses —
because a finding removed from the list while left in the totals is a bug this
surface has already shipped once. `--diff` on an unchanged tree now reports no
findings, ₹0, score 100 and exit 0; after one new medium finding it reports that
finding, its money, and exit 0 at the default `high` threshold — the gate is
about severity and the flag is about novelty, and they compose rather than
override each other.

---
## D-037 — `.siriusignore` was documented, scaffolded, and read by nothing

AGENTS.md names three suppression layers and this is one of them. `init` writes
the file. `ScanEngineOptions.ignorePatterns` declares the field. `scan` passed
the config's `exclude:` into it. The scanner never read it, and nothing read
`.siriusignore` during a scan at all — only `watch` ever loaded it.

**It hid behind its own defaults.** The `.siriusignore` that `init` writes lists
`node_modules/`, `vendor/`, `dist/`, `build/` — every one of which is already in
the scanner's hardcoded `SKIP_DIRS`. So the file appeared to work exactly as
advertised while any pattern a user added did nothing whatsoever. A feature that
is correct on the values it ships with is the hardest kind to notice is broken:
the only way to see it is to add a pattern of your own and count.

Found by a flag audit that came up clean. All 81 CLI options are wired — the one
apparent miss, `--no-markdown`, was my own script mis-deriving commander's
negation form. So the search widened from flags to *config*, which is where
`--ruleset` and `--diff` both lived, and `exclude:` in `sirius.yaml` turned out
to change nothing. `.siriusignore` was the same hole from the other end.

Matching follows what a `.gitignore` reader expects, because that is the file it
looks like: a bare name or a trailing slash means the directory and everything
under it, `*` and `**` mean what they mean everywhere else, and a pattern with
no slash in it matches a filename at any depth — anchoring `*.min.js` to the
root would silently keep every vendored bundle in the tree. `matchesGlob` in
`store.ts` already existed for suppression path globs and is reused rather than
reimplemented.

One case is pinned because it is the easy mistake: `src` must not prune
`src-generated`. Prefix matching on the string rather than on path segments
would take both.

---
## D-038 — A question is not a reason to take the terminal

`/triage` unmounted the shell, handed the whole screen to a child, and remounted
on the way back. Watching it happen makes the cost obvious: the transcript
vanishes, the scan you are triaging goes with it, nothing else can be running,
and coming back is a remount — a great deal of machinery for what is a question
with three answers.

It runs inline now, as a panel above the prompt, which is the shape this shell
already had for `/fix`'s confirmation. The keyboard is taken; the terminal is
not. Scrolling still works while the panel is open, because reading back over
the findings is exactly what you want to do while deciding about one.

**This also answers the split-terminal question, which I had been answering
backwards.** The old note (D-…) said a split means a pty, a terminal emulator
and a native dependency — a multiplexer for two commands. True, but it was the
answer to the wrong question. A split only looked necessary because `/triage`
and `/watch` each drew a full screen and took the terminal. Nothing needs to sit
beside anything else if neither takes over: they are both just things happening
in one scrolling transcript. `/watch` is the remaining takeover and does not
need to be one either — it re-scans and prints findings, which is output, and
this shell has a place for output.

Two things the first version got wrong, both found by using it:

**The queue was filtered to undecided findings**, so a decision was final the
moment it was taken — the finding left the queue and `k` could never reach it
again. It now holds every finding, opens at the first unanswered one, and the
panel shows the verdict already on file so a finding you have not reached is
distinguishable from one you decided ten keystrokes ago. Re-deciding replaces
and the transcript says `(was accepted)`.

**There was no way to see what you had chosen.** The decisions were on disk and
nothing read them back. `/triage --decided` lists them without reopening the
queue, and closing prints a tally rather than a bare count.

`clearTriage` is new and is a real undo rather than "decide the other way":
accepted, dismissed and suppressed are three claims about a finding, and none of
them means "I have not looked at this yet".

---
## D-039 — "Ready to scan locally." and then nothing

`doctor` ended on a verdict and stopped. That is the answer to a question
nobody asked: what somebody runs `doctor` to find out is whether they can
start, and the useful reply to "yes" is the command that starts. Somebody read
the whole green checklist and asked, reasonably, *how do I scan and what*.

It now ends with the two or three things worth doing next, named in the form
that works where the reader is — `/scan .` inside the shell, `sirius scan .`
from their own prompt. The shell marks its children with `SIRIUS_IN_SHELL` so
advice can tell the difference; suggesting a command in the wrong form is worse
than suggesting none, because it fails in front of the person who trusted it.

`triage` and `report` are offered only once a scan exists to triage, and the
failing path gets the same treatment: "1 problem would stop a scan" now adds
"fix those first, then run doctor again" rather than leaving the reader to
guess whether to re-run it.

---
## D-040 — The palette went quiet exactly when it was needed

It filtered commands as you typed and then stopped. `/scan` was as far as it
would take anybody: every flag after that you had to already know, or go and
read `--help` somewhere else. Somebody typed `/scan`, got nothing more, and
asked what else they could put there — which is the question the palette exists
to answer.

Once the name is complete and a space follows it, the list becomes what can
*follow* that command: subcommands first and in accent, flags after and muted,
each with a sentence. `/revenue ` shows the nine subcommands; `/scan ` shows the
flags that change what a scan does; `/rules ` shows list, show, validate, test.
Tab completes the highlighted one, and only its literal part — `--sarif <file>`
inserts `--sarif` and leaves the filename to the person who knows it.

Three details that decide whether it helps or annoys:

**It offers nothing until the name is complete**, so the command list is never
replaced while somebody is still choosing a command.

**It stops offering what is already on the line.** Suggesting `--json` to
somebody who has just typed `--json` is the completion equivalent of not
listening.

**A typo falls back to the full list rather than going blank.** An empty panel
reads as "there is nothing here", which is a lie: it means "nothing starts with
what you typed".

A test asserts every subcommand a usage line advertises is actually offered —
`/revenue [gen|detect|…]` promising nine and listing four would be worse than
listing none — and that every entry has a real sentence, since a name with no
explanation leaves you exactly where you were.

---
## D-041 — Clickable locations, and the reason they are opt-in

From the zero-AI design report's Part D, which calls OSC 8 "the single most
impressive small touch". A finding prints `src/config.py:14`; on a terminal that
implements the sequence, that string becomes a link the terminal will open.

**It is detected, never assumed.** A terminal that does not understand OSC 8 may
print the payload as literal text, which would turn every location in the output
into a line of escape gibberish — far worse than a location that is merely not
clickable. So the check is a list of terminals known to implement it (iTerm2,
WezTerm, kitty, Ghostty, Windows Terminal, VS Code, VTE), plus `SIRIUS_LINKS=1`
to force it on and `=0` to force it off for a terminal that lies. Off in a pipe,
which is what every test and every CI log sees.

**The scheme is configurable because there is no standard for "open this file at
this line".** `file://` opens the file and usually forgets the line;
`SIRIUS_LINK_SCHEME=vscode` gives `vscode://file/<abs>:<line>`, which does jump.

**Writing the test found a real bug in the layout kit.** `stripAnsi` knew about
colour and nothing else, so `visibleWidth` measured a linked cell as the length
of its URL — seventy columns for a six-character filename. Every `table` and
`padVisible` would have been laid out against a number wrong by the length of a
path. The finding card happened to be safe because it pads the plain string and
wraps the link around it afterwards, but the primitive was wrong and any future
linked cell would have exposed it. `stripAnsi` strips OSC 8 now.

Two other items from the report were already in place and are not re-done:
synchronized output (DEC 2026) arrives through Ink, and reports are signed over
a canonicalised payload with sorted keys — close to RFC 8785 and documented as
such rather than claimed to be it.

---
## D-042 — Following a value into another function, by summary

From the zero-AI design report's Part B, which calls a limited interprocedural
pass "the single most impressive-yet-tractable feature". The shape it exists for
is two lines, neither of which looks wrong on its own:

```python
def run_query(cur, q): cur.execute(q)      # a sink, with nothing untrusted in sight
run_query(cur, request.args["q"])          # the mistake, with no sink in sight
```

A rule matching the shape of a statement cannot see this, and the intraprocedural
pass could not either. Each function is now asked two questions **once** — if
parameter *i* were tainted, would it reach the return value, and would it reach a
sink — and the answers are reused at every call. That is the economy of the
approach: a body is analysed once rather than re-analysed down every path that
reaches it.

**Per parameter, not per function.** "This function sinks its second argument"
is a different fact from "it sinks its first", and a summary that cannot tell
them apart reports the wrong argument at every call site. A tainted value
arriving at a parameter that is never sunk is not this bug and is not reported.

**The finding is at the call.** That is the line somebody has to change; the
sink inside the callee is correct code that was handed something it should not
have been. The message names both — `reaches cur.execute inside run_query()` —
because a report saying an ordinary function call is a SQL injection leaves the
reader to work out why on their own.

**The negatives are the feature.** A pass that assumes every call passes taint
through flags `q = escape(dirty)`, which is code doing exactly the right thing;
one that assumes every call sinks its arguments flags the whole codebase. Both
are worse than staying intraprocedural, so `returnsTaintFrom` gates propagation
out of a call and `sinksParam` gates findings into one. Four of the ten tests
are negatives.

Still out of scope, and still said out loud: crossing a file, resolving a method
on a receiver whose type is unknown, containers, and aliasing. `Finding.taint`
being null remains "no path proven", never "safe".

Measured for regressions: chaos-repo 6 findings unchanged, and nothing new in
this repository's own source.

---
## D-043 — Which fixes may be applied without being asked

Every fix carried a `confidence: 0.84` that gated nothing and meant nothing to
anybody. The verifier decided whether a patch resolved the finding and parsed,
and after that all four templates were equal — so moving a secret to
`os.environ`, which is unambiguously what the author meant, and wrapping a log
argument in `redact()`, which calls a helper this tool does not define and would
raise a NameError in a project that has none, were applied by the same keystroke.

rustc's `Applicability` is the canonical model and `cargo clippy --fix` applies
only `MachineApplicable`. Copied exactly: `--apply` applies machine-applicable
fixes and prints the rest with their reason, and `--unsafe-fixes` opts into
`maybe-incorrect`.

**Applicability belongs to the match, not the template.** `execute("… %s" % uid)`
rewrites to bound parameters with the meaning intact — machine applicable. The
same template against `"… %s … %s" % uid` is a guess about how many values were
meant, and guessing is what `maybe-incorrect` is for. The placeholders are
counted against the operands rather than the template being labelled once.

**Consequence is a second axis, reported and not gated on.** Moving a secret to
the environment is certain *and* makes the program need a variable that must now
be set. Both are true; only the first decides whether to apply automatically,
and the second is what somebody wants to know before pressing y. So a fix can
carry `behaviourNote` — "the program will read STRIPE_KEY from the environment",
"calls redact(), which this fix does not define" — without that note blocking it.

**One thing I built and removed.** The report's third verifier condition is that
a fix be idempotent, so the first attempt re-ran the template against its own
output. That is not the test it looks like: `add_auth_decorator` inserts a line,
so the second run read the decorator it had just written and failed a template
that converges perfectly well. Convergence follows from the checks already
there — fixes are selected by findings, and the rule no longer matches, so
nothing would select the line again. The verifier says that instead of claiming
a test it is not running.

---
## D-044 — A signature is per-document; the ledger is about the history

From the design report's Part C, which calls the Merkle scan ledger the killer
feature. The gap it closes is real and easy to miss: an ed25519 signature proves
a report has not changed since it was signed, and says nothing about whether a
*different* report was signed in its place, or whether an inconvenient one was
deleted. Signatures answer a question about one document. A transparency log
answers one about the sequence.

Every `sirius report` appends its canonical digest as a leaf; the root sits
beside it in `.sirius/ledger.json`. RFC 6962's construction, the one behind
Certificate Transparency and Rekor, including the `0x00`/`0x01` domain
separation — without those a leaf hash and an interior node hash come from the
same space and a leaf can be forged to collide with a subtree, which is the
classic second-preimage bug in a naive Merkle implementation.

**Two layers, catching different things.** `report --verify` proves a report is
in the log, in log(n) hashes, holding no other report. `ledger verify` proves
the log only ever appended, by checking every prefix against the whole. The
second is the one nobody thinks to ask for and the one that catches a rewritten
history.

**The limit is stated, not discovered.** Somebody who can edit the file can
delete an entry and recompute the root, and `ledger verify` will pass — a log
rebuilt from scratch is internally perfect. What catches that is the other
layer: the deleted report can no longer prove it was ever there, and
`report --verify` says `NOT IN THE LEDGER` and exits 1. Past that, the root has
to be published somewhere the writer does not control, which is what a witness
or a hosted log is for. Both behaviours are tested, including the rebuild.

**Recorded by digest, not by invocation.** Running `report` twice over an
unchanged scan appends nothing, or the log's size would count command
invocations rather than distinct reports.

**A corrupt ledger is not an empty one.** Loading refuses rather than starting a
fresh log over the top, because quietly beginning again destroys exactly the
history the file exists to keep, at the moment somebody most needs it.

The proofs are tested against brute force rather than against themselves —
every leaf of every tree up to 33, every pair of sizes up to 25 — because an
inclusion check that walks the tree it was handed returns true for anything, and
an off-by-one in consistency passes every happy path while rejecting nothing.
That is how the 5 → 6 case was caught: the first verifier collapsed the CT
algorithm's two loops into one and dropped the "left child with a right sibling
in the new tree only" branch, which exists precisely where the two trees differ.

---
## D-045 — The palette and the CLI cannot drift any more

Three commands shipped missing from the `/` palette — `revenue stress`, `rules
test`, `ledger` — and all three were caught by somebody using the shell and
noticing, after the fact, each time. The lists live in different files
(`cli.ts` and `CommandPalette.tsx`) and nothing made them agree, so they drifted
whenever either grew. Fixing it a fourth time by hand would have been treating
the symptom.

`parity.test.ts` reads the commands commander registers straight out of
`cli.ts` and compares them with `SHELL_COMMANDS`, both directions. Adding a
command to one without the other now fails the build and names the missing one.

**The exceptions are enumerated with reasons, not allowed as slack.** Four
commands are shell-only: `cd` (a one-shot process cannot change its parent
shell's directory, so `sirius cd` would appear to work and do nothing), `clear`
and `exit` (there is no transcript and nothing to leave outside the shell), and
`help` (commander's `--help` and `help <command>` are already better). A blanket
"some commands are shell-only" would let the next real gap through disguised as
one of these, so the list is closed and a stale entry fails too.

`shell` was the one genuine gap left and is now listed, with the summary "you
are already in it" — the shell has always answered it, so it was handled and
invisible at the same time, which is the worst of both.

Three smaller things the same test now holds: every summary has to say more than
the command's own name, usage strings are written in the slash form because that
is where they are read, and a usage line has to name the command it belongs to
— `/report` documenting `/repot [scan-id]` is the kind of typo that survives
review forever because both halves look right on their own.

---

## D-046 — `key_id` is derived from the key, never read from the document

A cold audit forged a signed audit trail: delete all 37 compliance refusals,
rebuild the hash chain, re-sign with a freshly generated keypair, and *keep the
legitimate `key_id`*. `revenue audit --verify` answered `OK … signed by key
6947844440ba90c4`, exit 0. The same forgery passed `report --verify` with every
finding removed and the score forced to 100.

`verifyAttested` checked the signature against the public key embedded in the
document — correct as far as it goes — and then returned `att.key_id` verbatim.
The id was attacker-controlled string data sitting beside the key it claimed to
name.

The docstring made this worse rather than better. It acknowledged key
substitution and said "whoever gates on this must pin `key_id`". But `key_id`
travelled *inside the document the forger controls*, so the advice named the one
field an attacker had most reason to copy, and following it produced the trusted
fingerprint printed over the attacker's key.

So: `key_id` is now derived (`fingerprint(public_key)`) and checked against what
the document claims; a mismatch is a hard failure. Fingerprinting moved from the
PEM text to the decoded SPKI bytes, because the key was fingerprinted at load
from the raw export and written into the attestation trimmed — a text hash
disagreed with itself over a trailing newline.

That makes pinning mean what it always claimed, so pinning now exists: `--key
<fingerprint>` on both `report --verify` and `revenue audit --verify`. Without
it the result is marked unpinned and both surfaces say so in as many words —
*ANY key verifies its own report* — rather than implying an identity nothing
established.

Also: a missing ledger was a silent `return`, so a forged report verified on any
machine but the one holding `.sirius/ledger.json` printed a bare `OK` with no
sign the stronger check had been skipped. A report that travels is the
documented use case; the absence is now reported as plainly as a result.

The existing test named "catches a report signed by a different key" asserted
`ok === true`. It documented the hole rather than closing it, and it used the
attacker's *honest* key id — so it never touched the case that was the attack.

## D-047 — A number is never shortened to fit

Two cold reviews drove the CLI in real ptys and found the same class of bug in
two places: a fixed-width layout quietly removing the part of a line that
carried the meaning.

**The footer clipped the money.** The money row is an Ink flex row, and Ink
shrinks flex children to make a row fit. At 64 columns `₹89,30,000` rendered as
`₹89,30,00` — not a visible truncation but a plausible, differently-valued,
wrongly-grouped number, and the number the whole product is about. A clipped
sentence announces itself; a clipped figure does not. Money now never shrinks,
and below the width where the figure and the score stop fitting together the
score moves to its own row rather than squeezing its neighbour.

**The Cerebus panel was a hard 62 columns** whatever the terminal was, and
elided its rows into that. It cut `re-ran SIR-SEC-001, no match — nothing would
select it again` at "noth…" on a 120-column terminal with fifty columns spare.
That clause *is* the security argument the 45-second beat exists to make, and a
conclusion always sits at the end of its sentence, so eliding from the end
removes precisely the words worth reading. The panel now takes the width it is
given up to 96, and wraps under the value column instead of truncating. The
narrow fallback below 68 columns wrapped nothing at all — 91 characters at 56
columns — so it wraps too.

Also D-032's rule, restated because it was violated in a new place: **layout
gives way, content does not.** A column may narrow, a row may stack, a value may
wrap. Nothing may be shortened into something that still reads as a valid value.

### The test that nearly did not test anything

The first version of `ink-width.test.tsx` passed against the unfixed code.
`ink-testing-library`'s fake stdout hard-codes `columns = 100`, so every width
in the file laid out at 100 and the assertions never saw a narrow terminal. It
was caught only by deliberately reverting each fix and watching the suite stay
green — which is now the standard for a regression test on this branch: a test
that has not been seen to fail has not been shown to test anything. The file
renders through Ink directly with a stdout that reports the width under test.

## D-048 — A rule may not advertise a language it does nothing in

`rules show SIR-SEC-010` printed `languages: python, javascript, typescript`.
`doctor` printed `13 rules · python, javascript, typescript, go`. A JavaScript
file containing SQL injection, command injection, MD5 over a PAN, a card number
in a `console.log`, and an unauthenticated transfer endpoint scanned clean apart
from the hardcoded key — which was caught by a regex that never needed a
grammar.

Eleven of thirteen rules gated on tree-sitter's *Python* node names. tree-sitter
names the same construct differently per grammar — Python `call`, JavaScript
`call_expression` — so on a `.js` file those rules walked the entire tree,
matched nothing, and reported success.

No Python fixture could ever have caught this, because in Python every one of
those rules worked perfectly. It took a file in another language, which is why
the gallery is now bilingual.

Silent under-reporting is the worst failure this tool has. A crash gets fixed; a
clean report gets believed and shipped.

**What changed.** The node names moved behind `isCall` / `isAssignment`, so a
rule states what it means rather than what one grammar calls it. Five rules —
010, 011, 021, 030, 040 — now fire in JavaScript, taint tracing included, since
the taint sources already knew `req.body` and `req.query`. `SIR-SEC-011` also
learned Node's shell spawners: matching only `child_process.exec` missed the
destructured `const { exec } = require('child_process')`, which is how it is
nearly always written. `execFile` and `spawn` are deliberately excluded — they
take an argv array and involve no shell, and reporting them is the false
positive that teaches a team to ignore the rule.

**What did not change, and says so.** `SIR-SEC-020`, `050` and `051` gate on
`decorated_definition` — Python's `@app.route` idiom, which Express spells as a
call. They now declare `languages: ['python']`. Narrowing a claim is the fix
when the alternative is a claim that is not true; the JavaScript equivalents are
a rule to write, not a language to assert.

`doctor`'s language line is derived from the catalogue instead of being a
hardcoded string. It had been advertising Go, which no rule has ever declared —
a health check composing its own good news cannot report bad news. Manifests are
counted separately, because `package.json` is a file and not a language.

The gallery's per-rule counts are now scoped per language. A single total across
a bilingual fixture would need editing every time either half grew, and a number
edited without being re-derived is the failure mode the gallery exists to
prevent.

## D-049 — The ASCII fallback covers the character it was created for

AGENTS.md names `SIRIUS_ASCII=1` the projector safety net and lists `₹` first
among the characters it protects. It did not protect `₹`. `money.ts` hardcoded
the symbol and knew nothing about the terminal, so a scan under the flag still
emitted nine of them, along with `—`, `…`, `·`, `§` and `≥` — prose punctuation
that never went near the glyph table.

Only the revenue renderer honoured the flag, through `palette.rupee`. So one
environment variable meant two different things in the two demo beats, and the
beat it did not cover was the opening one.

What made it survive: `doctor`'s glyph self-test rendered `Rs.42,00,000` through
a *third* code path and passed, so the diagnostic vouched for a fallback the
command it was vouching for did not have. A check that does not exercise the
thing it certifies certifies nothing — the same shape as `rules test` passing
against a rule the engine could not run.

`formatInr` now resolves the symbol from the environment rather than taking a
`Capabilities` argument. Money is formatted from about thirty places, most
nowhere near a capability object, and a fallback correct only where somebody
remembered to pass an argument is precisely the situation being replaced.
`NO_COLOR` works this way for the same reason. Machine output is untouched:
`--json` and SARIF carry money as a number and never pass through here.

For the punctuation, `toAscii` applies at the two paced writers and the two
plain writes that bypass them — the last point before the terminal, and so the
only place a fallback can be complete rather than remembered. Substitutions
never lengthen a line: a replacement that grew the string would push a fitted
table over the edge on exactly the narrow terminal that asked for ASCII, which
is why `§` becomes `S.` and not `Sec.`.

The test asserts both directions. Under the flag, no non-ASCII byte survives a
scan or a `doctor` run; without it, `₹` is still there. Asserting only the first
would be passed by a fallback that applied always, quietly costing the Indian
grouping the figures exist to demonstrate.

## D-050 — Refusing beats coercing, and a message is printed once

Three things a cold review found by running the binary, all of the same shape:
the tool appeared to answer the question rather than failing to understand it.

**A number that is not a number.** `Number.parseInt('abc', 10)` is `NaN`, and
every comparison against `NaN` is false — so `--limit abc` printed an empty list
with no error and exit 0, and `--capacity -5` printed `room for -5` and carried
on. `countArg` refuses both. Zero is allowed: `--capacity 0` and `--budget 0`
are real questions — *what does this run do with nothing to spend?* — and the
answer, a run that refuses everything, is exactly what the audit trail exists to
show.

**A usage error exiting 1.** `exitOverride()` was applied to the root command
after `buildProgram()` had constructed the subcommands, so they kept commander's
`process.exit(1)` — the code this CLI documents as *findings at or above
threshold*. A pipeline could not tell a blocked gate from a typo, and the
README's own escape hatch, `sirius scan … || true`, swallowed a mistyped flag
and went green having scanned nothing. Applied recursively now, with
`showHelpAfterError` instead of commander's full help body: twenty-five lines of
options after an error scrolls the error itself off a short terminal.

**And then printed twice.** The catch block listed `unknownCommand`,
`unknownOption` and `missingArgument`, and missed `invalidArgument` — which is
precisely what an option's own parser throws, so the validation above arrived as
`error: error: option '--limit <n>' argument 'abc' is invalid`. Matching the
`commander.` prefix handles the next one commander adds before anyone sees it
twice.

**`fix` had no terminal and waited anyway.** With stdin not a TTY the screen
that asks for the diff resolves nothing, so `fix` printed `applying…`, waited
forever, and ended on a Node warning about an unsettled top-level await naming a
path inside `dist/`. In a pipeline it hung; from a script it read as a crash in
the tool rather than a missing flag. `triage` already refuses this way, but it
can only refuse — there is no non-interactive triage. `fix` has two, so the hint
names them rather than turning somebody away from a door that is open.

### The palette row, and a finding that was not one

The review reported `… 17 more` carrying `/doctor`'s description. It reproduces
in a captured pty transcript and it is not what a user sees: Ink repaints in
place, and stripping the escape codes from a transcript concatenates a shorter
line with the tail of the frame beneath it. Rendering the component directly at
a fixed width shows `/doctor` on its own row and `… 17 more` on its own. Worth
recording because the reproduction looked conclusive and was not — a transcript
with its cursor movements removed is not a screenshot.

Chasing it did find a real bug. Long summaries wrapped, so five entries occupied
six lines. The first fix — `wrap="truncate-end"` with a width on the row — was
worse: the row becomes a flex container, Ink shrinks *every* child, and the
indent and name column collapsed on exactly the rows that were cut. Same lesson
as D-047: decide the width, then hand Ink strings that already fit.

## D-051 — The log protects the half a person reads, and config says what it ignored

**`ledger verify` said "no entry was rewritten" after an entry was rewritten.**
The leaf was `leafHash(digest)` alone, so `scan_id`, `recorded_at` and
`findings` — everything `ledger show` prints, and everything an auditor actually
reads — sat outside the chain. An entry could be restamped to 2020, renamed
`clean-audit-2026`, and have its finding count zeroed, and the verifier answered
`OK · 1 entry, every prefix consistent · so no entry was rewritten or removed`.

A report could not be *swapped*, because the digest was chained and that part
worked. But a transparency log whose human-readable half is unprotected is
telling the truth about the half nobody reads. The leaf now covers the whole
entry, written in fixed field order rather than through a serialiser, so the
hash cannot move because a JSON implementation reordered keys.

**A bad config value produced the message `[`.** The hint was
`cause.message.split('\n')[0]`, and a Zod error's message is a pretty-printed
JSON array — so the first line was the opening bracket. Every hand-written error
in this CLI names the problem and the fix; this one named a punctuation mark. It
now names the key and the values that were expected, at most three issues,
because a config with ten mistakes is usually one mis-indented block and
printing ten lines buries the first.

**A misspelled key said nothing at all.** Zod objects are non-strict, so
`policy: { min_complaince_score: 80 }` parses cleanly and applies nothing. A
misspelled *gate* key means the gate silently does not exist — the file reads
stricter than the run is, which is the direction that matters.

A warning rather than an error, deliberately: a hard failure turns a typo into a
broken build for anyone whose config was written against a newer version, and
this file is read on every command. Only the top level and `policy:` are
checked, because that is where the gate lives and `revenue:` is a large nested
surface where a false alarm would be worse than the silence.

## D-052 — Show the column the list is sorted by

`revenue detect` ranks records on expected recovery — score × amount × recovery
share — and that number appeared nowhere on screen. Neither visible column was
monotonic (67, 46, 55, 41 … / ₹3.25L, ₹1.40L, ₹1.08L, ₹1.41L), so to anyone
seeing it for the first time the list looked scrambled. A sort key the reader
cannot see is indistinguishable from no sort at all — and this is demo beat 3,
where the ranking *is* the argument.

There were also no column headers, and the header line read `floor 16 · room for
67` immediately above a first row whose score was also 67: two unrelated 67s
three words apart.

So the row carries an `EXPECTED` column, the columns are labelled, and the line
above says `ranked by expected recovery` in as many words. `floor`/`room for`
became `score floor`/`capacity`, which is what they mean.

The header is built from the same widths as the row, in the same order, rather
than being spaced by eye. A header that is close but not aligned is worse than
none: it makes a reader distrust the columns that are right.

## D-053 — `fix` names the problem it actually has

Inserting two lines above a finding and running `fix SIR-SEC-001 --apply`
printed `no local fix template for SIR-SEC-001 (env_lookup)`. There is plainly a
template for `env_lookup`; the real cause was that the finding's line number now
pointed somewhere else, so the template was reading the wrong line and declining.

It refused safely, which is the important part — it did not rewrite a line it
had not matched. But it sent the reader looking for a missing feature instead of
re-running the scan. Three outcomes now say three different things: no template
for this action, a template that no longer matches the line (with the fix — run
`sirius scan` again), and the existing case where the project has no
authenticated route to copy.

## D-054 — The compliance score explains itself

`sirius explain` exists because "how did you get ₹42,00,000?" is the first
question anyone sensible asks, and "it's a heuristic" is not an answer. Asking
the same question about the other headline number got:

    error: No exposure model for "score".

`Compliance 60/100` sits on the footer beside a rupee figure traceable to a
public anchor, and was itself the one number on screen with no derivation
anywhere. It is also the number a compliance officer asks about first.

The formula was explainable the whole time — `complianceScore` in `scanner.ts`
is twelve lines and deliberately not tuned. It was simply not reachable from the
command whose entire job is disclosure. `sirius explain score` now prints the
weights, the file-count scale and the reason for it, and works the example
against the last scan: `penalty 2×12 + 2×6 + 2×2 = 40 · scale log10(max(10, 3))
= 1.00 · score 100 − 40 ÷ 1.00 = 60`, which is the figure on the footer.

It also says whose formula it is. The weighting is one of the open questions
logged as blocking on `auto`, and this is the local engine's answer, not the
contract's — so two sirius scans are comparable to each other and not to a score
from another tool. A number somebody may have to defend has to name its
authority.

The test recomputes the score from the printed terms rather than trusting the
prose: a worked example that disagrees with the footer is worse than none.
