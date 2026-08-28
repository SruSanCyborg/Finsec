/**
 * The audit trail: every decision, in order, and impossible to edit afterwards.
 *
 * An agent that moves money has to be able to answer, months later, "why did
 * you contact this customer on the 14th?" — and the answer has to be one nobody
 * could have rewritten in between. So each entry carries the hash of the one
 * before it, and the head of the chain is signed with the same ed25519 key that
 * signs compliance reports. Change any entry and every hash after it stops
 * matching; replace the lot and the signature stops matching.
 *
 * What that proves is narrow and worth stating: the trail has not been altered
 * since it was signed, by anyone without the key. It does not prove the actions
 * were correct, or that the simulator's outcomes resemble a real gateway's. The
 * verifier says exactly this rather than printing a tick.
 *
 * Entries are written for the *decision*, not for the action — a record the
 * agent declined to touch produces an entry saying which rule stopped it. That
 * is the half of an audit trail that is usually missing, and the half that
 * answers "did you consider this one?".
 */

import { createHash } from 'node:crypto';

import { attest, canonicalise, loadOrCreateKey, verifyAttested } from '../engine/attest.js';
import type { Attestation } from '../engine/attest.js';
import type { Intervention } from './types.js';

export interface AuditEntry {
  seq: number;
  /** Simulated wall-clock time of the decision, in the run's virtual timeline. */
  at: string;
  record_id: string;
  /** Which pass over this record — a bounded workflow, not a single shot. */
  step: number;
  action: Intervention;
  /** `executed`, or `blocked` with the rule that blocked it. */
  disposition: 'executed' | 'blocked' | 'skipped';
  rule_id?: string;
  rule_says?: string;
  rule_basis?: string;
  detail?: string;
  /** The top reasons the record was selected at all. */
  because?: string[];
  cost_paise?: number;
  recovered_paise?: number;
  /** Set when the money would have arrived without any of this. */
  self_healed?: boolean;
  /** sha256 of the previous entry's hash plus this entry's canonical body. */
  prev_hash: string;
  hash: string;
}

export interface AuditTrail {
  schema: 'sirius.revenue.audit/v1';
  run_id: string;
  started_at: string;
  batch: string;
  /** Stated at the top of the file: none of this touched a real system. */
  mode: 'simulated' | 'live';
  entries: AuditEntry[];
  attestation?: Attestation;
}

const GENESIS = '0'.repeat(64);

export class AuditLog {
  private readonly entries: AuditEntry[] = [];
  private head = GENESIS;

  constructor(
    private readonly runId: string,
    private readonly batch: string,
    private readonly startedAt: string,
    private readonly mode: 'simulated' | 'live' = 'simulated',
  ) {}

  append(entry: Omit<AuditEntry, 'seq' | 'prev_hash' | 'hash'>): AuditEntry {
    const body = { ...entry, seq: this.entries.length + 1, prev_hash: this.head };
    const hash = hashOf(body);
    const complete: AuditEntry = { ...body, hash };
    this.entries.push(complete);
    this.head = hash;
    return complete;
  }

  get length(): number {
    return this.entries.length;
  }

  all(): readonly AuditEntry[] {
    return this.entries;
  }

  /** Seals the trail: the head hash is what gets signed, not the whole file. */
  seal(): AuditTrail {
    const trail: AuditTrail = {
      schema: 'sirius.revenue.audit/v1',
      run_id: this.runId,
      started_at: this.startedAt,
      batch: this.batch,
      mode: this.mode,
      entries: this.entries,
    };

    return { ...trail, attestation: attest(trail, loadOrCreateKey()) };
  }
}

function hashOf(entry: Omit<AuditEntry, 'hash'>): string {
  return createHash('sha256').update(canonicalise(entry)).digest('hex');
}

export type AuditVerification =
  | { ok: true; entries: number; signedAt: string; keyId: string; mode: string }
  | { ok: false; reason: string; brokenAt?: number };

/**
 * Checks the chain first, then the signature.
 *
 * In that order deliberately: a broken link says *where* the trail was altered,
 * which is more useful than a signature failure that only says *that* it was.
 */
export function verifyTrail(document: unknown): AuditVerification {
  if (!isTrail(document)) return { ok: false, reason: 'not a sirius audit trail' };

  let previous = GENESIS;
  for (const entry of document.entries) {
    if (entry.prev_hash !== previous) {
      return {
        ok: false,
        reason: `entry ${entry.seq} does not follow the one before it — the chain was cut or reordered`,
        brokenAt: entry.seq,
      };
    }

    const { hash, ...body } = entry;
    if (hashOf(body) !== hash) {
      return { ok: false, reason: `entry ${entry.seq} has been altered since it was written`, brokenAt: entry.seq };
    }
    previous = hash;
  }

  const signature = verifyAttested(document);
  if (!signature.ok) return { ok: false, reason: signature.reason };

  return {
    ok: true,
    entries: document.entries.length,
    signedAt: signature.signedAt,
    keyId: signature.keyId,
    mode: document.mode,
  };
}

function isTrail(value: unknown): value is AuditTrail {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as AuditTrail).schema === 'sirius.revenue.audit/v1' &&
    Array.isArray((value as AuditTrail).entries)
  );
}
