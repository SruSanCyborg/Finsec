/**
 * Three views of the same money, disagreeing in all the usual ways.
 *
 * A merchant's ledger says a customer paid ₹2,450. The gateway's settlement
 * file says ₹2,314.87 — the difference is a fee, the tax on the fee, and
 * sometimes tax deducted at source. The bank statement says ₹1,84,203.14 landed
 * on Tuesday, which is eighty-one of those payouts added together with two
 * refunds subtracted. None of the three is wrong, and reconciling them by hand
 * is somebody's whole Wednesday.
 *
 * This generates all three from one underlying truth, then breaks them the way
 * they break in practice: fees netted, TDS withheld, payouts split across two
 * days, several orders merged into one credit, a UTR posted twice, a narration
 * with no order reference in it, a chargeback, and a payment the gateway simply
 * never settled. The links are written to a separate file, so the matcher can
 * be scored on whether it got them right rather than only on how many it found.
 *
 * Money is integer paise throughout. Fees are computed and rounded once, at the
 * point they are charged, exactly as a gateway does — reconciliation that has
 * to allow a rupee of slack for floating point cannot detect a rupee of theft.
 */

import { Rng } from './random.js';

export type SettlementType = 'payment' | 'refund' | 'chargeback';

export interface LedgerEntry {
  entry_id: string;
  order_id: string;
  amount_paise: number;
  captured_at: string;
  rail: string;
  psp: string;
  customer_id: string;
}

export interface SettlementLine {
  utr: string;
  /** The gateway's reference back to the order. Sometimes missing, as in life. */
  order_ref?: string;
  type: SettlementType;
  gross_paise: number;
  /** Gateway commission. */
  fee_paise: number;
  /** Tax on the commission. */
  tax_paise: number;
  /** Withheld at source on some flows. */
  tds_paise: number;
  net_paise: number;
  settled_at: string;
}

export interface BankLine {
  line_id: string;
  value_date: string;
  narration: string;
  credit_paise: number;
  debit_paise: number;
}

/** The true mapping, kept apart from the data so the matcher can be scored. */
export interface LedgerLinks {
  /** order_id → the UTRs that settled it. More than one means a split payout. */
  settled_by: Record<string, string[]>;
  /** bank line_id → the UTRs it paid out. */
  paid_by: Record<string, string[]>;
  /** Orders the gateway never settled at all — real money, really missing. */
  never_settled: string[];
  /** Bank lines posted twice by the bank. */
  duplicates: string[];
}

export interface LedgerBooks {
  ledger: LedgerEntry[];
  settlements: SettlementLine[];
  bank: BankLine[];
  links: LedgerLinks;
}

const PSPS = ['nimbuspay', 'tatva', 'kaveri-pg'] as const;
const RAILS = ['upi_intent', 'card', 'netbanking', 'upi_collect'] as const;

/** Commission in basis points, by rail. UPI is cheap; cards are not. */
const MDR_BPS: Record<string, number> = {
  upi_intent: 0,
  upi_collect: 0,
  netbanking: 90,
  card: 195,
};

const GST_BPS = 1800;

export interface LedgerOptions {
  seed: number | string;
  /** Orders to generate. The bar for this loop is fifty; the default is more. */
  orders: number;
  asOf?: Date;
}

export function generateBooks(options: LedgerOptions): LedgerBooks {
  const rng = new Rng(`${options.seed}:books`);
  const asOf = options.asOf ?? new Date('2026-08-24T18:30:00.000Z');

  const ledger: LedgerEntry[] = [];
  const settlements: SettlementLine[] = [];
  const bank: BankLine[] = [];
  const links: LedgerLinks = { settled_by: {}, paid_by: {}, never_settled: [], duplicates: [] };

  // ---- the orders, and what the gateway did with each
  const pending: { utr: string; net: number; settledAt: Date }[] = [];

  for (let i = 0; i < options.orders; i += 1) {
    const orderId = `ord_${String(i + 1).padStart(5, '0')}`;
    const rail = rng.pick(RAILS);
    const psp = rng.pick(PSPS);
    const capturedAt = new Date(asOf.getTime() - rng.int(2, 9) * 86400_000 - rng.int(0, 86400) * 1000);

    const entry: LedgerEntry = {
      entry_id: `led_${String(i + 1).padStart(5, '0')}`,
      order_id: orderId,
      amount_paise: rng.amount(1800, 0.95),
      captured_at: capturedAt.toISOString(),
      rail,
      psp,
      customer_id: `cus_${hex(rng, 8)}`,
    };
    ledger.push(entry);

    // Roughly one order in forty is captured and never settled. It is the most
    // expensive exception in the file and the one manual reconciliation misses,
    // because nothing in the settlement file points at it.
    if (rng.chance(0.025)) {
      links.never_settled.push(orderId);
      continue;
    }

    const settledAt = new Date(capturedAt.getTime() + rng.weighted([[1, 70], [2, 25], [3, 5]]) * 86400_000);
    const split = rng.chance(0.05);

    const parts = split
      ? [Math.round(entry.amount_paise * 0.6), entry.amount_paise - Math.round(entry.amount_paise * 0.6)]
      : [entry.amount_paise];

    links.settled_by[orderId] = [];

    for (const [index, gross] of parts.entries()) {
      const utr = `UTR${rng.int(1_000_000_00, 9_999_999_99)}`;
      const fee = Math.round((gross * (MDR_BPS[rail] ?? 0)) / 10000);
      const tax = Math.round((fee * GST_BPS) / 10000);
      // TDS applies to a minority of flows, and is the deduction people forget.
      const tds = rng.chance(0.12) ? Math.round(gross * 0.001) : 0;

      const line: SettlementLine = {
        utr,
        // One settlement line in twelve arrives with no order reference at all.
        ...(rng.chance(0.08) ? {} : { order_ref: orderId }),
        type: 'payment',
        gross_paise: gross,
        fee_paise: fee,
        tax_paise: tax,
        tds_paise: tds,
        net_paise: gross - fee - tax - tds,
        settled_at: new Date(settledAt.getTime() + index * 86400_000).toISOString(),
      };

      settlements.push(line);
      links.settled_by[orderId].push(utr);
      pending.push({ utr, net: line.net_paise, settledAt: new Date(line.settled_at) });
    }
  }

  // ---- refunds and chargebacks, which arrive as debits against the payouts
  const refundable = settlements.filter((line) => line.type === 'payment');
  for (const line of refundable) {
    if (!rng.chance(0.04)) continue;
    const isChargeback = rng.chance(0.25);
    const utr = `UTR${rng.int(1_000_000_00, 9_999_999_99)}`;
    const amount = isChargeback ? line.gross_paise : Math.round(line.gross_paise * (rng.chance(0.5) ? 1 : 0.5));
    // Drawn once. Two separate draws put the debit on the settlement file and
    // the bank statement on different days, which made every payout in the set
    // fail to reconcile — a defect in the fixture masquerading as a defect in
    // the books.
    const settledAt = new Date(Date.parse(line.settled_at) + rng.int(1, 6) * 86400_000);
    // A chargeback carries a fee of its own, and nobody refunds it. It goes in
    // `fee_paise` where a fee belongs: it was in `tds_paise` as a negative
    // number at first, which balanced the total and broke the one identity
    // every line of a settlement file has to satisfy —
    // net = gross − fee − tax − tds. A reconciler that cannot rely on that has
    // to guess, and guessing is what it exists to replace.
    const chargebackFee = isChargeback ? 35000 : 0;
    const net = -amount - chargebackFee;

    settlements.push({
      utr,
      ...(line.order_ref ? { order_ref: line.order_ref } : {}),
      type: isChargeback ? 'chargeback' : 'refund',
      gross_paise: -amount,
      fee_paise: chargebackFee,
      tax_paise: 0,
      tds_paise: 0,
      net_paise: net,
      settled_at: settledAt.toISOString(),
    });

    pending.push({ utr, net, settledAt });
  }

  // ---- the bank statement: one credit per gateway per day, netted
  const byDay = new Map<string, { utr: string; net: number }[]>();
  for (const item of pending) {
    const day = item.settledAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(item);
    else byDay.set(day, [item]);
  }

  let lineNumber = 0;
  for (const [day, items] of [...byDay.entries()].sort()) {
    const total = items.reduce((sum, item) => sum + item.net, 0);
    if (total === 0) continue;

    lineNumber += 1;
    const lineId = `bnk_${String(lineNumber).padStart(5, '0')}`;
    const line: BankLine = {
      line_id: lineId,
      value_date: day,
      // The narration a real statement carries: an id, a gateway, and nothing
      // that maps to an order without joining through the settlement file.
      narration: `NEFT/${items[0]?.utr ?? 'UNKNOWN'}/PG SETTLEMENT ${items.length} TXN`,
      credit_paise: total > 0 ? total : 0,
      debit_paise: total < 0 ? -total : 0,
    };
    bank.push(line);
    links.paid_by[lineId] = items.map((item) => item.utr);

    // The bank posts a line twice now and then, and the duplicate has to be
    // found rather than reconciled against a second copy of the same money.
    //
    // At a 3% chance per line and a dozen lines in a set, most sets came out
    // with no duplicate at all — so the defect was injected on average and
    // present on no particular run. One is now guaranteed, on the first line
    // big enough to matter, for the same reason the gateway outage is: a
    // fixture whose defects are a lottery cannot be tested against.
    const forceDuplicate = links.duplicates.length === 0 && byDay.size > 1 && lineNumber >= 2;
    if (forceDuplicate || rng.chance(0.03)) {
      lineNumber += 1;
      const duplicateId = `bnk_${String(lineNumber).padStart(5, '0')}`;
      bank.push({ ...line, line_id: duplicateId });
      links.duplicates.push(duplicateId);
    }
  }

  return { ledger, settlements, bank, links };
}

function hex(rng: Rng, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += '0123456789abcdef'[rng.int(0, 15)];
  return out;
}
