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

/**
 * The key's identity, over its DER bytes rather than its PEM text.
 *
 * PEM is a text encoding, so the same key can be written with or without a
 * trailing newline and hash to two different values. That is not hypothetical:
 * the key is fingerprinted at load from the raw export, and written into the
 * attestation trimmed. Fingerprinting the decoded SPKI bytes makes the id a
 * property of the key rather than of how it happened to be spelled.
 */
export function fingerprint(publicPem: string): string {
  const der = createPublicKey(publicPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').slice(0, 16);
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
  | {
      ok: true;
      keyId: string;
      signedAt: string;
      /** Whether the caller named the key it expected, or merely read one off. */
      pinned: boolean;
    }
  | { ok: false; reason: string };

export interface VerifyOptions {
  /**
   * The key fingerprint the caller requires. Without it a pass says the
   * document is internally consistent, not who signed it.
   */
  expectKey?: string;
}

/**
 * Verifies a signed report.
 *
 * Two separate questions, and conflating them is how a verifier ends up
 * vouching for the forger:
 *
 *   *Was this altered?*   The signature over the canonical payload answers it.
 *   *Who signed it?*      Only a key the verifier already trusts answers it.
 *
 * The second is not answered by anything inside the document. Anyone can
 * generate a keypair, re-sign a payload they rewrote, and embed their own
 * public key — the maths then checks out perfectly, because it is their
 * signature over their document.
 *
 * This used to say "whoever gates on this must pin `key_id`", which was worse
 * than no advice: `key_id` was free-text sitting in the same document, so a
 * forger kept the victim's id, and the verifier printed the trusted
 * fingerprint over the attacker's key. Pinning defeated nothing — it named the
 * one field the attacker had most reason to copy.
 *
 * So `key_id` is now *derived* and checked, never read. It must be the
 * fingerprint of the key beside it, which makes it an identity rather than a
 * label, and makes pinning mean what it always claimed to. `expectKey` is how
 * a caller pins; without it the result is marked unpinned and every surface
 * that prints it has to say the signer is unverified.
 */
export function verifyAttested(document: unknown, options: VerifyOptions = {}): VerifyResult {
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

  // The id has to be the key's own fingerprint, not a label sitting beside it.
  // Without this the field is decorative: a forger re-signs with their own key
  // and copies the id across, and the verifier prints the *trusted* fingerprint
  // over the *attacker's* key — the worst possible outcome, since it is exactly
  // the string an auditor was told to check.
  let derived: string;
  try {
    derived = fingerprint(att.public_key);
  } catch {
    return { ok: false, reason: 'the embedded public key is not a readable key' };
  }
  if (att.key_id && att.key_id !== derived) {
    return {
      ok: false,
      reason: `key_id ${att.key_id} is not the fingerprint of the key it is attached to (${derived})`,
    };
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

  // A pin is the only thing here that establishes *who*. Checked after the
  // maths so a wrong signer is reported as a wrong signer rather than as a
  // broken signature.
  if (options.expectKey && options.expectKey !== derived) {
    return {
      ok: false,
      reason: `signed by key ${derived}, but ${options.expectKey} was required`,
    };
  }

  return {
    ok: true,
    keyId: derived,
    signedAt: att.signed_at ?? 'unknown',
    pinned: Boolean(options.expectKey),
  };
}
