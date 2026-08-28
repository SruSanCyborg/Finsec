/**
 * Collects every figure the published page shows, by running the CLI.
 *
 * The page was hand-transcribed from a terminal the first time, and went stale
 * twice inside a day — once when the risk-block hold changed the baselines, once
 * when the calibration wording changed. A number that has to be copied is a
 * number that will be wrong, so nothing here is typed: each figure comes from
 * the same `--json` output a pipeline would consume.
 *
 * Everything is derived from two seeds, `sirius-2026` and `sirius-books`, so the
 * page is reproducible from the repo alone. Rupees are pre-formatted here rather
 * than in the template, because Indian grouping is a rule the template should
 * not have to know.
 *
 * Usage: node scripts/artifact/collect.mjs [out.json]
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(root, 'packages', 'cli', 'dist', 'cli.js');

/** Runs the CLI in `cwd` and parses its JSON. Pacing off: nobody is watching. */
function run(cwd, args) {
  const out = execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SIRIUS_REVENUE_PACE: '0', SIRIUS_SCAN_PACE: '0', NO_COLOR: '1' },
  });
  return JSON.parse(out);
}

function quiet(cwd, args) {
  execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    stdio: 'ignore',
    env: { ...process.env, SIRIUS_REVENUE_PACE: '0', NO_COLOR: '1' },
  });
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Paise in, a grouped rupee string out. The page never does this arithmetic. */
const rupees = (paise) => `₹${inr.format(Math.round(paise / 100))}`;
const pct = (share, places = 1) => `${(share * 100).toFixed(places)}%`;
const signed = (share) => `${share >= 0 ? '+' : ''}${(share * 100).toFixed(1)}%`;

const stage = mkdtempSync(join(tmpdir(), 'sirius-artifact-'));

try {
  // ---- the batch every headline figure comes from
  quiet(stage, ['revenue', 'gen', 'batch', '--seed', 'sirius-2026']);
  quiet(stage, ['reconcile', 'books', '--gen', '--seed', 'sirius-books']);

  const detect = run(stage, ['revenue', 'detect', 'batch', '--json']);
  const evaluation = run(stage, ['revenue', 'eval', 'batch', '--json']);
  const recovery = run(stage, ['revenue', 'recover', 'batch', '--json']);
  // Read the trail rather than deriving its length: "every decision is an
  // entry" is a claim the page makes, and counting them from the outcome would
  // be re-deriving it from the same assumption it is meant to evidence.
  const trail = JSON.parse(readFileSync(recovery.trail, 'utf8'));
  const reconciliation = run(stage, ['reconcile', 'books', '--json']);

  // ---- stability, and where the ranking earns its keep
  const sweep = run(stage, ['revenue', 'sweep', '--seeds', '8', '--json']);

  // Eight seeds a point, not four. At 3% capacity the agent works a handful of
  // records and the edge over the heuristics swings wildly — four seeds put it
  // at +36%, which is a number nobody should publish from four observations.
  // The whole collection runs in under two seconds either way.
  const capacity = [];
  for (const share of [0.03, 0.05, 0.1, 0.2, 0.4]) {
    const point = run(stage, ['revenue', 'sweep', '--seeds', '8', '--capacity-share', String(share), '--json']);
    capacity.push({
      share,
      label: `capacity ${Math.round(share * 100)}%`,
      edge: point.mean.edge,
      edge_text: signed(point.mean.edge),
      ceiling: point.mean.share_of_ceiling,
      ceiling_text: pct(point.mean.share_of_ceiling, 0),
      forbidden_touched: point.forbidden_touched,
      heuristic_forbidden_touched: point.heuristic_forbidden_touched,
    });
  }

  const e = evaluation.evaluation;
  const ceilingNet =
    e.baselines.find((baseline) => baseline.name === 'perfect foresight')?.cost.net_paise ?? 0;

  // Measured, not read out of prose.
  //
  // This grepped `AGENTS.md` for "N passing", which made it the one figure on
  // the page nobody had run to obtain — and the one that went stale twice,
  // because the count moves whenever a test is added and the doc is updated by
  // hand. Running the suite costs a couple of seconds and removes the last
  // hand-maintained number from the page.
  const vitest = () =>
    execFileSync('npx', ['vitest', 'run', '--reporter=json', '--silent'], {
      cwd: join(root, 'packages', 'cli'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

  // A failing suite makes vitest exit non-zero, which makes execFileSync throw
  // before anything here can say why — a raw Node stack where a sentence
  // belongs. The report is still on stdout, so read it off the error.
  let raw;
  try {
    raw = vitest();
  } catch (error) {
    raw = error?.stdout ?? '';
  }

  const report = raw ? JSON.parse(raw) : { numTotalTests: 0, numFailedTests: 1 };

  if (report.numFailedTests > 0) {
    process.stderr.write(
      `${report.numFailedTests} of ${report.numTotalTests} tests failing.\n` +
        `Refusing to collect: a page published from a build that does not pass is a page\n` +
        `describing something nobody can run. Fix the suite, then re-run.\n`,
    );
    process.exit(1);
  }

  const tests = report.numTotalTests;

  const metrics = {
    generated_at: new Date().toISOString(),
    seeds: { batch: 'sirius-2026', books: 'sirius-books' },
    tests,

    batch: {
      records: detect.assessments.length,
      capacity: detect.capacity.max_actions,
      capacity_rule: detect.capacity.rule,
      floor: detect.floor,
      degradations: detect.incidents.degradations.length,
      rings: detect.incidents.rings.length,
      ring_parties: detect.incidents.rings[0]?.distinct_parties ?? 0,
      degradation_failures: detect.incidents.degradations[0]?.failures ?? 0,
      degradation_lift: detect.incidents.degradations[0]?.lift ?? 0,
    },

    eval: {
      records: e.records,
      trained_on: evaluation.model.trained_on,
      matrix: e.matrix,
      precision: pct(e.precision),
      recall: pct(e.recall),
      money_precision: pct(e.money_precision),
      money_recall: pct(e.money_recall),
      calibration_error: pct(e.calibration_error),
      calibration_warning: e.calibration_warning ?? null,
      calibration: e.calibration.map((bin) => ({
        ...bin,
        predicted_text: pct(bin.predicted),
        actual_text: pct(bin.actual),
        gap_text: `${bin.actual - bin.predicted >= 0 ? '+' : ''}${((bin.actual - bin.predicted) * 100).toFixed(1)}pp`,
      })),
      forbidden: e.forbidden,
      share_of_ceiling: pct(e.cost.net_paise / Math.max(1, ceilingNet), 0),
      cost: {
        recovered: rupees(e.cost.recovered_paise),
        false_positive_bill: rupees(e.cost.spent_on_misses_paise),
        annoyance: rupees(e.cost.annoyance_paise),
        net: rupees(e.cost.net_paise),
        forgone: rupees(e.cost.forgone_paise),
      },
      baselines: e.baselines.map((baseline) => ({
        name: baseline.name,
        net: rupees(baseline.cost.net_paise),
        flagged: baseline.flagged,
        harmful_touches: baseline.harmful_touches,
        over_capacity: baseline.over_capacity,
        feasible: baseline.feasible,
        infeasible_because: baseline.infeasible_because ?? null,
        bound: baseline.bound ?? false,
        note: baseline.note,
      })),
      detector: {
        net: rupees(e.cost.net_paise),
        flagged: e.matrix.true_positive + e.matrix.false_positive,
        harmful_touches: e.forbidden.touched,
      },
    },

    sweep: {
      seeds: sweep.seeds.length,
      wins: sweep.wins,
      mean: {
        precision: pct(sweep.mean.precision),
        recall: pct(sweep.mean.recall),
        money_recall: pct(sweep.mean.money_recall),
        edge: signed(sweep.mean.edge),
        share_of_ceiling: pct(sweep.mean.share_of_ceiling, 0),
        calibration_error: pct(sweep.mean.calibration_error),
      },
      forbidden_touched: sweep.forbidden_touched,
      heuristic_forbidden_touched: sweep.heuristic_forbidden_touched,
      rows: sweep.rows.map((row) => ({
        seed: row.seed,
        precision: pct(row.precision),
        recall: pct(row.recall),
        money_recall: pct(row.money_recall),
        edge: signed(row.net_paise / Math.max(1, row.best_heuristic_paise) - 1),
        ceiling: pct(row.net_paise / Math.max(1, row.ceiling_paise), 0),
        forbidden_touched: row.forbidden_touched,
      })),
    },

    capacity,

    recover: {
      considered: recovery.outcome.records_considered,
      worked: recovery.outcome.records_worked,
      actions: recovery.outcome.actions_executed,
      blocked: recovery.outcome.actions_blocked,
      escalations: recovery.outcome.escalations,
      entries: trail.entries.length,
      trail_mode: trail.mode,
      at_risk: rupees(recovery.outcome.at_risk_paise),
      recovered: rupees(recovery.outcome.recovered_paise),
      anyway: rupees(recovery.outcome.recovered_paise - recovery.outcome.attributable_paise),
      attributable: rupees(recovery.outcome.attributable_paise),
      spent: rupees(recovery.outcome.spent_paise),
      net: rupees(recovery.outcome.net_paise),
      counterfactual: rupees(recovery.outcome.counterfactual_paise),
      blocked_by: Object.entries(recovery.outcome.blocked_by)
        .sort((a, b) => b[1] - a[1])
        .map(([rule, count]) => ({ rule, count })),
    },

    reconcile: {
      captures: reconciliation.counts.ledger,
      settlements: reconciliation.counts.settlements,
      bank: reconciliation.counts.bank,
      match_rate: pct(reconciliation.match_rate),
      value_match_rate: pct(reconciliation.value_match_rate),
      matched_value: rupees(reconciliation.matched_value_paise),
      ledger_value: rupees(reconciliation.ledger_value_paise),
      correct: reconciliation.accuracy?.correct ?? 0,
      checked: reconciliation.accuracy?.checked ?? 0,
      deductions: rupees(reconciliation.deductions_paise),
      tiers: Object.entries(reconciliation.by_tier).map(([tier, count]) => ({ tier, count })),
      exceptions: reconciliation.exceptions.length,
      exception_value: rupees(reconciliation.exception_value_paise),
      exception_kinds: [...new Set(reconciliation.exceptions.map((item) => item.kind))].map((kind) => {
        const items = reconciliation.exceptions.filter((item) => item.kind === kind);
        return {
          kind: kind.replace(/_/g, ' '),
          count: items.length,
          value: rupees(items.reduce((sum, item) => sum + Math.abs(item.amount_paise), 0)),
          next_step: items[0]?.next_step ?? '',
        };
      }),
    },
  };

  const target = resolve(process.argv[2] ?? join(root, 'scripts', 'artifact', 'metrics.json'));
  writeFileSync(target, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
  process.stdout.write(`Collected from a live run into ${target}\n`);
  process.stdout.write(
    `  batch ${metrics.batch.records} records · sweep ${metrics.sweep.seeds} seeds · ` +
      `${metrics.reconcile.captures} captures reconciled\n`,
  );
} finally {
  rmSync(stage, { recursive: true, force: true });
}
