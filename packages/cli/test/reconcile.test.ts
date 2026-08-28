/**
 * Reconciliation, and the ways a match rate can lie.
 *
 * A matcher is easy to make look good: pair things off loosely and the
 * percentage climbs. So the tests here care about two things a headline number
 * hides — whether the pairings are *correct* against the mapping the books were
 * generated from, and whether the defects that were deliberately injected are
 * actually the ones that end up in the exception list.
 *
 * The last group is arithmetic. Money is integer paise everywhere, and a
 * reconciler that needs a rupee of slack for floating point cannot detect a
 * rupee of theft.
 */

import { describe, expect, it } from 'vitest';

import { generateBooks } from '../src/revenue/ledger.js';
import { reconcile } from '../src/revenue/reconcile.js';

const books = (seed = 'books-test', orders = 220) => generateBooks({ seed, orders });

describe('the books', () => {
  it('generate the same three files for the same seed', () => {
    const a = books();
    const b = books();
    expect(a.settlements).toEqual(b.settlements);
    expect(a.bank).toEqual(b.bank);
  });

  it('keep every figure in integer paise', () => {
    const set = books();
    for (const line of set.settlements) {
      expect(Number.isInteger(line.gross_paise)).toBe(true);
      expect(Number.isInteger(line.net_paise)).toBe(true);
      // The identity a gateway statement has to satisfy, on every line.
      expect(line.net_paise).toBe(line.gross_paise - line.fee_paise - line.tax_paise - line.tds_paise);
    }
  });

  it('net each bank credit to the settlement lines behind it', () => {
    // The property the whole grouped tier depends on. It was false at first:
    // refunds drew their settlement date and their payout date separately, so
    // every payout in the file disagreed with the statement by a refund.
    const set = books();
    const byUtr = new Map(set.settlements.map((line) => [line.utr, line]));

    for (const [lineId, utrs] of Object.entries(set.links.paid_by)) {
      const line = set.bank.find((entry) => entry.line_id === lineId);
      if (!line) continue;
      const expected = utrs.reduce((sum, utr) => sum + (byUtr.get(utr)?.net_paise ?? 0), 0);
      expect(line.credit_paise - line.debit_paise, lineId).toBe(expected);
    }
  });

  it('inject captures the gateway never settled', () => {
    const set = books();
    expect(set.links.never_settled.length).toBeGreaterThan(0);
    for (const orderId of set.links.never_settled) {
      expect(set.settlements.some((line) => line.order_ref === orderId)).toBe(false);
    }
  });

  it('meet the fifty-record bar several times over', () => {
    expect(books().ledger.length).toBeGreaterThanOrEqual(50);
  });
});

describe('reconciling them', () => {
  const set = books();
  const result = reconcile(set.ledger, set.settlements, set.bank, set.links);

  it('matches nearly all of the captures', () => {
    expect(result.match_rate).toBeGreaterThan(0.9);
    expect(result.value_match_rate).toBeGreaterThan(0.9);
  });

  it('gets every pairing it claims right', () => {
    // The number that matters more than the match rate. A wrong pairing is
    // worse than an unmatched line: one is a question, the other is an answer
    // nobody will check again.
    expect(result.accuracy?.checked).toBeGreaterThan(100);
    expect(result.accuracy?.wrong).toEqual([]);
  });

  it('separates what it is certain of from what it is guessing', () => {
    const probable = result.matches.filter((match) => match.confidence === 'probable');
    expect(probable.length).toBeGreaterThan(0);
    // Every fuzzy match is a suggestion, never a closed line.
    for (const match of result.matches.filter((m) => m.tier === 'fuzzy')) {
      expect(match.confidence).toBe('probable');
    }
  });

  it('explains the gap rather than tolerating it', () => {
    const feeAware = result.matches.filter((match) => match.tier === 'fee-aware');
    expect(feeAware.length).toBeGreaterThan(0);
    for (const match of feeAware.slice(0, 5)) {
      expect(match.explains).toMatch(/commission|TDS|tax/);
    }
  });

  it('finds a daily payout as the sum of that day\'s settlement lines', () => {
    expect(result.by_tier.grouped).toBeGreaterThan(0);
  });

  it('reports every capture the gateway never settled', () => {
    const reported = result.exceptions
      .filter((exception) => exception.kind === 'never_settled')
      .map((exception) => exception.reference)
      .sort();

    expect(reported).toEqual([...set.links.never_settled].sort());
  });

  it('spots a bank line posted twice instead of reconciling it twice', () => {
    const duplicated = books('dup-seed', 400);
    const run = reconcile(duplicated.ledger, duplicated.settlements, duplicated.bank, duplicated.links);
    const reported = run.exceptions
      .filter((exception) => exception.kind === 'duplicate_bank_line')
      .map((exception) => exception.reference);

    expect(duplicated.links.duplicates.length).toBeGreaterThan(0);
    for (const id of duplicated.links.duplicates) expect(reported).toContain(id);
  });

  it('gives every exception a next step, not just a label', () => {
    for (const exception of result.exceptions) {
      expect(exception.next_step.length).toBeGreaterThan(10);
      expect(exception.detail.length).toBeGreaterThan(10);
    }
  });

  it('accounts for the deductions rather than writing them off', () => {
    const set2 = books();
    const run = reconcile(set2.ledger, set2.settlements, set2.bank);
    expect(run.deductions_paise).toBeGreaterThan(0);

    // Everything matched, plus everything excepted, plus what was deducted,
    // should be the ledger — no money may vanish between the three files.
    const unmatchedValue = run.exceptions
      .filter((exception) => exception.kind === 'never_settled' || exception.kind === 'amount_mismatch')
      .reduce((sum, exception) => sum + Math.abs(exception.amount_paise), 0);

    expect(run.matched_value_paise + unmatchedValue).toBe(run.ledger_value_paise);
  });

  it('says nothing about accuracy when there is no answer key', () => {
    // Real books have no links file, and a report that invented an accuracy
    // figure for them would be inventing the one number nobody could check.
    const run = reconcile(set.ledger, set.settlements, set.bank);
    expect(run.accuracy).toBeUndefined();
  });

  it('never claims a match it cannot name the lines for', () => {
    for (const match of result.matches) {
      expect(match.utrs.length).toBeGreaterThan(0);
      expect(match.explains.length).toBeGreaterThan(10);
    }
  });

  it('never pairs one settlement line with two captures', () => {
    // Double-counting is how a reconciliation reports 100% and hides a hole.
    const claimed = result.matches.filter((match) => match.order_id).flatMap((match) => match.utrs);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});

describe('across several sets of books', () => {
  it('keeps the pairings correct every time', () => {
    for (const seed of ['one', 'two', 'three', 'four']) {
      const set = books(seed, 160);
      const run = reconcile(set.ledger, set.settlements, set.bank, set.links);
      expect(run.accuracy?.wrong, `seed ${seed}`).toEqual([]);
      expect(run.match_rate, `seed ${seed}`).toBeGreaterThan(0.85);
    }
  });
});
