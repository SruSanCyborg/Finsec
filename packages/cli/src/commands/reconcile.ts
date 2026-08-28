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
import { note, padVisible, plural, truncate, visibleWidth } from '../ui/kit.js';

interface ReconcileFlags {
  gen?: boolean;
  seed?: string;
  orders?: number;
  limit?: number;
  json?: boolean;
  exceptions?: boolean;
  force?: boolean;
}

interface GlobalFlags {
  color?: boolean;
}

const FILES = {
  ledger: 'ledger.jsonl',
  settlements: 'settlements.jsonl',
  bank: 'bank.jsonl',
  links: 'links.json',
  seed: 'seed.txt',
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

  // Paced in blocks, not lines: a reconciliation reads as a report — the tier
  // table is one thought and each exception group is another. Pausing inside
  // one of them would just look like stutter. Off for a pipe and for --json,
  // where the whole point is arriving as fast as it is produced.
  const { writePaced } = await import('../engine/pace.js');
  const interactive = process.env.SIRIUS_STREAM_PLAIN === '1' || Boolean(process.stdout.isTTY);
  const raw = process.env.SIRIUS_REVENUE_PACE;
  const configured = raw === undefined ? undefined : Number(raw);
  const pace =
    configured !== undefined && Number.isFinite(configured) && configured >= 0
      ? configured * 3
      : interactive
        ? 260
        : 0;

  await writePaced(render(result, palette, flags, dir).split('\n'), pace);

  // Unresolved exceptions are findings, not failures: exit 1 so a nightly close
  // can gate on "nothing unexplained" without parsing the output.
  if (result.exceptions.length > 0) process.exitCode = 1;
}

function generate(dir: string, flags: ReconcileFlags): void {
  const seed = flags.seed ?? 'sirius-books';
  const orders = flags.orders ?? 220;
  const stamp = `${seed}:${orders}`;

  // The same rule `revenue gen` follows. A set of books is the evidence for a
  // match rate reported against it, and `links.json` is the only thing that can
  // say a matcher was *correct* rather than merely confident. Rewriting the
  // same seed is byte-identical and allowed; changing it is refused.
  const seedPath = join(dir, FILES.seed);
  if (existsSync(join(dir, FILES.links)) && !flags.force) {
    const previous = existsSync(seedPath) ? readFileSync(seedPath, 'utf8').trim() : undefined;

    if (previous !== stamp) {
      throw new CliError(`${dir} already holds a different set of books.`, {
        hint:
          `${previous ? `They came from seed "${previous.split(':')[0]}".` : 'Their seed was not recorded.'} ` +
          'links.json is the only thing that can say whether a match was correct.\n' +
          `  Write these somewhere else:  sirius reconcile <other-dir> --gen --seed ${seed}\n` +
          '  Or replace them on purpose:  --force',
      });
    }
  }

  const books = generateBooks({ seed, orders });

  mkdirSync(dir, { recursive: true });
  // Recorded so a later `--gen` can tell an identical regeneration from a
  // destructive one. The generated files carry no seed of their own.
  writeFileSync(seedPath, `${stamp}\n`, 'utf8');
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
    ` ${palette.bold('RECONCILIATION')}${palette.dim(
      truncate(
        `   ${result.counts.ledger} captures · ${result.counts.settlements} settlement lines · ` +
          `${result.counts.bank} bank lines`,
        Math.max(0, palette.width - 16),
      ),
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');

  // The bar was a fixed twenty-six columns with a sentence after it, which put
  // the accuracy row at 106 — the number a reader came for, and then the
  // explanation of it, past the edge of the terminal.
  const barWidth = Math.max(10, Math.min(26, palette.width - 54));
  const metric = (label: string, value: number, paint: (t: string) => string, gloss: string): string => {
    const head = `  ${padVisible(label, 16)}${palette.bold(padVisible(pct(value), 7, 'right'))}  ${paint(
      palette.bar(value, barWidth),
    )}  `;
    return head + palette.dim(truncate(gloss, Math.max(0, palette.width - visibleWidth(head))));
  };

  lines.push(
    metric(
      'matched',
      result.match_rate,
      palette.violet,
      `${result.matches.filter((m) => m.order_id).length} of ${result.counts.ledger} captures`,
    ),
  );
  lines.push(
    metric(
      'matched (₹)',
      result.value_match_rate,
      palette.blue,
      `${palette.rupee(result.matched_value_paise)} of ${palette.rupee(result.ledger_value_paise)}`,
    ),
  );

  if (result.accuracy && result.accuracy.checked > 0) {
    const accuracy = result.accuracy.correct / result.accuracy.checked;
    lines.push(
      metric(
        'correct',
        accuracy,
        palette.green,
        `${result.accuracy.correct} of ${result.accuracy.checked} pairings verified against the true links`,
      ),
    );
  } else {
    lines.push(`  ${palette.dim('correct'.padEnd(16))}${palette.dim('     — no answer key: these are real books')}`);
  }
  lines.push('');

  lines.push(`  ${palette.bold('HOW IT MATCHED')}`);
  for (const [tier, count] of Object.entries(result.by_tier) as [Tier, number][]) {
    if (count === 0) continue;
    const paint = tier === 'fuzzy' ? palette.amber : palette.dim;
    lines.push(
      `    ${paint(padVisible(String(count), 5, 'right'))}  ${palette.bold(padVisible(tier, 12))}` +
        palette.dim(truncate(TIER_NOTE[tier], Math.max(0, palette.width - 23))),
    );
  }
  lines.push('');
  lines.push(
    ...note(
      `deducted along the way ${palette.rupee(result.deductions_paise)} in commission, tax and TDS — ` +
        `missing on purpose, and accounted for`,
      { indent: 2, width: palette.width },
    ).map((line) => palette.dim(line)),
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
        `${palette.dim(plural(items.length, 'line'))} · ${palette.bold(palette.rupee(value))}`,
    );
    // The next step is a full sentence and belongs wrapped, not spilling past
    // the terminal — it is the part of an exception a person actually acts on.
    for (const line of note(items[0]?.next_step ?? '', { indent: 6, width: palette.width })) {
      lines.push(palette.dim(line));
    }

    for (const item of items.slice(0, flags.exceptions ? items.length : limit)) {
      const head = `        ${padVisible(item.reference, 14)}${padVisible(
        palette.rupee(Math.abs(item.amount_paise)),
        13,
        'right',
      )}  `;
      lines.push(head + palette.dim(truncate(item.detail, Math.max(0, palette.width - visibleWidth(head)))));
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
