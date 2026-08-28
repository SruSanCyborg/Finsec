# rule-gallery — one demonstrated example of every rule

**Every security flaw in this directory is intentional.** Nothing here is
deployed, imported, or executed, and no credential in it is real.

This fixture is not the demo. [`../chaos-repo`](../chaos-repo) is, and its line
numbers are load-bearing for the demo's code frames. This one exists for a
different reason.

## Why it exists

Six of the engine's rules had no example anywhere. Nothing in the demo fixture
tripped `SIR-SEC-002`, `011`, `021`, `031`, `040` or `041`, so they shipped, were
unit-tested against hand-written snippets, and were never run end to end against
a file on disk. A rule with no example is a rule nobody has watched run.

Pointed at the engine for the first time, this fixture found three defects:

| Rule | What was wrong |
|---|---|
| `SIR-SEC-021` | Matched `verify=False` only, and missed `options={"verify_signature": False}` — PyJWT's documented idiom, and the spelling almost every real codebase uses |
| `SIR-SEC-030` | Flagged `card["number"][-4:]`, a last-four that PCI-DSS 3.3.1 explicitly permits |
| `SIR-SEC-031` | Counted one class-body assignment twice — two findings with one fingerprint, doubled in the totals and in the money, collapsing to a single row in every baseline |

## The shape of each file

Every planted flaw sits **beside a correct counterpart doing the same job**:
bound parameters next to string-formatted SQL, a verified JWT next to an
unverified one, a truncated PAN next to a full one. That gives the scanner true
negatives in the same file as the true positives, which is the only honest way to
show a low false-positive rate — and `rule-gallery.test.ts` asserts the exact
lines, so a rule that starts flagging the correct version fails the build.

| File | Rules |
|---|---|
| `src/secrets.py` | `SIR-SEC-001` provider key · `SIR-SEC-002` high-entropy credential |
| `src/injection.py` | `SIR-SEC-010` SQL string formatting · `SIR-SEC-011` shell command |
| `src/auth.py` | `SIR-SEC-020` unauthenticated route · `SIR-SEC-021` unverified JWT |
| `src/pii.py` | `SIR-SEC-030` PAN in logs · `SIR-SEC-031` PAN stored unmasked |
| `src/crypto.py` | `SIR-SEC-040` MD5 · `SIR-SEC-041` cardholder data over HTTP |
| `src/money.py` | `SIR-SEC-050` no rate limit · `SIR-SEC-051` no idempotency key |
| `requirements.txt`, `package.json` | `SIR-SEC-060` install hook, non-registry dependency, floating pin |

## One thing that will surprise you

`"dayjs": "^1.11.10"` in `package.json` is a floating range and is **not**
flagged. That is correct: the rule only reports a floating range when no
lockfile governs it, and it looks *up* the tree for one — this fixture sits
inside the sirius workspace, whose `pnpm-lock.yaml` pins every npm resolution.
The pip case still fires because no Python lockfile exists here.

It is left in deliberately. It is the clearest demonstration in the tree that the
lockfile gate works, and without that gate the rule would flag every caret in
every `package.json` it ever saw.
