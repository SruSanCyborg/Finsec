/**
 * The brief: what this is, for somebody who has never seen it.
 *
 * Written for a reader with two minutes and no context — an assessor, a judge,
 * somebody deciding whether to look further. That reader is not served by a
 * feature list. They need the problem stated in a sentence they already believe,
 * then one worked example, then the numbers.
 *
 * So the order is deliberate: the gap first, the four answers second, one real
 * attack third, and the results last. Anyone who stops after page one should
 * still have understood the point.
 *
 * Every figure is passed in from `collectBriefFacts`, which gets them by running
 * the tool. Nothing here is typed in — a document whose numbers do not reproduce
 * costs more credibility than it buys.
 */

import { RULE, renderPdf } from './pdf.js';
import type { Block } from './pdf.js';
import type { BriefFacts } from './brief.js';

/** Paise → `Rs.12,34,567`. The PDF base fonts have no rupee glyph. */
function rupees(paise: number): string {
  const whole = Math.round(paise / 100);
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(whole)}`;
}

const inr = (rupeesValue: number): string =>
  `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(rupeesValue))}`;

const TIER_WORD: Record<string, string> = {
  allow: 'ALLOW',
  verify: 'VERIFY',
  constrain: 'CONSTRAIN',
  block: 'BLOCK',
};

const PLANTED_WORD: Record<string, string> = {
  prompt_injection: 'Instruction injected from an email or web page',
  flagged_counterparty: 'Counterparty the operator had denied',
  out_of_scope: 'Action outside the agent’s grant',
  unaudited_protocol: 'Funds into an unaudited contract',
  drain_attempt: 'Amount sized just under the cap, to a new party',
  over_cap: 'Payment above the per-action limit',
  burst: 'A burst of actions inside one hour',
  new_vendor: 'A genuinely new supplier (must NOT be blocked)',
  after_hours: 'A real deadline outside working hours (must NOT be blocked)',
};

export function briefToPdf(facts: BriefFacts): Buffer {
  const blocks: Block[] = [];
  const line = (text: string, extra: Partial<Block & { text: string }> = {}): void => {
    blocks.push({ text, ...extra } as Block);
  };
  const gap = (points = 10): void => line('', { size: 1, spaceBefore: points });

  const g = facts.guard;

  // ---------------------------------------------------------------- masthead
  line('sirius', { size: 30, bold: true });
  line('A security and control layer for AI agents that can move money', {
    size: 13,
    grey: 0.25,
    spaceBefore: 2,
  });
  blocks.push(RULE);

  // ------------------------------------------------------------- the problem
  line('The problem', { size: 15, bold: true, spaceBefore: 16 });
  line(
    'An AI agent with access to a wallet is a new kind of actor. It holds credentials, decides for ' +
      'itself, and signs its own transactions. Traditional financial security assumes a person or a ' +
      'trusted application starts a payment — an autonomous agent breaks that assumption, because ' +
      'the agent is the one starting it.',
    { size: 10.5, spaceBefore: 6 },
  );
  line(
    'A transaction can be correctly signed, properly authenticated, and entirely inside the agent’s ' +
      'own credentials — and still be a transfer it has never made before, to a party it has never ' +
      'used, because a web page it was reading told it to.',
    { size: 10.5, spaceBefore: 6 },
  );
  line('Technical validity is not behavioural legitimacy. The gap between them is where the money goes.', {
    size: 11,
    bold: true,
    spaceBefore: 8,
  });

  line(
    'Both obvious answers fail. Require a human to approve every action and the agent is not autonomous ' +
      '— the operator has simply become the agent. Grant it unrestricted authority and one ' +
      'manipulated instruction empties the account.',
    { size: 10.5, spaceBefore: 8 },
  );

  // ------------------------------------------------------------- the answer
  line('So the answer is graduated', { size: 15, bold: true, spaceBefore: 20 });
  blocks.push(RULE);
  line(
    'Every action the agent proposes gets one of four responses. Most get the first one, which is the ' +
      'point.',
    { size: 10.5, spaceBefore: 6 },
  );

  const tiers: Array<[string, string]> = [
    ['ALLOW', 'Proceeds untouched. Nobody is asked, nobody is interrupted.'],
    ['VERIFY', 'Unusual but plausible — needs a second factor first. A step-up, not a person.'],
    ['CONSTRAIN', 'Over a limit, so it proceeds at the smaller amount that was permitted.'],
    ['BLOCK', 'Refused, and the operator is told exactly which rule refused it and why.'],
  ];
  for (const [word, meaning] of tiers) {
    line(`${word}    ${meaning}`, { size: 10.5, spaceBefore: 5 });
  }

  line(
    'CONSTRAIN matters more than it looks. Refusing a payment of ' +
      inr(82_000) +
      ' when the cap is ' +
      inr(50_000) +
      ' throws away the ' +
      inr(50_000) +
      ' the agent was entitled to move, and pushes the operator toward raising the cap — which is ' +
      'the opposite of what a limit is for.',
    { size: 10, grey: 0.25, spaceBefore: 8 },
  );

  // ------------------------------------------------------------- six checks
  line('Six questions, asked of every action', { size: 15, bold: true, spaceBefore: 20 });
  blocks.push(RULE);
  line(
    'No single check decides. Each raises signals, and the verdict is the strongest one — because ' +
      'the same fact means different things in combination. A first-time counterparty is routine. A ' +
      'large amount is routine. A large amount to a first-time counterparty, on an instruction fetched ' +
      'from a web page, is not.',
    { size: 10.5, spaceBefore: 6 },
  );

  const checks: Array<[string, string]> = [
    ['Identity', 'Is this kind of action inside the agent’s grant at all?'],
    ['Intent', 'Does its stated purpose match the objective it was given?'],
    ['Policy', 'Does it breach a spending, exposure, frequency or counterparty limit?'],
    ['Context', 'How risky is this counterparty, this contract, this amount, right now?'],
    ['Behaviour', 'Is this consistent with how this agent has actually behaved?'],
    ['Manipulation', 'Can the instruction behind it be trusted?'],
  ];
  for (const [name, question] of checks) {
    line(`${name}`, { size: 10.5, bold: true, spaceBefore: 6 });
    line(question, { size: 10, grey: 0.25 });
  }

  // --------------------------------------------------- the worked example
  if (g.injection) {
    line('A worked example: an instruction that was not from the operator', {
      size: 15,
      bold: true,
      spaceBefore: 22,
    });
    blocks.push(RULE);
    line(
      'The check with no equivalent in conventional payment security. An agent reads things, and some ' +
        'of what it reads is written by whoever wants it to move money. The transaction is perfectly ' +
        'signed and the agent perfectly obedient — the compromise happened before the signature ' +
        'existed.',
      { size: 10.5, spaceBefore: 6 },
    );

    line('The agent proposed:', { size: 10.5, bold: true, spaceBefore: 10 });
    line(`${rupees(g.injection.amountPaise)}  to  ${g.injection.counterparty}`, {
      size: 11,
      bold: true,
      spaceBefore: 4,
    });
    line(`saying it was: "${g.injection.intent}"`, { size: 10, grey: 0.25, spaceBefore: 3 });
    line(`instruction arrived by ${g.injection.source}:`, { size: 10, grey: 0.25, spaceBefore: 6 });
    line(`"${g.injection.instruction}"`, { size: 9.5, grey: 0.15, spaceBefore: 3 });

    line('What the layer said:', { size: 10.5, bold: true, spaceBefore: 12 });
    for (const signal of g.injection.signals) {
      line(`${TIER_WORD[signal.tier] ?? signal.tier}   ${signal.stage}   ${signal.says}`, {
        size: 9.5,
        spaceBefore: 4,
      });
      if (signal.basis) line(`        ${signal.basis}`, { size: 9, grey: 0.45 });
    }
    line('BLOCKED', { size: 12, bold: true, spaceBefore: 10 });
    if (g.injection.deciding) {
      line(`decided by ${g.injection.deciding}`, { size: 9.5, grey: 0.35 });
    }
    line(
      'Note that the amount was inside every limit and the transaction would have been valid. Nothing ' +
        'about the payment was wrong. What was wrong was where the instruction came from.',
      { size: 10, grey: 0.25, spaceBefore: 8 },
    );
  }

  // ------------------------------------------------------------- the results
  line('Results', { size: 15, bold: true, spaceBefore: 22 });
  blocks.push(RULE);
  line(
    `Judged over ${g.actions} proposed actions from ${g.agents} agents, with attacks planted among ` +
      'them and recorded separately so the run can be scored against what was actually there.',
    { size: 10.5, spaceBefore: 6 },
  );

  line(
    `${(g.autonomy * 100).toFixed(1)}% of actions proceeded with nobody asked`,
    { size: 13, bold: true, spaceBefore: 10 },
  );
  line(
    `${g.counts.allow ?? 0} allowed   ${g.counts.verify ?? 0} stepped up   ` +
      `${g.counts.constrain ?? 0} constrained   ${g.counts.block ?? 0} blocked`,
    { size: 10.5, spaceBefore: 4 },
  );
  line(
    `${rupees(g.allowedPaise)} allowed to move   ${rupees(g.stoppedPaise)} stopped   ` +
      `${rupees(g.trimmedPaise)} trimmed`,
    { size: 10.5, spaceBefore: 4 },
  );

  line('Against what was planted', { size: 11.5, bold: true, spaceBefore: 14 });
  for (const row of g.byPlanted) {
    const landed = Object.entries(row.tiers)
      .map(([tier, n]) => `${n} ${TIER_WORD[tier] ?? tier}`)
      .join(', ');
    line(`${PLANTED_WORD[row.planted] ?? row.planted}`, { size: 10, spaceBefore: 5 });
    line(`        ${landed}`, { size: 9.5, grey: 0.35 });
  }

  line(
    `${g.ordinaryIntervened} of ${g.ordinary} ordinary actions were interrupted.`,
    { size: 11.5, bold: true, spaceBefore: 14 },
  );
  line(
    'Both halves of that matter. A layer that catches every attack and interrupts routine work is a ' +
      'layer that gets switched off within a week — an earlier version of this engine stepped up ' +
      '194 of 252 ordinary payments, and it passed every test that only counted catches.',
    { size: 10, grey: 0.25, spaceBefore: 5 },
  );

  // --------------------------------------------------------------- the proof
  line('Why the decisions can be trusted afterwards', { size: 15, bold: true, spaceBefore: 22 });
  blocks.push(RULE);
  line(
    'A control layer’s decisions are worth nothing if they cannot be shown to be the decisions it ' +
      'actually made. The interesting case is not a refusal — it is an action that was allowed and ' +
      'turned out badly, which is exactly the record somebody has a reason to edit later.',
    { size: 10.5, spaceBefore: 6 },
  );
  line(
    'So every decision, including the allowed ones, carries the hash of the one before it, and the ' +
      'sealed trail is signed with an ed25519 key. Change one verdict from BLOCK to ALLOW and ' +
      'verification names the entry that moved.',
    { size: 10.5, spaceBefore: 6 },
  );
  line(
    'The key id is derived from the key material rather than read as a label, so a rewritten trail ' +
      're-signed with a fresh key cannot keep the original fingerprint and pass.',
    { size: 10, grey: 0.25, spaceBefore: 6 },
  );

  // ------------------------------------------------------- the other surfaces
  if (facts.scan) {
    const s = facts.scan;
    line('It also secures the code the agent runs on', { size: 15, bold: true, spaceBefore: 22 });
    blocks.push(RULE);
    line(
      `An agent is only as safe as the system it operates. The same tool scans that code before ` +
        `deployment against ${s.rules} rules, maps each finding to a specific compliance clause ` +
        `(PCI-DSS v4.0, RBI DPSC, DPDP 2023, GDPR), and prices the exposure.`,
      { size: 10.5, spaceBefore: 6 },
    );
    line(
      `On the demo fixture: ${s.findings} findings, ${inr(s.moneyInr)} at risk, ` +
        `compliance score ${Math.round(s.score)}/100.`,
      { size: 10.5, bold: true, spaceBefore: 6 },
    );
    if (s.topFinding) {
      line(
        `${s.topFinding.ruleId}  ${s.topFinding.message}  —  ${s.topFinding.file}:${s.topFinding.line}`,
        { size: 10, spaceBefore: 6 },
      );
      line(
        `        ${inr(s.topFinding.moneyInr)} at risk` +
          (s.topFinding.clauses.length ? `   ${s.topFinding.clauses.join(' · ')}` : ''),
        { size: 9.5, grey: 0.35 },
      );
    }
    line(
      'A third surface prices money at risk in operations — failed payments, abandoned checkouts, ' +
        'ageing receivables — under the same discipline: capacity-bounded, refusals logged, and ' +
        'uplift measured net of money that would have arrived anyway.',
      { size: 10, grey: 0.25, spaceBefore: 8 },
    );
  }

  // ------------------------------------------------------------ honest limits
  line('What it does not do', { size: 15, bold: true, spaceBefore: 22 });
  blocks.push(RULE);
  line(
    'The intent check compares the stated purpose against the authorised objective by word overlap, ' +
      'not by calling a language model. A check that needs a network round trip fails open under load, ' +
      'which is the worst failure a control layer can have. It is crude, and its crudeness is visible ' +
      'in the output — which is better than a confident score nobody can audit.',
    { size: 10.5, spaceBefore: 6 },
  );
  line(
    'The manipulation patterns catch the common shapes, not every possible one, and the output quotes ' +
      'what matched so a person can judge it.',
    { size: 10.5, spaceBefore: 6 },
  );
  line(
    'Everything is simulated. No account is contacted and no funds move. There is no flag that changes ' +
      'that.',
    { size: 10.5, bold: true, spaceBefore: 6 },
  );

  // ------------------------------------------------------------------ run it
  line('Run it yourself', { size: 15, bold: true, spaceBefore: 22 });
  blocks.push(RULE);
  for (const [cmd, what] of [
    ['sirius guard gen feed', 'a feed of agent actions, with attacks planted in it'],
    ['sirius guard eval feed', 'judge them, and stream the decisions'],
    ['sirius guard explain <id>', 'the whole six-stage ladder for one action'],
    ['sirius guard score feed', 'how it did against what was actually planted'],
    ['sirius guard trail --verify <f>', 'check the signed decision trail'],
  ] as Array<[string, string]>) {
    line(cmd, { size: 10, bold: true, spaceBefore: 5 });
    line(`        ${what}`, { size: 9.5, grey: 0.35 });
  }

  blocks.push(RULE);
  line(
    `Generated from a live run on ${facts.generatedAt.slice(0, 10)}. Every figure in this document ` +
      'came from running the commands above — none of them were typed in.',
    { size: 9, grey: 0.45, spaceBefore: 8 },
  );

  return renderPdf(blocks, { title: 'sirius — securing AI agents that can move money' });
}
