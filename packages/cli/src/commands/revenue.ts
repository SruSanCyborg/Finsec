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
import { findProjectRoot } from '../config/load.js';
import { detectCapabilities } from '../ui/theme.js';
import { paletteFor, renderAssessment, renderEvaluation, renderIncidents } from '../render/revenue.js';
import { DEFAULT_COSTS } from '../revenue/cost.js';
import { evaluate } from '../revenue/evaluate.js';
import { analyzeBatch } from '../revenue/features.js';
import { assessBatch, defaultCapacity, fitModel, isHeld } from '../revenue/model.js';
import type { Capacity, Model } from '../revenue/model.js';
import { generateBatch, splitOf } from '../revenue/synth.js';
import { loadBatch, loadTruth, hasTruth, writeBatch } from '../revenue/store.js';
import type { Assessment, RiskRecord, Split } from '../revenue/types.js';

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
  capacity?: number;
}

interface GlobalFlags {
  color?: boolean;
}

const DEFAULT_BATCH = 'batch';

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
    default:
      throw new CliError(`Unknown subcommand "${subcommand}".`, {
        hint: 'Expected one of: gen, detect, eval.',
      });
  }
}

// ---- gen --------------------------------------------------------------------

async function generate(target: string | undefined, flags: RevenueFlags): Promise<void> {
  const dir = resolve(process.cwd(), target ?? flags.out ?? DEFAULT_BATCH);
  const seed = flags.seed ?? 'sirius-2026';

  const batch = generateBatch({
    seed,
    payments: flags.payments ?? 700,
    checkouts: flags.checkouts ?? 200,
    invoices: flags.invoices ?? 120,
  });

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
  const shown = assessments
    .filter((assessment) => flags.all || assessment.flagged || isHeld(assessment))
    .sort((a, b) => b.expected_recovery_paise - a.expected_recovery_paise);

  process.stdout.write('\n');
  process.stdout.write(
    ` ${palette.bold('sirius revenue')}  ${palette.dim(
      `${inSplit.length} records in front of it · split=${split} · floor ${model.threshold} · room for ${capacity.max_actions}`,
    )}\n\n`,
  );

  const limit = flags.limit ?? 25;
  for (const assessment of shown.slice(0, limit)) {
    const record = byId.get(assessment.record_id);
    if (record) process.stdout.write(renderAssessment(assessment, record, palette) + '\n');
  }
  if (shown.length > limit) {
    process.stdout.write(palette.dim(`  … ${shown.length - limit} more (--limit to see them)\n`));
  }

  const incidents = renderIncidents(context, palette);
  if (incidents) process.stdout.write(incidents + '\n');

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
      'records the agent refuses to touch — disputes and shared-signal clusters',
    )}\n`,
  );
  process.stdout.write(palette.hr + '\n');
  process.stdout.write(
    palette.dim(
      ` Expected recovery is a forecast, not a result. ` +
        `Measure it:  sirius revenue eval ${target ?? DEFAULT_BATCH}\n`,
    ),
  );
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
  const { batch, model, assessments, capacity } = await scoreBatch(target, flags, split);
  const truth = loadTruth(dir);

  const evaluation = evaluate({
    records: batch.records,
    assessments,
    truth,
    threshold: model.threshold,
    split,
    costs: DEFAULT_COSTS,
    capacity,
  });

  if (flags.json) {
    process.stdout.write(
      JSON.stringify({ schema: 'sirius.revenue.eval/v1', model, evaluation }, null, 2) + '\n',
    );
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  process.stdout.write(renderEvaluation(evaluation, model, palette));
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

  const capacity = flags.capacity
    ? { max_actions: flags.capacity, rule: 'given with --capacity' }
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

function parseSplit(value: string | undefined): Split | 'all' {
  if (!value || value === 'test') return 'test';
  if (value === 'train' || value === 'all') return value;
  throw new CliError(`Unknown split "${value}".`, { hint: 'Expected: test, train, all.' });
}

