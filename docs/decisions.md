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

## Blocked on the `auto` branch

Not ours to decide. Tracked here so no one re-derives them.

1. **Compliance-score formula.** Arrives as `72.5`, renders `72/100`. Severity-weighted? Category coverage? Both the CLI footer meter and the web gauge depend on it.
2. **Fingerprint algorithm.** Drives baseline diffing, dedup, and suppression matching across all four surfaces. Presumably rule id + path + normalized snippet hash, deliberately line-number-insensitive — but it must be defined once, server-side.
3. **Money-at-risk model.** Explicitly a heuristic table per the PRD, but no table, no per-rule multipliers, and only one `money_at_risk_model` value (`provider_key`) is named.
4. **The K/S auth contradiction.** `PATCH /scans/{id}/findings/{fid}` (triage), `GET/POST /rules`, `POST /rules/validate`, `GET/POST /suppressions`, `GET/POST /baselines`, and `GET/PUT /projects/{id}/policy` are marked **S = session/JWT only**, but `sirius triage`, `suppress`, `baseline`, and `rules` are CLI commands authenticating with **K = Bearer API key**. As specified, those commands cannot work in CI. Either those endpoints accept `K`, or the command tree is wrong.
5. **Device-flow endpoints.** `login` is specified as "OAuth device flow" but no `/auth/device/code` or `/auth/device/token` endpoints exist in the API table. Also unstated: the `config.toml` schema, the env var name for an API key in CI, and profile support.
6. **`rules test`** has no backing endpoint and would require either a local engine (violating the golden rule) or a new endpoint.
7. **Pagination convention** for `GET /scans/{id}/results` and `GET /scans` — cursor vs offset, param names, envelope shape — and how paginated results reconcile with findings already delivered over WebSocket.
