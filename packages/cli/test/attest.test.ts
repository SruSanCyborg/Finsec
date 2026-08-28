/**
 * Signing and verifying a compliance report.
 *
 * The PRD leads with "a cryptographically signed report a CI pipeline can gate
 * on". What existed downloaded a report from an API and, on finding a
 * signature, printed that it had *not* checked it — no public key was published
 * anywhere. A signature nobody can verify is decoration, and a gate that cannot
 * detect a modified report is not a gate.
 *
 * These tests care about one question above all: does verification actually
 * fail when the report is changed? A verifier that always passes is worse than
 * no verifier, because it is trusted.
 */

import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attest, canonicalise, fingerprint, loadOrCreateKey, verifyAttested } from '../src/engine/attest.js';

let dir: string;
let key: ReturnType<typeof loadOrCreateKey>;

const payload = {
  schema: 'sirius.report/v1',
  summary: { findings: 6, money_at_risk_inr: 8_930_000, counts: { critical: 2, high: 2 } },
  findings: [
    { rule_id: 'SIR-SEC-001', severity: 'critical', file: 'src/config.py', line: 14 },
    { rule_id: 'SIR-SEC-010', severity: 'critical', file: 'src/ledger.py', line: 88 },
  ],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-attest-'));
  key = loadOrCreateKey(join(dir, 'signing-key.pem'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the key', () => {
  it('is written unreadable to anyone else', () => {
    const mode = statSync(join(dir, 'signing-key.pem')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('is reused across runs rather than regenerated', () => {
    const again = loadOrCreateKey(join(dir, 'signing-key.pem'));

    // A key that changed every run would make `key_id` meaningless to pin.
    expect(again.keyId).toBe(key.keyId);
    expect(again.publicPem).toBe(key.publicPem);
  });
});

describe('a signed report verifies', () => {
  it('accepts an untouched report', () => {
    const result = verifyAttested({ ...payload, attestation: attest(payload, key) });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.keyId).toBe(key.keyId);
  });

  it('does not depend on key order in the file', () => {
    const signed = { ...payload, attestation: attest(payload, key) };

    // Re-serialising through a tool that reorders keys must not break the
    // signature; canonicalisation exists for exactly this. Rebuilt key by key
    // in reverse — `JSON.stringify`'s replacer-array form filters recursively
    // and would quietly gut the nested findings instead of reordering them.
    const reordered = Object.fromEntries(Object.entries(signed).reverse());
    expect(verifyAttested(reordered).ok).toBe(true);
  });
});

describe('tampering is caught', () => {
  const signed = () => ({ ...payload, attestation: attest(payload, key) });

  it('catches a finding being deleted', () => {
    const doc = signed();
    doc.findings = doc.findings.slice(1);

    // The whole point: a pipeline step must not be able to drop a critical
    // finding between producing the report and gating on it.
    expect(verifyAttested(doc).ok).toBe(false);
  });

  it('catches a severity being downgraded', () => {
    const doc = signed();
    doc.findings[0]!.severity = 'low';

    expect(verifyAttested(doc).ok).toBe(false);
  });

  it('catches the money figure being edited', () => {
    const doc = signed();
    doc.summary.money_at_risk_inr = 0;

    expect(verifyAttested(doc).ok).toBe(false);
  });

  it('catches a signature swapped in from another report', () => {
    const other = attest({ ...payload, summary: { findings: 0 } }, key);
    const doc = { ...payload, attestation: other };

    expect(verifyAttested(doc).ok).toBe(false);
  });

  it('reports a different signer as a different signer', () => {
    const attacker = loadOrCreateKey(join(dir, 'attacker.pem'));
    const doc = { ...payload, attestation: attest(payload, attacker) };

    // The maths still passes: it is their signature over their document. What
    // matters is that the id reported is *theirs*, so a pin can reject it.
    const result = verifyAttested(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe(attacker.keyId);
      expect(result.keyId).not.toBe(key.keyId);
      expect(result.pinned).toBe(false);
    }
  });

  it('refuses a forged report that kept the trusted key_id', () => {
    // The actual attack, and the one the old test walked past: rewrite the
    // payload, re-sign with your own key, and copy the victim's key_id across.
    // Before key_id was derived, this returned OK and printed the *trusted*
    // fingerprint over the *attacker's* key — vouching for the forger under
    // exactly the name an auditor had been told to check.
    const attacker = loadOrCreateKey(join(dir, 'forger.pem'));
    const rewritten = { ...payload, summary: { findings: 0 } };
    const forged = { ...rewritten, attestation: { ...attest(rewritten, attacker), key_id: key.keyId } };

    const result = verifyAttested(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not the fingerprint of the key');
  });

  it('rejects a signer the caller did not ask for', () => {
    // Pinning is only meaningful because key_id is now derived from the key
    // material rather than read out of the document.
    const attacker = loadOrCreateKey(join(dir, 'other.pem'));
    const doc = { ...payload, attestation: attest(payload, attacker) };

    const result = verifyAttested(doc, { expectKey: key.keyId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('was required');
  });

  it('accepts the signer the caller asked for, and says it was pinned', () => {
    const doc = { ...payload, attestation: attest(payload, key) };
    const result = verifyAttested(doc, { expectKey: key.keyId });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pinned).toBe(true);
  });

  it('fingerprints a key the same however its PEM is spelled', () => {
    // The id is written into the attestation trimmed but was computed from the
    // raw export, so a text-based fingerprint disagreed with itself over a
    // trailing newline. Hashing the DER makes the id a property of the key.
    expect(fingerprint(key.publicPem)).toBe(fingerprint(`${key.publicPem.trim()}\n\n`));
    expect(fingerprint(key.publicPem)).toBe(key.keyId);
  });
});

describe('malformed input is refused, not crashed on', () => {
  it.each([
    ['not an object', 42],
    ['null', null],
  ])('%s', (_name, value) => {
    expect(verifyAttested(value).ok).toBe(false);
  });

  it('an unsigned report', () => {
    const result = verifyAttested(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('unsigned');
  });

  it('an unknown algorithm', () => {
    const doc = { ...payload, attestation: { ...attest(payload, key), algorithm: 'rot13' } };
    expect(verifyAttested(doc).ok).toBe(false);
  });

  it('a corrupt signature', () => {
    const doc = { ...payload, attestation: { ...attest(payload, key), signature: 'not-base64!!' } };
    expect(verifyAttested(doc).ok).toBe(false);
  });
});

describe('canonicalisation', () => {
  it('is stable regardless of key order', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
  });

  it('preserves array order, which is meaningful', () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('sorts nested objects too', () => {
    expect(canonicalise({ x: { b: 1, a: 2 } })).toBe(canonicalise({ x: { a: 2, b: 1 } }));
  });

  it('drops undefined rather than emitting invalid JSON', () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
