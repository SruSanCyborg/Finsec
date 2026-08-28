# finsec-lint (CLI): A Zero-AI, Provable Security & Compliance Scanner — Technical Design Report

## TL;DR
- **Remove the LLM entirely and lean into determinism as the headline feature.** The CLI's three flexes — an interprocedural taint engine, a template + concrete-syntax-tree (CST) autofix engine, and cryptographically signed, byte-reproducible attestations with a Merkle scan ledger — are all classical CS with real prior art (Semgrep taint mode, Coccinelle/LibCST, Sigstore/RFC 8785). The pitch: *"An LLM guesses; finsec proves."*
- **The autofix "Cerebus" engine becomes a deterministic fix-action VM** modeled on rustc's `Applicability` enum (MachineApplicable/MaybeIncorrect/HasPlaceholders/Unspecified), ESLint's multi-pass fixer loop (`const MAX_AUTOFIX_PASSES = 10;`, conflict = skip), and Ruff's safe/unsafe split — with a mandatory verifier that re-runs the detection rule on the patched CST and only keeps fixes that (a) resolve the finding, (b) reparse, and (c) are idempotent.
- **Recommended stack: Go + Bubble Tea/Lip Gloss for the CLI/TUI, calling a Python scan-worker over the shared Core API.** This gives a single static binary with best-in-class TUI craft while keeping Python's `ast`/LibCST/tree-sitter ecosystem for analysis. Budget the hackathon around a working Python→Flask/FastAPI taint demo, OSC-8 clickable taint traces, and a live `finsec verify` signature check — those three land the demo.

---

## Key Findings

1. **Deterministic autofix is a solved, well-documented problem class.** Every serious linter ships pattern/AST-based fixes with explicit *confidence levels* and a *verification discipline*, and none of them use AI. finsec should copy the union of their best ideas.
2. **A hackathon-scale taint engine is achievable if scoped to intraprocedural + limited interprocedural summaries.** Semgrep's own taint mode was intraprocedural for years and still catches "convoluted bugs." The YAML schema (`pattern-sources`/`pattern-sinks`/`pattern-sanitizers`/`pattern-propagators`) is directly copyable and is the single most impressive-yet-tractable feature.
3. **Cryptographic attestation is low-effort, high-wow.** RFC 8785 canonical JSON + Ed25519 detached signature + a Merkle append-only ledger gives you "any historical report provably unaltered" — a killer, entirely offline-verifiable feature that needs no network and no AI.
4. **TUI craft is where you win the room.** OSC 8 hyperlinks make `file:line` clickable (opens the editor), synchronized output (DEC 2026) kills flicker, and a rendered source→sink taint trace is genuinely beautiful. VHS lets you script a flawless demo GIF for the README.
5. **The compliance story is concrete and India-specific**, mapping findings to exact RBI, PCI-DSS v4.0, and DPDP Act clause numbers — which India-based FinSec judges will recognize.

---

## Details

### PART A — Deterministic Autofix (replacing the LLM "Cerebus" entirely)

**How real, non-AI tools generate fixes (the prior art finsec copies):**

- **Semgrep `fix:`** — the rule YAML carries a `fix:` key whose value references the same metavariables captured by the pattern; `$X` in the pattern is substituted verbatim into the fix. Example from Semgrep docs: `pattern: $A == $B` / `fix: $A === $B`, or `pattern: from old_module import $FUNC` / `fix: from new_module import $FUNC`. `focus-metavariable` lets the fix rewrite just one sub-node (e.g. `secure=$VALUE`→`True`). Applied with `--autofix`; tested by placing a `.fixed.py` next to the target and diffing. This is pure metavariable substitution — deterministic and byte-stable.
- **ESLint fixer API** — `context.report({ fix(fixer){…} })` where `RuleFixer` exposes `replaceText(node, text)`, `insertTextBefore/After(node, text)`, `insertTextBeforeRange/AfterRange(range, text)`, `replaceTextRange(range, text)`, `removeRange(range)`. Fixes return `{range, text}` objects. **Conflict resolution: if two fixes touch overlapping character ranges, only one is applied** ("if two fixes want to modify characters 0 through 5, only one is applied"). ESLint runs `Linter.verifyAndFix` in a loop capped by a hard-coded `const MAX_AUTOFIX_PASSES = 10;` (in `lib/linter.js`, PR #8631), re-linting after each pass until no more fixable problems remain or the cap is hit; a 10-pass exhaustion is a documented signal of conflicting rules (ESLint issues #18007, #17609).
- **Ruff `--fix`** — classifies every fix by *applicability*: **Safe** (doesn't change program semantics, applied by default) vs **Unsafe** (may change semantics, requires `--unsafe-fixes`) vs **Manual/Display** (never auto-applied). Since v0.1.0 Ruff applies only safe fixes by default. Safety is tunable per-rule via `extend-safe-fixes` / `extend-unsafe-fixes`, and is exposed in JSON output under an `applicability` field.
- **rustc / cargo fix** — the canonical confidence model. `enum Applicability { MachineApplicable, MaybeIncorrect, HasPlaceholders, Unspecified }`: MachineApplicable = "definitely what the user intended, or maintains the exact meaning of the code… should be automatically applied"; MaybeIncorrect = "may be what the user intended, but it is uncertain… should result in valid Rust code"; HasPlaceholders = "contains placeholders like `(...)` or `{ /* fields */ }`… cannot be applied automatically because it will not result in valid Rust code"; Unspecified = confidence unknown. `cargo clippy --fix` applies only MachineApplicable.
- **Codemods & semantic patching prior art** — jscodeshift, OpenRewrite (LSTs + Recipes), comby, ast-grep (structural search/replace), and especially **Coccinelle** (SmPL "semantic patches" on the Linux kernel: `- !E & C` / `+ !(E & C)` with metavariables `expression E; constant C;`). Coccinelle proves deterministic, patch-syntax transformation scales to the largest C codebase on earth without any AI — "a single small semantic patch can modify hundreds of files, at thousands of code sites" (Inria/coccinelle.gitlabpages.inria.fr), and Lawall & Muller's *"Coccinelle: 10 Years of Automated Evolution in the Linux Kernel"* (USENIX ATC 2018) documents its long-running in-tree use (as of Linux v4.15, 59 semantic patches shipped in-tree, run continuously via `make coccicheck`). *(The earlier "5,000+ kernel / 200+ QEMU / 80+ systemd patches" figures circulate on conference slides but should be cited to the ATC 2018 paper rather than treated as audited.)*
- **Lossless/Concrete Syntax Trees** — the enabling technology for round-trip-safe rewriting. **LibCST (Instagram)** parses Python into a CST that "keeps all formatting details (comments, whitespaces, parentheses)" and is "useful for building automated refactoring (codemod) applications" — "the resulting code diff looks like a precise change made manually by a developer, but the process is fully automated." tree-sitter and rust-analyzer's **rowan** provide the same lossless property for other languages.

**finsec's deterministic autofix engine design:**

The engine is a small **fix-action VM** operating on a LibCST/tree-sitter CST (never on plain text — this guarantees comments/formatting survive). Each detection rule optionally emits one or more `FixAction`s.

*Fix-action vocabulary* (mirrors ESLint's RuleFixer + rustc applicability):
```
ReplaceNode(node_id, template)          # metavariable substitution, Semgrep-style
InsertBefore(node_id, template)
InsertAfter(node_id, template)
RemoveNode(node_id)
WrapNode(node_id, prefix_tpl, suffix_tpl)
AddImport(module, symbol)               # idempotent; dedups against existing imports
ReplaceArgKwarg(call_id, kw, template)
```
Each `FixAction` carries `applicability ∈ {MachineApplicable, MaybeIncorrect, HasPlaceholders, Unspecified}` and a `safety ∈ {safe, unsafe}` (Ruff-style). Templates use `$METAVAR` placeholders bound from the match environment (Semgrep/Coccinelle model).

*Concrete rewrite templates (fintech examples):*
```yaml
- id: py-flask-sql-string-concat
  fix_action: ReplaceNode
  # cursor.execute("... " + user_input)  ->  parameterized
  match: cursor.execute($Q + $V)
  template: cursor.execute($Q, ($V,))
  applicability: MaybeIncorrect     # placeholder count may vary
  safety: unsafe

- id: py-hardcoded-secret
  fix_action: ReplaceNode
  match: $K = "$LITERAL"             # where $K matches *_KEY|*_SECRET|*_TOKEN
  template: $K = os.environ["$K"]
  extra_action: AddImport(os)
  applicability: MaybeIncorrect
  safety: unsafe

- id: py-requests-verify-false
  fix_action: ReplaceArgKwarg
  match: requests.$M(..., verify=False)
  kw: verify
  template: "True"
  applicability: MachineApplicable
  safety: safe

- id: js-loose-equality-authcheck
  fix_action: ReplaceNode
  match: $A == $B
  template: $A === $B
  applicability: MachineApplicable
  safety: safe

- id: py-pan-in-log
  fix_action: WrapNode
  match: logger.info($MSG)           # where taint says $MSG carries PAN
  prefix_tpl: "logger.info(mask_pan("
  suffix_tpl: "))"
  extra_action: AddImport(finsec_runtime, mask_pan)
  applicability: MaybeIncorrect
  safety: unsafe
```

*Conflict resolution* (ESLint model): collect all `FixAction`s, sort by CST source range, and greedily apply non-overlapping actions; any action whose range overlaps an already-applied action is deferred. After applying a batch, re-parse and re-run rules; **loop up to N=10 passes** (ESLint's exact `MAX_AUTOFIX_PASSES`). If pass 10 still yields fixable findings, emit a warning that rules are likely conflicting (ESLint issue #17609 documents this exact failure mode) and stop.

*The verifier (this is the crux — it replaces the LLM's "verifier" half deterministically):* a fix is only kept if ALL hold:
1. **Reparse check** — patched source reparses to a valid CST (rustc's HasPlaceholders fixes are rejected here by construction).
2. **Rule re-run** — the originating detection rule no longer matches at that location (Semgrep's own `.fixed.py` testing discipline).
3. **No-new-findings check** — the full rule set produces no *new* findings introduced by the patch.
4. **Idempotency** — applying the fix twice equals applying it once (`fix(fix(x)) == fix(x)`).
5. **Safe-mode gate** — under default `--fix`, only `safety: safe` + `MachineApplicable` actions apply; `--unsafe-fixes` opts into the rest (Ruff's exact model).

**Why deterministic template + CST rewriting beats an LLM here (judge pitch language):**
- **Provable & reproducible**: the same commit always yields byte-identical patches; you can sign the patch (see Part C). An LLM's temperature>0 output isn't reproducible and can't be signed meaningfully.
- **No hallucination**: a template can only emit what its grammar allows; the verifier re-runs the rule so a "fix" that doesn't actually fix is discarded. LLMs routinely produce plausible-but-wrong patches that pass review.
- **Auditable**: every fix traces to a rule ID + template + applicability level a human wrote and reviewed — exactly the audit trail RBI's source-code-review controls expect.
- **Fast & offline**: microseconds per fix, no API, no data egress (critical when the code being scanned contains card data — you cannot ship a fintech codebase to a third-party LLM).
- **Byte-identical output** enables the whole attestation story.

**Before/after table (stripping the AI out):**

| Original "Cerebus" piece | AI? | Replacement in finsec |
|---|---|---|
| Quarantined LLM "suggester" model | ✅ removed | Human-authored fix templates in rule YAML (`fix_action` + `template`) |
| Dual-LLM guardrail / prompt isolation | ✅ removed | N/A — no untrusted model, so no guardrail needed |
| Deterministic diff builder | ❌ kept | CST fix-action VM (LibCST/tree-sitter), ESLint-style conflict resolution |
| Verifier (re-run rule on patch) | ❌ kept & strengthened | 5-gate verifier: reparse + rule re-run + no-new-findings + idempotency + safety gate |
| "Fix suggestion" UX | ⚠️ reframed | Deterministic side-by-side diff, applicability badge, `--fix`/`--unsafe-fixes` |

---

### PART B — Deep Static Analysis: the Dataflow / Taint Engine (core differentiator)

**Fundamentals.** Taint analysis tracks untrusted data from **sources** to dangerous **sinks**; **sanitizers** clear taint; **propagators** move taint through operations the engine doesn't model natively (e.g. `set.add(x)`). The classic formulation is source→sink reachability over a dataflow graph. Semgrep frames it exactly this way: "taint analysis… tracks the flow of untrusted, or tainted, data… Tainted data originates from tainted sources… taint analysis reports a finding whenever tainted data reaches a vulnerable function, called a sink. Tainted data flows from sources to sinks through propagators."

**Sensitivity dimensions and what's realistic in 24–36h:**
- **Flow-sensitive** (respects statement order) — *do this*; cheap and necessary.
- **Intraprocedural** (within one function) — *do this first*; Semgrep shipped taint mode intraprocedural-only for years.
- **Interprocedural via function summaries** (does f return taint if arg tainted? does it sink its arg?) — *do a limited version*; compute per-function summaries in one pass, then propagate across the call graph.
- **Field-sensitive** (distinguish `obj.a` from `obj.b`) — *partial, via access paths*; FlowDroid uses access paths for exactly this.
- **Context-sensitive / path-sensitive / full alias (points-to) analysis** — *out of scope*; mention Andersen's (inclusion-based, precise, slower) vs Steensgaard's (unification-based, near-linear, less precise) to show depth, then explicitly descope them. This honest scoping is itself a credibility signal to judges.

**The classical machinery (implement this):**
1. **CFG** per function; **SSA** form so each variable has one definition (Cytron et al. 1989), giving trivial **def-use chains** and **reaching definitions**.
2. **Monotone dataflow framework**: a lattice of dataflow facts (here: sets of tainted SSA values), monotone **transfer functions** per statement, joined at CFG merge points, solved to a **fixpoint** by a **worklist algorithm**.

*Worklist pseudocode (the core of the engine):*
```
IN[n], OUT[n] := ∅ for all nodes n
worklist := all CFG nodes
while worklist not empty:
    n := worklist.pop()
    IN[n]  := ⋃ OUT[p] for p in preds(n)          # join (may-taint = union)
    new    := transfer(n, IN[n])                    # gen tainted / kill on sanitize
    if new != OUT[n]:
        OUT[n] := new
        worklist.push_all(succs(n))
# transfer(n, in):
#   if n matches a source pattern:      return in ∪ {def(n)}
#   if n matches a sanitizer on v:      return in \ {v}
#   if n is assign lhs = expr:          return in ∪ {lhs} if any var(expr)∈in else in\{lhs}
#   if n matches a propagator from→to:  return in ∪ {to} if from∈in
#   if n matches a sink using v∈in:     record finding(source_of(v) → n); return in
```
Monotonicity + a finite lattice guarantees termination.

**IFDS/IDE (the "shows real depth" reference).** For interprocedural precision, the Reps–Horwitz–Sagiv **IFDS** framework (POPL 1995, "Precise interprocedural dataflow analysis via graph reachability," DOI 10.1145/199448.199462) reduces distributive dataflow problems to graph reachability on an exploded supergraph; **IDE** generalizes it to environment transformers. **FlowDroid** (Arzt et al., PLDI 2014) is the canonical IFDS taint tool — "precise context, flow, field, object-sensitive and lifecycle-aware," using a forward solver for taint plus a backward solver for aliases via access paths. finsec should *cite* IFDS as the theoretical ceiling and implement the simpler worklist+summaries version, noting IFDS is the upgrade path.

**How the real tools do it (design inputs):**
- **Semgrep taint mode** — the directly copyable YAML. `mode: taint` enables `pattern-sources`, `pattern-sinks`, `pattern-sanitizers`, `pattern-propagators`. Propagators use two metavariables with `from:`/`to:` (e.g. `pattern: $X.add($Y)` `from: $Y` `to: $X`). Sinks can be `exact: false` to taint subexpressions. Findings carry a **taint trace** source→sink. Semgrep conservatively assumes an unmodeled function returning a tainted arg is itself tainted.
- **CodeQL** — `DataFlow::Configuration` / `TaintTracking::Configuration` with `isSource`/`isSink`/`isSanitizer` predicates over a relational (Datalog-style) model.
- **Pysa** (Meta's Python taint analyzer) — external `.pysa` model files declare sources/sinks on library functions; good model for finsec's "framework models" file.
- **Joern / Code Property Graph** — the CPG merges **AST + CFG + PDG** into one queryable graph (Yamaguchi et al. 2014), queried in **CPGQL** (Scala DSL). "many dataflow tasks can be solved with graph traversal, e.g., IFDS." This is finsec's ideal internal representation: build a CPG-lite (AST + CFG + data-dependence edges) and run taint as graph reachability. Joern also does **fuzzy parsing** (robust to missing code / no build) — essential for hackathon-grade robustness.
- **Infer** (separation logic / Pulse), **SonarQube** (symbolic execution), **Snyk Code** — cite as the commercial landscape.

**Fintech-specific taint policy library (finsec's differentiator — concrete lists):**

*Python (Flask/FastAPI/Django):*
- Sources: `request.args.get(...)`, `request.form[...]`, `request.json`, `request.data`, `request.cookies[...]`, FastAPI path/query/body params, `flask.request.headers[...]`.
- SQL-injection sinks: `cursor.execute($Q)`, `db.engine.execute(...)`, `connection.execute(...)`, Django `.raw(...)`, `.extra(...)`.
- Command-injection sinks: `os.system(...)`, `subprocess.call(..., shell=True)`, `subprocess.run(..., shell=True)`, `eval(...)`, `exec(...)`.
- PAN/PII→log sinks: `logging.*`, `print(...)`, `logger.info/debug/...` when arg is taint-typed PAN/Aadhaar.
- Sanitizers: `shlex.quote(...)`, `int(...)`, `float(...)`, parameterized-query form, `bleach.clean(...)`, `django.utils.html.escape(...)`, a project `mask_pan(...)`.

*JS/TS (Express/Next.js):*
- Sources: `req.query.$P`, `req.body.$P`, `req.params.$P`, `req.headers[...]`, `req.cookies`.
- Sinks: `res.send($D)`, `res.write($D)`, `$EL.innerHTML = $D`, `child_process.exec($D)`, `db.query($D)`, `eval($D)`.
- Sanitizers: `DOMPurify.sanitize(...)`, `escapeHtml(...)`, `encodeURIComponent(...)`, parameterized query.

*Payment SDKs (Stripe, Razorpay) — the fintech twist:*
- Secret→egress: `STRIPE_SECRET_KEY`/`rzp_live_*` flowing to any non-Stripe/Razorpay network call, or into a log/analytics SDK.
- PAN/CVV from request body → any Razorpay/Stripe call that is NOT tokenization (flags storing raw card data — a direct RBI CoFT violation).
- Unvalidated `amount` from request → `razorpay.payment.capture(amount)` / Stripe `PaymentIntent(amount=...)` without a server-side amount check.
- Unsigned webhook body → business logic: taint from `request.body` reaching order-fulfilment before `verify_webhook_signature(...)` sanitizes it.

*Worked fintech taint rule (copy-paste schema):*
```yaml
rules:
  - id: pan-reaches-logger
    mode: taint
    languages: [python]
    message: "Cardholder PAN flows into a log sink (PCI-DSS 3.4.1 / RBI DPSC cl.32)"
    severity: ERROR
    metadata:
      compliance: [PCI-DSS-4.0:3.4.1, RBI-DPSC-2021:32, DPDP-2023:8(5)]
      money_at_risk: high
    pattern-sources:
      - pattern: request.json["card_number"]
      - pattern: request.form["pan"]
    pattern-propagators:
      - pattern: $D[$K] = $V
        from: $V
        to: $D
    pattern-sanitizers:
      - pattern: mask_pan(...)
      - pattern: tokenize(...)
    pattern-sinks:
      - pattern: logger.$M(...)
      - pattern: print(...)
```

**Rendering a taint path in the terminal (the visually stunning feature).** Each finding stores the ordered hops (source → propagators → sink), each with `file:line:col`. Render as a vertical trace with box-drawing gutters and OSC-8 clickable locations (mockup in Part D).

**Performance strategies (state them; implement the cheap ones):** cache parsed ASTs/CPGs keyed by file content hash; parallelize per-file across worker processes; compute per-function **summaries** once and reuse; **diff-aware scanning** against a baseline commit (only re-analyze changed files + their callers); incremental re-analysis on file-content-hash change. SparseDroid-style sparsification (skip irrelevant CFG nodes) is the documented way IFDS tools get large speedups (the ASE 2019 SparseDroid paper reports an average 22× speedup over FlowDroid on 40 Android apps) — cite as future work.

---

### PART C — Cryptographic Proofs & Signed Attestations (no AI, high wow)

**Canonical, byte-stable report.** Serialize the report with **RFC 8785 JSON Canonicalization Scheme (JCS)**: keys sorted by UTF-16 code-unit order, whitespace removed, numbers normalized (ECMAScript/Ryū), constrained to I-JSON. "Cryptographic operations like hashing and signing need the data to be expressed in an invariant format so that the operations are reliably repeatable." JCS guarantees two runs produce byte-identical bytes → identical hash → stable signature. (JWS/RFC 7515 solved the same problem via base64url; JCS lets the report stay human-readable JSON.)

**Signing scheme.** Compute `digest = SHA-256(JCS(report_without_signature))`, sign with **Ed25519** (fast, deterministic signatures, small 64-byte sigs, no nonce-reuse footgun) — recommended over ECDSA P-256 for a demo precisely because ECDSA needs a secure random nonce per signature and Ed25519 doesn't. Emit a **detached JWS** (RFC 7515) so the report body stays readable and the signature travels alongside. Optionally also emit **COSE** for the CBOR/embedded path.

**Reproducible builds / deterministic output** (prerequisite for signature stability): sort all finding arrays by content-address fingerprint; strip timestamps from the signed payload (record scan time in an unsigned envelope, or pin it to the git commit time); pin rule-pack version + tool version into the payload; ensure map iteration is ordered. Two scans of the same commit with the same rule-pack must be byte-identical.

**Content-addressed findings (survive line shifts).** Follow SARIF `partialFingerprints.primaryLocationLineHash` (GitHub code scanning): "code scanning uses fingerprints to match results across various runs so they only appear once… This makes it possible to match alerts to the correct line of code when files are edited." finsec fingerprint = `SHA-256(rule_id ∥ normalized_file_path ∥ hash_of_trimmed_line_content ∥ hash_of_surrounding_AST_context)`, truncated with a `:N` disambiguation suffix (SARIF's exact convention, e.g. `39fa2ee980eb94b0:1`). This makes findings stable across reformatting and line insertion — essential for baseline/diff scanning and for the ledger.

**Merkle scan ledger (the killer feature).** Maintain an append-only log where leaf `i` = `SHA-256(JCS(report_i))`. Store an interior Merkle tree; the current **root** is published (and optionally signed). For any historical report you can produce a **Merkle inclusion proof** (log(n) sibling hashes) that it's in the ledger, and a **consistency proof** that the ledger only ever appended (never rewrote history) — the exact constructs behind **Certificate Transparency** and Sigstore's **Rekor** transparency log ("an immutable, publicly verifiable Merkle-tree transparency log" returning "a signed inclusion proof and a timestamp"). Pitch: *"Point at any report we ever produced; we prove in milliseconds it hasn't been altered by a single byte."*

**Ecosystem alignment (cite, optionally integrate).** The report can be wrapped as an **in-toto attestation** with **SLSA provenance**-style predicate, and signed keyless via **Sigstore cosign** (OIDC → **Fulcio** short-lived ~10-min cert → **Rekor** log entry), verified with `cosign verify-attestation`. For a hackathon, ship your own Ed25519 + local Merkle ledger (works offline, no external dependency) and *mention* cosign/Rekor as the production upgrade. Also generate a signed **CycloneDX or SPDX SBOM** for dependency risk.

**`finsec verify` flow (offline):**
```
finsec verify report.finsec.json --key finsec.pub
  1. split detached JWS signature from JCS payload
  2. recompute SHA-256(JCS(payload)); check Ed25519 signature over digest
  3. if --ledger given: verify Merkle inclusion proof against published root
  4. exit 0 if all pass, 20 if signature invalid, 21 if ledger proof fails
```
Key management for the demo: generate an Ed25519 keypair at repo init (`finsec keygen`), commit the public key, keep the private key in an env var / OS keychain; in CI, sign with a CI-provided key or go keyless via cosign+OIDC.

---

### PART D — Insane Terminal UX / TUI Craft (pure craft, no AI)

**Reference-class quality.** The leading agent CLIs use React + Ink; the equivalent quality bar in Go is the **Charm** ecosystem: **Bubble Tea** (Elm-architecture TUI framework: Model/Update/View, "high-performance cell-based renderer, built-in color downsampling, declarative views… mouse handling"). Per Charm's own v2 release post, "the Bubble Tea ecosystem powers more than 25,000 open-source applications. Teams at NVIDIA, GitHub, Slack, Microsoft Azure and thousands of others build on top of them" — and TruffleHog (Truffle Security's credential scanner) is a named production user. The rest of the stack: **Lip Gloss** (CSS-like styling/layout, terminal color-capability detection), **Bubbles** (components: list, table, viewport, spinner, textinput, filepicker, progress), **Glamour** (markdown), **Huh** (forms), **Gum** (shell-script UI), **Wish** (serve TUIs over SSH), and **VHS** (script terminal GIFs/PNGs declaratively — record the demo for the README). Python equivalents: **Rich** (tables, syntax highlighting, live displays, progress) and **Textual** (full CSS-styled TUI framework). Node: **Ink**, **Clack**, **Ora**, **Chalk**, **Listr2**. Rust: **Ratatui**, **indicatif**, **crossterm**.

**Advanced terminal capabilities to show off:**
- **OSC 8 hyperlinks** — clickable `file:line` that opens the editor: emit `\033]8;;file:///abs/path.py:42\033\\path.py:42\033]8;;\033\\`. Supported by Kitty, iTerm2, WezTerm, Windows Terminal, Ghostty. This is the single most impressive small touch — Major agent CLIs have open feature requests for exactly this.
- **24-bit truecolor**, with graceful downsampling (Lip Gloss does this automatically).
- **Synchronized output (DEC 2026)** — batch rendering to eliminate flicker on live updates; per WezTerm's docs, "DECSET 2026 is set to batch (hold) rendering until DECSET 2026 is reset to flush the queued screen data."
- **Kitty graphics protocol / Sixel** — inline the scorecard chart or logo as an image on capable terminals.
- **Alternate screen buffer** for the interactive triage TUI; **mouse support**; **terminal capability detection** with graceful degradation.
- **NO_COLOR** standard + **TTY detection** — when piped (`| jq`), emit plain JSON, no ANSI.
- **Nerd Font icons with Unicode fallback**, box-drawing characters, accessible-contrast palettes.

**ANSI mockups of the key screens** (Nerd Font icons shown; degrade to ASCII):

*Main scan (live streaming + synchronized output):*
```
 finsec-lint v1.0.0 · scanning ./payments-api @ 4f2a9c1 (main)
 ────────────────────────────────────────────────────────────
  Parsing ........ 214 files    ████████████████████ 100%
  Taint pass ..... 1,908 fns    ████████████████░░░░  82%  eta 3s
 ────────────────────────────────────────────────────────────
  ⛔ CRITICAL  PAN → logger        app/routes/pay.py:88   ↩ trace
  ⛔ CRITICAL  user → SQL execute  app/db/orders.py:142   ↩ trace
  ⚠  HIGH      verify=False (TLS)  app/clients/psp.py:31  ✔ autofix
  ⚠  HIGH      rzp_live_ key in src app/config.py:12      ● live: ACTIVE
 ────────────────────────────────────────────────────────────
  4 findings  ·  2 auto-fixable  ·  money-at-risk: HIGH
```

*Taint trace visualization (OSC-8 clickable hops):*
```
 ⛔ CRITICAL  Cardholder PAN flows into a log sink
   rule: pan-reaches-logger   PCI-DSS 3.4.1 · RBI DPSC cl.32 · DPDP §8(5)
   ┌─ source ─────────────────────────────────────────────
   │ ● app/routes/pay.py:81   pan = request.json["card_number"]
   │ │
   │ ▼ propagate  (assignment)
   │ ○ app/routes/pay.py:84   payload["pan"] = pan
   │ │
   │ ▼ propagate  (dict store $D[$K]=$V)
   │ ○ app/routes/pay.py:86   audit = payload
   │ │
   │ ▼ SINK  (no sanitizer on path)
   │ ⛔ app/routes/pay.py:88   logger.info(audit)
   └───────────────────────────────────────────────────────
   fix: wrap sink arg in mask_pan(...)   [unsafe · MaybeIncorrect]
```

*Deterministic autofix diff:*
```
 Autofix · py-requests-verify-false · SAFE · MachineApplicable
   app/clients/psp.py
   ── 31 │ - resp = requests.post(url, json=body, verify=False)
   ++ 31 │ + resp = requests.post(url, json=body, verify=True)
   verifier: reparse ✔  rule-cleared ✔  no-new-findings ✔  idempotent ✔
   [a]pply  [s]kip  [d]iff  [e]xplain
```

*Interactive triage TUI (vim keys, split-pane, alternate screen):*
```
 finsec triage · 4 findings · j/k move · a fix · i ignore · / filter · q quit
 ┌────────────────────────────┬─────────────────────────────────────────────┐
 │ ▸ ⛔ PAN → logger  pay:88   │  app/routes/pay.py                            │
 │   ⛔ user → SQL   orders:142│   86  audit = payload                         │
 │   ⚠  verify=False psp:31    │   87                                          │
 │   ⚠  rzp_live_ key cfg:12   │ ▸ 88  logger.info(audit)   ⛔ PAN sink        │
 │                            │   89                                          │
 │ money-at-risk: HIGH        │  ── taint: source pay:81 → sink pay:88 (3 hop)│
 │ status: 0 fixed 0 ignored  │  ── fix: mask_pan(...)  [unsafe]              │
 └────────────────────────────┴─────────────────────────────────────────────┘
```

*Report verification:*
```
 finsec verify report.finsec.json
   payload canonicalized (RFC 8785 JCS) ....... ✔
   Ed25519 signature ......................... ✔  key 9f3a…c21
   Merkle inclusion proof (leaf 42 / root e7b1…) ✔
   reproducible: re-scan @4f2a9c1 == signed digest ✔
   VERDICT: AUTHENTIC & UNALTERED            exit 0
```

*Final scorecard:*
```
 ╔══════════════ finsec compliance scorecard ══════════════╗
 ║  score  62 / 100        gate: FAIL (min 80)             ║
 ║  ⛔ 2 critical  ⚠ 2 high  ● 0 med  ○ 0 low              ║
 ║  ───────────────────────────────────────────────────   ║
 ║  PCI-DSS v4.0 ......  3.4.1 ✗  3.5.1 ✗  6.2.4 ✗         ║
 ║  RBI DPSC 2021 .....  cl.24 ✗  cl.31 ✗  cl.32 ✗         ║
 ║  RBI CoFT ..........  raw PAN stored ✗                  ║
 ║  DPDP Act 2023 .....  §8(5) ✗  §8(6) ⚠                  ║
 ║  money-at-risk: HIGH   ·  2 auto-fixable                ║
 ║  report signed ✔   ledger leaf #42 ✔   trend ▁▂▃▅▇ ↑    ║
 ╚═════════════════════════════════════════════════════════╝
```

---

### PART E — What Else Makes a Non-AI CLI Unique (deterministic, provable)

- **Live secret validity checking (TruffleHog-style, no AI).** For each detected credential, make a stateless read-only API call to the issuing service to determine if it's still active — "the AWS credential detector performs a GetCallerIdentity API call against the AWS API to verify if an AWS credential is active." TruffleHog's model: HTTP 200 = **verified/active**; explicit failure = invalid; network error = **indeterminate/unknown** (they call these *determinate* vs *indeterminate*). finsec ships verifiers for AWS, Stripe (`sk_live_`), Razorpay (`rzp_live_`), GitHub, Slack, and shows a live `● ACTIVE / ○ revoked / ? unknown` badge. Verification is off by default (`--verify-secrets`) since it makes network calls.
- **Git history archaeology / time-travel.** `git log -S<secret>` / blame to answer "which commit introduced this, by whom, is it still live." Combined with live check → "active secret leaked 14 months ago by X, still valid" — a devastating demo line, all deterministic git plumbing.
- **Attack-path graph by chaining taint results.** Build a graph whose nodes are findings and whose edges connect a finding's sink to another finding's source (or shared tainted variable); run reachability/shortest-path to surface multi-step attack chains (e.g. leaked key → egress → PAN store). Pure graph algorithms.
- **Money-at-risk scoring via a deterministic rule table.** Each rule carries a `money_at_risk` weight; aggregate with a transparent scoring function (not ML). Every number is explainable and reproducible.
- **Blast-radius computation via reachability.** From a vulnerable function, compute the set of reachable API endpoints / exported handlers over the call graph — "how much of the app does this expose."
- **OpenAPI spec linting (Spectral-style rulesets).** Deterministic rules over the OpenAPI document: missing/weak `securitySchemes`, endpoints without auth, missing rate-limit headers, PII in query params, `http` (non-TLS) servers.
- **Policy-as-code with OPA/Rego (excellent non-AI fit).** Emit findings as JSON and evaluate compliance gates in **Rego** via Open Policy Agent, which "decouples policy decision-making from application logic"; policies are declarative, versionable, testable, and (per the OPA docs) can "generate arbitrary structured data as output" such as a clear list of policy violations. Ship a `finsec.rego` that expresses the org's quality gate (e.g. "deny if any PCI-3.4.1 finding"). This is genuinely how cloud-native teams do compliance gating.
- **Differential/baseline scanning + quality gates** using content-addressed fingerprints (only fail CI on *new* findings vs a baseline commit).
- **SBOM generation + dependency risk** (CycloneDX/SPDX), signed (Part C).
- **Property-based testing / fuzzing of the rules engine itself** to prove a low false-positive rate — generate random-but-valid code, assert no findings on known-safe patterns.
- **Benchmark against known-vulnerable corpora and report precision/recall — the deterministic, measurable claim judges love.** Run finsec against the **OWASP Benchmark** (v1.2 contains exactly **2,740 test cases — 1,415 true positives and 1,325 false positives across 11 vulnerability/CWE categories**; four outcomes TP/FN/TN/FP), the **NIST Juliet Test Suite** (v1.3: **64,099 C/C++ test cases across 118 CWEs and 28,886 Java test cases across 112 CWEs**, per NIST's official release doc — each case pairs a `bad()` and `good()` function), **NIST SARD**, plus **OWASP WebGoat/DVWA/damn-vulnerable-bank** for realism, and publish precision/recall/F1. A concrete "we scored X% TPR at Y% FPR on OWASP Benchmark" is far more credible than any AI hand-wave. (Caveat honestly: synthetic benchmarks let pattern-matchers over-score vs real cross-file flow — say so.)
- **Editor LSP server (`finsec lsp`) — very impressive, totally AI-free.** Implement `textDocument/publishDiagnostics`, and `textDocument/codeAction` returning **LSP `WorkspaceEdit`s** built from the same fix-action VM — the exact mechanism IntelliJ/gopls quick-fixes use. One engine, three surfaces (CLI, CI, editor).
- **Pre-commit hook** distribution + **deterministic rule DSL** so users write their own sources/sinks/fixes in YAML.

---

## Revised positioning & pitch

**One-liner:** *"finsec-lint — the security & compliance scanner that doesn't guess. Every finding has a provable data-flow path; every fix is verified; every report is cryptographically signed. Zero AI."*

**30-second judge pitch:** "Most new security tools are an LLM in a trench coat — they hallucinate vulnerabilities, hallucinate fixes, and you ship a fintech codebase full of card data to someone else's model. finsec is the opposite: a real interprocedural taint engine that traces cardholder data from the request body to the log line it leaks into, a template-and-syntax-tree autofix engine that *re-runs the rule to prove the fix worked*, and a signed, reproducible compliance report mapped to PCI-DSS 4.0, RBI's Digital Payment Security Controls, the card-tokenization mandate, and the DPDP Act. Same commit, same bytes, same signature — every time. An LLM guesses; we prove."

**Rebuttal lines for "why no AI?"**
- "Because we can *prove* our results and an LLM can't. Reproducible, signable, auditable — that's the whole point of a compliance tool."
- "Because you legally can't ship card data to a third-party model — RBI's controls and the DPDP Act's security-safeguard duty (§8(5)) make data egress the vulnerability, not the fix."
- "Because determinism is the feature: our fixes are byte-identical every run, so we sign them; an LLM at temperature>0 is unsignable."
- "Because false positives cost engineer-trust; we benchmark precision/recall on OWASP Benchmark and Juliet and publish the numbers. Can the AI tool?"

---

## Revised CLI command tree

```
finsec
  scan [PATH]              run analysis (default command)
    --rules <pack|dir>     rule packs (default: all bundled)
    --taint / --no-taint   toggle taint engine (default on)
    --lang <py,js,ts,go>   restrict languages
    --baseline <ref>       diff-aware scan vs git ref (only new findings fail)
    --verify-secrets       live secret validity checks (network)
    --format <tty|json|sarif|junit>   output mode (auto-detects TTY)
    --output <file>
    --sign                 emit signed report + append to ledger
    --fail-on <sev>        gate severity threshold
    --gate <finsec.rego>   OPA/Rego policy gate
  fix [PATH]               apply deterministic autofixes
    --unsafe-fixes         include unsafe / non-MachineApplicable
    --dry-run / --diff     show diffs, don't write
    --rule <id>            restrict to a rule
  triage                   interactive TUI (alternate screen, vim keys)
  verify <report>          check signature + Merkle inclusion (offline)
    --key <pub>  --ledger <path>
  attest <report>          wrap as in-toto/SLSA, optionally cosign keyless
  ledger                   inspect scan ledger (root, proofs, trend)
    proof <leaf>           emit inclusion/consistency proof
  sbom                     generate signed CycloneDX/SPDX SBOM
  lint-openapi <spec>      Spectral-style OpenAPI ruleset
  lsp                      run as Language Server (diagnostics + code actions)
  rules                    list/show/test rules (ruleid:/ok: annotations)
  keygen                   generate Ed25519 keypair
  bench <corpus>           run OWASP Benchmark/Juliet, report precision/recall
```

**Config file (`finsec.toml`):**
```toml
[scan]
languages = ["python", "javascript"]
rules = ["p/fintech", "p/pci", "p/rbi", "p/dpdp"]
taint = true

[gate]
fail_on = "high"
min_score = 80
policy = "finsec.rego"

[fix]
unsafe_fixes = false

[fix.safety]           # Ruff-style per-rule promotion/demotion
extend_safe = ["py-requests-verify-false"]
extend_unsafe = ["py-hardcoded-secret"]

[attest]
sign = true
ledger = ".finsec/ledger"
key = "env:FINSEC_ED25519_SK"
```

**Exit codes:** `0` clean / gate pass · `1` findings ≥ gate severity · `2` config/usage error · `3` parse/internal error · `20` signature invalid (`verify`) · `21` ledger proof failed · `30` autofix verifier rejected all fixes.

**Output modes:** `tty` (rich TUI, auto when stdout is a terminal & NO_COLOR unset) · `json` (JCS-canonical, pipe-friendly) · `sarif` (with `partialFingerprints` for GitHub code scanning) · `junit` (CI test reports).

---

## Recommended tech stack (with tradeoffs)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Go + Bubble Tea/Lip Gloss (CLI) + Python worker** | Single static binary; best TUI ecosystem (25k+ apps; TruffleHog uses it); trivial cross-compile for judges; keeps Python `ast`/LibCST/tree-sitter for analysis | Two languages; IPC over the Core API | **RECOMMENDED** |
| Python + Textual/Rich (all-in-one) | One language; Rich/Textual are excellent; LibCST/`ast` native | Packaging to a binary is painful; TUI perf below Bubble Tea; slower | Strong fallback if team is Python-only |
| Node + Ink | Matches the leading agent CLIs' approach; great DX | Weakest for heavy AST analysis; another runtime | Only if team is JS-first |
| Rust + Ratatui | Fastest; rowan CST is ideal; single binary | Steepest curve; slowest to build in 36h | Overkill for a hackathon |

**Decision:** the team already needs a **Python scan worker** (for `ast`/LibCST/tree-sitter and the richest fintech library ecosystem), so pair it with a **Go + Charm** CLI that talks to the shared **FastAPI Core API**. You get the single-binary demo polish *and* Python's analysis muscle. Use **VHS** to record the demo GIF. Datastore: **SQLite** for the hackathon (zero-config, file-based ledger fits perfectly); Postgres is the production upgrade. Queue: in-memory for the demo, Redis+RQ later.

---

## Hour-by-hour CLI build plan (≈36h)

- **H0–3 — Skeleton & Core API contract.** Go CLI scaffold (Cobra + Bubble Tea), define the Core API JSON schema for findings/fixes/traces, stub Python worker (FastAPI) returning a canned finding. Get `finsec scan` end-to-end with one hardcoded finding rendered in the TUI.
- **H3–9 — Detection + taint MVP.** Python worker: parse with `ast`/tree-sitter, build per-function CFG, implement the worklist taint algorithm intraprocedurally, load the Semgrep-style YAML source/sink/sanitizer schema. Land 6–8 fintech rules (PAN→log, user→SQL, verify=False, hardcoded key, unsigned webhook, unvalidated amount).
- **H9–14 — Taint trace UX.** Stream findings live; render the source→sink trace with box-drawing + **OSC 8** clickable file:line; synchronized output for flicker-free updates. This is the demo centerpiece — polish it.
- **H14–20 — Autofix engine.** Fix-action VM on LibCST; implement ReplaceNode/ReplaceArgKwarg/AddImport/WrapNode; 4 safe + 3 unsafe templates; ESLint-style conflict resolution + 10-pass loop; 5-gate verifier; side-by-side diff UI.
- **H20–25 — Attestation.** RFC 8785 JCS serialization; Ed25519 sign; content-addressed fingerprints (SARIF-style); Merkle ledger (SQLite) with inclusion proof; `finsec verify` offline flow.
- **H25–29 — Interactive triage TUI + scorecard** (alternate screen, vim keys, split pane); compliance scorecard with clause mapping; money-at-risk aggregation.
- **H29–32 — Differentiators.** Live secret check (Stripe/Razorpay/AWS) behind `--verify-secrets`; git-blame secret archaeology; OPA/Rego gate; SARIF output.
- **H32–34 — Benchmark run.** Score against OWASP Benchmark / a Juliet subset; bake precision/recall into the pitch.
- **H34–36 — Demo polish.** VHS-recorded GIF, README, dry-run the demo script twice.

**Demo script (5 min):** (1) `finsec scan` on damn-vulnerable-bank — live findings stream in. (2) Click a PAN→logger trace; it opens the editor at the sink. (3) `finsec fix --diff` — show the verifier's four green checks. (4) `finsec scan --sign` then `finsec verify` — AUTHENTIC & UNALTERED; hand-edit one byte of the report and re-verify → FAIL. (5) Scorecard with RBI/PCI/DPDP clause mapping + your measured OWASP Benchmark TPR/FPR. Close: "An LLM guesses; we prove."

**Risk register:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Interprocedural taint too ambitious | High | Ship intraprocedural first (Semgrep did for years); summaries only if time |
| Autofix breaks code | Med | 5-gate verifier + safe-by-default (Ruff/rustc model); worst case fixes are skipped, never wrong |
| CST library friction (LibCST build/Rust toolchain) | Med | Pre-build wheels; fall back to `ast` + line-based edits for MVP |
| Two-language IPC eats time | Med | Freeze the Core API JSON contract at H3; canned fixtures for parallel work |
| Terminal feature not supported on judge's terminal | Low | Capability detection + graceful degradation + NO_COLOR; VHS GIF as backup |
| Live secret check hits rate limits / offline venue | Med | Off by default; never required for the core demo |

---

## Compliance mapping reference (exact clause numbers for the scorecard)

Verified against primary sources; use these in rule metadata and the scorecard so India-based judges recognize them.

- **PCI-DSS v4.0** — **Req 3.4.1** (PAN masked on display: at most BIN + last four visible); **Req 3.5.1** (stored PAN rendered unreadable via strong cryptography, truncation, tokenization, or one-way hashing); **Req 3.3.1** (never store sensitive authentication data — CVV/CVC/PIN — after authorization, now applying to all entities); **Req 6.4.1** (public-facing web apps protected by a WAF / automated technical solution). Future-dated v4.0 requirements became mandatory 31 March 2025.
- **RBI "Master Direction on Digital Payment Security Controls"** — circular **RBI/2020-21/74; DoS.CO.CSITE.SEC.No.1852/31.01.015/2020-21, dated 18 Feb 2021**. Relevant clauses in the Application Security Life Cycle (ASLC) section: **cl.20** ("secure by design" approach), **cl.21(d)** ("testing including source code review" as a defined lifecycle phase), **cl.24** (mandatory source-code review / VA / PT against OWASP; third-party code must carry a vendor certificate that it is "free of known vulnerabilities, malwares and any covert channels"), **cl.31** (applications must correctly "handle, store and protect payment data," referencing OWASP-ASVS/MASVS), **cl.32** (redact/mask card numbers and sensitive info in SMS/email), and **cl.18** (effective logging and monitoring of user activity and anomalous transactions). *(If targeting non-bank PSOs/aggregators, note the separate 2024 "Master Direction on Cyber Resilience and Digital Payment Security Controls for non-bank PSOs," which adds an explicitly titled API-security control area.)*
- **RBI Card-on-File Tokenisation (CoFT)** — circular **RBI/2021-22/96; CO.DPSS.POLC.No.S-516/02-14-003/2021-22, dated 7 Sept 2021**, para 4: "no entity in the card transaction / payment chain, other than the card issuers and / or card networks, shall store the actual card data" (only last four digits + issuer name may be retained for reconciliation). The rule originates in this Sept 2021 circular but its **final enforced date was 1 October 2022** after RBI moved the purge deadline from 1 Jan 2022 to 30 June 2022 and then to 30 Sept 2022 — cite both dates.
- **DPDP Act, 2023** (Act No. 22 of 2023, assent 11 Aug 2023) — **Section 2(i)** ("Data Fiduciary… determines the purpose and means of processing of personal data"); **Section 2(j)** ("Data Principal… the individual to whom the personal data relates"); **Section 8(5)** — the security-safeguards duty: a Data Fiduciary must "protect personal data in its possession or under its control… by taking reasonable security safeguards to prevent personal data breach" (max penalty ₹250 crore); **Section 8(6)** — breach notification to the Data Protection Board and affected principals; **Section 9** — processing of children's data requires verifiable parental consent and bars tracking/behavioural monitoring/targeted ads at children. *(Cite the two Section 2 definitions by named term + "Section 2," since sub-clause lettering is reported inconsistently across secondary sources; verify letter-precision against the official MeitY gazette PDF.)*

---

## How GUI / Web / Automation surfaces change (branches gui, web, auto)

The removal of AI *simplifies* every surface because the Core API is now a pure, deterministic function of (code, rules) → (findings, fixes, signed report). All clients render the same signed artifact.

- **`gui`** — desktop/web GUI drops any "AI fix suggestion" panel; instead shows the interactive taint-trace graph (reuse the CLI's hop model), the deterministic diff with the verifier's four checks, and a signature/ledger badge ("verified unaltered"). Add a visual attack-path graph (chained taint) — a strong visual the CLI can only approximate.
- **`web`** — the web dashboard becomes a *verifiable report viewer*: upload/point at a `report.finsec.json`, it verifies the signature and Merkle inclusion **in the browser** (Ed25519 + JCS are trivial in WASM/JS), and renders the trend sparkline from the ledger. Compliance clause mapping (PCI/RBI/DPDP) as filterable views. No model serving infra needed — cheaper and simpler.
- **`auto`** — CI/automation is the biggest winner: a GitHub Action / pre-commit hook runs `finsec scan --baseline origin/main --format sarif --gate finsec.rego`, uploads SARIF (with stable fingerprints so alerts don't duplicate), and gates the pipeline. Because output is reproducible and signed, the CI can attach the signed report as a build artifact / in-toto attestation (optionally cosign-keyless via the CI's OIDC identity → Fulcio → Rekor). "The pipeline gate is now a cryptographic fact, not a probabilistic opinion."

Shared benefit: one deterministic engine, four thin clients, one signed source of truth — and nothing to explain to a security review about where the code was sent.

---

## Recommendations (staged)

1. **Now (first 6h): lock the wedge.** Build the Go+Charm CLI ↔ Python worker over a frozen Core API JSON contract, and get one taint finding rendering live. If you build nothing else impressive, the **taint trace with OSC-8 clickable hops** is the demo — prioritize it over breadth of rules. *Threshold to proceed:* end-to-end scan renders a real trace by H9.
2. **Next (H9–25): the two other flexes.** Land the CST autofix engine with its 5-gate verifier (safe-by-default) and the Ed25519 + JCS + Merkle attestation with offline `finsec verify`. These are independently demoable and each is a "wow." *Threshold:* `finsec verify` detects a one-byte tamper by H25.
3. **Then (H25–34): credibility multipliers.** Interactive triage TUI, compliance scorecard with exact RBI/PCI/DPDP clause numbers, live secret check, and a benchmark number (precision/recall on OWASP Benchmark or a Juliet subset). A published accuracy number is the most judge-persuasive artifact you can produce and directly answers "why no AI?"
4. **Always: sell determinism as the feature.** Every screen should reinforce provable/reproducible/signed. Rehearse the "an LLM guesses; we prove" close and the one-byte-tamper reveal.

**Benchmarks that would change the plan:** if intraprocedural taint isn't working by H9, cut interprocedural entirely and add more single-pattern rules (still impressive). If LibCST fights you by H16, fall back to `ast`+range edits for fixes and keep the verifier. If the venue is offline, drop `--verify-secrets` from the demo (it's off by default anyway).

---

## Caveats

- **Scope honesty is a feature, not a weakness** — tell judges plainly that finsec is flow-sensitive + intraprocedural (+ limited summaries), not full context/path/alias-sensitive like FlowDroid's IFDS; over-claiming precision is the fastest way to lose credibility with technical judges.
- **Synthetic benchmarks flatter pattern-matchers.** OWASP Benchmark and Juliet are self-contained single-file cases; a good score there does not prove real cross-file performance (arXiv "RealVuln" and others document this). Report the number *with* this caveat.
- **Live secret verification touches third-party APIs** — it makes real network calls, can hit rate limits, and must be stateless/read-only (TruffleHog's discipline); keep it opt-in.
- **CoFT effective-date nuance:** the no-raw-card-storage rule originates in RBI's 7 Sept 2021 CoFT circular (para 4) but its final enforced date was 1 October 2022 after extensions — cite both.
- **DPDP clause lettering** for the two core definitions (Data Fiduciary vs Data Principal in Section 2) is reported inconsistently across secondary sources; cite by named term + Section 2, and verify letter-precision against the official MeitY gazette PDF before publishing.
- **cosign/Rekor keyless signing needs network + OIDC**; for an offline hackathon demo, ship the self-contained Ed25519 + local Merkle ledger and present cosign/Fulcio/Rekor as the production upgrade path.
- Some cited figures (Bubble Tea "25,000+ apps," "22× IFDS speedup") come from vendor/marketing or a single paper — directionally reliable, not independently audited.