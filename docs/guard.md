# `sirius guard`

The scanner asks whether the **code** is safe. `revenue` decides what a workflow
may do to a batch of records. This asks the question in between, at the moment it
matters: **an autonomous agent is about to move money — should it?**

Same product, same vocabulary, same refusal to print a number nobody computed.

```bash
sirius guard gen feed              # a reproducible feed, attacks planted in it
sirius guard eval feed --narrate   # judge every action, explained as it goes
sirius guard explain act_00253     # the full six-stage ladder for one action
sirius guard agents feed           # what each agent may do, and what it has done
sirius guard score feed            # how it did against what was actually planted
sirius guard trail --verify feed/decisions-<id>.json
```

---

## The gap it exists for

Traditional financial security assumes a person or a trusted application starts a
transaction. An autonomous agent breaks that assumption, because the agent *is*
the one starting it — it holds credentials, decides for itself, and signs.

A transaction can be correctly signed, properly authenticated, and entirely
inside the agent's own credentials, and still be a transfer it has never made
before, to a counterparty it has never used, because a web page it was reading
told it to.

> **Technical validity is not behavioural legitimacy.**

Both obvious answers fail:

- Require human approval for every action and the agent is not autonomous. The
  operator has become the agent.
- Grant unrestricted authority and one manipulated instruction empties the
  account.

So the answer has to be graduated, and most actions have to pass untouched.

---

## Four verdicts

| | What it means |
|---|---|
| `ALLOW` | Proceeds untouched. Nobody is asked, nothing is interrupted. |
| `VERIFY` | Unusual but plausible — a second factor first. A step-up, not a person. |
| `CONSTRAIN` | Over a limit, so it proceeds at the amount that *was* permitted. |
| `BLOCK` | Refused, and the rule that refused it is named along with the limit it answers to. |

`CONSTRAIN` carries more weight than it looks. Refusing a ₹82,000 payment when
the cap is ₹50,000 throws away the ₹50,000 the agent was entitled to move, and
pushes the operator toward raising the cap — the opposite of what a limit is for.

---

## Six stages

Each stage returns **signals**, not a verdict. Nothing decides alone, because the
same fact means different things in combination: a first-time counterparty is
routine, a large amount is routine, and a large amount to a first-time
counterparty on an instruction fetched from a web page is not.

| Stage | Asks | Example signal |
|---|---|---|
| `identity` | Is this kind of action inside the agent's grant at all? | `withdraw is outside this agent's grant` |
| `intent` | Does the stated purpose match the authorised objective? | `stated purpose does not match the agent's objective` |
| `policy` | Any explicit spending, exposure, frequency or counterparty limit? | `₹82,000 is over the per-action cap` |
| `context` | How risky is this counterparty, contract or amount right now? | `yield-max is unaudited` |
| `behaviour` | Is this how the agent has actually behaved? | `₹49,500 is 2.1σ above this agent's usual` |
| `manipulation` | Can the instruction behind it be trusted? | `the instruction contains override of prior instructions` |

Every signal carries the obligation or limit it answers to. A control layer that
says "blocked: risk" teaches an operator nothing and gets switched off.

### The verdict is the strongest signal, not a score

A weighted score would let three mild signals outvote one categorical refusal,
and some of these are categorical — a counterparty on a deny list is not 0.7 of a
problem. Where combination genuinely matters it is written down as its own rule
in `verdict.ts`, so an operator can read why an action was refused and disagree
with the reasoning. A learned combiner would be more accurate and would fail that
test; in a control layer, auditable outranks subtle.

Among signals at the deciding tier, the one reported is the most fundamental —
`manipulation` before `identity` before `intent` before a combination before a
limit. Reporting a prompt injection as `policy.rate_limit` (both true, one the
story) would have an operator tuning a rate limit and never learning that an
email tried to redirect the payment.

---

## Prompt injection is a financial control problem

The requirement with no equivalent in conventional payment security. An agent
reads things, and some of what it reads is written by whoever wants it to move
money. The transaction is perfectly signed and the agent perfectly obedient — the
compromise happened upstream of the signature.

Two independent checks, because either alone is easy to defeat:

- **the source** — content the agent *fetched* is not an instruction from its
  operator, however imperative it sounds
- **the shape** — override phrasing, urgency stacked with secrecy, redirection of
  funds to a "corrected" account

```
  BLOCK  manipulation  the instruction contains override of prior instructions
                       source: email
  BLOCK  manipulation  driven by email content, which this agent may not act on
                       trusted sources: operator, tool
  BLOCK  behaviour     untrusted content is directing funds somewhere new
                       the two halves of an injection that actually pays out
```

The patterns catch the common shapes, not every possible one, and the output
quotes what matched so a person can judge it. A confident score with no visible
evidence would be worse than useless here.

---

## The attacker who read the policy

A cap stops an action that exceeds it and says nothing about one that lands at
99% of it — which is exactly where a competent attacker aims, because it is the
most that can be taken in one move without tripping anything.

At ₹49,500 against a ₹50,000 cap there is **no limit breach at all** and only 2σ
on amount. Neither signal blocks alone. `policy.near_cap` exists for that: an
amount within 10% of the ceiling is weak evidence by itself and decisive paired
with a counterparty the agent has never used.

```
  BLOCK  wlt-9f2c41  ₹49,500  an amount sized just under the cap, to a
                              counterparty never used before
                              the limit was not breached because it was
                              measured first
```

---

## Behaviour, and why it abstains

"Expected behaviour" has to mean something measured, or the stage is a second
opinion on the policy limits.

- Amounts are tracked in **log space**. Payment amounts are heavy-tailed; one
  ₹40,00,000 settlement among two hundred ₹5,000 invoices would drag a plain mean
  above anything typical and make every ordinary payment look small.
- Welford's method, so it is O(1) in memory and numerically stable — this runs in
  front of a live agent and has to answer before the action does.
- Below `MIN_OBSERVATIONS` the stage **says nothing** rather than guessing. An
  agent's third action is not anomalous because there were only two before it.
- The hour-of-day test needs `MIN_HOURS_OBSERVED` and is Laplace-smoothed. An
  hour the agent has not reached yet is not evidence against it.
- Concentration per counterparty is a **rolling window**, not a lifetime total.
  An agent paying the same ten vendors every week is doing its job.

**It never learns from an action it refused.** Otherwise an attacker refused often
enough eventually makes the refusal look like the deviation. That is the
poisoning path, and not learning from refusals closes it.

---

## The loop

Security evaluation does not stop when an action is approved. `evaluateFeed` is a
**fold**, not a filter: each action is judged against the baseline as it stands at
that moment, and only then does the baseline move.

That ordering is the whole point and easy to get wrong. Judging every action
against a baseline built from the entire feed would let an attack teach the
profile that the attack is normal *before* the attack is judged — the evaluation
would be reading the future. Folding forwards means the layer sees exactly what a
live deployment would: everything before this action and nothing after it.

`--continue` carries stored baselines forward, which is what persistence is for:
new actions arriving in front of an agent that has already been running.
Evaluating a fixed feed does **not** do this by default, because folding a feed's
own actions in twice made the same command on the same input give a completely
different answer.

---

## The decisions are the product

A control layer's decisions are worth nothing if they cannot be shown to be the
decisions it actually made. The interesting case is not a refusal — it is an
action that was **allowed** and turned out badly, which is exactly the record
somebody has a reason to edit afterwards.

So every decision, including the allowed ones, carries the hash of the one before
it, and the sealed trail is ed25519-signed.

```
$ sirius guard trail --verify decisions-mtcnin36.json
OK      decisions-mtcnin36.json
        278 decisions, chained and unbroken
        signed 2026-08-28T07:49:52.870Z by key e960b577e03659b4
```

Flip one `block` to `allow`:

```
FAILED  tampered.json
        entry 255 has been altered since it was written
```

`key_id` is derived from the embedded public key and checked, never read as a
label — otherwise anyone could re-sign a rewritten trail, keep the legitimate
fingerprint, and have the verifier vouch for them. Without `--key`, a passing
verify says *unmodified*; it does not say *by whom*, and it prints that in as
many words. See D-046.

---

## Results on the fixture

```
  planted case            allow  verify  constrain  block
  ----------------------------------------------------------
  after_hours               0       1          0      0
  burst                    12       0          0      4
  drain_attempt             0       0          0      1
  flagged_counterparty      0       0          0      1
  new_vendor                0       1          0      0
  none                    252       0          0      0
  out_of_scope              0       0          0      2
  over_cap                  0       0          1      0
  prompt_injection          0       0          0      2
  unaudited_protocol        0       0          0      1

  0 of 252 ordinary actions were intervened on (0.0%)
  95.0% of actions proceeded with nobody asked
```

**Both halves matter.** Every planted attack is stopped; a genuinely new supplier
and a late-night deadline are *stepped up rather than refused*; and nothing
ordinary is touched.

An earlier version of this engine caught every attack and stepped up **194 of 252
ordinary payments**. It would have passed any test that only counted catches, and
it would have been switched off inside a week. That is the failure this surface is
arranged around, and it is why `guard score` reports the ordinary-traffic rate as
prominently as the catches.

---

## What it does not do

The **intent** stage is lexical word overlap between the stated purpose and the
authorised objective, not a model call. A stage that needs a network round trip
to a language model fails open under load, which is the worst failure mode a
control layer has. It is crude, its crudeness is visible in the output, and that
is better than a confident score nobody can audit.

The **manipulation** patterns catch the common shapes, not every possible one.

Everything is **simulated**. No account is contacted and no funds move. There is
no flag that changes that — the same rule the revenue surface holds, for the same
reason: a tool that can be talked into acting for real is one nobody can safely
demo.

---

## Where the code is

| Path | What |
|---|---|
| `src/guard/types.ts` | The vocabulary — tiers, stages, signals, baselines |
| `src/guard/stages.ts` | The six evaluators |
| `src/guard/verdict.ts` | Combination rules and the graduated verdict |
| `src/guard/baseline.ts` | Welford in log space, rolling windows, what gets learned |
| `src/guard/loop.ts` | The fold, and the outcome feedback |
| `src/guard/trail.ts` | Hash chain and attestation |
| `src/guard/synth.ts` | The seeded feed, with attacks planted and recorded |
| `src/render/guard.ts` | How a decision looks on a terminal |

Design decisions: **D-056** (the surface), **D-057** (`brief`, and the two bugs it
exposed), **D-046** (why `key_id` is derived).
