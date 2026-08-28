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
