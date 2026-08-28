/**
 * `sirius guard` — the control layer for agents that can move money.
 *
 *   gen      synthesise a feed of proposed actions, attacks planted in it
 *   eval     judge the feed and stream the decisions
 *   explain  the whole ladder for one action
 *   agents   what each agent is allowed to do
 *   score    how well the layer did against what was actually planted
 *   trail    verify a signed decision trail
 *
 * Everything is simulated and says so. There is no flag that makes it move
 * money — the same rule the revenue surface holds, for the same reason: a tool
 * that can be talked into acting for real is one nobody can safely demo.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { CliError } from '../api/errors.js';
import { evaluateFeed, moneyMoved, tally } from '../guard/loop.js';
import { GuardTrailLog, verifyGuardTrail } from '../guard/trail.js';
import { generateFeed } from '../guard/synth.js';
import { loadBaselines, loadFeed, saveBaselines, writeFeed } from '../guard/store.js';
import { paletteFor } from '../render/revenue.js';
import { renderDecision, renderLadder, renderSummary, renderWhereItStopped } from '../render/guard.js';
import { detectCapabilities } from '../ui/theme.js';
import { plural } from '../ui/kit.js';
/** Only the flag this surface reads; the CLI passes the whole object. */
interface GlobalFlags {
  color?: boolean;
}

export interface GuardFlags {
  seed?: string;
  actions?: number;
  json?: boolean;
  all?: boolean;
  limit?: number;
  agent?: string;
  tier?: string;
  output?: string;
  verify?: string;
  key?: string;
  fresh?: boolean;
}

const target = (path: string | undefined, fallback: string): string =>
  path ? (isAbsolute(path) ? path : resolve(process.cwd(), path)) : resolve(process.cwd(), fallback);

export async function runGuard(
  subcommand: string | undefined,
  feedArg: string | undefined,
  flags: GuardFlags,
  globals: GlobalFlags,
): Promise<void> {
  const sub = (subcommand ?? 'eval').toLowerCase();

  switch (sub) {
    case 'gen':
      return generate(feedArg, flags);
    case 'eval':
      return evaluate(feedArg, flags, globals);
    case 'explain':
      return explain(feedArg, flags, globals);
    case 'agents':
      return listAgents(feedArg, flags, globals);
    case 'score':
      return score(feedArg, flags);
    case 'trail':
      return verify(feedArg, flags);
    default:
      throw new CliError(`Unknown guard subcommand "${sub}".`, {
        hint: 'Expected gen, eval, explain, agents, score, or trail.',
      });
  }
}

// ------------------------------------------------------------------------ gen

function generate(feedArg: string | undefined, flags: GuardFlags): void {
  const dir = target(feedArg, 'feed');
  const feed = generateFeed({
    ...(flags.seed ? { seed: flags.seed } : {}),
    ...(flags.actions !== undefined ? { actions: flags.actions } : {}),
  });
  writeFeed(dir, feed);

  const planted = Object.values(feed.truth).filter((p) => p !== 'none').length;
  process.stdout.write(
    `\n  wrote ${plural(feed.actions.length, 'proposed action')} for ` +
      `${plural(feed.agents.length, 'agent')} to ${dir}\n` +
      `  ${plural(planted, 'planted case')}, recorded in truth.json so a run can be scored\n\n` +
      `  Judge it:  sirius guard eval ${feedArg ?? 'feed'}\n\n`,
  );
}

// ----------------------------------------------------------------------- eval

async function evaluate(feedArg: string | undefined, flags: GuardFlags, globals: GlobalFlags): Promise<void> {
  const dir = target(feedArg, 'feed');
  const feed = loadFeed(dir);
  const capabilities = detectCapabilities({ noColor: globals.color === false, machineMode: Boolean(flags.json) });
  const palette = paletteFor({ color: capabilities.color, unicode: capabilities.unicode, width: capabilities.width });

  // Baselines persist between runs unless asked otherwise: an agent that starts
  // new every time has no behaviour to deviate from.
  const baselines = flags.fresh ? {} : loadBaselines(dir);

  const { decisions, baselines: after } = evaluateFeed(feed.actions, feed.agents, { baselines });
  const byAction = new Map(feed.actions.map((a) => [a.id, a]));

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          feed: dir,
          actions: feed.actions.length,
          counts: tally(decisions),
          money: moneyMoved(decisions, feed.actions),
          decisions,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const { writeLinesPaced, writePaced } = await import('../engine/pace.js');
  const pace = Number(process.env.SIRIUS_GUARD_PACE ?? (capabilities.tty ? 14 : 0));

  process.stdout.write('\n');
  process.stdout.write(
    ` ${palette.bold('sirius guard')}  ${palette.dim(
      `${feed.actions.length} proposed actions · ${plural(feed.agents.length, 'agent')} · simulated`,
    )}\n\n`,
  );

  // Interesting rows only, unless asked for everything. Two hundred lines of
  // ALLOW is the correct behaviour and the wrong output — the reader needs to
  // see what was intervened on, and a count of what was not.
  const shown = decisions.filter((d) => (flags.all ? true : d.tier !== 'allow'));
  const wanted = flags.tier ? shown.filter((d) => d.tier === flags.tier) : shown;
  const limit = flags.limit ?? 40;

  const rows = wanted
    .slice(0, limit)
    .map((d) => {
      const action = byAction.get(d.action_id);
      return action ? renderDecision(d, action, palette) : '';
    })
    .filter(Boolean);

  await writeLinesPaced(rows, pace);

  if (wanted.length > limit) {
    process.stdout.write(palette.dim(`  … ${wanted.length - limit} more (--limit to see them)\n`));
  }
  if (!flags.all) {
    const allowed = tally(decisions).allow ?? 0;
    process.stdout.write(
      palette.dim(`  ${allowed} routine actions proceeded untouched and are not listed (--all)\n`),
    );
  }

  await writePaced(renderWhereItStopped(decisions, palette), pace * 3);

  // The trail is written whether or not anyone asked, because the decisions are
  // the product. A control layer whose record is optional has no record.
  const trailPath = flags.output ? target(flags.output, flags.output) : join(dir, `decisions-${Date.now().toString(36)}.json`);
  const log = new GuardTrailLog(
    `guard-${Date.now().toString(36)}`,
    dir,
    new Date().toISOString(),
    'simulated',
  );
  for (const decision of decisions) {
    log.append(decision, byAction.get(decision.action_id)?.amount_paise ?? 0);
  }
  writeFileSync(trailPath, `${JSON.stringify(log.seal(), null, 2)}\n`, 'utf8');

  saveBaselines(dir, after);

  await writePaced(
    renderSummary(
      {
        counts: tally(decisions),
        money: moneyMoved(decisions, feed.actions),
        actions: feed.actions.length,
        agents: feed.agents.length,
        trailPath,
        entries: log.length,
      },
      palette,
    ),
    pace * 3,
  );

  process.stdout.write(
    `  ${palette.dim('Every decision above is in')} ${trailPath}\n` +
      `  ${palette.dim('Verify it:')}  sirius guard trail --verify ${trailPath}\n\n`,
  );
}

// -------------------------------------------------------------------- explain

async function explain(actionId: string | undefined, flags: GuardFlags, globals: GlobalFlags): Promise<void> {
  if (!actionId) {
    throw new CliError('Which action?', { hint: 'e.g. sirius guard explain act_00253' });
  }

  const dir = target(flags.agent, 'feed');
  const feed = loadFeed(dir);
  const action = feed.actions.find((a) => a.id === actionId);
  if (!action) {
    throw new CliError(`No action ${actionId} in ${dir}.`, {
      hint: 'Run `sirius guard eval` to see the ids.',
    });
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({ color: capabilities.color, unicode: capabilities.unicode, width: capabilities.width });

  // Judged against the baseline as it stood at that action, not the final one —
  // otherwise the explanation would not be the decision that was actually made.
  const upTo = feed.actions.filter((a) => Date.parse(a.at) < Date.parse(action.at));
  const { baselines } = evaluateFeed(upTo, feed.agents, { baselines: loadBaselines(dir) });
  const { decisions } = evaluateFeed([action], feed.agents, { baselines });
  const decision = decisions[0];
  if (!decision) throw new CliError('The action could not be evaluated.');

  process.stdout.write(renderLadder(decision, action, palette).join('\n') + '\n');
}

// --------------------------------------------------------------------- agents

async function listAgents(feedArg: string | undefined, flags: GuardFlags, globals: GlobalFlags): Promise<void> {
  const dir = target(feedArg, 'feed');
  const feed = loadFeed(dir);
  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({ color: capabilities.color, unicode: capabilities.unicode, width: capabilities.width });

  if (flags.json) {
    process.stdout.write(JSON.stringify(feed.agents, null, 2) + '\n');
    return;
  }

  const baselines = loadBaselines(dir);
  process.stdout.write('\n');

  for (const agent of feed.agents) {
    const baseline = baselines[agent.id];
    process.stdout.write(`  ${palette.bold(agent.name)}  ${palette.dim(agent.id)}\n`);
    process.stdout.write(`    ${palette.dim('objective')}   ${agent.objective}\n`);
    process.stdout.write(`    ${palette.dim('may')}         ${agent.scopes.join(', ')}\n`);
    process.stdout.write(
      `    ${palette.dim('per action')}  ${palette.rupee(agent.limits.per_action_paise)}` +
        `   ${palette.dim('daily')} ${palette.rupee(agent.limits.daily_paise)}` +
        `   ${palette.dim('per counterparty')} ${palette.rupee(agent.limits.exposure_paise)}\n`,
    );
    process.stdout.write(
      `    ${palette.dim('trusts')}      ${agent.trusted_sources.join(', ')}` +
        `   ${palette.dim(`(anything else is escalated)`)}\n`,
    );
    process.stdout.write(
      `    ${palette.dim('observed')}    ${
        baseline ? `${baseline.n} actions, ${Object.keys(baseline.counterparties).length} counterparties` : 'nothing yet'
      }\n\n`,
    );
  }
}

// ---------------------------------------------------------------------- score

/**
 * How well the layer did against what was actually planted.
 *
 * Reported per planted kind rather than as one number. "94% accurate" over a
 * feed that is 90% routine says almost nothing — the question is whether the
 * attacks were stopped and the ordinary work was left alone, and those are two
 * different failures with two different costs.
 */
function score(feedArg: string | undefined, flags: GuardFlags): void {
  const dir = target(feedArg, 'feed');
  const feed = loadFeed(dir);
  if (Object.keys(feed.truth).length === 0) {
    throw new CliError(`No truth file in ${dir}.`, {
      hint: 'Only a generated feed can be scored — the planted cases are what it is scored against.',
    });
  }

  const { decisions } = evaluateFeed(feed.actions, feed.agents, { baselines: {} });
  const byId = new Map(decisions.map((d) => [d.action_id, d]));

  const groups = new Map<string, Record<string, number>>();
  for (const [actionId, planted] of Object.entries(feed.truth)) {
    const tier = byId.get(actionId)?.tier ?? 'allow';
    const row = groups.get(planted) ?? {};
    row[tier] = (row[tier] ?? 0) + 1;
    groups.set(planted, row);
  }

  const ordinary = groups.get('none') ?? {};
  const ordinaryTotal = Object.values(ordinary).reduce((a, b) => a + b, 0);
  const intervened = ordinaryTotal - (ordinary.allow ?? 0);

  if (flags.json) {
    process.stdout.write(
      JSON.stringify({ by_planted: Object.fromEntries(groups), ordinary_intervention_rate: intervened / ordinaryTotal }, null, 2) + '\n',
    );
    return;
  }

  process.stdout.write('\n  planted case            allow  verify  constrain  block\n');
  process.stdout.write('  ' + '-'.repeat(58) + '\n');
  for (const [planted, row] of [...groups.entries()].sort()) {
    process.stdout.write(
      `  ${planted.padEnd(22)}${String(row.allow ?? 0).padStart(5)}${String(row.verify ?? 0).padStart(8)}` +
        `${String(row.constrain ?? 0).padStart(11)}${String(row.block ?? 0).padStart(7)}\n`,
    );
  }

  process.stdout.write(
    `\n  ${intervened} of ${ordinaryTotal} ordinary actions were intervened on ` +
      `(${((intervened / ordinaryTotal) * 100).toFixed(1)}%).\n` +
      `  An operator asked to approve most of the agent's work has become the agent,\n` +
      `  so this number matters as much as the ones above it.\n\n`,
  );
}

// ---------------------------------------------------------------------- trail

function verify(fileArg: string | undefined, flags: GuardFlags): void {
  const path = flags.verify ?? fileArg;
  if (!path) {
    throw new CliError('Which trail?', {
      hint: 'e.g. sirius guard trail --verify decisions-abc123.json',
    });
  }

  const file = resolve(process.cwd(), path);
  if (!existsSync(file)) throw new CliError(`No such trail: ${path}`);

  const result = verifyGuardTrail(JSON.parse(readFileSync(file, 'utf8')), flags.key);

  if (!result.ok) {
    process.stdout.write(`FAILED  ${path}\n        ${result.reason}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`OK      ${path}\n`);
  process.stdout.write(`        ${plural(result.entries, 'decision')}, chained and unbroken\n`);
  process.stdout.write(`        signed ${result.signedAt} by key ${result.keyId}\n`);
  process.stdout.write(
    result.pinned
      ? `        Unaltered since signing, by the key you required. The run was\n` +
          `        ${result.mode} — no account was contacted.\n`
      : `        Unaltered since signing — but ANY key verifies its own trail, so\n` +
          `        this does not say who signed it. Re-run with --key ${result.keyId}\n` +
          `        once you have that fingerprint from outside this file.\n` +
          `        The run was ${result.mode} — no account was contacted.\n`,
  );
}
