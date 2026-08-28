/**
 * `sirius explain <rule>` — where a rupee figure comes from.
 *
 * Exists because "how did you get ₹42,00,000?" is the first question anyone
 * sensible asks, and "it's a heuristic" is not an answer. Every number the
 * scanner prints can be traced to a stated assumption and a public anchor, and
 * this is the command that shows it.
 */

import { wrapText } from '../wrap.js';
import { CliError } from '../api/errors.js';
import { EXPOSURE_MODEL, estimateExposure, explain } from '../engine/exposure-model.js';
import { detectCapabilities } from '../ui/theme.js';
import type { Severity } from '../domain.js';

interface ExplainFlags {
  live?: boolean;
  json?: boolean;
}

const DIM = '\u001b[38;5;244m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

export async function runExplain(
  ruleId: string | undefined,
  flags: ExplainFlags,
  globals: { color?: boolean },
): Promise<void> {
  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const color = capabilities.color;
  const paint = (text: string, style: string) => (color ? `${style}${text}${RESET}` : text);

  // No argument: show the whole model, which is the honest default for a
  // command whose job is disclosure.
  if (!ruleId) {
    if (flags.json) {
      process.stdout.write(JSON.stringify(EXPOSURE_MODEL, null, 2) + '\n');
      return;
    }

    process.stdout.write(`\n${paint('Money-at-risk model', BOLD)}\n\n`);
    process.stdout.write(
      paint(
        '  exposure = base × reachability × persistence\n\n' +
          '  Order-of-magnitude estimates for prioritisation, anchored to public\n' +
          '  figures. Not actuarial, and not a prediction of loss.\n\n',
        DIM,
      ),
    );

    for (const [id, entry] of Object.entries(EXPOSURE_MODEL)) {
      process.stdout.write(`  ${paint(id, BOLD)}  ${paint(formatInr(entry.amount), DIM)}\n`);
      for (const chunk of wrapText(entry.anchor, Math.max(24, capabilities.width - 7))) {
        process.stdout.write(`     ${paint(chunk, DIM)}\n`);
      }
    }
    process.stdout.write(
      `\n  ${paint('sirius explain SIR-SEC-001', BOLD)}${paint('  for one rule in full', DIM)}\n\n`,
    );
    return;
  }

  // The other number on the footer. `Compliance 60/100` sat beside a rupee
  // figure that could be traced to a public anchor, and was itself the one
  // headline with no derivation anywhere — `explain score` answered "No
  // exposure model for \"score\"". It is the first thing a compliance officer
  // asks about, and the formula was explainable the whole time; it just was not
  // reachable from the command whose entire job is disclosure.
  if (ruleId.toLowerCase() === 'score') {
    await explainScore(paint, capabilities.width, Boolean(flags.json));
    return;
  }

  const id = ruleId.toUpperCase();
  if (!EXPOSURE_MODEL[id]) {
    throw new CliError(`No exposure model for "${ruleId}".`, {
      hint:
        `Known rules: ${Object.keys(EXPOSURE_MODEL).slice(0, 5).join(', ')}…  Run \`sirius explain\` for all.\n` +
        `  For the compliance score, \`sirius explain score\`.`,
    });
  }

  const severity: Severity = id === 'SIR-SEC-001' || id === 'SIR-SEC-010' ? 'critical' : 'high';
  const input = { ruleId: id, severity, ...(flags.live ? { verifiedLive: true } : {}) };
  const result = estimateExposure(input);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ruleId: id, ...result }, null, 2) + '\n');
    return;
  }

  process.stdout.write('\n');
  process.stdout.write(`  ${paint(id, BOLD)}   ${paint(formatInr(result.amount), BOLD)}\n\n`);
  for (const raw of explain(input, capabilities.width).slice(2)) {
    process.stdout.write(color ? `${DIM}${raw}${RESET}\n` : `${raw}\n`);
  }
  process.stdout.write('\n');

  if (!flags.live) {
    process.stdout.write(
      paint(`  --live shows the same rule with the credential confirmed active.\n\n`, DIM),
    );
  }
}

function formatInr(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
}

/**
 * Where `Compliance 60/100` comes from.
 *
 * The weighting is one of the questions logged as blocking on `auto`, and this
 * is the local engine's answer rather than the contract's — so it says which it
 * is. A number a compliance officer will be asked to defend cannot arrive
 * without a derivation, and "the API owns that formula" is not one when the API
 * is not what produced the figure on screen.
 */
async function explainScore(
  paint: (text: string, style: string) => string,
  width: number,
  json: boolean,
): Promise<void> {
  const WEIGHTS: Record<string, number> = { critical: 12, high: 6, medium: 2, low: 0.5, info: 0 };

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          formula: 'max(0, 100 - (sum(weight[severity] * count) / max(1, log10(max(10, files)))))',
          weights: WEIGHTS,
          rounding: 'one decimal place',
          authority: 'local engine — the Core API contract leaves this undefined',
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  process.stdout.write(`\n${paint('Compliance score', '\u001b[1m')}\n\n`);
  process.stdout.write(
    paint('  score = 100 − (penalty ÷ scale)\n\n', '\u001b[38;5;244m'),
  );

  process.stdout.write(`  ${paint('penalty', '\u001b[1m')}  every finding costs points by severity:\n`);
  for (const [severity, weight] of Object.entries(WEIGHTS)) {
    process.stdout.write(paint(`             ${severity.padEnd(9)} ${String(weight).padStart(4)}\n`, '\u001b[38;5;244m'));
  }

  process.stdout.write(`\n  ${paint('scale', '\u001b[1m')}    max(1, log10(max(10, files scanned)))\n`);
  for (const chunk of wrapText(
    'So a large codebase is not punished for the same absolute number of findings as a tiny one. ' +
      'Ten files and ten thousand are not the same denominator.',
    Math.max(24, width - 13),
  )) {
    process.stdout.write(paint(`           ${chunk}\n`, '\u001b[38;5;244m'));
  }

  // A worked example beats a formula, and the numbers are the ones on screen.
  const { locateLastScan } = await import('../session.js');
  const found = locateLastScan(process.cwd());
  if (found) {
    const counts: Record<string, number> = {};
    for (const finding of found.cache.findings ?? []) {
      counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    }
    const files = found.cache.summary?.files_scanned ?? 0;
    const penalty = Object.entries(counts).reduce((sum, [s, n]) => sum + (WEIGHTS[s] ?? 0) * n, 0);
    const scale = Math.max(1, Math.log10(Math.max(10, files)));

    process.stdout.write(`\n  ${paint('your last scan', '\u001b[1m')}\n`);
    const terms = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${n}×${WEIGHTS[s] ?? 0}`)
      .join(' + ');
    process.stdout.write(
      paint(
        `           penalty ${terms || '0'} = ${penalty}\n` +
          `           scale   log10(max(10, ${files})) = ${scale.toFixed(2)}\n` +
          `           score   100 − ${penalty} ÷ ${scale.toFixed(2)} = ` +
          `${Math.max(0, Math.round((100 - penalty / scale) * 10) / 10)}\n`,
        '\u001b[38;5;244m',
      ),
    );
  }

  process.stdout.write(
    `\n${paint(
      '  This is the local engine\u2019s formula, not the Core API contract\u2019s — the\n' +
        '  contract leaves the weighting undefined. Two scans are comparable to each\n' +
        '  other, not to a score from another tool.\n\n',
      '\u001b[38;5;244m',
    )}`,
  );
}
