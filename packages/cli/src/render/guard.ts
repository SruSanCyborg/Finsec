/**
 * How a decision looks on a terminal.
 *
 * The important line is the one an operator reads at 3am when something has
 * been refused, so every blocked or trimmed action shows *what decided it* and
 * *the limit that decision answers to*, on the row, not in a footnote. An
 * allowed action shows almost nothing — the whole point is that ordinary work
 * passes without demanding attention.
 *
 * Widths come from the content and the terminal, the same as everywhere else:
 * the reason column gives way, the money never does (D-047).
 */

import { padVisible, truncate, visibleWidth } from '../ui/kit.js';
import type { Palette } from './revenue.js';
import type { Decision, Signal, Tier } from '../guard/types.js';
import type { ProposedAction } from '../guard/types.js';

/** Fixed-width tier labels, so the column is a column. */
const LABEL: Record<Tier, string> = {
  allow: 'ALLOW',
  verify: 'VERIFY',
  constrain: 'CONSTRAIN',
  block: 'BLOCK',
};

/**
 * Signal text is written by the engine, which formats money with `₹`.
 * The palette renders `Rs.` when the terminal cannot draw it, so text that
 * arrives from a stage has to pass through the same conversion or one row ends
 * up carrying both conventions.
 */
const say = (text: string, palette: Palette): string =>
  palette.rupee(0).startsWith('Rs.') ? text.replace(/₹/g, 'Rs.') : text;

const paintTier = (tier: Tier, palette: Palette): string => {
  const text = padVisible(LABEL[tier], 9);
  if (tier === 'allow') return palette.dim(text);
  if (tier === 'verify') return palette.blue(text);
  if (tier === 'constrain') return palette.amber(text);
  return palette.red(palette.bold(text));
};

const mark = (tier: Tier, palette: Palette): string =>
  tier === 'allow'
    ? palette.dim(palette.glyph('skip'))
    : tier === 'block'
      ? palette.red(palette.glyph('warn'))
      : palette.amber(palette.glyph('flag'));

/**
 * One decision, one line.
 *
 * An allowed action deliberately carries no reason: there is nothing to justify,
 * and filling the column with "nothing wrong" would bury the four rows that
 * matter under two hundred that do not.
 */
export function renderDecision(
  decision: Decision,
  action: ProposedAction,
  palette: Palette,
): string {
  const money =
    decision.constrained_from_paise !== undefined
      ? `${palette.dim(palette.rupee(decision.constrained_from_paise))} ${palette.glyph('arrow')} ${palette.bold(palette.rupee(decision.amount_paise))}`
      : decision.tier === 'block'
        ? palette.dim(palette.rupee(action.amount_paise))
        : palette.bold(palette.rupee(action.amount_paise));

  const head =
    `  ${mark(decision.tier, palette)} ${paintTier(decision.tier, palette)} ` +
    `${padVisible(action.counterparty.id, 18)} `;

  const room = Math.max(12, palette.width - visibleWidth(head) - visibleWidth(money) - 2);
  const reason =
    decision.tier === 'allow' ? '' : palette.dim(truncate(say(decision.deciding?.says ?? '', palette), room));

  return `${head}${money}${reason ? `  ${reason}` : ''}`;
}

/** The full ladder for one action — every stage, every signal, and the basis. */
export function renderLadder(
  decision: Decision,
  action: ProposedAction,
  palette: Palette,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(
    `  ${palette.bold(action.id)}  ${palette.dim(action.at.replace('T', ' ').slice(0, 16))}  ` +
      `${palette.bold(palette.rupee(action.amount_paise))} ${palette.glyph('arrow')} ${action.counterparty.id}`,
  );
  lines.push(`  ${palette.dim(`agent ${action.agent_id} · ${action.kind}`)}`);
  lines.push(`  ${palette.dim(`intent: "${action.intent}"`)}`);
  if (action.instruction) {
    lines.push(
      `  ${palette.dim(`instruction (${action.instruction.source}): `)}` +
        palette.dim(truncate(action.instruction.text, Math.max(20, palette.width - 32))),
    );
  }
  lines.push('');

  if (decision.signals.length === 0) {
    lines.push(`  ${palette.dim('nothing was raised by any stage')}`);
  }

  for (const signal of decision.signals) {
    lines.push(
      `  ${paintTier(signal.tier, palette)} ${palette.dim(padVisible(signal.stage, 13))}` +
        truncate(say(signal.says, palette), Math.max(16, palette.width - 26)),
    );
    if (signal.basis) {
      // The obligation the rule answers to, wrapped under the row rather than
      // extending it — the same rule the revenue surface holds.
      lines.push(
        `  ${' '.repeat(23)}${palette.dim(truncate(say(signal.basis, palette), Math.max(16, palette.width - 26)))}`,
      );
    }
  }

  lines.push('');
  const verdict =
    decision.tier === 'block'
      ? palette.red(palette.bold('BLOCKED'))
      : decision.tier === 'constrain'
        ? palette.amber(palette.bold(`CONSTRAINED to ${palette.rupee(decision.amount_paise)}`))
        : decision.tier === 'verify'
          ? palette.blue(palette.bold('STEP-UP REQUIRED'))
          : palette.green(palette.bold('ALLOWED'));
  lines.push(`  ${verdict}`);
  if (decision.deciding) {
    lines.push(`  ${palette.dim(`decided by ${decision.deciding.id}`)}`);
  }
  lines.push('');
  return lines;
}

/**
 * What each verdict means, said once, the first time it appears.
 *
 * For somebody watching over a shoulder who has not read anything. A column of
 * ALLOW/VERIFY/BLOCK is self-evident to whoever built it and opaque to everyone
 * else, and the demo is mostly watched by everyone else. Said once rather than
 * per row, because a legend repeated on every line stops being read by the
 * third one.
 */
const NARRATION: Record<Tier, string> = {
  allow: 'proceeds untouched — nobody is asked, nothing is interrupted',
  verify: 'unusual but plausible — needs a second factor, not a person',
  constrain: 'over a limit, so it proceeds at the amount that was permitted',
  block: 'refused — and the rule that refused it is named',
};

export function narrationFor(tier: Tier, palette: Palette): string {
  return palette.dim(`     ${LABEL[tier]} means: ${NARRATION[tier]}`);
}

export interface SummaryInput {
  counts: Record<string, number>;
  money: { allowed_paise: number; stopped_paise: number; trimmed_paise: number };
  actions: number;
  agents: number;
  trailPath?: string;
  entries?: number;
}

export function renderSummary(input: SummaryInput, palette: Palette): string[] {
  const { counts, money } = input;
  const lines: string[] = ['', palette.dim(`  ${palette.hr}`)];

  const share = (n: number) => (input.actions > 0 ? `${Math.round((n / input.actions) * 100)}%` : '0%');

  lines.push(
    `  ${palette.dim(padVisible('Decisions', 12))}` +
      `${palette.green(`${counts.allow ?? 0} allowed`)}${palette.dim(` (${share(counts.allow ?? 0)})`)}   ` +
      `${palette.blue(`${counts.verify ?? 0} step-up`)}   ` +
      `${palette.amber(`${counts.constrain ?? 0} constrained`)}   ` +
      `${palette.red(`${counts.block ?? 0} blocked`)}`,
  );

  lines.push(
    `  ${palette.dim(padVisible('Money', 12))}` +
      `${palette.bold(palette.rupee(money.allowed_paise))} allowed   ` +
      `${palette.red(palette.rupee(money.stopped_paise))} stopped   ` +
      `${palette.amber(palette.rupee(money.trimmed_paise))} trimmed`,
  );

  // The number PS7 actually cares about: an operator asked to approve most of
  // the agent's work has become the agent.
  const autonomy = input.actions > 0 ? (counts.allow ?? 0) / input.actions : 0;
  lines.push(
    `  ${palette.dim(padVisible('Autonomy', 12))}` +
      `${palette.bold(`${(autonomy * 100).toFixed(1)}%`)} ${palette.dim('of actions proceeded with nobody asked')}`,
  );

  if (input.trailPath) {
    lines.push(
      `  ${palette.dim(padVisible('Trail', 12))}` +
        palette.dim(`${input.entries ?? 0} decisions, hash-chained and signed`),
    );
  }

  lines.push(palette.dim(`  ${palette.hr}`));
  lines.push('');
  lines.push(
    `  ${palette.dim('Simulated. No account was contacted and no funds moved.')}`,
  );
  lines.push('');
  return lines;
}

/** Grouped refusals, so an operator sees which rule is doing the work. */
export function renderWhereItStopped(decisions: readonly Decision[], palette: Palette): string[] {
  const stopped = decisions.filter((d) => d.tier === 'block' || d.tier === 'constrain');
  if (stopped.length === 0) return [];

  // Keyed on the rule *and* what it did. The same rule constrains when there is
  // headroom and blocks when there is none, and folding those together reported
  // five constraints where four were refusals.
  const groups = new Map<string, { n: number; signal: Signal; tier: Decision['tier'] }>();
  for (const decision of stopped) {
    const signal = decision.deciding;
    if (!signal) continue;
    const key = `${signal.id}:${decision.tier}`;
    const found = groups.get(key);
    if (found) found.n += 1;
    else groups.set(key, { n: 1, signal, tier: decision.tier });
  }

  const lines: string[] = ['', `  ${palette.bold('WHERE IT INTERVENED')}`, ''];
  const ordered = [...groups.values()].sort((a, b) => b.n - a.n);

  for (const { n, signal, tier } of ordered) {
    lines.push(
      `  ${paintTier(tier, palette)} ${palette.bold(padVisible(String(n), 4))}` +
        truncate(say(signal.says, palette), Math.max(16, palette.width - 20)),
    );
    if (signal.basis) {
      lines.push(
        `  ${' '.repeat(14)}${palette.dim(truncate(say(signal.basis, palette), Math.max(16, palette.width - 20)))}`,
      );
    }
  }
  lines.push('');
  return lines;
}
