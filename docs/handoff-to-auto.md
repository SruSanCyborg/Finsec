# Handoff: what the `cli` branch needs from `auto`

For whoever owns the Core API, scan worker, and Cerebus. Written from the CLI side after building against the frozen contract in [`../contract/openapi.yaml`](../contract/openapi.yaml).

Nothing here is a request to change your design. It is a list of the places where the PRD is silent or self-contradictory, what the CLI does today as a result, and which of those decisions need your agreement to hold.

Full rationale for each item is in [`decisions.md`](decisions.md).

---

## 1. Read this first: the rule IDs changed

**`FIN-SEC-001` is now `SIR-SEC-001`.** The project was renamed `finsec-lint` → `sirius`, rule identifiers included.

This is the one item that will cost real rework if it reaches you late, because you are building the YAML rule catalogue, the detection rules, and the Cerebus fix templates against IDs that appear 137 times in the PRD.

| Was | Now |
|---|---|
| `FIN-SEC-001` … `FIN-SEC-060` | `SIR-SEC-001` … `SIR-SEC-060` |
| `FIN_ERR_*` | `SIRIUS_ERR_*` |
| `X-FinSec-Signature` / `-Event` / `-Delivery` | `X-Sirius-Signature` / `-Event` / `-Delivery` |
| `# finsec-ignore: FIN-SEC-010` | `# sirius-ignore: SIR-SEC-010` |
| `finsec.dev` | `sirius.dev` |

**Unchanged:** the numbering scheme (blocks of ten by category — `SIR-SEC-010` is the rule `FIN-SEC-010` was), and every compliance clause. PCI-DSS 8.6.2, 6.2.4, 8.4.2, 3.4.1, 3.5.1, RBI DPSC, DPDP §8, GDPR Art.5 are external standards and did not move.

`docs/original-prd.md` still says `finsec-lint` throughout — it is the source research artifact and was deliberately left as received. Read it against the table above.

---

## 2. Four things only you can decide

The CLI cannot invent these, and all four surfaces depend on them being defined once, server-side.

| # | What | Why it is blocking |
|---|---|---|
| 1 | **Compliance-score formula** | Arrives as `72.5`, renders as `72/100`. Severity-weighted? Category coverage? The CLI footer meter and the web gauge both display it, and they must agree. |
| 2 | **Fingerprint algorithm** | Drives baseline diffing, dedup, and suppression matching across every surface. Likely rule id + path + normalized snippet hash, deliberately line-number-insensitive — but it has to be one definition, computed server-side. The CLI has no engine and cannot compute it. |
| 3 | **Money-at-risk model** | The PRD says heuristic table, then gives no table, no per-rule multipliers, and one `money_at_risk_model` value (`provider_key`). The ₹ figure is the demo's most memorable number. |
| 4 | **The K/S auth split** | See §4 — as specified, four CLI commands cannot work in CI. |

---

## 3. Contract additions the CLI is already coding against

These are in `contract/openapi.yaml` today. If you implement something different, the CLI breaks.

**`POST /scans` accepts two extra fields** — `severity_threshold` and `fail_on`. The PRD's body had `policy_id` but no threshold, while `scan.completed` carried a server-computed `exit_code`, so nobody owned the gate. The CLI sends both up **and computes its own exit code locally**, treating yours as a cross-check. Keep sending `exit_code`; a mismatch is logged, not obeyed. Rationale: CI gating has to be deterministic offline and under `--replay`.

**`Finding` gains `col`** (1-indexed column of the offending token). The PRD has it in the DDL but omits it from the WebSocket `finding` frame. The CLI needs it to align the `╰──` underline under the secret. It degrades gracefully when null, but the demo's best visual depends on it.

**`Finding` gains `triage_state`** — `open | accepted | dismissed | suppressed`. The PRD describes a triage endpoint as "accept/dismiss/suppress" but the DDL has only a `suppressed` boolean: one value for three verbs. Keep `suppressed` derived from `triage_state == "suppressed"` so existing gate logic is untouched. `accepted` ("real, will fix") and `dismissed` ("false positive") are opposite judgements, and flattening them destroys the audit trail.

**`PATCH /scans/{id}/findings/{fid}`** takes `{ triage_state, reason?, expires_at? }`. `reason` is required for `dismissed` and `suppressed`.

**WebSocket auth**: `Authorization: Bearer <key>` on the upgrade request, with a `?token=` query fallback for browsers, which cannot set headers on a handshake. Close with `4401` on rejection — the CLI already handles that code specifically.

**Severity → SARIF level**: `critical`+`high` → `error`, `medium` → `warning`, `low`+`info` → `note`. `baseline_state` passes through untouched, since `new|unchanged|absent` are already SARIF's own `baselineState` tokens.

---

## 4. The contradiction that needs your ruling

The PRD's endpoint table marks these **S = session/JWT only**:

- `PATCH /scans/{id}/findings/{fid}` (triage)
- `GET/POST /rules`, `POST /rules/validate`
- `GET/POST /suppressions`
- `GET/POST /baselines`
- `GET/PUT /projects/{id}/policy`

But `sirius triage`, `sirius suppress`, `sirius baseline`, and `sirius rules` are all CLI commands, and the CLI authenticates with **K = Bearer API key**.

**As written, those four commands work interactively and fail in CI.** That defeats the point of `suppress` and `baseline`, which exist precisely so a pipeline can accept a known state.

Either those endpoints accept API keys, or the PRD's command tree is wrong. The CLI is built assuming **they accept `K`**. If you disagree, say so now and I will gate them behind a clearer error instead.

---

## 5. Smaller things the CLI decided on its own

Low-stakes, listed so you are not surprised. Full reasoning in `decisions.md` (D-001…D-015).

- **`GET /rules` returns the full 13-rule `p/fintech-core` catalogue**, and the contract carries it as a response example so every surface renders identically. Your real implementation should return the same IDs, categories, severities, and `compliance_ref` values.
- **`GET /rules/{id}` returns `yaml_body`** — the CLI prints it verbatim. It is what makes the engine legible rather than a black box, and it is a good demo moment.
- **`rules test` is not implemented.** It would need either a local engine (violating the golden rule) or an endpoint that does not exist. If you want it, it needs a `POST /rules/test` taking a rule and a snippet.
- **`sirius report` does not verify the JWS.** There is no public-key endpoint. If you expose a JWKS URL, the CLI can verify on stage — which is what makes "a signed report CI can gate on" tangible.
- **Device-flow login is unimplemented** — no `/auth/device/*` endpoints exist. `sirius login` stores a project API key directly, which is what CI needs anyway.
- **Pagination** for `GET /scans/{id}/results` is assumed to be `limit` + `cursor` with `{ items, next_cursor }`. It is also unspecified how paginated results reconcile with findings already delivered over the WebSocket — the CLI de-duplicates by finding `id`.

---

## 6. How to check yourself against the CLI

The mock is the executable spec. When your Core API is up:

```bash
env SIRIUS_API_URL=<your-api> SIRIUS_WS_URL=<your-ws> SIRIUS_API_KEY=<key> \
    SIRIUS_PROJECT_ID=<id> sirius doctor
```

`doctor` checks reachability, credentials, and the stream handshake, and tells you which config layer each value came from. Then:

```bash
sirius scan contract/fixtures/chaos-repo
```

The chaos repo has three planted findings at known line numbers (`src/config.py:14`, `src/ledger.py:88`, `src/webhooks.py:52`). `contract/mock/smoke.mjs` asserts the totals the demo depends on: 2 critical / 5 high / 9 medium / 3 low, ₹51,20,000, score 72.5, exit 1. If your engine produces those against the chaos repo, the CLI will render the demo correctly.
