/**
 * The record of every decision, hash-chained and signed.
 *
 * A control layer's decisions are only worth anything if they can be shown to be
 * the decisions it actually made. Otherwise "the agent was blocked" is a claim,
 * and the interesting case — an action that was *allowed* and turned out badly —
 * is exactly the one somebody has an incentive to edit afterwards.
 *
 * So every entry, including the allowed ones, carries the hash of the entry
 * before it, and the sealed trail is signed. Removing a decision breaks the
 * chain at that point; rewriting one changes its hash and every hash after it.
 *
 * The same construction as the revenue audit trail, which is deliberate: an
 * operator who has learned to verify one can verify the other. It is kept as its
 * own schema rather than shared, because the entry shape is genuinely different
 * and pretending otherwise would put optional fields on both.
 *
 * What this does *not* prove is stated rather than left to be discovered:
 * somebody who can rewrite the file can rebuild a self-consistent chain and
 * re-sign it with their own key. That is why `key_id` is derived from the key
 * material and why `--key` exists — see `engine/attest.ts`.
 */

import { createHash } from 'node:crypto';

import { attest, canonicalise, loadOrCreateKey, verifyAttested } from '../engine/attest.js';
import type { Attestation } from '../engine/attest.js';
import type { Decision, Signal, Tier } from './types.js';

export interface TrailEntry {
  seq: number;
  at: string;
  action_id: string;
  agent_id: string;
  tier: Tier;
  /** What the action asked for, and what it was permitted to move. */
  requested_paise: number;
  permitted_paise: number;
  /** The signal that set the tier, flattened so the trail reads without a decoder. */
  deciding_id?: string;
  deciding_says?: string;
  deciding_basis?: string;
  /** Every signal raised, so a later reader sees what was considered. */
  signals: Array<Pick<Signal, 'id' | 'tier' | 'says'>>;
  prev_hash: string;
  hash: string;
}

export interface GuardTrail {
  schema: 'sirius.guard.trail/v1';
  run_id: string;
  started_at: string;
  feed: string;
  mode: 'simulated' | 'live';
  entries: TrailEntry[];
  attestation?: Attestation;
}

const GENESIS = '0'.repeat(64);

const hashOf = (entry: Omit<TrailEntry, 'hash'>): string =>
  createHash('sha256').update(canonicalise(entry)).digest('hex');

export class GuardTrailLog {
  private readonly entries: TrailEntry[] = [];
  private head = GENESIS;

  constructor(
    private readonly runId: string,
    private readonly feed: string,
    private readonly startedAt: string,
    private readonly mode: 'simulated' | 'live' = 'simulated',
  ) {}

  append(decision: Decision, requestedPaise: number): TrailEntry {
    const body: Omit<TrailEntry, 'hash'> = {
      seq: this.entries.length + 1,
      at: decision.at,
      action_id: decision.action_id,
      agent_id: decision.agent_id,
      tier: decision.tier,
      requested_paise: requestedPaise,
      permitted_paise: decision.tier === 'block' ? 0 : decision.amount_paise,
      ...(decision.deciding
        ? {
            deciding_id: decision.deciding.id,
            deciding_says: decision.deciding.says,
            ...(decision.deciding.basis ? { deciding_basis: decision.deciding.basis } : {}),
          }
        : {}),
      signals: decision.signals.map((s) => ({ id: s.id, tier: s.tier, says: s.says })),
      prev_hash: this.head,
    };

    const entry: TrailEntry = { ...body, hash: hashOf(body) };
    this.entries.push(entry);
    this.head = entry.hash;
    return entry;
  }

  get length(): number {
    return this.entries.length;
  }

  all(): readonly TrailEntry[] {
    return this.entries;
  }

  seal(): GuardTrail {
    const trail: GuardTrail = {
      schema: 'sirius.guard.trail/v1',
      run_id: this.runId,
      started_at: this.startedAt,
      feed: this.feed,
      mode: this.mode,
      entries: this.entries,
    };
    return { ...trail, attestation: attest(trail, loadOrCreateKey()) };
  }
}

export type TrailVerification =
  | { ok: true; entries: number; signedAt: string; keyId: string; mode: string; pinned: boolean }
  | { ok: false; reason: string; brokenAt?: number };

/**
 * Chain first, signature second.
 *
 * In that order deliberately: a broken link says *where* the trail was altered,
 * which is more useful to somebody investigating than a signature failure that
 * only says *that* it was.
 */
export function verifyGuardTrail(document: unknown, expectKey?: string): TrailVerification {
  if (
    typeof document !== 'object' ||
    document === null ||
    (document as GuardTrail).schema !== 'sirius.guard.trail/v1' ||
    !Array.isArray((document as GuardTrail).entries)
  ) {
    return { ok: false, reason: 'not a sirius guard trail' };
  }

  const trail = document as GuardTrail;
  let previous = GENESIS;

  for (const entry of trail.entries) {
    if (entry.prev_hash !== previous) {
      return {
        ok: false,
        reason: `entry ${entry.seq} does not follow the one before it — the chain was cut or reordered`,
        brokenAt: entry.seq,
      };
    }
    const { hash, ...body } = entry;
    if (hashOf(body) !== hash) {
      return {
        ok: false,
        reason: `entry ${entry.seq} has been altered since it was written`,
        brokenAt: entry.seq,
      };
    }
    previous = hash;
  }

  const signature = verifyAttested(document, { expectKey });
  if (!signature.ok) return { ok: false, reason: signature.reason };

  return {
    ok: true,
    entries: trail.entries.length,
    signedAt: signature.signedAt,
    keyId: signature.keyId,
    mode: trail.mode,
    pinned: signature.pinned,
  };
}
