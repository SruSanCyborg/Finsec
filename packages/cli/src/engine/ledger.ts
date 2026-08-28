/**
 * An append-only log of every report this project has produced.
 *
 * A signature proves a report has not changed since it was signed. It does not
 * prove that report is the one you were shown last week, or that a different
 * one was not signed in its place, or that an inconvenient one was not deleted.
 * Signatures are per-document; a transparency log is about the *history*.
 *
 * So each report's canonical digest becomes a leaf in a Merkle tree, and the
 * root is written beside it. Two things follow, both offline and both cheap:
 *
 *   `sirius report --verify <file>`   proves that exact report is in the log,
 *                                     in log(n) hashes
 *   `sirius ledger verify`            proves the log only ever appended — that
 *                                     no earlier entry was rewritten or removed
 *
 * The construction is Certificate Transparency's and Rekor's. What is not
 * copied is the trust model: theirs is a public log run by somebody else, and
 * this is a file in your repository. It catches an accident, a bad merge, or a
 * careless rewrite. It does not stop somebody who can edit the file from
 * rebuilding the whole log to match — for that the root has to be published
 * somewhere the writer does not control, which is what a witness or a hosted
 * log is for. Said here rather than left for a reader to discover.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  consistencyProof,
  hex,
  inclusionProof,
  leafHash,
  treeRoot,
  unhex,
  verifyConsistency,
  verifyInclusion,
} from './merkle.js';

export interface LedgerEntry {
  /** SHA-256 of the report's canonical payload — the same digest it is signed over. */
  digest: string;
  /** The leaf hash, which is domain-separated and not the digest itself. */
  leaf: string;
  scan_id: string;
  recorded_at: string;
  /** Findings at the time, so the log is readable without the reports. */
  findings: number;
}

export interface Ledger {
  schema: 'sirius.ledger/v1';
  entries: LedgerEntry[];
  /** The Merkle root over every leaf, recomputed on each append. */
  root: string;
}

export interface InclusionEvidence {
  index: number;
  size: number;
  root: string;
  proof: string[];
}

export const ledgerPath = (root: string): string => join(root, '.sirius', 'ledger.json');

export function loadLedger(root: string): Ledger {
  const path = ledgerPath(root);
  if (!existsSync(path)) return { schema: 'sirius.ledger/v1', entries: [], root: '' };

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
    return parsed.entries ? parsed : { schema: 'sirius.ledger/v1', entries: [], root: '' };
  } catch {
    // A corrupt ledger is not an empty one, and quietly starting a new log over
    // the top of it would destroy exactly the history it exists to keep.
    throw new Error(`${path} is not readable as a ledger. Move it aside rather than letting a new log overwrite it.`);
  }
}

const leavesOf = (ledger: Ledger): Buffer[] => ledger.entries.map((entry) => unhex(entry.leaf));

/**
 * Appends one report, or returns the entry it already has.
 *
 * Recording the same report twice would put two identical leaves in the log and
 * make its size a count of `sirius report` invocations rather than of distinct
 * reports. The digest is the identity — the same scan of the same tree produces
 * the same one.
 */
export function record(
  root: string,
  entry: Omit<LedgerEntry, 'leaf' | 'recorded_at'> & { recorded_at?: string },
): { ledger: Ledger; index: number; added: boolean } {
  const ledger = loadLedger(root);

  const existing = ledger.entries.findIndex((each) => each.digest === entry.digest);
  if (existing >= 0) return { ledger, index: existing, added: false };

  ledger.entries.push({
    digest: entry.digest,
    leaf: hex(leafHash(entry.digest)),
    scan_id: entry.scan_id,
    findings: entry.findings,
    recorded_at: entry.recorded_at ?? new Date().toISOString(),
  });
  ledger.root = hex(treeRoot(leavesOf(ledger)));

  const path = ledgerPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

  return { ledger, index: ledger.entries.length - 1, added: true };
}

/** The proof that a report with this digest is in the log. */
export function evidenceFor(ledger: Ledger, digest: string): InclusionEvidence | undefined {
  const index = ledger.entries.findIndex((entry) => entry.digest === digest);
  if (index < 0) return undefined;

  const leaves = leavesOf(ledger);
  return {
    index,
    size: leaves.length,
    root: hex(treeRoot(leaves)),
    proof: inclusionProof(leaves, index).map(hex),
  };
}

/** Checks a report's digest against a published root, holding no other report. */
export function checkInclusion(digest: string, evidence: InclusionEvidence): boolean {
  return verifyInclusion(
    leafHash(digest),
    evidence.index,
    evidence.size,
    evidence.proof.map(unhex),
    unhex(evidence.root),
  );
}

/**
 * Checks the log against itself: that the root it carries is the root of the
 * entries it carries, and that every prefix is consistent with the whole.
 *
 * The prefix walk is what catches a rewritten history. Recomputing the root
 * alone only proves the file is internally consistent *now* — a log rebuilt
 * from scratch around an altered entry passes that and fails this.
 */
export function checkLedger(ledger: Ledger): { ok: boolean; detail: string } {
  const leaves = leavesOf(ledger);
  if (leaves.length === 0) return { ok: true, detail: 'empty ledger' };

  // Each entry's leaf must be the hash of its own digest, or the tree is built
  // over numbers that have nothing to do with the reports.
  for (const [index, entry] of ledger.entries.entries()) {
    if (hex(leafHash(entry.digest)) !== entry.leaf) {
      return { ok: false, detail: `entry ${index} (${entry.scan_id}): leaf does not hash its digest` };
    }
  }

  const computed = hex(treeRoot(leaves));
  if (ledger.root && ledger.root !== computed) {
    return { ok: false, detail: `recorded root ${ledger.root.slice(0, 16)}… but the entries hash to ${computed.slice(0, 16)}…` };
  }

  for (let size = 1; size < leaves.length; size += 1) {
    const proof = consistencyProof(leaves, size);
    const ok = verifyConsistency(size, leaves.length, proof, treeRoot(leaves.slice(0, size)), treeRoot(leaves));
    if (!ok) return { ok: false, detail: `the log at ${size} entries is not a prefix of the log at ${leaves.length}` };
  }

  return {
    ok: true,
    detail: `${leaves.length} entr${leaves.length === 1 ? 'y' : 'ies'}, every prefix consistent`,
  };
}
