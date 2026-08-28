/**
 * The Merkle tree, checked against brute force rather than against itself.
 *
 * Proof code fails quietly. An inclusion check that recomputes the root by
 * walking the tree it was handed will return `true` for anything, and a
 * consistency proof with an off-by-one in its index arithmetic passes every
 * happy path and rejects nothing. So the tests here do two things a
 * hand-written example cannot: they verify every leaf of every tree up to a
 * size that exercises the ragged right edge, and they check that tampering is
 * actually caught.
 */

import { describe, expect, it } from 'vitest';

import {
  consistencyProof,
  emptyRoot,
  inclusionProof,
  leafHash,
  treeRoot,
  verifyConsistency,
  verifyInclusion,
} from '../src/engine/merkle.js';

const leaves = (n: number): Buffer[] => Array.from({ length: n }, (_, i) => leafHash(`report-${i}`));

describe('the hash construction', () => {
  it('separates leaves from interior nodes', () => {
    // Without the 0x00/0x01 prefixes a leaf and a subtree are drawn from the
    // same space, and a leaf can be forged that collides with an interior node.
    // The check is that a one-leaf tree is not the hash of its own contents.
    const raw = leafHash('x');
    expect(treeRoot([raw])).toEqual(raw);
    expect(raw.equals(Buffer.from('x'))).toBe(false);
    expect(raw).toHaveLength(32);
  });

  it('has a defined root for an empty log', () => {
    expect(treeRoot([])).toEqual(emptyRoot());
  });

  it('changes the root when any leaf changes', () => {
    const before = treeRoot(leaves(7));
    const after = leaves(7);
    after[3] = leafHash('tampered');
    expect(treeRoot(after).equals(before)).toBe(false);
  });
});

describe('inclusion', () => {
  it('proves every leaf of every tree up to 33', () => {
    // Sizes that are not powers of two are where the ragged right edge lives,
    // and where an implementation that only ever saw 2, 4 and 8 breaks.
    for (let size = 1; size <= 33; size += 1) {
      const log = leaves(size);
      const root = treeRoot(log);

      for (let index = 0; index < size; index += 1) {
        const proof = inclusionProof(log, index);
        expect(
          verifyInclusion(log[index] as Buffer, index, size, proof, root),
          `size ${size}, leaf ${index}`,
        ).toBe(true);
      }
    }
  });

  it('is logarithmic, not linear', () => {
    // If the proof carried every other leaf it would still verify, and the
    // whole point — checking one report without holding the rest — would be
    // gone. 1024 leaves must not need more than ten siblings.
    expect(inclusionProof(leaves(1024), 500).length).toBeLessThanOrEqual(10);
  });

  it('rejects a leaf that is not the one proved', () => {
    const log = leaves(9);
    const proof = inclusionProof(log, 4);
    expect(verifyInclusion(leafHash('forged'), 4, 9, proof, treeRoot(log))).toBe(false);
  });

  it('rejects the right leaf at the wrong index', () => {
    const log = leaves(9);
    expect(verifyInclusion(log[4] as Buffer, 5, 9, inclusionProof(log, 4), treeRoot(log))).toBe(false);
  });

  it('rejects a tampered sibling', () => {
    const log = leaves(11);
    const proof = inclusionProof(log, 3);
    proof[0] = leafHash('not the sibling');
    expect(verifyInclusion(log[3] as Buffer, 3, 11, proof, treeRoot(log))).toBe(false);
  });

  it('rejects a proof against the wrong root', () => {
    const log = leaves(11);
    expect(verifyInclusion(log[3] as Buffer, 3, 11, inclusionProof(log, 3), treeRoot(leaves(12)))).toBe(false);
  });
});

describe('consistency — that the log only ever appended', () => {
  it('holds for every pair of sizes up to 25', () => {
    for (let older = 1; older <= 25; older += 1) {
      for (let newer = older; newer <= 25; newer += 1) {
        const log = leaves(newer);
        const proof = consistencyProof(log, older);
        expect(
          verifyConsistency(older, newer, proof, treeRoot(leaves(older)), treeRoot(log)),
          `${older} → ${newer}`,
        ).toBe(true);
      }
    }
  });

  it('catches a log that rewrote an old entry instead of appending', () => {
    // The attack this exists for. The log grew from 5 to 8 entries, and entry
    // 2 was quietly changed on the way. Every new report still verifies against
    // the new root; only consistency notices the history moved.
    const older = leaves(5);
    const rewritten = leaves(8);
    rewritten[2] = leafHash('substituted');

    const proof = consistencyProof(rewritten, 5);
    expect(verifyConsistency(5, 8, proof, treeRoot(older), treeRoot(rewritten))).toBe(false);
  });

  it('catches a log that dropped an entry', () => {
    const older = leaves(6);
    const shortened = [...leaves(6).slice(0, 4), leafHash('report-5')];
    const proof = consistencyProof(shortened, 6);
    expect(verifyConsistency(6, shortened.length, proof, treeRoot(older), treeRoot(shortened))).toBe(false);
  });

  it('refuses to go backwards', () => {
    expect(verifyConsistency(8, 5, [], treeRoot(leaves(8)), treeRoot(leaves(5)))).toBe(false);
  });

  it('needs no proof when nothing was added', () => {
    const root = treeRoot(leaves(7));
    expect(consistencyProof(leaves(7), 7)).toEqual([]);
    expect(verifyConsistency(7, 7, [], root, root)).toBe(true);
    expect(verifyConsistency(7, 7, [], root, treeRoot(leaves(8)))).toBe(false);
  });
});
