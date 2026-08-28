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

**How far to trust a score is part of the score.** The mean gap between
confidence and outcome runs about **15% on a 185-record batch and about 5% at
ten times that** — measured across seeds, not guessed. Below 250 held-out
records the evaluation says so and tells you to read the scores as a ranking
rather than as probabilities, and `explain` repeats it beside the shrink. A bin
with fewer than 20 records gets no verdict at all: the top of a scorecard is
always sparse, and one record that happened to come back reads as "said 88%, was
100%", which is noise wearing a finding's clothes.

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

On money, across eight seeds, expected-value ranking runs close to **level**
with sorting by amount: +0.6% at 20% capacity, +5.2% when capacity is tight at
3%, winning on five seeds of eight. When amounts span a hundredfold and
probabilities span threefold, size is already most of the answer, and the report
says so instead of claiming a lift the data will not support. The tighter the
capacity, the more the choice matters — and capacity is always tight.

Where the policies actually differ is **what gets touched**:

```
 chase everything    ₹9,77,302  ✗ touched 24 it must not   333 acted on — over capacity
 biggest first       ₹7,54,709  ✗ touched  1 it must not    67 acted on
 newest first        ₹6,46,092  ✗ touched  6 it must not    67 acted on
→ this detector      ₹7,67,417  ✓ touched none              67 acted on · 83% of what was reachable
 perfect foresight   ₹9,19,507  ✗ touched  1 it must not    67 acted on — the ceiling
```

Out of bounds means an open dispute, an issuer risk block, or a shared-signal
cluster. Even perfect foresight breaks the rule, because it optimises money
alone — it is an upper bound, not a policy anyone may run.

That column exists because the evaluation caught the agent itself retrying a
`risk_block`. The issuer had already refused it, and **a low probability is not
a prohibition**.

### Asking why

```
sirius revenue explain pay_00051 --split test
```

```
  pay_00051   ₹29,733   upi_collect network_timeout · attempt 2 · tatva

  HOW THE SCORE WAS REACHED
    start                 base rate 36.6% — how often acting pays off at all
    failure                 +4.1  network_timeout ×1.33
    rail                    +3.8  upi_collect ×1.30
    attempts                +0.9  2 ×1.06
    shrink                ×0.8556 — the model is overconfident and was told so on the training half
    score                     51  the chance this comes back BECAUSE the agent acts

  WHAT THAT IS WORTH
    0.51 × ₹29,733 × 1 (recovery share for payment:network_timeout)
      = ₹15,276 expected, against ₹3.00 to act

  WHAT THE AGENT DOES
    ◆ retry_now
    ⏸ cooldown — 3.2h since the last attempt, 6h required
        wait 6h before retrying — 30h when the account was empty
        card-scheme retry guidance; a retry into the same empty account is a second decline
```

This is the reason the model is a scorecard rather than something with better
numbers: every line is a sentence a payments lead can disagree with. A model
that cannot be argued with in a meeting does not get used in one.

On a batch with labels it also prints **what actually happens**, last and under
its own heading — including the uncomfortable case where the model scored a
record 88 and the answer key says it was never recoverable by anyone. It plays
no part in the score, and the layout says so by position.

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

### They are your numbers

Every threshold above is set in `sirius.yaml`, and `sirius init` scaffolds the
block commented out. Pin only what you argue about; the rest falls back to a
documented default.

```yaml
revenue:
  capacity: 200
  budget_inr: 50000
  contacts_per_day: 2
  quiet_hours: { from: 21, to: 9 }
  timezone: Asia/Kolkata        # the zone quiet hours are read in, never the server's
  mandate_attempts: 3
  costs:
    annoyance_inr: 12           # the charge for chasing someone who'd have paid anyway
```

Two things follow from this that are easy to get wrong. A run under a project's
own policy **says so** in its banner, naming what moved — obeying a config file
silently is how a number nobody remembers setting ends up explaining a result
nobody expected. And the rules quote the limits **actually in force**, in the
report and in the audit trail: with a static table, a run under
`contacts_per_day: 1` refused an action and explained it with "at most two
messages to one party in a rolling day". `rule_says` is what an auditor reads
months later, so it has to be what happened.

The *basis* is not configurable. A project sets its threshold; it does not get
to edit the obligation the threshold answers to.

### The number

```
  at risk                 ₹29,43,248  the money these records represent
  recovered                ₹8,87,331  came back during the run
  would have anyway       -₹2,21,666  the same records recover this much untouched
  attributable             ₹6,65,664  recovered because the agent acted
  spent                        -₹852
  net                      ₹6,64,812
```

With no agent at all, the same records return ₹3,37,599.

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

## Tuning the policy

```bash
sirius revenue watch batch
```

Re-runs when the batch or `sirius.yaml` changes, and prints **only what moved**:

```
 changed  sirius.yaml changed
    actions taken                  82 →            64   ▼ 18
    actions refused                37 →            39   ▲ 2
    attributable            ₹6,65,664 →     ₹6,37,094   ▼ ₹28,570
      contact_frequency            17 →            21   ▲ 4
```

That is what tightening `contacts_per_day` from 2 to 1 costs, stated rather than
inferred from two reports read one after the other. Refusals break out per rule,
because "you tightened the contact limit" should read as `contact_frequency`
rising, not as a change in an aggregate nobody can act on.

It writes nothing — the audit trail stays a return value, since a loop
re-running on every keystroke should not leave a hundred signed trails behind
it. `recover` and `watch` share one pipeline (`revenue/pipeline.ts`) so the two
cannot drift.

## Is it stable, and did that change help?

```bash
sirius revenue sweep --seeds 8 --save baseline.json
# ... change the model ...
sirius revenue sweep --seeds 8 --against baseline.json
```

One batch is an anecdote. The sweep runs the whole evaluation over
independently generated batches and prints **the rows, not just the mean** — a
mean edge of +2.0% built from eight agreeing batches is a different claim from
the same mean built from five wins and three losses, and only the rows say which
one you have.

```
  seed           precision   recall  recall ₹  vs heuristic  of ceiling  touched
  sirius-sweep-1     53.3%    27.6%     87.7%         -0.3%       90.8%        0
  sirius-sweep-3     63.3%    32.2%     88.3%         +5.1%       93.5%        0
  ...
  mean               47.7%    24.9%     82.0%         +2.0%       86.4%        0

  beat every capacity-matched heuristic on 5 of 6 batches
  over the same batches the heuristics touched 10 records nothing may touch; this touched 0
```

`--against` prints the deltas since a saved run, **including the ones that got
worse** — tightening capacity to 5%, for instance, buys +2.2pp of edge over the
heuristics and costs 19.7pp of recall, and the table says "1 better, 5 worse"
rather than leading with the improvement. Measures where lower is better are
marked as such.

It refuses to call two runs a comparison when they used different seeds or
different batch sizes. Subtracting two different experiments produces a number
that reads exactly like a result.

## Rehearsing it

```bash
pnpm rehearse:revenue
```

Drives the beat through the interactive shell in a real pty, checks that eight
things actually landed on screen, and prints how long each one takes. The
characteristic failure here is not a crash — it is fifty lines arriving in one
paint, which reads as a paste rather than an agent working, and which a green
test suite cannot see.

Everything on the demo path is paced for that reason: `detect` a record at a
time, `recover` a decision at a time, `reconcile` a block at a time. Roughly six
seconds of terminal time across the three, so the rest of the slot is narration.
`SIRIUS_REVENUE_PACE` sets the per-line delay and `0` turns it off — as it is
automatically for `--json`, a pipe, and CI.

## The published page

```bash
pnpm artifact
```

`scripts/artifact/collect.mjs` runs the CLI against the two seeds and writes
every figure the page shows into `metrics.json`; `build.mjs` renders the HTML
from it. Nothing on the page is typed except the prose, and where the prose
makes a numeric claim it interpolates the same figure the table does, so the two
cannot drift.

`pnpm artifact:check` re-collects and diffs against the committed
`metrics.json`, naming every figure that moved and exiting 1 if any did.
Generating the page stops it being *typed* wrong; it does not stop it going
stale, and a model change with no regeneration publishes figures describing a
build nobody can run. It caught one on its first run — the page claimed 533
tests against a build with 546.

It exists because the first version was transcribed from a terminal and went
stale twice in a day — once when the risk-block hold changed the baselines, once
when the calibration wording changed. A number that has to be copied is a number
that will be wrong.

## Neither generator will quietly destroy evidence

A batch is what every figure reported against it rests on, and `truth.jsonl` is
the only thing that can score it again. `links.json` plays the same part for a
set of books: it is the file that says whether a match was *correct* rather than
merely confident.

Both generators used to overwrite silently. They refuse now — but only when the
regeneration would change what is there. The generators are deterministic, so
rewriting the same seed produces byte-identical files and stays idempotent for
scripts.

```
error: …/batch already holds a different batch.
  It was generated from seed "first" (1050 records, 2026-08-26), and its
  truth.jsonl is the only thing that can score it.
    Write it somewhere else:  sirius revenue gen <other-dir> --seed second
    Or replace it on purpose: --force
```

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
