/**
 * `sirius explain <rule>` — where a rupee figure comes from.
 *
 * Exists because "how did you get ₹42,00,000?" is the first question anyone
 * sensible asks, and "it's a heuristic" is not an answer. Every number the
 * scanner prints can be traced to a stated assumption and a public anchor, and
 * this is the command that shows it.
 */

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
      process.stdout.write(`     ${paint(entry.anchor, DIM)}\n`);
    }
    process.stdout.write(
      `\n  ${paint('sirius explain SIR-SEC-001', BOLD)}${paint('  for one rule in full', DIM)}\n\n`,
    );
    return;
  }

  const id = ruleId.toUpperCase();
  if (!EXPOSURE_MODEL[id]) {
    throw new CliError(`No exposure model for "${ruleId}".`, {
      hint: `Known rules: ${Object.keys(EXPOSURE_MODEL).slice(0, 5).join(', ')}…  Run \`sirius explain\` for all.`,
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
  for (const raw of explain(input).slice(2)) {
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
