/**
 * Matching three sets of books, in tiers, and admitting what did not match.
 *
 * The tiers run from certain to plausible, and each one is a different claim:
 *
 *   exact        the reference matches and so does the amount
 *   fee-aware    the reference matches and the gap is the fee, the tax on the
 *                fee, and TDS — computed, not tolerated
 *   split        two settlement lines sum to one order
 *   grouped      many settlement lines sum to one bank credit, which is what a
 *                daily payout actually is
 *   fuzzy        no reference, but one unmatched line of the same amount
 *                landed inside the settlement window
 *
 * A matcher that reports one number hides the difference between these. An
 * exact match is a fact; a fuzzy one is a suggestion for a human, and the
 * output keeps them apart rather than averaging them into a percentage.
 *
 * Everything unmatched is an exception with a reason and a next step. The
 * exception list is the deliverable — a run that matched 96% and could not say
 * what the other 4% was has not closed the loop, it has narrowed it.
 */

import type { BankLine, LedgerEntry, LedgerLinks, SettlementLine } from './ledger.js';

export type Tier = 'exact' | 'fee-aware' | 'split' | 'grouped' | 'fuzzy';

export interface Match {
  tier: Tier;
  /** What the matcher is willing to claim: certain, or for review. */
  confidence: 'certain' | 'probable';
  order_id?: string;
  utrs: string[];
  bank_line_id?: string;
  amount_paise: number;
  /** The arithmetic, spelled out, so a reviewer can check it in their head. */
  explains: string;
}

export type ExceptionKind =
  | 'never_settled'
  | 'unmatched_settlement'
  | 'unmatched_bank_line'
  | 'duplicate_bank_line'
  | 'amount_mismatch';

export interface Exception {
  kind: ExceptionKind;
  reference: string;
  amount_paise: number;
  /** What is wrong, in one sentence. */
  detail: string;
  /** What a human should do about it. */
  next_step: string;
}

export interface ReconcileResult {
  /** Orders, settlement lines and bank lines seen. */
  counts: { ledger: number; settlements: number; bank: number };
  matches: Match[];
  exceptions: Exception[];
  by_tier: Record<Tier, number>;
  /** Orders matched to at least one settlement line, over all orders. */
  match_rate: number;
  /** The same, weighted by money. */
  value_match_rate: number;
  matched_value_paise: number;
  ledger_value_paise: number;
  /** Fees, tax and TDS accounted for — the money that is missing on purpose. */
  deductions_paise: number;
  exception_value_paise: number;
  /** Filled in when the true links are available: was the matcher right? */
  accuracy?: { checked: number; correct: number; wrong: string[] };
}

const WINDOW_DAYS = 5;

export function reconcile(
  ledger: readonly LedgerEntry[],
  settlements: readonly SettlementLine[],
  bank: readonly BankLine[],
  links?: LedgerLinks,
): ReconcileResult {
  const matches: Match[] = [];
  const exceptions: Exception[] = [];

  const payments = settlements.filter((line) => line.type === 'payment');
  const usedSettlements = new Set<string>();
  const byRef = new Map<string, SettlementLine[]>();
  for (const line of payments) {
    if (!line.order_ref) continue;
    const bucket = byRef.get(line.order_ref);
    if (bucket) bucket.push(line);
    else byRef.set(line.order_ref, [line]);
  }

  // ---- pass one: ledger against settlement
  for (const entry of ledger) {
    const candidates = byRef.get(entry.order_id) ?? [];

    if (candidates.length === 1) {
      const line = candidates[0] as SettlementLine;
      usedSettlements.add(line.utr);

      if (line.gross_paise === entry.amount_paise && line.net_paise === entry.amount_paise) {
        matches.push({
          tier: 'exact',
          confidence: 'certain',
          order_id: entry.order_id,
          utrs: [line.utr],
          amount_paise: entry.amount_paise,
          explains: 'reference and amount both match, nothing deducted',
        });
      } else if (line.gross_paise === entry.amount_paise) {
        matches.push({
          tier: 'fee-aware',
          confidence: 'certain',
          order_id: entry.order_id,
          utrs: [line.utr],
          amount_paise: entry.amount_paise,
          explains: deductionSentence(line),
        });
      } else {
        // Short by exactly the amount of another unreferenced line, settled in
        // the same window: this is a split payout that lost the reference on
        // one leg, not a discrepancy. Reported as a mismatch at first, which
        // sent two perfectly good captures to a human every run.
        const missingLeg = findCompletingLine(
          payments,
          usedSettlements,
          entry.amount_paise - line.gross_paise,
          entry.captured_at,
        );

        if (missingLeg) {
          usedSettlements.add(missingLeg.utr);
          matches.push({
            tier: 'split',
            confidence: 'probable',
            order_id: entry.order_id,
            utrs: [line.utr, missingLeg.utr],
            amount_paise: entry.amount_paise,
            explains:
              `one leg references the order, the other carries no reference; ` +
              `${rupees(line.gross_paise)} + ${rupees(missingLeg.gross_paise)} is the capture exactly`,
          });
        } else {
          exceptions.push({
            kind: 'amount_mismatch',
            reference: entry.order_id,
            amount_paise: entry.amount_paise - line.gross_paise,
            detail: `ledger says ${rupees(entry.amount_paise)}, settlement says ${rupees(line.gross_paise)} gross`,
            next_step: 'raise with the gateway: a gross amount should never differ from the capture',
          });
        }
      }
      continue;
    }

    if (candidates.length > 1) {
      const gross = candidates.reduce((sum, line) => sum + line.gross_paise, 0);
      for (const line of candidates) usedSettlements.add(line.utr);

      if (gross === entry.amount_paise) {
        matches.push({
          tier: 'split',
          confidence: 'certain',
          order_id: entry.order_id,
          utrs: candidates.map((line) => line.utr),
          amount_paise: entry.amount_paise,
          explains: `paid out in ${candidates.length} parts across ${spanDays(candidates)} day(s), summing to the capture`,
        });
      } else {
        exceptions.push({
          kind: 'amount_mismatch',
          reference: entry.order_id,
          amount_paise: entry.amount_paise - gross,
          detail: `${candidates.length} settlement lines sum to ${rupees(gross)}, capture was ${rupees(entry.amount_paise)}`,
          next_step: 'check for a third part still in transit before escalating',
        });
      }
      continue;
    }

    // ---- no reference at all: look for an unclaimed line of the right size,
    // settled inside the window. Reported as probable, never as certain.
    const orphan = payments.find(
      (line) =>
        !line.order_ref &&
        !usedSettlements.has(line.utr) &&
        line.gross_paise === entry.amount_paise &&
        withinDays(entry.captured_at, line.settled_at, WINDOW_DAYS),
    );

    if (orphan) {
      usedSettlements.add(orphan.utr);
      matches.push({
        tier: 'fuzzy',
        confidence: 'probable',
        order_id: entry.order_id,
        utrs: [orphan.utr],
        amount_paise: entry.amount_paise,
        explains: `settlement line carries no order reference; amount and ${WINDOW_DAYS}-day window agree`,
      });
      continue;
    }

    exceptions.push({
      kind: 'never_settled',
      reference: entry.order_id,
      amount_paise: entry.amount_paise,
      detail: 'captured, but no settlement line anywhere in the file',
      next_step: 'the most expensive exception here: the gateway owes this money. Chase it with the capture id',
    });
  }

  // ---- pass two: settlement against bank
  const seenNarration = new Map<string, string>();
  const bankTotals = new Map<string, number>();
  for (const line of bank) {
    const net = line.credit_paise - line.debit_paise;
    bankTotals.set(line.line_id, net);

    const key = `${line.value_date}|${line.narration}|${net}`;
    const first = seenNarration.get(key);
    if (first) {
      exceptions.push({
        kind: 'duplicate_bank_line',
        reference: line.line_id,
        amount_paise: net,
        detail: `identical to ${first} — same date, narration and amount`,
        next_step: 'do not reconcile twice; ask the bank to reverse the duplicate posting',
      });
      continue;
    }
    seenNarration.set(key, line.line_id);
  }

  // A day's payout is the sum of that day's settlement nets. Grouping by the
  // settlement date is what turns eighty lines and one credit into one match.
  const netByDay = new Map<string, { total: number; utrs: string[] }>();
  for (const line of settlements) {
    const day = line.settled_at.slice(0, 10);
    const bucket = netByDay.get(day) ?? { total: 0, utrs: [] };
    bucket.total += line.net_paise;
    bucket.utrs.push(line.utr);
    netByDay.set(day, bucket);
  }

  for (const line of bank) {
    if (exceptions.some((e) => e.kind === 'duplicate_bank_line' && e.reference === line.line_id)) continue;
    const net = line.credit_paise - line.debit_paise;
    const day = netByDay.get(line.value_date);

    if (day && day.total === net) {
      matches.push({
        tier: 'grouped',
        confidence: 'certain',
        utrs: day.utrs,
        bank_line_id: line.line_id,
        amount_paise: net,
        explains: `${day.utrs.length} settlement lines on ${line.value_date} net to this credit exactly`,
      });
      continue;
    }

    exceptions.push({
      kind: 'unmatched_bank_line',
      reference: line.line_id,
      amount_paise: net,
      detail: day
        ? `credit is ${rupees(net)}, that day's settlement lines net to ${rupees(day.total)}`
        : 'no settlement lines share this value date',
      next_step: 'unexplained money in the account is as much a problem as missing money',
    });
  }

  const unmatchedSettlements = payments.filter((line) => !usedSettlements.has(line.utr));
  for (const line of unmatchedSettlements) {
    exceptions.push({
      kind: 'unmatched_settlement',
      reference: line.utr,
      amount_paise: line.gross_paise,
      detail: line.order_ref
        ? `references ${line.order_ref}, which is not in the ledger`
        : 'no order reference, and no unclaimed capture of this amount in the window',
      next_step: 'a settlement with no capture behind it: check for an order booked in another system',
    });
  }

  // ---- the numbers
  const ledgerValue = ledger.reduce((sum, entry) => sum + entry.amount_paise, 0);
  const orderMatches = matches.filter((match) => match.order_id);
  const matchedValue = orderMatches.reduce((sum, match) => sum + match.amount_paise, 0);

  const byTier: Record<Tier, number> = { exact: 0, 'fee-aware': 0, split: 0, grouped: 0, fuzzy: 0 };
  for (const match of matches) byTier[match.tier] += 1;

  const deductions = settlements
    .filter((line) => line.type === 'payment')
    .reduce((sum, line) => sum + line.fee_paise + line.tax_paise + line.tds_paise, 0);

  const result: ReconcileResult = {
    counts: { ledger: ledger.length, settlements: settlements.length, bank: bank.length },
    matches,
    exceptions,
    by_tier: byTier,
    match_rate: ledger.length === 0 ? 0 : round(orderMatches.length / ledger.length),
    value_match_rate: ledgerValue === 0 ? 0 : round(matchedValue / ledgerValue),
    matched_value_paise: matchedValue,
    ledger_value_paise: ledgerValue,
    deductions_paise: deductions,
    exception_value_paise: exceptions.reduce((sum, item) => sum + Math.abs(item.amount_paise), 0),
  };

  if (links) result.accuracy = scoreAgainst(matches, links);
  return result;
}

/**
 * Was the matcher right, not just confident?
 *
 * A match rate on its own rewards a matcher that pairs things off boldly. This
 * checks each claimed pairing against the mapping the books were generated
 * from — the difference between "we closed 96% of the file" and "we closed 96%
 * of the file correctly", which is the only version worth reporting.
 */
function scoreAgainst(matches: readonly Match[], links: LedgerLinks): NonNullable<ReconcileResult['accuracy']> {
  let checked = 0;
  let correct = 0;
  const wrong: string[] = [];

  for (const match of matches) {
    if (match.order_id) {
      const expected = links.settled_by[match.order_id];
      if (!expected) continue;
      checked += 1;
      const claimed = [...match.utrs].sort().join(',');
      if (claimed === [...expected].sort().join(',')) correct += 1;
      else wrong.push(`${match.order_id} (${match.tier})`);
      continue;
    }

    if (match.bank_line_id) {
      const expected = links.paid_by[match.bank_line_id];
      if (!expected) continue;
      checked += 1;
      // The grouped tier claims a set of UTRs; getting the set right is the
      // claim, and a superset that happens to sum correctly is still wrong.
      const claimed = new Set(match.utrs);
      const same = expected.length === claimed.size && expected.every((utr) => claimed.has(utr));
      if (same) correct += 1;
      else wrong.push(`${match.bank_line_id} (grouped)`);
    }
  }

  return { checked, correct, wrong };
}

/**
 * An unclaimed settlement line of exactly the missing amount, near enough in time.
 *
 * Exact on the paise, because these are integers and a split that is off by one
 * is not a split. The window is what keeps it from pairing with a coincidence
 * three weeks away.
 */
function findCompletingLine(
  payments: readonly SettlementLine[],
  used: ReadonlySet<string>,
  missing: number,
  capturedAt: string,
): SettlementLine | undefined {
  if (missing <= 0) return undefined;
  return payments.find(
    (line) =>
      !line.order_ref &&
      !used.has(line.utr) &&
      line.gross_paise === missing &&
      withinDays(capturedAt, line.settled_at, WINDOW_DAYS + 2),
  );
}

function deductionSentence(line: SettlementLine): string {
  const parts: string[] = [];
  if (line.fee_paise) parts.push(`${rupees(line.fee_paise)} commission`);
  if (line.tax_paise) parts.push(`${rupees(line.tax_paise)} tax on it`);
  if (line.tds_paise) parts.push(`${rupees(line.tds_paise)} TDS`);
  return parts.length === 0
    ? 'reference and amount match'
    : `gross matches; ${parts.join(' + ')} deducted, netting ${rupees(line.net_paise)}`;
}

function withinDays(a: string, b: string, days: number): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) <= days * 86400_000;
}

function spanDays(lines: readonly SettlementLine[]): number {
  const times = lines.map((line) => Date.parse(line.settled_at));
  return Math.round((Math.max(...times) - Math.min(...times)) / 86400_000) + 1;
}

function rupees(paise: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    paise / 100,
  )}`;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
