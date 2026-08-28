# Handoff: what the `cli` branch needs from `auto`

For whoever owns the Core API, scan worker, and Cerebus. Written from the CLI side after building against the frozen contract in [`../contract/openapi.yaml`](../contract/openapi.yaml).

Nothing here is a request to change your design. It is a list of the places where the PRD is silent or self-contradictory, what the CLI does today as a result, and which of those decisions need your agreement to hold.

Full rationale for each item is in [`decisions.md`](decisions.md).

---

## 1. Read this first: two things changed under you

**The rule IDs were renamed.** `FIN-SEC-001` is now `SIR-SEC-001`. The project became `finsec-lint` → `sirius`, rule identifiers included. This is the item that costs real rework if it reaches you late, because you are building the YAML catalogue, the detection rules, and the Cerebus fix templates against IDs that appear 137 times in the PRD.

| Was | Now |
|---|---|
| `FIN-SEC-001` … `FIN-SEC-060` | `SIR-SEC-001` … `SIR-SEC-060` |
| `FIN_ERR_*` | `SIRIUS_ERR_*` |
| `X-FinSec-Signature` / `-Event` / `-Delivery` | `X-Sirius-Signature` / `-Event` / `-Delivery` |
| `# finsec-ignore: FIN-SEC-010` | `# sirius-ignore: SIR-SEC-010` |
| `finsec.dev` | `sirius.dev` |

**Unchanged:** the numbering scheme (blocks of ten by category), and every compliance clause. PCI-DSS 8.6.2, 6.2.4, 8.4.2, 3.4.1, 3.5.1, RBI DPSC, DPDP §8, GDPR Art.5 are external standards and did not move. `docs/original-prd.md` still says `finsec-lint` throughout — it is the source research artifact, deliberately left as received.

**The CLI is no longer a pure client.** The golden rule said no surface may hold a scan engine. The CLI now has one: tree-sitter AST analysis, 13 compiled rules, fingerprints, a money model, live secret validation, signing, and a full local recovery surface. It runs `scan`, `fix`, `triage`, `baseline`, `suppress`, `report`, `rules list|show|validate`, and `badge` with **no backend at all**.

This was not a land grab. It was forced: seven features were listed Done while being unreachable in the configuration everything defaults to, because they were written as API clients against a server nobody was running. The rule still governs `web` and `gui`, which have no engine and should not grow one. See D-016 and D-020.

**What this means for you:** the CLI is now a *second implementation* of things you also implement. That is a liability if the two disagree silently, which is exactly what §2 is about.

---

## 2. The four questions — three now have running answers

These were "only you can decide". Three of them now have a working implementation on this branch, because the CLI could not ship without them. **Treat them as proposals with code attached, not as constraints.** If yours differs, yours wins and the CLI adopts it — but the difference has to be deliberate, because two implementations that disagree about a fingerprint silently break every baseline in the product.

### 1. Compliance score — implemented

`packages/cli/src/engine/scanner.ts › complianceScore()`

```
penalty = Σ (weight[severity] × count)      critical 12 · high 6 · medium 2 · low 0.5 · info 0
scale   = max(1, log10(max(10, fileCount)))
score   = max(0, round((100 − penalty / scale) × 10) / 10)
```

Scaled by file count so a large clean codebase is not punished for the same absolute number of findings as a tiny one. Deliberately explainable rather than tuned. Arrives from you as `72.5` and renders as `72/100`; if you compute it differently, the CLI's local scans and your hosted scans will disagree on the same repository.

### 2. Fingerprint — implemented

`packages/cli/src/engine/scanner.ts › fingerprint()`

`sha256(ruleId ␀ path ␀ normalisedSnippet)`, truncated to 32 hex characters, where the snippet is whitespace-collapsed and the line number is deliberately absent so reformatting does not invalidate a baseline. NUL is the separator because it is the one byte that cannot occur in a rule id or a path.

**Two findings with the same fingerprint are one finding, and the scanner now
enforces that.** `SIR-SEC-031` matched a class-body assignment twice — once as
the assignment, once as the statement wrapping it — and the duplicate counted
twice in the totals and twice in the money while collapsing to a single row in
every baseline. If your worker can emit two findings that fingerprint alike, it
has the same bug, and it shows up as totals that disagree with the list.

This is the one where a silent disagreement is worst: baselines, dedup and suppression matching all key on it, and a mismatch does not error — it just stops matching, and findings a team accepted come back as new.

### 3. Money at risk — implemented, and larger than a table

`packages/cli/src/engine/exposure-model.ts`

Per-rule base amounts, each carrying a `basis` sentence and an `anchor` citation, multiplied by:

- **reachability** — direct / behind auth / internal only
- **provider weight** — a cloud root key is a wider blast radius than a chat token; a *test-mode* key is priced at ×0.01
- **verified live** ×2, or **provider refused it** ×0.15 (disclosure and rotation only)
- **age in version control**, capped at ×1.5

`sirius explain SIR-SEC-001` prints the whole derivation. The PRD asked for a heuristic table; this is that table plus the multipliers it needs to not be nonsense, and every figure states what it assumes.

### 4. The K/S auth split — still yours, but no longer blocking

The PRD marks `PATCH /scans/{id}/findings/{fid}`, `GET/POST /rules`, `POST /rules/validate`, `GET/POST /suppressions`, `GET/POST /baselines` and `GET/PUT /projects/{id}/policy` as **S = session/JWT only**, while the CLI authenticates with **K = Bearer API key**. As written, `triage`, `suppress`, `baseline` and `rules` work interactively and fail in CI.

It bites less than it did: all four now have local paths that need no auth at all, so the contradiction blocks only teams that want hosted history. The CLI is still built assuming **those endpoints accept `K`**. If you disagree, say so and the hosted paths will fail with a clearer error instead.

---

## 3. Contract additions the CLI is already coding against

These are in `contract/openapi.yaml` today. If you implement something different, the CLI breaks.

**`POST /scans` accepts `severity_threshold` and `fail_on`.** The PRD's body had `policy_id` but no threshold, while `scan.completed` carried a server-computed `exit_code`, so nobody owned the gate. The CLI sends both and **computes its own exit code locally**, treating yours as a cross-check. Keep sending `exit_code`; a mismatch is logged, not obeyed. CI gating has to be deterministic offline and under `--replay`.

**`Finding` gains `col`** — 1-indexed column of the offending token. The PRD has it in the DDL but omits it from the WebSocket frame. The CLI needs it to align the `╰──` underline. Degrades gracefully when null.

**`Finding` gains `triage_state`** — `open | accepted | dismissed | suppressed`. The PRD describes accept/dismiss/suppress but the DDL has one `suppressed` boolean: one value for three verbs. Keep `suppressed` derived from `triage_state == "suppressed"`. `accepted` ("real, will fix") and `dismissed` ("false positive") are opposite judgements, and flattening them destroys the audit trail.

**`PATCH /scans/{id}/findings/{fid}`** takes `{ triage_state, reason?, expires_at? }`. `reason` is required for `dismissed` and `suppressed`.

**WebSocket auth**: `Authorization: Bearer <key>` on the upgrade, `?token=` fallback for browsers. Close `4401` on rejection — the CLI handles that code specifically.

**Severity → SARIF level**: `critical`+`high` → `error`, `medium` → `warning`, `low`+`info` → `note`. `baseline_state` passes through untouched; `new|unchanged|absent` are already SARIF's own tokens.

---

## 4. Where the CLI ended up differing from the PRD

Listed because these were described to you as one thing and are now another. Full reasoning in `decisions.md` (D-016 … D-026).

- **`rules show` prints no `yaml_body`, and invents none.** The PRD's rules are YAML documents; the local engine's are compiled AST matchers. There is nothing to print, and the command says so rather than fabricating a document. If your `GET /rules/{id}` returns real YAML, the CLI will print it when talking to you.
- **`rules validate` runs locally.** Schema, vocabularies, the `SIR-SEC-NNN` numbering blocks, the fix-action list, and PCI-DSS numbers that v4.0 renumbered — all checkable without a network round trip. Invalid exits **1**, not 2: a rule file with a typo is a finding, not a broken tool. When a project is configured it also asks you and merges your errors. What it does not check is semantics — whether a pattern matches what its author thinks — and it says so.
- **`rules test` is still unimplemented**, but the reason changed. It is not "that would need a local engine"; the engine exists. It needs a *YAML rule interpreter*, and the engine runs compiled matchers, so there is nothing to feed a YAML rule into. A `POST /rules/test` taking a rule and a snippet would still be the cleanest answer.
- **`report` is genuinely signed and verified.** It is built from the last scan, signed ed25519 with a key at `~/.config/sirius/` (0600, generated on first use), and `sirius report --verify` gates on exit 0/1/2. It states what that proves (unmodified since signing) and what it does not (identity — the key travels inside the file, so pin `key_id`). **If you expose a JWKS URL the CLI will verify your signatures too**; until then the local one is what exists.
- **`badge` draws its own SVG** from the last scan when no project is configured, and prints your hosted URL when one is. A committed badge is also the more honest one: it moves only when someone scans and commits.
- **Rulesets are defined.** The PRD names `p/fintech-core` and `p/secrets` without defining membership. The CLI's mapping: the core set is everything, `p/<category>` is one category, anything else is an error naming what exists. A ruleset that silently means "all rules" is how a team believes it narrowed a scan it did not.
- **Device-flow login is unimplemented** — no `/auth/device/*` endpoints exist. `sirius login` stores a project API key, which is what CI needs anyway.
- **Pagination** for `GET /scans/{id}/results` is assumed `limit` + `cursor` with `{ items, next_cursor }`. How paginated results reconcile with findings already delivered over the WebSocket is unspecified; the CLI de-duplicates by finding `id`.

---

## 5. A whole surface you do not need to build

`sirius revenue` and `sirius reconcile` price money at risk in **operations** rather than in code: failed payments, abandoned checkouts, ageing receivables, and three sets of books that disagree. Detection with held-out precision and recall, a bounded recovery agent with thirteen stopping rules and a hash-chained signed audit trail, and a five-tier reconciler that reports its match rate, its verified accuracy, and an honest exception list.

**It needs nothing from you.** No endpoint, no contract change, no schema. It is local by construction and there is deliberately no `--execute`. Flagged here only so it does not arrive as a surprise, and because the audit trail reuses the same ed25519 signing as `report` — if that ever becomes a hosted concern, the two should move together.

Design and honest findings: [`revenue.md`](revenue.md).

---

## 6. How to check yourself against the CLI

The mock is the executable spec. When your Core API is up:

```bash
env SIRIUS_API_URL=<your-api> SIRIUS_WS_URL=<your-ws> SIRIUS_API_KEY=<key> \
    SIRIUS_PROJECT_ID=<id> sirius doctor
```

`doctor` reports against the mode a scan will actually run in. With a project configured it probes your API and your WebSocket handshake and fails on either; it also names the working directory, self-tests both engines, and refuses a signing key that is not 0600. It says which config layer every value came from.

Then:

```bash
sirius scan contract/fixtures/chaos-repo
```

The chaos repo has planted findings at known line numbers (`src/config.py:14`, `src/ledger.py:88`, `src/webhooks.py:52`). A second fixture, `contract/fixtures/rule-gallery/`, plants **one example of every rule**, each beside a correct counterpart doing the same job — the fastest way to check your engine agrees with this one about what is and is not a finding. `contract/mock/smoke.mjs` asserts the totals the demo depends on: 2 critical / 5 high / 9 medium / 3 low, ₹51,20,000, score 72.5, exit 1. If your engine produces those against the chaos repo, the CLI renders the demo correctly.

**One caution, and it needs a ruling.** The local engine produces different numbers for that same repo:

| | critical | high | medium | low | money | score |
|---|---|---|---|---|---|---|
| mock / PRD | 2 | 5 | 9 | 3 | ₹51,20,000 | 72.5 |
| local engine | 2 | 2 | 2 | — | ₹89,30,000 | 60 |

Neither is wrong: the two describe different repositories. `demo.jsonl` is a sixteen-file fictional codebase and the chaos repo is three real files, so they were never two readings of one scan. The local engine also prices exposure with the multipliers in §2.3 rather than a flat table. But it does mean **"the demo totals" now depend on which engine ran**, and two numbers for one repository is one too many.

Say which set is canonical. The CLI will report the other as a cross-check, the way it already does for `exit_code`.
