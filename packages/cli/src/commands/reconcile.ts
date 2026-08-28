/**
 * `sirius reconcile` — close the loop between the ledger, the gateway and the bank.
 *
 * The output is arranged around a claim that is easy to make badly. A match
 * rate is trivially inflated by matching things loosely, so three numbers are
 * printed together and none of them alone: how much was matched, at what tier
 * of confidence, and — where the true links are known — how much of it was
 * matched *correctly*. Under them sits the exception list, which is the actual
 * deliverable: the file is closed when somebody knows what every unmatched line
 * is, not when the percentage is high enough.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CliError } from '../api/errors.js';
import { paletteFor } from '../render/revenue.js';
import { generateBooks } from '../revenue/ledger.js';
import type { BankLine, LedgerEntry, LedgerLinks, SettlementLine } from '../revenue/ledger.js';
import { reconcile } from '../revenue/reconcile.js';
import type { Exception, ReconcileResult, Tier } from '../revenue/reconcile.js';
import { detectCapabilities } from '../ui/theme.js';

interface ReconcileFlags {
  gen?: boolean;
  seed?: string;
  orders?: number;
  limit?: number;
  json?: boolean;
  exceptions?: boolean;
}

interface GlobalFlags {
  color?: boolean;
}

const FILES = {
  ledger: 'ledger.jsonl',
  settlements: 'settlements.jsonl',
  bank: 'bank.jsonl',
  links: 'links.json',
} as const;

export async function runReconcile(
  target: string | undefined,
  flags: ReconcileFlags,
  globals: GlobalFlags,
): Promise<void> {
  const dir = resolve(process.cwd(), target ?? 'books');

  if (flags.gen) return generate(dir, flags);
  if (!existsSync(join(dir, FILES.ledger))) {
    throw new CliError(`No books at ${dir}.`, {
      hint: 'Generate a set:  sirius reconcile books --gen',
    });
  }

  const ledger = readLines<LedgerEntry>(join(dir, FILES.ledger));
  const settlements = readLines<SettlementLine>(join(dir, FILES.settlements));
  const bank = readLines<BankLine>(join(dir, FILES.bank));

  // The links are the answer key. Present in a generated set, absent from real
  // books — and the report says which case it is rather than quietly dropping
  // the accuracy line.
  const linksPath = join(dir, FILES.links);
  const links = existsSync(linksPath) ? (JSON.parse(readFileSync(linksPath, 'utf8')) as LedgerLinks) : undefined;

  const result = reconcile(ledger, settlements, bank, links);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ schema: 'sirius.reconcile/v1', ...result }, null, 2) + '\n');
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const palette = paletteFor({
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: capabilities.width,
  });

  process.stdout.write(render(result, palette, flags, dir));
  // Unresolved exceptions are findings, not failures: exit 1 so a nightly close
  // can gate on "nothing unexplained" without parsing the output.
  if (result.exceptions.length > 0) process.exitCode = 1;
}

function generate(dir: string, flags: ReconcileFlags): void {
  const seed = flags.seed ?? 'sirius-books';
  const books = generateBooks({ seed, orders: flags.orders ?? 220 });

  mkdirSync(dir, { recursive: true });
  writeLines(join(dir, FILES.ledger), books.ledger);
  writeLines(join(dir, FILES.settlements), books.settlements);
  writeLines(join(dir, FILES.bank), books.bank);
  writeFileSync(join(dir, FILES.links), JSON.stringify(books.links, null, 2) + '\n', 'utf8');

  process.stdout.write(`Wrote three sets of books to ${dir}\n`);
  process.stdout.write(`  ${FILES.ledger.padEnd(20)}${books.ledger.length} captures\n`);
  process.stdout.write(`  ${FILES.settlements.padEnd(20)}${books.settlements.length} settlement lines\n`);
  process.stdout.write(`  ${FILES.bank.padEnd(20)}${books.bank.length} bank lines\n`);
  process.stdout.write(`  ${FILES.links.padEnd(20)}the true mapping, so the matcher can be scored\n\n`);
  process.stdout.write(
    `Injected: ${books.links.never_settled.length} captures the gateway never settled · ` +
      `${books.links.duplicates.length} duplicate bank postings\n`,
  );
  process.stdout.write(`\nSeed "${seed}". Next:  sirius reconcile ${dir.split('/').pop()}\n`);
}

// ---- rendering --------------------------------------------------------------

const TIER_NOTE: Record<Tier, string> = {
  exact: 'reference and amount agree, nothing deducted',
  'fee-aware': 'the gap is commission, tax and TDS — computed, not tolerated',
  split: 'one capture paid out in parts',
  grouped: 'a day of settlement lines netting to one bank credit',
  fuzzy: 'no reference; amount and window agree — for review, not for closing',
};

const EXCEPTION_ORDER: Exception['kind'][] = [
  'never_settled',
  'amount_mismatch',
  'unmatched_bank_line',
  'duplicate_bank_line',
  'unmatched_settlement',
];

function render(
  result: ReconcileResult,
  palette: ReturnType<typeof paletteFor>,
  flags: ReconcileFlags,
  dir: string,
): string {
  const lines: string[] = [];
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  lines.push('');
  lines.push(palette.hr);
  lines.push(
    ` ${palette.bold('RECONCILIATION')}   ${palette.dim(
      `${result.counts.ledger} captures · ${result.counts.settlements} settlement lines · ` +
        `${result.counts.bank} bank lines · ${dir}`,
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');

  lines.push(
    `  ${'matched'.padEnd(16)}${palette.bold(pct(result.match_rate).padStart(7))}  ${palette.violet(
      palette.bar(result.match_rate, 26),
    )}  ${palette.dim(`${result.matches.filter((m) => m.order_id).length} of ${result.counts.ledger} captures`)}`,
  );
  lines.push(
    `  ${'matched (₹)'.padEnd(16)}${palette.bold(pct(result.value_match_rate).padStart(7))}  ${palette.blue(
      palette.bar(result.value_match_rate, 26),
    )}  ${palette.dim(`${palette.rupee(result.matched_value_paise)} of ${palette.rupee(result.ledger_value_paise)}`)}`,
  );

  if (result.accuracy && result.accuracy.checked > 0) {
    const accuracy = result.accuracy.correct / result.accuracy.checked;
    lines.push(
      `  ${'correct'.padEnd(16)}${palette.bold(pct(accuracy).padStart(7))}  ${palette.green(
        palette.bar(accuracy, 26),
      )}  ${palette.dim(`${result.accuracy.correct} of ${result.accuracy.checked} pairings verified against the true links`)}`,
    );
  } else {
    lines.push(`  ${palette.dim('correct'.padEnd(16))}${palette.dim('     — no answer key: these are real books')}`);
  }
  lines.push('');

  lines.push(`  ${palette.bold('HOW IT MATCHED')}`);
  for (const [tier, count] of Object.entries(result.by_tier) as [Tier, number][]) {
    if (count === 0) continue;
    const paint = tier === 'fuzzy' ? palette.amber : palette.dim;
    lines.push(`    ${paint(String(count).padStart(5))}  ${palette.bold(tier.padEnd(12))}${palette.dim(TIER_NOTE[tier])}`);
  }
  lines.push('');
  lines.push(
    `  ${palette.dim('deducted along the way')} ${palette.bold(palette.rupee(result.deductions_paise))} ${palette.dim(
      'in commission, tax and TDS — missing on purpose, and accounted for',
    )}`,
  );
  lines.push('');

  // ---- the exceptions, which are the point
  const grouped = new Map<Exception['kind'], Exception[]>();
  for (const exception of result.exceptions) {
    const bucket = grouped.get(exception.kind) ?? [];
    bucket.push(exception);
    grouped.set(exception.kind, bucket);
  }

  lines.push(palette.hr);
  lines.push(
    ` ${palette.bold('EXCEPTIONS')}   ${palette.dim(
      `${result.exceptions.length} lines this run could not close, worth ${palette.rupee(
        result.exception_value_paise,
      )}`,
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');

  const limit = flags.limit ?? 4;
  for (const kind of EXCEPTION_ORDER) {
    const items = grouped.get(kind);
    if (!items || items.length === 0) continue;

    const value = items.reduce((sum, item) => sum + Math.abs(item.amount_paise), 0);
    lines.push(
      `  ${palette.amber(palette.glyph('warn'))} ${palette.bold(kind.replace(/_/g, ' '))}  ` +
        `${palette.dim(`${items.length} line(s)`)} · ${palette.bold(palette.rupee(value))}`,
    );
    lines.push(`      ${palette.dim(items[0]?.next_step ?? '')}`);

    for (const item of items.slice(0, flags.exceptions ? items.length : limit)) {
      lines.push(
        `        ${item.reference.padEnd(14)}${palette.rupee(Math.abs(item.amount_paise)).padStart(13)}  ${palette.dim(
          item.detail,
        )}`,
      );
    }
    if (!flags.exceptions && items.length > limit) {
      lines.push(palette.dim(`        … ${items.length - limit} more (--exceptions for all of them)`));
    }
    lines.push('');
  }

  if (result.exceptions.length === 0) {
    lines.push(`  ${palette.green(palette.glyph('check'))} nothing unexplained.\n`);
  }

  if (result.accuracy && result.accuracy.wrong.length > 0) {
    lines.push(
      palette.dim(
        `  Wrongly paired: ${result.accuracy.wrong.slice(0, 6).join(', ')}` +
          `${result.accuracy.wrong.length > 6 ? `, +${result.accuracy.wrong.length - 6} more` : ''}.\n` +
          `  Printed because a match rate that hides its own errors is worse than a lower one.\n`,
      ),
    );
  }

  return lines.join('\n');
}

function readLines<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function writeLines(path: string, rows: readonly unknown[]): void {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}
