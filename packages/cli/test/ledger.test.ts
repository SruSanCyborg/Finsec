/**
 * The append-only log of reports, and what it does and does not prove.
 *
 * A signature proves a report has not changed since it was signed. It says
 * nothing about whether a different report was signed in its place, or whether
 * an inconvenient one was deleted — signatures are per-document, and this is a
 * claim about the history.
 *
 * There are two layers and they catch different things, which is worth pinning
 * because it is easy to assume either one covers both:
 *
 *   `ledger verify`   catches an entry rewritten or removed *in place*
 *   `report --verify` catches a report missing from the log, including when the
 *                     whole log was rebuilt around its deletion
 *
 * The second is the one that survives a determined edit, and the limit past it
 * is stated in the module rather than left to be discovered: somebody who can
 * rewrite the file can rebuild a self-consistent log. Catching that needs the
 * root published somewhere they do not control.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkInclusion, checkLedger, evidenceFor, loadLedger, ledgerPath, record } from '../src/engine/ledger.js';
import { hex, leafHash, treeRoot } from '../src/engine/merkle.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-ledger-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const digestOf = (n: number): string => `${n}`.padStart(64, 'a');
const add = (n: number) => record(dir, { digest: digestOf(n), scan_id: `scan-${n}`, findings: n });

describe('recording', () => {
  it('starts empty and stays readable', () => {
    expect(loadLedger(dir).entries).toEqual([]);
    expect(checkLedger(loadLedger(dir)).ok).toBe(true);
  });

  it('appends and moves the root', () => {
    const first = add(1).ledger.root;
    const second = add(2).ledger.root;
    expect(first).not.toBe('');
    expect(second).not.toBe(first);
  });

  it('records the same report once, however often it is asked', () => {
    // Otherwise the log's size counts invocations of `sirius report` rather
    // than distinct reports, and the ledger stops being about the history.
    add(1);
    const again = add(1);
    expect(again.added).toBe(false);
    expect(again.index).toBe(0);
    expect(loadLedger(dir).entries).toHaveLength(1);
  });

  it('refuses to start a fresh log over a corrupt one', () => {
    // Quietly beginning again would destroy exactly the history the file exists
    // to keep, and would do it silently at the moment somebody most needs it.
    mkdirSync(join(dir, '.sirius'), { recursive: true });
    writeFileSync(ledgerPath(dir), '{ this is not json', 'utf8');
    expect(() => loadLedger(dir)).toThrow(/not readable as a ledger/);
  });
});

describe('proving one report is in the log', () => {
  it('verifies with a proof and no other report', () => {
    for (let n = 1; n <= 9; n += 1) add(n);
    const ledger = loadLedger(dir);

    for (let n = 1; n <= 9; n += 1) {
      const evidence = evidenceFor(ledger, digestOf(n));
      expect(evidence, `report ${n}`).toBeDefined();
      expect(checkInclusion(evidence!.entry, evidence!), `report ${n}`).toBe(true);
    }
  });

  it('has nothing to offer for a report that was never recorded', () => {
    add(1);
    expect(evidenceFor(loadLedger(dir), digestOf(99))).toBeUndefined();
  });

  it('rejects a proof carried over to a different report', () => {
    for (let n = 1; n <= 5; n += 1) add(n);
    const ledger = loadLedger(dir);
    const evidence = evidenceFor(ledger, digestOf(2));
    const other = ledger.entries[3]!;
    expect(checkInclusion(other, evidence!)).toBe(false);
  });
});

describe('proving the log only ever appended', () => {
  it('passes on a log that was only appended to', () => {
    for (let n = 1; n <= 12; n += 1) add(n);
    const verdict = checkLedger(loadLedger(dir));
    expect(verdict.ok).toBe(true);
    expect(verdict.detail).toContain('every prefix consistent');
  });

  it('catches an entry rewritten in place', () => {
    for (let n = 1; n <= 6; n += 1) add(n);
    const ledger = loadLedger(dir);
    ledger.entries[2]!.digest = digestOf(99);
    // The leaf is recomputed too, so the file is not obviously wrong.
    ledger.entries[2]!.leaf = hex(
      leafHash(
        [digestOf(99), ledger.entries[2]!.scan_id, ledger.entries[2]!.recorded_at, String(ledger.entries[2]!.findings)].join(
          '\u0000',
        ),
      ),
    );

    const verdict = checkLedger(ledger);
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain('entries hash to');
  });

  it('catches a leaf that does not hash its own digest', () => {
    // The subtler tamper: change the digest and leave the leaf, so the tree
    // still has the shape it published while describing a different report.
    for (let n = 1; n <= 4; n += 1) add(n);
    const ledger = loadLedger(dir);
    ledger.entries[1]!.digest = digestOf(77);

    const verdict = checkLedger(ledger);
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain('leaf does not hash its entry');
  });

  it('catches an entry whose displayed history was rewritten', () => {
    // The half an auditor actually reads. `scan_id`, `recorded_at` and
    // `findings` used to sit outside the chain, so an entry could be restamped
    // to 2020, renamed `clean-audit-2026` and have its finding count zeroed
    // while `ledger verify` answered "every prefix consistent — so no entry was
    // rewritten or removed".
    for (let n = 1; n <= 4; n += 1) add(n);
    const ledger = loadLedger(dir);
    ledger.entries[1]!.recorded_at = '2020-01-01T00:00:00.000Z';
    ledger.entries[1]!.scan_id = 'clean-audit-2026';
    ledger.entries[1]!.findings = 0;

    const verdict = checkLedger(ledger);
    expect(verdict.ok).toBe(false);
  });
});

describe('the limit, stated rather than discovered', () => {
  it('a log rebuilt around a deletion is self-consistent', () => {
    // Somebody who can edit the file can remove an entry and recompute the
    // root. `ledger verify` cannot see that, and the module says so — catching
    // it needs the root published where the writer has no reach.
    for (let n = 1; n <= 5; n += 1) add(n);
    const ledger = loadLedger(dir);
    ledger.entries.splice(2, 1);
    ledger.root = hex(treeRoot(ledger.entries.map((entry) => Buffer.from(entry.leaf, 'hex'))));

    expect(checkLedger(ledger).ok).toBe(true);
  });

  it('but the deleted report can no longer prove it was ever there', () => {
    // Which is the layer that does catch it, and why `report --verify` checks
    // the ledger rather than leaving it to a command nobody would think to run.
    for (let n = 1; n <= 5; n += 1) add(n);
    const ledger = loadLedger(dir);
    ledger.entries.splice(2, 1);
    ledger.root = hex(treeRoot(ledger.entries.map((entry) => Buffer.from(entry.leaf, 'hex'))));

    expect(evidenceFor(ledger, digestOf(3))).toBeUndefined();
  });
});

describe('what lands on disk', () => {
  it('is readable JSON somebody can inspect without this tool', () => {
    add(1);
    add(2);
    const raw = JSON.parse(readFileSync(ledgerPath(dir), 'utf8'));
    expect(raw.schema).toBe('sirius.ledger/v1');
    expect(raw.entries).toHaveLength(2);
    expect(raw.entries[0]).toMatchObject({ scan_id: 'scan-1', findings: 1 });
    expect(raw.root).toMatch(/^[0-9a-f]{64}$/);
  });
});
