# chaos-repo — deliberately vulnerable test fixture

**Every security flaw in this directory is intentional.** It is the seeded target
`sirius scan .` points at during the demo, and the fixture our own tests assert
against. Nothing here is deployed, imported, or executed.

No credential in this tree is real. `sk_live_51H8xR2eZvNOTAREALKE` is
shaped like a Stripe secret key so the detector's regex and entropy checks fire,
but it is not a key and never was. Live secret validation in the demo uses a
Stripe **test** key, per the PRD's risk register.

**This fixture is the demo, not the coverage.** It plants three findings and the
engine reports six; the other seven rules are demonstrated in
[`../rule-gallery`](../rule-gallery), which exists so this one's totals never
have to move to prove a rule works.

## Planted findings

Line numbers are load-bearing — `contract/fixtures/demo.jsonl` references them,
and `contract/mock/generate-fixture.mjs` is the generator. If you edit these
files, re-check the line numbers or the demo's code frames will point at the
wrong source.

| File | Line | Rule | What |
|---|---|---|---|
| `src/config.py` | 14 | SIR-SEC-001 | Hardcoded payment-provider secret key |
| `src/ledger.py` | 88 | SIR-SEC-010 | SQL built with string formatting |
| `src/webhooks.py` | 52 | SIR-SEC-030 | PAN written to an application log |

Each file also contains a correct counterpart to the flaw it plants —
`ledger.py` uses bound parameters everywhere except line 88, and `webhooks.py`
verifies its HMAC signature in constant time. That contrast gives the scanner
true negatives sitting right next to the true positives, which is the honest way
to show a low false-positive rate.
