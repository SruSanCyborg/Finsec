/**
 * `sirius revenue` — the other half of money at risk.
 *
 * `scan` looks at money-handling code. This looks at what the code did: failed
 * payments, abandoned checkouts, receivables going stale. Same product, same
 * vocabulary, same refusal to print a number nobody computed.
 *
 * Three subcommands, and they are deliberately separate processes rather than
 * one pipeline flag:
 *
 *   gen     write a reproducible synthetic batch (a seed, not a fixture blob)
 *   detect  score a batch, diagnose it, and say what it would act on
 *   eval    measure the detector on the half it was never fitted on
 *
 * `eval` being its own command matters. A tool that only ever prints metrics as
 * a footer under its own output is a tool whose metrics are decoration; this
 * one can be pointed at a batch and asked, on its own, how well it does.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { CliError } from '../api/errors.js';
import { findProjectRoot, loadConfig } from '../config/load.js';
import { detectCapabilities } from '../ui/theme.js';
import { note, truncate } from '../ui/kit.js';
import { paletteFor, renderAssessment, renderEvaluation, renderIncidents } from '../render/revenue.js';
import { evaluate } from '../revenue/evaluate.js';
import { analyzeBatch } from '../revenue/features.js';
import { assessBatch, defaultCapacity, fitModel, isHeld } from '../revenue/model.js';
import type { Capacity, Model } from '../revenue/model.js';
import { generateBatch, splitOf } from '../revenue/synth.js';
import { loadBatch, loadTruth, hasTruth, writeBatch } from '../revenue/store.js';
import type { Assessment, RecordKind, RiskRecord, Split } from '../revenue/types.js';

interface RevenueFlags {
  seed?: string;
  payments?: number;
  checkouts?: number;
  invoices?: number;
  out?: string;
  split?: string;
  threshold?: number;
  limit?: number;
  json?: boolean;
  all?: boolean;
  model?: string;
  kind?: string;
  capacity?: number;
  budget?: number;
  maxSteps?: number;
  output?: string;
  verify?: string;
  /** `explain` takes the record id as its argument, so the batch moves to a flag. */
  batch?: string;
  seeds?: number;
  debounce?: number;
  force?: boolean;
  capacityShare?: number;
  save?: string;
  against?: string;
}

interface GlobalFlags {
  color?: boolean;
}

const DEFAULT_BATCH = 'batch';

/**
 * The project's own settings, read from `sirius.yaml` the same way `scan` reads
 * its gate. Cached because three subcommands ask for it and walking up the tree
 * for every one of them is work nobody asked for.
 */
let cachedConfig: ReturnType<typeof loadConfig> | undefined;
function projectConfig(): ReturnType<typeof loadConfig> {
  cachedConfig ??= loadConfig({ cwd: process.cwd() });
  return cachedConfig;
}

/**
 * Whether to pace the output, and by how much.
 *
 * The same problem `scan` has, for the same reason: the work finishes in a
 * tenth of a second and writes fifty lines, so a terminal paints once and the
 * viewer sees the last screenful. Pacing restores what a streamed path gets for
 * free. Off for `--json`, off for a pipe, off in CI — a pipeline must not pay
 * deliberate delay to look good for nobody.
 *
 * `SIRIUS_REVENUE_PACE` overrides the per-line delay in milliseconds; 0 turns
 * it off, which is what the tests and the rehearsal's fast mode use.
 */
function paceMs(machineMode: boolean): number {
  const raw = process.env.SIRIUS_REVENUE_PACE;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  if (machineMode) return 0;
  const interactive = process.env.SIRIUS_STREAM_PLAIN === '1' || Boolean(process.stdout.isTTY);
  return interactive ? 85 : 0;
}

export async function runRevenue(
  subcommand: string | undefined,
  target: string | undefined,
  flags: RevenueFlags,
  globals: GlobalFlags,
): Promise<void> {
  switch (subcommand ?? 'detect') {
    case 'gen':
      return generate(target, flags);
    case 'detect':
      return detect(target, flags, globals);
    case 'eval':
      return evaluateBatch(target, flags, globals);
    case 'recover':
      return runRecovery(target, flags, globals);
    case 'audit':
      return auditTrail(target, flags);
    case 'explain':
      return explainRecord(target, flags, globals);
    case 'sweep':
      return runSweep(flags, globals);
    case 'stress':
      return runStress(flags, globals);
    case 'watch':
      return watchBatch(target, flags, globals);
    default:
      throw new CliError(`Unknown subcommand "${subcommand}".`, {
        hint: 'Expected one of: gen, detect, eval, recover, explain, sweep, stress, watch, audit.',
      });
  }
}

// ---- gen --------------------------------------------------------------------

async function generate(target: string | undefined, flags: RevenueFlags): Promise<void> {
  const dir = resolve(process.cwd(), target ?? flags.out ?? DEFAULT_BATCH);
  const seed = flags.seed ?? 'sirius-2026';
  const counts = {
    payments: flags.payments ?? 700,
    checkouts: flags.checkouts ?? 200,
    invoices: flags.invoices ?? 120,
  };

  // The one destructive act in this surface, and it used to be silent.
  //
  // A batch is the evidence for every figure reported against it — the labels
  // most of all, since without them nothing can be scored again. Overwriting it
  // with a different seed makes yesterday's metrics unreproducible from the
  // directory they were measured in, and says nothing.
  //
  // Regenerating the *same* batch is not destructive: the generator is
  // deterministic, so the same seed and counts rewrite byte-identical files.
  // Only a change is refused, which keeps `gen` idempotent for scripts.
  const existing = existsSync(join(dir, 'manifest.json'))
    ? (JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as ReturnType<typeof generateBatch>['manifest'])
    : undefined;

  if (existing && !flags.force) {
    const sameSeed = String(existing.seed) === String(seed);
    // Checkouts and invoices only. The manifest's payment count includes the
    // injected outage burst, so it is never the number that was asked for —
    // comparing it would refuse every regeneration, including identical ones.
    const sameCounts =
      existing.counts.checkouts === counts.checkouts && existing.counts.invoices === counts.invoices;

    if (!sameSeed || !sameCounts) {
      const total = existing.counts.payments + existing.counts.checkouts + existing.counts.invoices;
      throw new CliError(`${dir} already holds a different batch.`, {
        hint:
          `It was generated from seed "${existing.seed}" (${total} records, ${existing.generated_at.slice(0, 10)}), ` +
          `and its truth.jsonl is the only thing that can score it.
` +
          `  Write it somewhere else:  sirius revenue gen <other-dir> --seed ${seed}
` +
          `  Or replace it on purpose: --force`,
      });
    }
  }

  const batch = generateBatch({ seed, ...counts });

  writeBatch(dir, batch);

  const total = batch.records.length;
  const test = batch.records.filter((record) => splitOf(record.id) === 'test').length;

  process.stdout.write(`Wrote ${total} records to ${dir}\n`);
  process.stdout.write(`  records.jsonl   what the detector sees\n`);
  process.stdout.write(`  truth.jsonl     the labels, kept in a separate file on purpose\n`);
  process.stdout.write(`  manifest.json   seed "${seed}", split rule, injected incidents\n\n`);
  process.stdout.write(`Split: ${total - test} train · ${test} held out (${batch.manifest.split_rule})\n`);

  for (const incident of batch.incidents) {
    process.stdout.write(
      `Injected: ${incident.kind} — ${incident.record_ids.length} records` +
        `${incident.psp ? ` on ${incident.psp}/${incident.rail}` : ''}\n`,
    );
  }

  process.stdout.write(`\nSame seed, same batch, on any machine. Next:  sirius revenue detect ${target ?? DEFAULT_BATCH}\n`);
}

// ---- detect -----------------------------------------------------------------

async function detect(
  target: string | undefined,
  flags: RevenueFlags,
  globals: GlobalFlags,
): Promise<void> {
  const split = parseSplit(flags.split);
  const { batch, model, assessments, context, capacity, inSplit } = await scoreBatch(target, flags, split);

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: 'sirius.revenue.detect/v1',
          batch: batch.dir,
          floor: model.threshold,
          capacity,
          incidents: { degradations: context.degradations, rings: context.rings },
          assessments,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  const byId = new Map(batch.records.map((record) => [record.id, record]));

  // Ranked by expected value, the top of the list is all invoices — they are
  // the largest records, so they win a money ranking honestly. A payments team
  // and a receivables team are different people with different queues, though,
  // so `--kind` narrows the view without touching the selection: the agent
  // still spent its capacity across the whole batch, and the totals below still
  // say so.
  const kind = parseKind(flags.kind);
  const shown = assessments
    .filter((assessment) => flags.all || assessment.flagged || isHeld(assessment))
    .filter((assessment) => !kind || assessment.kind === kind)
    .sort((a, b) => b.expected_recovery_paise - a.expected_recovery_paise);

  process.stdout.write('\n');
  process.stdout.write(
    ` ${palette.bold('sirius revenue')}  ${palette.dim(
      `${inSplit.length} records · split=${split}${kind ? ` · showing ${kind}s` : ''}` +
        ` · floor ${model.threshold} · room for ${capacity.max_actions}`,
    )}\n\n`,
  );

  const { writeLinesPaced, writePaced } = await import('../engine/pace.js');
  const pace = paceMs(Boolean(flags.json));

  const limit = flags.limit ?? 25;
  const rows = shown
    .slice(0, limit)
    .map((assessment) => {
      const record = byId.get(assessment.record_id);
      return record ? renderAssessment(assessment, record, palette) : '';
    })
    .filter(Boolean);

  // A line at a time: this is the part a viewer reads one record at a time.
  await writeLinesPaced(rows, pace);

  if (shown.length > limit) {
    process.stdout.write(palette.dim(`  … ${shown.length - limit} more (--limit to see them)\n`));
  }

  const incidents = renderIncidents(context, palette);
  if (incidents) await writePaced(incidents.split('\n'), pace * 3);

  const flagged = assessments.filter((a) => a.flagged);
  const held = assessments.filter(isHeld);
  const atRisk = assessments.reduce((sum, a) => sum + a.amount_paise, 0);
  const expected = flagged.reduce((sum, a) => sum + a.expected_recovery_paise, 0);
  const byKind = (kind: string) => flagged.filter((a) => a.kind === kind).length;

  process.stdout.write(palette.hr + '\n');
  process.stdout.write(
    ` ${'At risk'.padEnd(12)}${palette.bold(palette.rupee(atRisk))} ${palette.dim(
      `across ${assessments.length} records`,
    )}\n`,
  );
  process.stdout.write(
    ` ${'Actionable'.padEnd(12)}${palette.violet(palette.bold(palette.rupee(expected)))} ${palette.dim(
      `expected from ${flagged.length} records the agent would act on`,
    )}\n`,
  );
  process.stdout.write(
    ` ${''.padEnd(12)}${palette.dim(
      `${byKind('payment')} payments · ${byKind('checkout')} checkouts · ${byKind('invoice')} invoices` +
        `${flagged.length >= capacity.max_actions ? ' — capacity full' : ''}`,
    )}\n`,
  );
  process.stdout.write(
    ` ${'Held'.padEnd(12)}${palette.amber(String(held.length))} ${palette.dim(
      truncate('records the agent refuses to touch — disputes and shared-signal clusters', Math.max(0, palette.width - 22)),
    )}\n`,
  );
  process.stdout.write(palette.hr + '\n');
  // Wrapped, not shortened. Trimming this to fit cost it its subject — "a
  // forecast, not a result" does not say *what* is a forecast, and the whole
  // point of the line is that the expected-recovery figure above it has not
  // happened yet.
  for (const line of note(
    `Expected recovery is a forecast, not a result. ` +
      `Measure it:  sirius revenue eval ${target ?? DEFAULT_BATCH}`,
    { indent: 1, width: palette.width },
  )) {
    process.stdout.write(palette.dim(line) + '\n');
  }
  process.stdout.write('\n');
}

// ---- eval -------------------------------------------------------------------

async function evaluateBatch(
  target: string | undefined,
  flags: RevenueFlags,
  globals: GlobalFlags,
): Promise<void> {
  const dir = batchDir(target);
  if (!hasTruth(dir)) {
    throw new CliError(`${dir} has no labels, so nothing here can be measured.`, {
      hint: 'Generate a batch with `sirius revenue gen`, which writes truth.jsonl beside the records.',
    });
  }

  const split = parseSplit(flags.split);
  const { batch, model, assessments, capacity, context, inSplit } = await scoreBatch(target, flags, split);
  const truth = loadTruth(dir);

  // The project's cost model, not the built-in one. `recover` and `sweep` both
  // read it and `eval` did not, so the three disagreed about what a false
  // positive costs — and the number a team would gate on was the one computed
  // from somebody else's assumptions.
  const { costsFrom } = await import('../revenue/policy.js');

  const input = {
    records: batch.records,
    assessments,
    truth,
    threshold: model.threshold,
    split,
    costs: costsFrom(projectConfig().revenue),
    capacity,
  };
  const evaluation = evaluate(input);

  // The edge against the best runnable heuristic is a function of how much room
  // there is to act, and reporting it at one capacity invited "so your model is
  // worth one percent". It is worth one percent at the capacity this batch
  // happened to be measured at. The curve is the answer.
  const { capacityCurve } = await import('../revenue/evaluate.js');
  const curve = capacityCurve({
    records: inSplit,
    model,
    context,
    truth,
    threshold: model.threshold,
    split,
    costs: costsFrom(projectConfig().revenue),
  });

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        { schema: 'sirius.revenue.eval/v1', model, evaluation, capacity_curve: curve },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  process.stdout.write(renderEvaluation(evaluation, model, palette, curve));
}

// ---- recover ----------------------------------------------------------------

/**
 * Runs the bounded workflow and writes a signed trail of everything it did.
 *
 * Simulated, and it says so in three places: the banner, the trail's `mode`,
 * and the closing note. There is no `--execute`, because there is nothing
 * behind it — an agent that can spend real money needs more than a flag, and
 * shipping the flag before the safeguards is how the flag gets used.
 */
async function runRecovery(
  target: string | undefined,
  flags: RevenueFlags,
  globals: GlobalFlags,
): Promise<void> {
  const dir = batchDir(target);
  if (!hasTruth(dir)) {
    throw new CliError(`${dir} has no labels, so a run against it could not be measured.`, {
      hint: 'Generate a batch with `sirius revenue gen`.',
    });
  }

  const split = parseSplit(flags.split);
  const { batch, model, capacity } = await scoreBatch(target, flags, split);

  const { runBatch } = await import('../revenue/pipeline.js');
  const { costsFrom, describeOverrides, limitsFrom, rulesFor } = await import('../revenue/policy.js');

  // sirius.yaml first, then flags on top of it — the same precedence every
  // other setting follows. A team pins its policy in the file; an operator
  // overrides one number for one run.
  const config = projectConfig();
  const fromFile = limitsFrom(config.revenue);
  const limits = flags.budget ? { ...fromFile, budget_paise: flags.budget * 100 } : fromFile;
  const costs = costsFrom(config.revenue);
  const maxSteps = flags.maxSteps ?? config.revenue?.max_steps;

  // The same function `watch` calls. Two commands running the same batch two
  // different ways is the drift this repo keeps paying for.
  const pipeline = runBatch({
    dir: batch.dir,
    split,
    limits,
    costs,
    capacity,
    model,
    ...(maxSteps ? { maxSteps } : {}),
  });
  const result = pipeline.recovery as NonNullable<typeof pipeline.recovery>;

  const trailPath = flags.output
    ? resolve(process.cwd(), flags.output)
    : join(batch.dir, `recovery-${result.run_id}.json`);
  writeFileSync(trailPath, JSON.stringify(result.trail, null, 2) + '\n', 'utf8');

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        { schema: 'sirius.revenue.recover/v1', run_id: result.run_id, trail: trailPath, outcome: result.outcome },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  const { renderRecovery, renderRecoveryLog } = await import('../render/revenue.js');
  const { writeLinesPaced, writePaced } = await import('../engine/pace.js');
  const pace = paceMs(false);

  process.stdout.write(
    `\n ${palette.bold('sirius revenue recover')}${palette.dim(
      truncate(
        `  run ${result.run_id} · split=${split} · room for ${capacity.max_actions} · simulated, nothing left this machine`,
        Math.max(0, palette.width - 24),
      ),
    )}\n`,
  );

  // A run under someone's own policy says so. Obeying a config file silently is
  // how a number nobody remembers setting ends up explaining a result nobody
  // expected.
  const moved = describeOverrides(limits);
  if (moved.length > 0) {
    process.stdout.write(
      ` ${palette.dim(`under this project's policy — ${moved.join(' · ')}`)}\n`,
    );
  }
  process.stdout.write('\n');

  // The timeline first, then the totals. A summary alone says what happened;
  // watching the refusals arrive is what shows the agent stopping.
  await writeLinesPaced(renderRecoveryLog(result.trail.entries, palette, flags.limit ?? 120), pace);

  // The rules table quotes this run's limits, not the built-in ones.
  await writePaced(renderRecovery(result.outcome, rulesFor(limits), palette, trailPath).split('\n'), pace * 3);
}

// ---- watch ------------------------------------------------------------------

/**
 * `sirius revenue watch` — re-run when the batch or the policy changes.
 *
 * A recovery agent is tuned, not written: somebody sets `contacts_per_day: 1`,
 * wants to know what it cost, and today has to run the command twice and hold
 * the difference in their head. This watches `sirius.yaml` and the batch and
 * prints only what moved.
 *
 * It writes nothing. A loop that re-runs on every keystroke must not leave a
 * hundred signed audit trails behind it, so the trail stays a return value.
 */
async function watchBatch(
  target: string | undefined,
  flags: RevenueFlags,
  globals: GlobalFlags,
): Promise<void> {
  const dir = batchDir(target);
  if (!hasTruth(dir)) {
    throw new CliError(`${dir} has no labels, so a run against it could not be measured.`, {
      hint: 'Generate a batch with `sirius revenue gen`.',
    });
  }

  const { watch } = await import('node:fs');
  const { runBatch, summarise, changes } = await import('../revenue/pipeline.js');
  const { costsFrom, limitsFrom } = await import('../revenue/policy.js');
  const { renderChanges } = await import('../render/revenue.js');

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  const split = parseSplit(flags.split);
  const projectFile = findProjectRoot(process.cwd())?.file;

  let previous: ReturnType<typeof summarise> | undefined;
  let running = false;
  let queued = false;
  let timer: NodeJS.Timeout | undefined;
  let runs = 0;

  const once = async (reason: string): Promise<void> => {
    running = true;
    runs += 1;
    const startedAt = Date.now();

    try {
      // Config is re-read every run: watching a policy file and then using a
      // cached copy of it would be a loop that cannot see the thing it watches.
      cachedConfig = undefined;
      const config = projectConfig();

      const result = runBatch({
        dir,
        split,
        limits: limitsFrom(config.revenue),
        costs: costsFrom(config.revenue),
        ...(flags.capacity
          ? { capacity: { max_actions: flags.capacity, rule: 'given with --capacity' } }
          : config.revenue?.capacity
            ? { capacity: { max_actions: config.revenue.capacity, rule: 'set in sirius.yaml' } }
            : {}),
        ...(flags.maxSteps ?? config.revenue?.max_steps
          ? { maxSteps: (flags.maxSteps ?? config.revenue?.max_steps) as number }
          : {}),
      });

      const summary = summarise(result);

      if (runs === 1) {
        process.stdout.write(
          `\n ${palette.bold('sirius revenue watch')}  ${palette.dim(
            `${result.inSplit.length} records · split=${split} · capacity ${summary.capacity}`,
          )}\n`,
        );
        process.stdout.write(
          `    ${palette.dim(
            `${summary.flagged} acted on · ${summary.actions} actions · ${summary.blocked} refused · ` +
              `${palette.rupee(summary.attributable_paise)} attributable`,
          )}\n`,
        );
      } else {
        process.stdout.write(renderChanges(changes(previous as never, summary), palette, reason));
      }

      previous = summary;
    } catch (error) {
      // A broken config must not kill the watcher — the next save usually fixes
      // it, and dying on a half-typed YAML line is the worst moment to exit.
      process.stderr.write(`  ${palette.amber('run failed')}: ${error instanceof Error ? error.message : String(error)}\n`);
    }

    process.stdout.write(
      palette.dim(`    ${Date.now() - startedAt}ms · watching ${dir}${projectFile ? ` and ${projectFile}` : ''}. Ctrl-C to stop.\n`),
    );
    running = false;

    if (queued) {
      queued = false;
      await once('another change while that was running');
    }
  };

  const trigger = (reason: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) queued = true;
      else void once(reason);
    }, flags.debounce ?? 300);
  };

  const watchers = [watch(dir, { recursive: true }, () => trigger('the batch changed'))];
  if (projectFile) watchers.push(watch(projectFile, () => trigger(`${basenameOf(projectFile)} changed`)));

  process.on('SIGINT', () => {
    for (const watcher of watchers) watcher.close();
    if (timer) clearTimeout(timer);
    process.stdout.write('\nstopped.\n');
    process.exit(0);
  });

  await once('first run');
  await new Promise<void>(() => {});
}

// ---- sweep ------------------------------------------------------------------

/**
 * `sirius revenue sweep` — is it stable, and did that change help?
 *
 * One batch is an anecdote. Every time this model changed, the honest answer
 * needed several independently generated batches and a comparison against the
 * previous numbers, and getting them meant a throwaway script. Three of those
 * were written before this command existed.
 *
 * `--save` writes the run; `--against` compares to a saved one and reports the
 * deltas, including the ones that got worse. Refusing to compare runs that used
 * different seeds matters more than it looks: subtracting two different
 * experiments produces a number that reads exactly like a result.
 */
/**
 * How much of the edge survives a world the model was not fitted to.
 *
 * The held-out split answers the weak form of "you made the data": same
 * distribution, rows the fit never saw. This answers the form that happens —
 * the traffic mix moves and the weights are last quarter's.
 */
async function runStress(flags: RevenueFlags, globals: GlobalFlags): Promise<void> {
  const { stress } = await import('../revenue/stress.js');
  const { costsFrom } = await import('../revenue/policy.js');

  const report = stress({
    ...(flags.seeds ? { seeds: flags.seeds } : {}),
    ...(flags.payments ? { payments: flags.payments } : {}),
    ...(flags.checkouts ? { checkouts: flags.checkouts } : {}),
    ...(flags.invoices ? { invoices: flags.invoices } : {}),
    ...(flags.capacityShare ? { capacityShare: flags.capacityShare } : {}),
    costs: costsFrom(projectConfig().revenue),
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  const { renderStress } = await import('../render/revenue.js');
  process.stdout.write(renderStress(report, palette));
}

async function runSweep(flags: RevenueFlags, globals: GlobalFlags): Promise<void> {
  const { sweep, compare, comparable } = await import('../revenue/sweep.js');
  const { costsFrom } = await import('../revenue/policy.js');

  const summary = sweep({
    seed: flags.seed ?? 'sirius-sweep',
    count: flags.seeds ?? 8,
    payments: flags.payments ?? 700,
    checkouts: flags.checkouts ?? 200,
    invoices: flags.invoices ?? 120,
    costs: costsFrom(projectConfig().revenue),
    ...(flags.capacityShare ? { capacityShare: flags.capacityShare } : {}),
  });

  if (flags.save) {
    const path = resolve(process.cwd(), flags.save);
    writeFileSync(path, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  const { renderSweep, renderComparison } = await import('../render/revenue.js');
  process.stdout.write(renderSweep(summary, palette));

  if (flags.against) {
    const path = resolve(process.cwd(), flags.against);
    if (!existsSync(path)) throw new CliError(`No saved sweep at ${flags.against}.`);

    const before = JSON.parse(readFileSync(path, 'utf8')) as typeof summary;
    process.stdout.write(renderComparison(compare(before, summary), palette, comparable(before, summary)));
  }

  if (flags.save) {
    process.stdout.write(
      `  ${'Saved to'} ${resolve(process.cwd(), flags.save)} — compare a later run with --against\n\n`,
    );
  }
}

// ---- explain ----------------------------------------------------------------

/**
 * `sirius revenue explain <record-id>` — the counterpart to explaining a rule.
 *
 * The model is a scorecard rather than something with better numbers precisely
 * so this command can exist: every step from the base rate to the decision
 * prints as a sentence somebody can disagree with. A model that cannot be
 * argued with in a meeting does not get used in one.
 *
 * The record id comes first here, not the batch, because that is the order the
 * question arrives in — somebody is looking at a line of output and asking why.
 */
async function explainRecord(
  recordId: string | undefined,
  flags: RevenueFlags,
  globals: GlobalFlags,
): Promise<void> {
  if (!recordId) {
    throw new CliError('Which record?', {
      hint: 'e.g. sirius revenue explain inv_00059 — the ids are in `revenue detect` output',
    });
  }

  const split = parseSplit(flags.split ?? 'all');
  const { batch, model, assessments, context, capacity } = await scoreBatch(flags.batch, flags, split);

  const record = batch.records.find((entry) => entry.id === recordId);
  const assessment = assessments.find((entry) => entry.record_id === recordId);

  if (!record) {
    throw new CliError(`No record "${recordId}" in ${batch.dir}.`, {
      hint: 'Ids look like pay_00123, chk_00045 or inv_00007.',
    });
  }
  if (!assessment) {
    throw new CliError(`${recordId} is in the batch but was not scored in this split.`, {
      hint: 'Pass --split all to score every record.',
    });
  }

  const { chooseAction, check, costsFrom, emptyState, limitsFrom, rulesFor } = await import(
    '../revenue/policy.js'
  );
  const { interventionCost } = await import('../revenue/cost.js');
  const { shareFor, shareKeyOf } = await import('../revenue/model.js');

  const config = projectConfig();
  const limits = limitsFrom(config.revenue);
  const costs = costsFrom(config.revenue);
  const at = batch.manifest.as_of ? new Date(batch.manifest.as_of) : new Date();

  const action = chooseAction(record, context, 0);
  const cost = interventionCost(action, costs);
  const verdict = check(action, record, context, emptyState(), at, limits, cost);

  // Only read when the batch has an answer key, and never before the score is
  // computed. It is printed at the bottom, under its own heading, because it
  // plays no part in anything above it.
  const truth = hasTruth(batch.dir) ? loadTruth(batch.dir).get(recordId) : undefined;

  const explanation = {
    record,
    assessment,
    split,
    baseRate: model.base_rate,
    calibration: model.calibration,
    trainedOn: model.trained_on,
    share: shareFor(model, record),
    shareKey: shareKeyOf(record),
    cost_paise: cost,
    action,
    verdict: {
      allowed: verdict.allowed,
      ...(verdict.rule ? { rule: verdict.rule } : {}),
      ...(verdict.detail ? { detail: verdict.detail } : {}),
    },
    capacity,
    floor: model.threshold,
    ...(truth ? { truth } : {}),
  };

  if (flags.json) {
    process.stdout.write(
      JSON.stringify({ schema: 'sirius.revenue.explain/v1', ...explanation, rules: rulesFor(limits) }, null, 2) +
        '\n',
    );
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  const { renderExplanation } = await import('../render/revenue.js');
  process.stdout.write(renderExplanation(explanation, palette));
}

// ---- audit ------------------------------------------------------------------

async function auditTrail(target: string | undefined, flags: RevenueFlags): Promise<void> {
  const path = flags.verify ?? target;
  if (!path) {
    throw new CliError('Which trail?', { hint: 'e.g. sirius revenue audit --verify recovery-1a2b3c4d.json' });
  }

  const file = resolve(process.cwd(), path);
  if (!existsSync(file)) throw new CliError(`No such trail: ${path}`);

  const { verifyTrail } = await import('../revenue/audit.js');
  const result = verifyTrail(JSON.parse(readFileSync(file, 'utf8')));

  if (!result.ok) {
    process.stdout.write(`FAILED  ${path}\n        ${result.reason}\n`);
    // Exit 1: a broken trail is a finding, not a crash.
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`OK      ${path}\n`);
  process.stdout.write(`        ${result.entries} entries, chained and unbroken\n`);
  process.stdout.write(`        signed ${result.signedAt} by key ${result.keyId}\n`);
  process.stdout.write(
    `        This proves the trail has not been altered since it was signed. It does\n` +
      `        not prove the actions were right, and the run was ${result.mode} —\n` +
      `        no gateway was called and no message was sent.\n`,
  );
}

// ---- shared -----------------------------------------------------------------

interface Scored {
  batch: ReturnType<typeof loadBatch>;
  model: Model;
  assessments: Assessment[];
  context: ReturnType<typeof analyzeBatch>;
  capacity: Capacity;
  /** The records actually in front of the agent — the split being worked. */
  inSplit: RiskRecord[];
}

/**
 * Loads a batch, fits or reuses a model, and scores everything.
 *
 * The fit reads `truth.jsonl` because a supervised model has to be trained on
 * something — but only the training split, and the model it produces is written
 * out so `detect` on a batch with no labels at all still works. That is the
 * arrangement a real deployment has: labels exist for history, not for the
 * records arriving now.
 */
async function scoreBatch(
  target: string | undefined,
  flags: RevenueFlags,
  split: Split | 'all',
): Promise<Scored> {
  const dir = batchDir(target);
  const batch = loadBatch(dir);
  const model = await resolveModel(dir, batch.records, flags);

  // The context is built from the whole batch even when only one split is being
  // acted on: an outage is visible in all the traffic, and a ring that spans the
  // split is still a ring. Only the *selection* is confined to the split, so
  // that a capacity of sixty-seven means sixty-seven of the records in front of
  // the agent right now.
  const context = analyzeBatch(batch.records);
  const inSplit = batch.records.filter((record) => split === 'all' || splitOf(record.id) === split);

  const configured = projectConfig().revenue?.capacity;
  const capacity = flags.capacity
    ? { max_actions: flags.capacity, rule: 'given with --capacity' }
    : configured
      ? { max_actions: configured, rule: 'set in sirius.yaml' }
      : defaultCapacity(inSplit.length);

  const { assessments } = assessBatch(inSplit, model, { context, capacity });
  return { batch, model, assessments, context, capacity, inSplit };
}

async function resolveModel(
  dir: string,
  records: readonly RiskRecord[],
  flags: RevenueFlags,
): Promise<Model> {
  const path = flags.model ? resolve(process.cwd(), flags.model) : modelPath(dir);

  if (!flags.model && hasTruth(dir)) {
    // Fit on this batch's training split. Cheap enough to do every run, which
    // keeps the reported model and the printed scores from ever drifting apart.
    const model = fitModel(records, loadTruth(dir));
    if (flags.threshold !== undefined) model.threshold = flags.threshold;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(model, null, 2) + '\n', 'utf8');
    } catch {
      // A read-only tree should not stop a scoring run.
    }
    return model;
  }

  if (!existsSync(path)) {
    throw new CliError(`No labels in ${dir} and no fitted model at ${path}.`, {
      hint: 'Fit one on a labelled batch first: `sirius revenue eval <labelled-batch>`.',
    });
  }

  const model = JSON.parse(readFileSync(path, 'utf8')) as Model;
  if (flags.threshold !== undefined) model.threshold = flags.threshold;
  return model;
}

function modelPath(dir: string): string {
  const root = findProjectRoot(process.cwd())?.dir ?? process.cwd();
  return join(root, '.sirius', `revenue-model-${basenameOf(dir)}.json`);
}

function basenameOf(dir: string): string {
  return dir.split('/').filter(Boolean).pop() ?? 'batch';
}

function batchDir(target: string | undefined): string {
  const dir = resolve(process.cwd(), target ?? DEFAULT_BATCH);
  if (!existsSync(dir)) {
    throw new CliError(`No batch at ${dir}.`, {
      hint: 'Generate one:  sirius revenue gen batch',
    });
  }
  return dir;
}

function parseKind(value: string | undefined): RecordKind | undefined {
  if (!value) return undefined;
  const singular = value.endsWith('s') ? value.slice(0, -1) : value;
  if (singular === 'payment' || singular === 'checkout' || singular === 'invoice') return singular;
  throw new CliError(`Unknown kind "${value}".`, { hint: 'Expected: payment, checkout, invoice.' });
}

function parseSplit(value: string | undefined): Split | 'all' {
  if (!value || value === 'test') return 'test';
  if (value === 'train' || value === 'all') return value;
  throw new CliError(`Unknown split "${value}".`, { hint: 'Expected: test, train, all.' });
}

