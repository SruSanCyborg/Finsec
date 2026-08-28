/**
 * A Merkle tree, to RFC 6962.
 *
 * The construction behind Certificate Transparency and Sigstore's Rekor, and it
 * answers two questions a signature alone cannot:
 *
 *   inclusion    "this exact report is in the log" — in log(n) hashes, without
 *                the verifier holding any other report
 *   consistency  "the log only ever appended" — that no earlier entry was
 *                rewritten or removed between two published roots
 *
 * A signature proves a report has not changed since it was signed. It says
 * nothing about whether a *different* report was quietly signed in its place,
 * or whether one was removed from the history. That is the gap this closes, and
 * it is the reason a transparency log exists at all.
 *
 * RFC 6962's hashing is copied exactly, including the domain separation:
 *
 *   MTH({})     = SHA256()
 *   MTH({d0})   = SHA256(0x00 || d0)
 *   MTH(D[n])   = SHA256(0x01 || MTH(D[0:k]) || MTH(D[k:n]))
 *
 * where k is the largest power of two strictly less than n. The `0x00` and
 * `0x01` prefixes are not decoration: without them a leaf hash and an interior
 * node hash are drawn from the same space, and a leaf can be forged that
 * collides with a subtree. Hashing the two identically is the classic
 * second-preimage bug in a naive Merkle implementation.
 */

import { createHash } from 'node:crypto';

const LEAF = 0x00;
const NODE = 0x01;

/** MTH of the empty log. */
export function emptyRoot(): Buffer {
  return createHash('sha256').digest();
}

/** The hash of one entry. Domain-separated from interior nodes. */
export function leafHash(data: string | Buffer): Buffer {
  return createHash('sha256')
    .update(Buffer.from([LEAF]))
    .update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    .digest();
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  return createHash('sha256').update(Buffer.from([NODE])).update(left).update(right).digest();
}

/** The largest power of two strictly less than n. RFC 6962's `k`. */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** MTH(D[n]) — the root over a list of leaf hashes. */
export function treeRoot(leaves: readonly Buffer[]): Buffer {
  if (leaves.length === 0) return emptyRoot();
  if (leaves.length === 1) return leaves[0] as Buffer;

  const k = split(leaves.length);
  return nodeHash(treeRoot(leaves.slice(0, k)), treeRoot(leaves.slice(k)));
}

/**
 * PATH(m, D[n]) — the sibling hashes proving leaf `index` is in the tree.
 *
 * Logarithmic in the size of the log, which is the whole point: a verifier
 * checks one report against a published root while holding none of the others.
 */
export function inclusionProof(leaves: readonly Buffer[], index: number): Buffer[] {
  if (index < 0 || index >= leaves.length) return [];
  if (leaves.length === 1) return [];

  const k = split(leaves.length);
  return index < k
    ? [...inclusionProof(leaves.slice(0, k), index), treeRoot(leaves.slice(k))]
    : [...inclusionProof(leaves.slice(k), index - k), treeRoot(leaves.slice(0, k))];
}

/**
 * Recomputes the root from a leaf and its proof, and compares.
 *
 * Deliberately written as the verifier rather than as a lookup: it never sees
 * the tree, only the one leaf, its position, the log's size and the sibling
 * hashes. Anything more would make it a re-derivation rather than a proof.
 */
export function verifyInclusion(
  leaf: Buffer,
  index: number,
  size: number,
  proof: readonly Buffer[],
  root: Buffer,
): boolean {
  if (index < 0 || index >= size) return false;

  let fn = index;
  let sn = size - 1;
  let current = leaf;

  for (const sibling of proof) {
    if (sn === 0) return false;

    if (fn % 2 === 1 || fn === sn) {
      current = nodeHash(sibling, current);
      while (fn !== 0 && fn % 2 === 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      current = nodeHash(current, sibling);
    }

    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }

  return sn === 0 && current.equals(root);
}

/**
 * PROOF(m, D[n]) — that a log of `oldSize` is a prefix of the current log.
 *
 * The proof nobody thinks to ask for and the one that matters most. Inclusion
 * says a report is in the log now; consistency says the log did not quietly
 * become a different log in the meantime — no entry rewritten, none removed.
 */
export function consistencyProof(leaves: readonly Buffer[], oldSize: number): Buffer[] {
  if (oldSize <= 0 || oldSize > leaves.length) return [];
  if (oldSize === leaves.length) return [];
  return subProof(leaves, oldSize, true);
}

function subProof(leaves: readonly Buffer[], m: number, isCompleteSubtree: boolean): Buffer[] {
  if (m === leaves.length) return isCompleteSubtree ? [] : [treeRoot(leaves)];

  const k = split(leaves.length);
  return m <= k
    ? [...subProof(leaves.slice(0, k), m, isCompleteSubtree), treeRoot(leaves.slice(k))]
    : [...subProof(leaves.slice(k), m - k, false), treeRoot(leaves.slice(0, k))];
}

export function verifyConsistency(
  oldSize: number,
  newSize: number,
  proof: readonly Buffer[],
  oldRoot: Buffer,
  newRoot: Buffer,
): boolean {
  if (oldSize > newSize) return false;
  if (oldSize === newSize) return proof.length === 0 && oldRoot.equals(newRoot);
  if (oldSize === 0) return true;
  if (proof.length === 0) return false;

  // Two roots are rebuilt at once from the same proof: the old one, which must
  // come out equal to the root that was published then, and the new one, which
  // must equal the root published now. A log that rewrote history cannot
  // satisfy both from one set of siblings — that is the whole trick.
  let node = oldSize - 1;
  let last = newSize - 1;

  // Climb out of any right-child positions first; those nodes are already
  // complete and contribute nothing to distinguish the two trees.
  while (node % 2 === 1) {
    node = Math.floor(node / 2);
    last = Math.floor(last / 2);
  }

  let index = 0;
  const next = (): Buffer | undefined => proof[index++];

  // When the old size was a power of two its root is a subtree root already and
  // is used directly; otherwise the proof's first element seeds both chains.
  let oldHash: Buffer;
  let newHash: Buffer;
  if (node !== 0) {
    const seed = next();
    if (!seed) return false;
    oldHash = seed;
    newHash = seed;
  } else {
    oldHash = oldRoot;
    newHash = oldRoot;
  }

  while (node !== 0) {
    if (node % 2 === 1) {
      // A right child: the sibling is on the left of both chains.
      const sibling = next();
      if (!sibling) return false;
      oldHash = nodeHash(sibling, oldHash);
      newHash = nodeHash(sibling, newHash);
    } else if (node < last) {
      // A left child that has a right sibling in the *new* tree only. The old
      // tree ended here; the new one continues. Skipping this branch is what
      // made 5 → 6 fail: the case exists precisely where the two trees differ.
      const sibling = next();
      if (!sibling) return false;
      newHash = nodeHash(newHash, sibling);
    }
    // A left child with no right sibling consumes nothing from the proof.

    node = Math.floor(node / 2);
    last = Math.floor(last / 2);
  }

  // Whatever is left of the new tree above the old one's last node.
  while (last !== 0) {
    const sibling = next();
    if (!sibling) return false;
    newHash = nodeHash(newHash, sibling);
    last = Math.floor(last / 2);
  }

  return index === proof.length && oldHash.equals(oldRoot) && newHash.equals(newRoot);
}

export const hex = (buffer: Buffer): string => buffer.toString('hex');
export const unhex = (text: string): Buffer => Buffer.from(text, 'hex');
