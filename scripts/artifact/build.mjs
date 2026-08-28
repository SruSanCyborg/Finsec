/**
 * Renders the published page from the metrics `collect.mjs` gathered.
 *
 * The page used to be written by hand from a terminal, and went stale twice in
 * a day. Every number below now comes from `metrics.json`; the prose is the
 * only thing typed, and where the prose makes a numeric claim it interpolates
 * the same figure the table does, so the two cannot drift apart.
 *
 * A render function rather than a template language: the page needs loops,
 * conditionals and formatting, and inventing a small dialect to express those
 * is more machinery than writing them out.
 *
 * Usage: node scripts/artifact/build.mjs [out.html]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(here, 'metrics.json'), 'utf8'));
const style = readFileSync(join(here, 'style.html'), 'utf8');

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The dot row: one dot per record nothing may touch, filled where a policy did.
 *
 * The page's one bold stroke, and the only place the argument is made visually
 * rather than in a column of rupees.
 */
const dots = (touched, total) =>
  Array.from({ length: total }, (_, index) =>
    index < touched ? '<span class="dot hit"></span>' : '<span class="dot"></span>',
  ).join('');

const cleanDots = (total) =>
  Array.from({ length: total }, () => '<span class="dot clean"></span>').join('');

const forbidden = m.eval.forbidden.in_population;

/** One row of the capacity-matched comparison. */
function policyRow(name, net, touched, acted, note, options = {}) {
  const marker = options.self ? '<span class="mark">→</span>' : '';
  const cells =
    touched === 0
      ? `<div class="dots" aria-label="touched none of ${forbidden}">${cleanDots(forbidden)}</div>`
      : `<div class="dots" aria-label="touched ${touched} of ${forbidden}">${dots(touched, forbidden)}</div>`;

  return `              <tr${options.self ? ' class="self"' : options.ceiling ? ' class="ceiling"' : ''}>
                <td class="name">${marker}${escape(name)}</td>
                <td class="money${options.self ? ' gain' : ''}">${escape(net)}</td>
                <td>${cells}</td>
                <td class="note">${escape(acted)} — ${escape(note)}</td>
              </tr>`;
}

const baselineRows = () => {
  const rows = [];
  for (const baseline of m.eval.baselines) {
    if (baseline.name === 'chase nothing') continue;
    const acted = baseline.over_capacity
      ? `${baseline.flagged} acted on, over capacity`
      : `${baseline.flagged} acted on`;
    rows.push(policyRow(baseline.name, baseline.net, baseline.harmful_touches, acted, baseline.note, {
      ceiling: baseline.name === 'perfect foresight',
    }));

    if (baseline.name === 'newest first') {
      rows.push(
        policyRow(
          'this detector',
          m.eval.detector.net,
          m.eval.detector.harmful_touches,
          `${m.eval.detector.flagged} acted on`,
          `${m.eval.share_of_ceiling} of what was reachable`,
          { self: true },
        ),
      );
    }
  }
  return rows.join('\n');
};

const capacityCells = () =>
  m.capacity
    .map(
      (point) => `            <div class="c">
              <div class="cap-k">${escape(point.label)}</div>
              <div class="edge">${escape(point.edge_text)}</div>
              <div class="bar"><i style="width:${(point.ceiling * 100).toFixed(0)}%"></i></div>
              <div class="n">${escape(point.ceiling_text)} of the ceiling<br><span class="gain">${point.forbidden_touched}</span> forbidden touched</div>
            </div>`,
    )
    .join('\n');

const calibrationRows = () =>
  m.eval.calibration
    .map((bin) => {
      const gap = bin.actual - bin.predicted;
      const verdict = !bin.enough
        ? '<span class="c">· too few to say</span>'
        : Math.abs(gap) < 0.05
          ? `<span class="g">✓</span><span class="c"> ${escape(bin.gap_text)}</span>`
          : `<span class="a">⚠</span><span class="c"> ${escape(bin.gap_text)}</span>`;

      const row = `${String(bin.from).padStart(6)}–${String(bin.to).padEnd(3)} n=${String(bin.count).padEnd(4)} said ${bin.predicted_text.padStart(6)}  was ${bin.actual_text.padStart(6)}  `;
      return `<span class="c">${escape(row)}</span>${verdict}`;
    })
    .join('\n');

const sweepRows = () =>
  m.sweep.rows
    .map((row) => {
      const cells = `  ${row.seed.padEnd(16)}${row.precision.padStart(9)}${row.recall.padStart(9)}${row.money_recall.padStart(10)}`;
      const edge = `${row.edge.padStart(9)}`;
      return `<span class="c">${escape(cells)}</span>${
        row.edge.startsWith('+') ? `<span class="g">${escape(edge)}</span>` : `<span class="a">${escape(edge)}</span>`
      }<span class="c">${escape(row.ceiling.padStart(9))}</span><span class="g">${escape(
        String(row.forbidden_touched).padStart(8),
      )}</span>`;
    })
    .join('\n');

const ruleRows = () =>
  m.recover.blocked_by
    .map(
      (entry) => `          <div class="r">
            <div><span class="id">${escape(entry.rule)}</span><span class="ct">${entry.count}</span></div>
            <div class="says">${escape(RULE_TEXT[entry.rule]?.says ?? '')}</div>
            <div class="basis">${escape(RULE_TEXT[entry.rule]?.basis ?? '')}</div>
          </div>`,
    )
    .join('\n');

/**
 * The rule wording, mirrored from `revenue/policy.ts`.
 *
 * Duplicated rather than imported because the page ships as one static file and
 * the CLI is TypeScript. The counts beside them are live; if a rule is renamed
 * the page will show a blank sentence rather than a stale one, which is the
 * failure mode to prefer.
 */
const RULE_TEXT = {
  contact_frequency: {
    says: 'at most two messages to one party in a rolling day',
    basis: 'internal — the line between collection and harassment is a number, so it is written down',
  },
  consent: {
    says: 'no contact on a channel the party has not consented to',
    basis: 'DPDP 2023 §6 — consent is per purpose, per channel, and revocable',
  },
  cooldown: {
    says: 'wait before retrying — and wait for the salary cycle when the account was empty',
    basis: 'a retry into the same empty account is just a second decline',
  },
  quiet_hours: {
    says: 'no SMS, WhatsApp or voice between 21:00 and 09:00 local time',
    basis: 'TRAI commercial-communication timing rules',
  },
  mandate_cap: {
    says: 'at most three re-presentments against one mandate in a cycle',
    basis: 'NPCI NACH re-presentment limits',
  },
  retry_cap: {
    says: 'at most four attempts against one payment across all rails',
    basis: 'scheme retry limits and gateway decline-ratio monitoring',
  },
  dnd: { says: 'no non-email push to a party on the DND registry', basis: 'TRAI DND registry' },
  budget: {
    says: 'stop when the run has spent its budget',
    basis: 'internal — a bounded agent is one whose worst case is stated in advance',
  },
  circuit_breaker: {
    says: 'halt the run if realised recovery falls far below expectation',
    basis: 'internal — a model that stopped working should stop acting',
  },
};

const tierRows = () => {
  const max = Math.max(...m.reconcile.tiers.map((tier) => tier.count), 1);
  return m.reconcile.tiers
    .map(
      (tier) => `          <div class="tn${tier.tier === 'fuzzy' ? ' hold' : ''}">${escape(tier.tier)}</div>
          <div class="tbar${tier.tier === 'fuzzy' ? ' probable' : ''}"><i style="width:${((tier.count / max) * 100).toFixed(0)}%"></i></div>
          <div class="tv">${tier.count}</div>`,
    )
    .join('\n');
};

const exceptionRows = () =>
  m.reconcile.exception_kinds
    .map(
      (item) => `          <div class="e">
            <div class="kind">${escape(item.kind)}</div>
            <div class="amt">${escape(item.value)}</div>
            <div class="step">${item.count} line(s). ${escape(item.next_step)}</div>
          </div>`,
    )
    .join('\n');

const page = `<title>Sirius Revenue</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">

${style}

<div class="wrap">

  <header class="mast">
    <div class="brandline">
      <b>sirius</b><span class="sep">·</span><span>revenue &amp; reconcile</span><span class="sep">·</span><span>cli branch</span><span class="sep">·</span><span>${m.tests} tests</span>
    </div>
    <h1>Three loops that close,<br><em>and one column that hurts.</em></h1>
    <p class="thesis">
      Sirius prices money at risk in code. This is the other half: what the code did —
      failed payments, abandoned checkouts, ageing receivables, and three sets of books
      that disagree. Every figure on this page was produced by running the tool, not by
      copying a terminal, and <strong>the numbers that flatter it are printed beside the
      ones that do not</strong>.
    </p>

    <div class="strip">
      <div class="stat">
        <div class="k">Recovered, attributable</div>
        <div class="v gain">${escape(m.recover.attributable)}</div>
        <div class="n">after subtracting ${escape(m.recover.anyway)} that would have arrived untouched</div>
      </div>
      <div class="stat">
        <div class="k">Records it must not touch</div>
        <div class="v">${forbidden} <span class="dim" style="font-size:19px">/</span> <span class="gain">${m.eval.forbidden.touched}</span></div>
        <div class="n">in the split, and the number the agent touched</div>
      </div>
      <div class="stat">
        <div class="k">Reconciled correctly</div>
        <div class="v cool">${m.reconcile.correct}<span class="dim">/${m.reconcile.checked}</span></div>
        <div class="n">pairings verified against the true links, ${escape(m.reconcile.match_rate)} of captures</div>
      </div>
      <div class="stat">
        <div class="k">Audit entries</div>
        <div class="v">${m.recover.entries}</div>
        <div class="n">hash-chained, ed25519-signed, tamper detected by sequence number</div>
      </div>
    </div>
  </header>

  <section>
    <div class="head">
      <div class="label"><p class="eyebrow">Loop one</p></div>
      <div>
        <h2>The detector, measured on the half it never saw</h2>
        <p>
          The target is not "will this come back" — it is <em>will this come back because we
          acted</em>. A payment the customer would have retried tomorrow is not revenue anybody
          recovered, and a model trained on recovery learns to chase exactly those, because
          they are the easiest positives in the data.
        </p>
      </div>
    </div>

    <div class="body">
      <div class="panel">
        <div class="cap">
          <span class="t">Same records · same costs · same room to act</span>
          <span class="s">${m.eval.records} held-out records · capacity ${m.batch.capacity}</span>
        </div>
        <div class="scroll">
          <table class="policies">
            <thead>
              <tr>
                <th>Policy</th>
                <th class="r">Net</th>
                <th>Touched what it must not</th>
                <th>Acted on</th>
              </tr>
            </thead>
            <tbody>
${baselineRows()}
            </tbody>
          </table>
        </div>
        <div class="legend">
          <span><span class="dot hit"></span> touched a record under dispute, an issuer risk block, or a shared-signal cluster</span>
          <span><span class="dot clean"></span> left it alone</span>
        </div>
      </div>

      <div class="callout">
        <p>
          <strong>On money, the detector is close to level with sorting by amount.</strong>
          Across ${m.sweep.seeds} seeds it wins by ${escape(m.sweep.mean.edge)} at this capacity,
          on ${m.sweep.wins} of ${m.sweep.seeds} batches, and the report says so. When amounts
          span a hundredfold and probabilities span threefold, size is already most of the
          answer — a claim of a 40% lift here would be a claim the data does not support.
        </p>
        <p>
          What the policies do not share is the column above. The heuristics have no way to know
          a record is under dispute. That column exists because the evaluation caught
          <em>this detector</em> retrying a payment the issuer had already refused on risk
          grounds: a low probability is not a prohibition.
        </p>
      </div>

      <div class="panel">
        <div class="cap">
          <span class="t">Where the ranking earns its keep</span>
          <span class="s">mean over 8 seeds · edge over the best heuristic</span>
        </div>
        <div class="scroll">
          <div class="sweep" style="min-width:620px">
${capacityCells()}
          </div>
        </div>
        <div class="legend">
          <span>The tighter the capacity, the more the choice matters — and capacity is always tight.</span>
          <span>Over the same runs the heuristics touched <span class="loss">${m.capacity.reduce(
            (sum, point) => sum + point.heuristic_forbidden_touched,
            0,
          )}</span> records nothing may touch; this touched <span class="gain">${m.capacity.reduce(
            (sum, point) => sum + point.forbidden_touched,
            0,
          )}</span>.</span>
        </div>
      </div>

      <div class="panel">
        <div class="cap">
          <span class="t">Held-out metrics</span>
          <span class="s">sirius revenue eval batch</span>
        </div>
        <pre class="term"><span class="c">                   acted        left alone</span>
<span class="c">  recoverable  </span>   <span class="g">${String(m.eval.matrix.true_positive).padStart(2)}</span>  <span class="c">hit    </span>    <span class="r">${String(m.eval.matrix.false_negative).padStart(2)}</span>  <span class="c">missed</span>
<span class="c">  would not    </span>   <span class="a">${String(m.eval.matrix.false_positive).padStart(2)}</span>  <span class="c">wasted </span>   <span class="c">${String(m.eval.matrix.true_negative).padStart(3)}  correctly ignored</span>

  precision          <span class="w">${m.eval.precision}</span>  <span class="c">of what it acted on, this much needed it</span>
  recall             <span class="w">${m.eval.recall}</span>  <span class="c">of what needed acting on, it found this much</span>

  precision (₹)      <span class="w">${m.eval.money_precision}</span>  <span class="c">weighted by rupees rather than rows</span>
  recall (₹)         <span class="w">${m.eval.money_recall}</span>  <span class="c">of the recoverable money, this much was flagged</span>

  <span class="w">CALIBRATION</span>   <span class="c">does a score of 70 mean 70%? mean gap ${m.eval.calibration_error}</span>
${calibrationRows()}</pre>
        <div class="legend">
          <span>Count precision is low and money recall is high — the ranking spends its capacity on the expensive records, and says which trade it made.</span>
          <span>A bin under twenty records gets no verdict: the top of a scorecard is always sparse, and a rate on one observation is not a finding.</span>
        </div>
      </div>

      <div class="panel">
        <div class="cap">
          <span class="t">Across ${m.sweep.seeds} independently generated batches</span>
          <span class="s">sirius revenue sweep --seeds ${m.sweep.seeds}</span>
        </div>
        <pre class="term"><span class="c">  seed              precision   recall  recall ₹     edge  ceiling  touched</span>
${sweepRows()}
<span class="w">  mean            ${escape(
    m.sweep.mean.precision.padStart(11) +
      m.sweep.mean.recall.padStart(9) +
      m.sweep.mean.money_recall.padStart(10) +
      m.sweep.mean.edge.padStart(9) +
      m.sweep.mean.share_of_ceiling.padStart(9) +
      String(m.sweep.forbidden_touched).padStart(9),
  )}</span></pre>
        <div class="legend">
          <span>One batch is an anecdote. The rows are printed because a mean built from disagreement is a weaker claim than the same mean built from agreement.</span>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="head">
      <div class="label"><p class="eyebrow">Loop two</p></div>
      <div>
        <h2>The agent, bounded on every side</h2>
        <p>
          Detection says which records are worth working. This decides what to do about each one,
          does it, watches what happened, escalates or stops — and writes every one of those
          decisions somewhere nobody can quietly revise later.
        </p>
      </div>
    </div>

    <div class="body">
      <div class="panel">
        <div class="cap">
          <span class="t">What came back, and what would have anyway</span>
          <span class="s">${m.recover.considered} considered · ${m.recover.worked} worked · ${m.recover.actions} actions · ${m.recover.trail_mode}</span>
        </div>
        <div class="fall">
          <div class="row">
            <div class="k muted">at risk</div>
            <div class="v muted">${escape(m.recover.at_risk)}</div>
            <div class="track"><i style="left:0;width:100%;background:#20242b"></i></div>
          </div>
          <div class="row">
            <div class="k">recovered</div>
            <div class="v">${escape(m.recover.recovered)}</div>
            <div class="track"><i style="left:0;width:30%;background:var(--cool)"></i></div>
          </div>
          <div class="row">
            <div class="k hold">would have anyway</div>
            <div class="v hold">−${escape(m.recover.anyway)}</div>
            <div class="track"><i style="left:22%;width:8%;background:var(--hold)"></i></div>
          </div>
          <div class="row total">
            <div class="k"><strong>attributable</strong></div>
            <div class="v gain">${escape(m.recover.attributable)}</div>
            <div class="track"><i style="left:0;width:22%;background:var(--gain)"></i></div>
          </div>
          <div class="row">
            <div class="k dim">spent on all of it</div>
            <div class="v dim">−${escape(m.recover.spent)}</div>
            <div class="track"><i style="left:0;width:0.4%;background:var(--loss)"></i></div>
          </div>
          <div class="row">
            <div class="k dim">the same records, untouched</div>
            <div class="v dim">${escape(m.recover.counterfactual)}</div>
            <div class="track"><i style="left:0;width:11%;background:#2a2f37"></i></div>
          </div>
        </div>
        <div class="legend">
          <span>The counterfactual is computed up front, on the same set, so it cannot be assembled afterwards from whatever looks best.</span>
        </div>
      </div>

      <div class="panel">
        <div class="cap">
          <span class="t">Where it stopped</span>
          <span class="s">${m.recover.blocked} proposed actions refused · ${m.recover.escalations} escalations</span>
        </div>
        <div class="rules">
${ruleRows()}
        </div>
        <div class="legend">
          <span>Cooldowns and quiet hours are a <em>not yet</em>, not a <em>no</em>: the run reschedules to the first permitted moment and comes back at 09:00. Deferrals are capped, which is what guarantees it terminates.</span>
          <span>Every threshold above is set in <code>sirius.yaml</code>, and a run under a project's own policy names what moved.</span>
        </div>
      </div>

      <div class="callout">
        <p>
          Executed, blocked <em>and skipped</em> all produce entries — ${m.recover.entries} of them
          in this run. "Considered and left alone" has to be distinguishable from "never looked",
          which is the half of an audit trail usually missing.
        </p>
        <p>
          <strong>There is deliberately no <code>--execute</code>.</strong> The run is ${m.recover.trail_mode},
          says so in the banner, in the document's own <code>mode</code> field, and in the verifier's
          output. An agent that can spend real money needs more than a flag.
        </p>
      </div>
    </div>
  </section>

  <section>
    <div class="head">
      <div class="label"><p class="eyebrow">Loop three</p></div>
      <div>
        <h2>The close, and the lines it could not close</h2>
        <p>
          A ledger says a customer paid ₹2,450. The gateway says ₹2,314.87 — the difference is
          commission, the tax on it, and sometimes TDS. The bank says one figure landed on
          Tuesday, which is eighty-one of those payouts with two refunds subtracted. None of the
          three is wrong.
        </p>
      </div>
    </div>

    <div class="body">
      <div class="strip" style="margin-top:26px">
        <div class="stat" style="grid-column: span 2">
          <div class="k">Matched</div>
          <div class="v">${escape(m.reconcile.match_rate)}<span class="dim" style="font-size:17px"> · ${escape(
            m.reconcile.value_match_rate,
          )} of the money</span></div>
          <div class="n">${m.reconcile.captures} captures · ${escape(m.reconcile.matched_value)} of ${escape(
            m.reconcile.ledger_value,
          )}</div>
        </div>
        <div class="stat" style="grid-column: span 2">
          <div class="k">Matched correctly</div>
          <div class="v gain">${m.reconcile.correct}<span class="dim">/${m.reconcile.checked}</span></div>
          <div class="n">every pairing verified against the true links. Real books have no answer key, and the report says so instead of inventing the one number nobody could check.</div>
        </div>
      </div>

      <div class="panel">
        <div class="cap">
          <span class="t">Five tiers, because they are five different claims</span>
          <span class="s">${m.reconcile.captures} captures · ${m.reconcile.settlements} settlement lines · ${m.reconcile.bank} bank lines</span>
        </div>
        <div class="tiers">
${tierRows()}
          <div class="note">
            <em>fee-aware</em> computes the deduction rather than tolerating a range —
            ${escape(m.reconcile.deductions)} of commission, tax and TDS accounted for, not written
            off. <em>fuzzy</em> has no reference at all: marked probable, sent for review, never
            counted as closed. A matcher that averages these into one percentage is hiding which
            is which.
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="cap">
          <span class="t">Exceptions — the deliverable</span>
          <span class="s">${m.reconcile.exceptions} lines · ${escape(m.reconcile.exception_value)} · exit 1</span>
        </div>
        <div class="exc">
${exceptionRows()}
        </div>
        <div class="legend">
          <span>A run that matched 96% and cannot say what the other 4% is has narrowed the loop, not closed it. Every exception carries a reason and a next step.</span>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="head">
      <div class="label"><p class="eyebrow">Credibility</p></div>
      <div>
        <h2>Bugs this surface found in itself</h2>
        <p>
          Kept in the record because each is the kind a green test suite hides, and each was
          caught by running the thing rather than by asserting on it.
        </p>
      </div>
    </div>

    <div class="body">
      <ol class="found">
        <li><b>The detector retried a payment the issuer had already refused on risk grounds.</b> Caught by the forbidden-touches column — which is why that column now exists.</li>
        <li><b>Human review cost ₹85 an action and was exempt from the budget</b>, so a run capped at ₹50 spent ₹510 of analyst time. An unbounded escape hatch is not a bounded agent.</li>
        <li><b>The generator made a disputed record recoverable</b> when it fell inside a gateway outage — a fixture quietly disagreeing with the policy it existed to test.</li>
        <li><b>A chargeback fee was carried as negative TDS</b>, which balanced the total and broke the identity every settlement line must satisfy: net = gross − fee − tax − tds.</li>
        <li><b>Ranking by probability alone lost to sorting by amount in a spreadsheet</b>, which is what a model that never multiplies probability by money deserves.</li>
        <li><b>The rules recited their defaults under a project's own policy</b> — refusing an action under <code>contacts_per_day: 1</code> and explaining it with "at most two messages", into the audit trail.</li>
        <li><b>A coverage check that turned pacing off reported twelve false failures</b>: output arriving faster than the shell repaints never reaches the screen at all.</li>
      </ol>
    </div>
  </section>

  <section>
    <div class="head">
      <div class="label"><p class="eyebrow">Run it</p></div>
      <div>
        <h2>No backend, no network, one seed</h2>
        <p>
          The same seed produces the same batch on any machine, which is what makes a reported
          figure checkable rather than anecdotal. Institutions are invented; the rails are real.
        </p>
      </div>
    </div>

    <div class="body">
      <div class="run">
<span class="p">$</span> sirius revenue gen batch          <span class="c"># a reproducible batch from a seed</span>
<span class="p">$</span> sirius revenue detect batch       <span class="c"># score it, diagnose it, price it</span>
<span class="p">$</span> sirius revenue explain inv_00059  <span class="c"># why that record scored what it did</span>
<span class="p">$</span> sirius revenue eval batch         <span class="c"># measure it on the held-out half</span>
<span class="p">$</span> sirius revenue recover batch      <span class="c"># bounded workflow + signed trail</span>
<span class="p">$</span> sirius revenue sweep --seeds 8    <span class="c"># is it stable, and did that change help</span>
<span class="p">$</span> sirius reconcile books --gen      <span class="c"># three sets of books that disagree</span>
      </div>

      <div class="callout">
        <p>
          Money is <strong>integer paise</strong> everywhere below the formatter. A reconciler that
          needs a rupee of slack for floating point cannot detect a rupee of theft.
        </p>
        <p>
          Nothing here is offence-capable. The cluster detector's only output is a hold and a queue
          for a human; the recovery agent's most-used capability is refusing to act.
        </p>
      </div>
    </div>
  </section>

  <footer>
    <span class="mono">sirius · cli branch · ${m.tests} tests · docs/revenue.md</span>
    <span>Generated from a live run on ${escape(m.generated_at.slice(0, 10))} — seeds ${escape(
      m.seeds.batch,
    )} and ${escape(m.seeds.books)}. Gateways and banks are fictional; UPI, NACH and their failure modes are not.</span>
  </footer>

</div>
`;

const target = resolve(process.argv[2] ?? join(here, 'sirius-revenue.html'));
writeFileSync(target, page, 'utf8');
process.stdout.write(`Rendered ${target} from metrics of ${m.generated_at}\n`);
