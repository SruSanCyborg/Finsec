# `sirius revenue` and `sirius reconcile`

The scanner prices money at risk in **code**. This prices it in **operations** —
failed payments, abandoned checkouts, receivables going stale, and three sets of
books that disagree. Same product, same vocabulary, same refusal to print a
number nobody computed.

Three loops, each closing end to end with no backend:

| Loop | Command | What it answers |
|---|---|---|
| Detect + measure | `sirius revenue detect \| eval` | which records are worth working, and how well the detector actually does on data it never saw |
| Decide + recover | `sirius revenue recover` | what to do about each one, what that recovered, and where it had to stop |
| Reconcile | `sirius reconcile` | which captures, settlements and bank lines are the same money, and what is left unexplained |

```bash
sirius revenue gen batch          # a reproducible batch from a seed
sirius revenue detect batch       # score it, diagnose it, price it
sirius revenue eval batch         # measure it on the held-out half
sirius revenue recover batch      # run the bounded workflow, write a signed trail
sirius revenue audit --verify batch/recovery-<id>.json

sirius reconcile books --gen      # three sets of books that disagree
sirius reconcile books            # match them, and list what did not match
```

---

## 1. Detection, and metrics that cannot flatter themselves

**The target is uplift, not recovery.** `recoverable AND NOT self_heals`. A
payment the customer would have retried tomorrow is not revenue anybody
recovered — and a model trained on recovery learns to chase exactly those,
because they are the easiest positives in the data.

**Labels live in a different file from the records.** `records.jsonl` is what
the detector reads; `truth.jsonl` is what it is scored against. Leakage is
structurally impossible rather than a matter of discipline.

**The split is a hash of the id**, not a random draw and not a time cut: the
same on every machine, and the injected incidents land on both sides.

**The model is naive Bayes on odds** — a prior and one likelihood ratio per
feature — because every step prints as a sentence somebody can disagree with:
`failure=psp_degraded ×4.2`. It is overconfident, as naive Bayes is, so a
two-parameter Platt shrink is fitted on train. The calibration table reports the
residual gap rather than waiting to be caught.

**Records are chosen by expected value under a capacity cap**, not by score.
Ranking by probability alone lost to sorting by amount in a spreadsheet, which
is what a model that never multiplies probability by money deserves. Capacity is
the real constraint — card networks watch decline-and-retry ratios, NACH caps
re-presentments, TRAI caps contact, and analysts are finite.

### The honest result

On money, across eight seeds, expected-value ranking runs **level** with sorting
by amount: +0.3% at 20% capacity, winning on five of eight. When amounts span a
hundredfold and probabilities span threefold, size is already most of the
answer, and the report says so instead of claiming a lift the data will not
support.

Where the policies actually differ is **what gets touched**:

```
 chase everything    ₹9,79,572  ✗ touched 24 it must not   333 acted on — over capacity
 biggest first       ₹7,55,248  ✗ touched  1 it must not    67 acted on
 newest first        ₹6,46,092  ✗ touched  6 it must not    67 acted on
→ this detector      ₹7,59,095  ✓ touched none              67 acted on · 82% of what was reachable
 perfect foresight   ₹9,22,048  ✗ touched  1 it must not    67 acted on — the ceiling
```

Out of bounds means an open dispute, an issuer risk block, or a shared-signal
cluster. Even perfect foresight breaks the rule, because it optimises money
alone — it is an upper bound, not a policy anyone may run.

That column exists because the evaluation caught the agent itself retrying a
`risk_block`. The issuer had already refused it, and **a low probability is not
a prohibition**.

---

## 2. Recovery: bounded, escalating, and auditable

Choosing the intervention is a lookup, not a model. What to do about an expired
card is not a statistical question: the card is expired. The model decided
*whether* the record was worth the capacity; the remedy is domain knowledge and
belongs where a payments person can read it line by line.

### The stopping rules

Each carries what it stops and the obligation behind it. They are **configured
policy, not legal advice** — frameworks are named so a compliance team knows
which of their own rules to check the numbers against.

| Rule | Stops | Basis |
|---|---|---|
| `dispute_hold` | any contact or retry while a dispute is open | card-scheme dispute handling |
| `risk_hold` | retrying what the issuer refused on risk grounds | a retry is a second attempt at a refusal |
| `ring_hold` | automated action on shared-signal clusters | internal — goes to a human, never a retry |
| `mandate_revoked` | re-presenting a revoked mandate | NPCI e-mandate/NACH — that is an unauthorised debit |
| `mandate_cap` | a fourth re-presentment | NPCI NACH re-presentment limits |
| `retry_cap` | a fifth attempt across all rails | scheme retry limits, gateway decline ratios |
| `cooldown` | retrying too soon — longer when the account was empty | a retry into an empty account is a second decline |
| `quiet_hours` | SMS/WhatsApp/voice 21:00–09:00 **local** | TRAI commercial-communication timing |
| `dnd` | non-email push to a party on DND | TRAI DND registry |
| `consent` | contact on a channel with no consent | DPDP 2023 §6 |
| `contact_frequency` | a third message in a day | internal — the line between collection and harassment is a number |
| `budget` | spending past the cap | internal — a bounded agent has a stated worst case |
| `circuit_breaker` | the whole run, when recovery falls far below expectation | internal — a model that stopped working should stop acting |

Cooldowns and quiet hours are a *not yet* rather than a *no*: the run reschedules
to the first permitted moment, so it comes back at 09:00 rather than abandoning
the record. Deferrals are capped, which is what guarantees termination.

### The number

```
  at risk                 ₹29,53,670  the money these records represent
  recovered                ₹8,84,093  came back during the run
  would have anyway       -₹2,29,438  the same records recover this much untouched
  attributable             ₹6,54,655  recovered because the agent acted
  spent                        -₹855
  net                      ₹6,53,800
```

The counterfactual is computed **up front, on the same set**, so it cannot be
assembled afterwards from whatever looks best.

### The trail

Every decision — executed, blocked, *and skipped* — is an entry. "Considered and
left alone" has to be distinguishable from "never looked". Entries are
hash-chained; the head is signed with the same ed25519 key that signs compliance
reports. Altering, deleting, reordering and appending are all caught, and the
verifier names the entry:

```
FAILED  tampered.json
        entry 268 has been altered since it was written
```

It states what that proves and what it does not: the run is **simulated**, no
gateway was called, no message was sent. There is deliberately no `--execute`.

---

## 3. Reconciliation

Five tiers, because they are different claims and averaging them into one
percentage hides which is which:

| Tier | Claim |
|---|---|
| `exact` | reference and amount agree |
| `fee-aware` | the gap is commission + tax on it + TDS, **computed** not tolerated |
| `split` | one capture paid out in parts — including when one leg lost its reference |
| `grouped` | a day of settlement lines netting to one bank credit |
| `fuzzy` | no reference; amount and window agree — *probable*, for review, never closed |

Three numbers print together, because any one alone is game-able:

```
  matched           97.3%   214 of 220 captures
  matched (₹)       99.1%   ₹8,26,862 of ₹8,34,123
  correct          100.0%   226 of 226 pairings verified against the true links
```

Real books have no answer key, and the report says so rather than inventing the
one number nobody could check.

**The exception list is the deliverable.** Each carries a reason and a next step,
and the expensive kind is named as such — captures the gateway never settled are
money it owes, and nothing in the settlement file points at them. Exit 1 when
anything is unexplained, so a nightly close can gate on it.

---

## What is synthetic, and what is not

Every batch and every set of books is generated from a seed, and the same seed
gives the same data on any machine. The rails (UPI, NACH, RuPay) and their
failure modes are real; **every gateway and bank named is invented**, because
generating outage records against a real company's name produces a document that
reads as a claim about that company.

Money is **integer paise** everywhere below the formatter. A reconciler that
needs a rupee of slack for floating point cannot detect a rupee of theft.

Nothing here is offence-capable. The ring detector's only output is a hold and a
queue for a human; the recovery agent's most-used capability is refusing to act.

---

## Bugs this found in itself

Kept because each is the kind of thing a green test suite hides:

- The detector retried a payment the **issuer had already refused on risk
  grounds**. Caught by the forbidden-touches column, not by a test.
- `human_review` cost ₹85 an action and was **exempt from the budget**, so a run
  capped at ₹50 spent ₹510 of analyst time.
- The generator made a **disputed record recoverable** when it fell inside a
  gateway outage — a fixture quietly disagreeing with the policy it existed to
  test.
- A chargeback fee was carried as **negative TDS**, which balanced the total and
  broke the identity every settlement line must satisfy.
- Duplicate bank postings were injected at 3% per line on a dozen lines, so most
  sets had none — a defect present on average and on no particular run.
