/**
 * The money-at-risk model.
 *
 * Every rupee figure sirius prints comes from here, and every one of them is an
 * *estimate with stated assumptions* — not a measurement. Saying so is the point:
 * a number a judge cannot interrogate is worse than no number at all.
 *
 * The model is deliberately simple and legible:
 *
 *     exposure = base × reachability × persistence
 *
 *   base          what an attacker could move or obtain through this class of
 *                 flaw, anchored to a published figure where one exists
 *   reachability  how much work stands between an attacker and it
 *   persistence   whether it is a one-off or a standing exposure
 *
 * Anchors, all public:
 *
 *   - RBI caps a single UPI transaction at ₹1,00,000 for most use cases, and
 *     ₹5,00,000 for verified merchants. A payment credential is bounded by
 *     velocity limits, not by the account balance.
 *   - IBM's Cost of a Data Breach 2024 puts the global average at $4.88M and the
 *     financial-sector average at $6.08M; India's average was ₹19.5 crore. Per
 *     *record* the figure is roughly ₹6,500.
 *   - DPDP Act 2023 §8(5) with the Schedule allows up to ₹250 crore per instance
 *     for failing to take reasonable security safeguards. That is a ceiling on
 *     regulatory exposure, not an expected value, so it is never used directly.
 *
 * These are order-of-magnitude estimates for prioritisation. They are not
 * actuarial, and `explain()` says so in the output rather than in a footnote.
 */

import { DEFAULT_WIDTH, wrapLabelled, wrapText } from '../wrap.js';

import type { Severity } from '../domain.js';

export interface ExposureBasis {
  /** The rupee figure. */
  amount: number;
  /** One line a person can argue with. */
  basis: string;
  /** Where the anchor comes from. */
  anchor: string;
}

/** How much friction stands between an attacker and the flaw. */
export type Reachability = 'direct' | 'authenticated' | 'local';

const REACHABILITY: Record<Reachability, number> = {
  direct: 1, // usable as-is, no exploitation needed
  authenticated: 0.4, // needs a credential or a session first
  local: 0.15, // needs code execution or filesystem access
};

/**
 * Per-rule exposure. Amounts are annual-equivalent estimates for one instance
 * of the flaw, before reachability is applied.
 */
const MODEL: Record<string, ExposureBasis> = {
  'SIR-SEC-001': {
    amount: 4_200_000,
    basis:
      'A live payment credential is bounded by transaction velocity, not account balance. ' +
      'Estimated at a ₹5,00,000 verified-merchant ceiling across a plausible 8-transaction ' +
      'window before detection, plus reissue and reconciliation cost.',
    anchor: 'RBI transaction limits; IBM Cost of a Data Breach 2024 (financial sector)',
  },
  'SIR-SEC-002': {
    amount: 80_000,
    basis:
      'An unidentified high-entropy credential of unknown scope. Rated an order of magnitude ' +
      'below a confirmed payment key because its blast radius is unknown, not because it is small.',
    anchor: 'IBM Cost of a Data Breach 2024, per-record average',
  },
  'SIR-SEC-010': {
    amount: 2_400_000,
    basis:
      'Injection reaching a ledger exposes the table, not one row. Estimated at ~370 customer ' +
      'records at the ₹6,500 per-record average — a small book for a fintech.',
    anchor: 'IBM Cost of a Data Breach 2024, per-record cost',
  },
  'SIR-SEC-011': {
    amount: 3_000_000,
    basis: 'Command execution is host compromise; the bound is the host, not the query.',
    anchor: 'IBM Cost of a Data Breach 2024 (financial sector average)',
  },
  'SIR-SEC-020': {
    amount: 600_000,
    basis:
      'An unauthenticated route is an entry point rather than a loss in itself. Valued as the ' +
      'cost of what it fronts, discounted because reaching data still takes a second step.',
    anchor: 'Derived: entry-point discount on the per-record average',
  },
  'SIR-SEC-021': {
    amount: 350_000,
    basis:
      'Unverified JWT means any identity can be asserted. Priced as account takeover across a ' +
      'handful of accounts before anomaly detection fires.',
    anchor: 'RBI transaction limits per compromised account',
  },
  'SIR-SEC-030': {
    amount: 1_300_000,
    basis:
      'PAN in logs spreads cardholder data into systems outside the CDE — log aggregators, ' +
      'backups, vendor tooling. Estimated at ~200 records, plus PCI scope expansion.',
    anchor: 'PCI-DSS 3.4.1 scope rules; per-record average',
  },
  'SIR-SEC-031': {
    amount: 400_000,
    basis:
      'Storing an unmasked PAN violates the RBI card-on-file tokenisation mandate directly. ' +
      'Priced as remediation and re-tokenisation, not as a breach.',
    anchor: 'RBI card-on-file tokenisation mandate (effective Dec 2021)',
  },
  'SIR-SEC-040': {
    amount: 150_000,
    basis:
      'A weak hash or fixed IV weakens a control rather than breaching it. Priced as the cost ' +
      'of re-hashing and forced credential rotation.',
    anchor: 'Derived: remediation cost, not loss',
  },
  'SIR-SEC-041': {
    amount: 900_000,
    basis:
      'Cardholder data in the clear is readable by anyone on the path. Requires network ' +
      'position, so it is discounted from a direct-credential exposure.',
    anchor: 'PCI-DSS 4.2.1; per-record average with a network-position discount',
  },
  'SIR-SEC-050': {
    amount: 250_000,
    basis:
      'An unthrottled money endpoint permits enumeration and repeated debits. Priced as the ' +
      'velocity ceiling over a short window.',
    anchor: 'RBI velocity-check guidance',
  },
  'SIR-SEC-051': {
    amount: 180_000,
    basis:
      'Missing idempotency means a retried POST moves money twice. Priced as duplicate ' +
      'settlement plus the reconciliation to unwind it.',
    anchor: 'Stripe idempotency guidance; operational reconciliation cost',
  },
  'SIR-SEC-060': {
    amount: 500_000,
    basis:
      'A dependency running install scripts executes in CI with CI credentials. Priced as ' +
      'supply-chain remediation, discounted by the chance it is benign.',
    anchor: 'Derived: build-system compromise, probability-weighted',
  },
};

/** Severity fallback for a rule with no entry, so the model never guesses silently. */
const BY_SEVERITY: Record<Severity, number> = {
  critical: 1_000_000,
  high: 400_000,
  medium: 120_000,
  low: 30_000,
  info: 0,
};

/**
 * Not all credentials are equal, and pricing them identically would be the
 * laziest part of the model. A cloud root key is a bigger blast radius than a
 * chat token; the multipliers say so, relative to a payment key at 1.0.
 */
const PROVIDER_WEIGHT: Record<string, { weight: number; why: string }> = {
  'private key block': { weight: 1.4, why: 'signing key: impersonation, not just access' },
  'AWS access key': { weight: 1.2, why: 'cloud control plane, broader than one payment account' },
  'Stripe secret key': { weight: 1.0, why: 'baseline: direct money movement' },
  'Razorpay key': { weight: 1.0, why: 'baseline: direct money movement' },
  'Google API key': { weight: 0.4, why: 'usually scoped to one service, often quota-limited' },
  'Slack token': { weight: 0.3, why: 'data and social reach, no direct money movement' },
  'Stripe test key': { weight: 0.01, why: 'test mode moves no real money; flagged for hygiene' },
};

export interface ExposureInput {
  ruleId: string;
  severity: Severity;
  /** Provider name from the matching secret pattern, when there is one. */
  provider?: string;
  reachability?: Reachability;
  /** A confirmed-live credential is a present loss, not a potential one. */
  verifiedLive?: boolean;
  /** Days the flaw has been in version control, if known. */
  ageDays?: number;
}

export interface ExposureResult extends ExposureBasis {
  reachability: Reachability;
  multiplier: number;
  factors: string[];
}

/**
 * Estimates exposure, and records how it got there.
 *
 * A live credential is doubled rather than scaled by some larger factor: it
 * moves the finding from "could be exploited" to "is exploitable now", which is
 * a category change, not a magnitude one.
 */
export function estimateExposure(input: ExposureInput): ExposureResult {
  const entry = MODEL[input.ruleId];
  const reachability = input.reachability ?? 'direct';
  const factors: string[] = [];

  const base = entry?.amount ?? BY_SEVERITY[input.severity];
  let multiplier = REACHABILITY[reachability];
  if (reachability !== 'direct') factors.push(`${reachability} access (×${REACHABILITY[reachability]})`);

  const provider = input.provider ? PROVIDER_WEIGHT[input.provider] : undefined;
  if (provider) {
    multiplier *= provider.weight;
    factors.push(`${input.provider} (×${provider.weight} — ${provider.why})`);
  }

  if (input.verifiedLive) {
    multiplier *= 2;
    factors.push('credential confirmed live (×2)');
  }

  // Long exposure means more clones, more logs, more chances taken. Capped at
  // 1.5 so age never dominates the estimate.
  if (input.ageDays && input.ageDays > 30) {
    const ageFactor = Math.min(1.5, 1 + input.ageDays / 730);
    multiplier *= ageFactor;
    factors.push(`in history ${input.ageDays} days (×${ageFactor.toFixed(2)})`);
  }

  return {
    amount: Math.round((base * multiplier) / 10_000) * 10_000,
    basis: entry?.basis ?? `No rule-specific model; estimated from ${input.severity} severity.`,
    anchor: entry?.anchor ?? 'Derived: severity band',
    reachability,
    multiplier: Math.round(multiplier * 100) / 100,
    factors,
  };
}

/** The full derivation, for `--explain` and for anyone who asks on stage. */
export function explain(input: ExposureInput, width = DEFAULT_WIDTH): string[] {
  const result = estimateExposure(input);

  // Wrapped, not truncated. The basis and the anchor are the whole point of
  // this command — they are what makes a rupee figure inspectable instead of
  // asserted — and both are long enough to run off an 80-column terminal.
  const GUTTER = 11;
  const usable = Math.max(24, width - 2);

  const lines = [`${input.ruleId}  estimated exposure`, ``];
  for (const line of wrapLabelled('  basis', result.basis, usable, GUTTER)) lines.push(line);
  for (const line of wrapLabelled('  anchor', result.anchor, usable, GUTTER)) lines.push(line);
  if (result.factors.length > 0) {
    for (const line of wrapLabelled('  factors', result.factors.join(', '), usable, GUTTER)) {
      lines.push(line);
    }
  }

  lines.push(``);
  for (const line of wrapText(
    'This is an order-of-magnitude estimate for prioritisation, not an actuarial ' +
      'figure. It assumes one instance of the flaw and says nothing about the ' +
      'probability of exploitation.',
    usable - 2,
  )) {
    lines.push(`  ${line}`);
  }

  return lines;
}

export { MODEL as EXPOSURE_MODEL };
