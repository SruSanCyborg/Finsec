/**
 * Signing a compliance report locally, and verifying one.
 *
 * The PRD leads with "a cryptographically signed report a CI pipeline can gate
 * on". What existed was a client that downloaded a report from an API and, on
 * finding a signature, printed that it had *not* checked it — because no public
 * key was published anywhere. A signature nobody can verify is decoration.
 *
 * So the report is signed here, with a key that lives on this machine, and
 * `sirius report --verify` checks it. Ed25519: small keys, no parameter
 * choices to get wrong, and in Node's standard library.
 *
 * **What this proves, precisely.** That the report was produced by whoever holds
 * the private key, and that not one byte has changed since. That is exactly
 * what a CI gate needs: a build cannot quietly hand the next stage a report it
 * edited. It is *not* a statement about identity — a locally generated key
 * attests to a machine, not an organisation. The verify output says so rather
 * than letting a green tick imply more than it earned.
 */

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Where the signing key lives. Same directory as the credentials, same 0600. */
export function keyPath(): string {
  const base =
    process.env.SIRIUS_CONFIG_HOME ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'sirius');
  return join(base, 'signing-key.pem');
}

export interface SigningKey {
  privatePem: string;
  publicPem: string;
  /** Short fingerprint of the public key, for naming the signer. */
  keyId: string;
}

function fingerprint(publicPem: string): string {
  return createHash('sha256').update(publicPem).digest('hex').slice(0, 16);
}

/**
 * Loads the signing key, generating one on first use.
 *
 * Generating silently is the right default here: the alternative is a setup
 * step between the user and their first signed report, and the key means
 * nothing until they publish its fingerprint anyway.
 */
export function loadOrCreateKey(path = keyPath()): SigningKey {
  if (existsSync(path)) {
    const privatePem = readFileSync(path, 'utf8');
    const publicPem = createPublicKey(createPrivateKey(privatePem))
      .export({ type: 'spki', format: 'pem' })
      .toString();
    return { privatePem, publicPem, keyId: fingerprint(publicPem) };
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, privatePem, { mode: 0o600 });
  // Explicit, because writeFileSync's mode is subject to the umask.
  chmodSync(path, 0o600);

  return { privatePem, publicPem, keyId: fingerprint(publicPem) };
}

/**
 * Canonical JSON: object keys sorted, recursively.
 *
 * Both signer and verifier must serialise identically or a valid signature
 * fails for no reason a user could diagnose. Key order is the way that happens.
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
}

export interface Attestation {
  algorithm: 'ed25519';
  key_id: string;
  public_key: string;
  signed_at: string;
  signature: string;
  /** Digest of the canonical payload, so a human can compare without a verifier. */
  payload_sha256: string;
}

/** Signs a report body, returning the attestation to attach alongside it. */
export function attest(payload: unknown, key: SigningKey = loadOrCreateKey()): Attestation {
  const canonical = canonicalise(payload);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), createPrivateKey(key.privatePem));

  return {
    algorithm: 'ed25519',
    key_id: key.keyId,
    public_key: key.publicPem.trim(),
    signed_at: new Date().toISOString(),
    signature: signature.toString('base64'),
    payload_sha256: createHash('sha256').update(canonical).digest('hex'),
  };
}

export type VerifyResult =
  | { ok: true; keyId: string; signedAt: string }
  | { ok: false; reason: string };

/**
 * Verifies a signed report.
 *
 * The signature is checked against the public key *embedded in the report*,
 * which detects tampering with the payload but not substitution of the whole
 * key. Whoever gates on this must pin `key_id` — the caller is told so rather
 * than being handed an unqualified pass.
 */
export function verifyAttested(document: unknown): VerifyResult {
  if (typeof document !== 'object' || document === null) {
    return { ok: false, reason: 'not a JSON object' };
  }

  const { attestation, ...payload } = document as Record<string, unknown>;
  if (typeof attestation !== 'object' || attestation === null) {
    return { ok: false, reason: 'no attestation — the report is unsigned' };
  }

  const att = attestation as Partial<Attestation>;
  if (att.algorithm !== 'ed25519') {
    return { ok: false, reason: `unsupported algorithm "${String(att.algorithm)}"` };
  }
  if (!att.signature || !att.public_key) {
    return { ok: false, reason: 'attestation is missing its signature or public key' };
  }

  const canonical = canonicalise(payload);

  const digest = createHash('sha256').update(canonical).digest('hex');
  if (att.payload_sha256 && att.payload_sha256 !== digest) {
    return { ok: false, reason: 'payload digest does not match — the report was modified' };
  }

  let good: boolean;
  try {
    good = verify(
      null,
      Buffer.from(canonical, 'utf8'),
      createPublicKey(att.public_key),
      Buffer.from(att.signature, 'base64'),
    );
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'signature could not be checked' };
  }

  if (!good) return { ok: false, reason: 'signature does not match the report' };

  return { ok: true, keyId: att.key_id ?? 'unknown', signedAt: att.signed_at ?? 'unknown' };
}
