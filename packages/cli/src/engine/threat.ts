/**
 * The Threat stage.
 *
 * Detection tells you a flaw exists. Threat tells you whether anyone can reach
 * it, whether it is live right now, and how long it has been exposed. Those are
 * different questions, and a finding list alone answers none of them.
 *
 * Three things happen here:
 *
 *   1. **Exposure** — is a leaked credential still valid? A revoked key in an
 *      old commit is history; a working one is an incident. Only a read-only
 *      call can tell them apart.
 *   2. **Archaeology** — when did it leak, in which commit, and by whom? A
 *      secret committed months ago has been in every clone since.
 *   3. **Attack paths** — findings chained into a route an attacker can walk.
 *      A leaked key plus an unauthenticated endpoint plus PAN in logs is not
 *      three medium problems; it is one critical one.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Finding, Severity, WsFrame } from '../domain.js';

// ---------------------------------------------------------------- exposure

export type Exposure = 'verified_live' | 'inactive' | 'unknown';

export interface ProviderProbe {
  name: string;
  pattern: RegExp;
  /** Read-only endpoint. Never a write: validating must not mutate anything. */
  url: string;
  header: (key: string) => Record<string, string>;
}

/**
 * Read-only probes only, and every one is a GET.
 *
 * This is deliberately narrow. Using a credential you found — even to check it —
 * touches someone else's account, so it stays opt-in behind `--validate-secrets`
 * and never runs by default.
 */
export const PROBES: ProviderProbe[] = [
  {
    name: 'stripe',
    pattern: /\b(sk|rk)_(live|test)_[0-9a-zA-Z]{16,}/,
    url: 'https://api.stripe.com/v1/balance',
    header: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'github',
    pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}/,
    url: 'https://api.github.com/user',
    header: (key) => ({ Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json' }),
  },
];

export function extractCredential(snippet: string): { probe: ProviderProbe; value: string } | undefined {
  for (const probe of PROBES) {
    const match = probe.pattern.exec(snippet);
    if (match) return { probe, value: match[0] };
  }
  return undefined;
}

/**
 * Asks the provider whether a key still works.
 *
 * A 401 or 403 is a definite "revoked". Anything else — a network failure, a
 * rate limit, a 500 — is `unknown`, never `inactive`: reporting a live key as
 * dead because the wifi dropped is the one error that actually costs money.
 */
export async function checkExposure(
  snippet: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ exposure: Exposure; provider?: string; detail?: string }> {
  const found = extractCredential(snippet);
  if (!found) return { exposure: 'unknown' };

  // A truncated literal cannot be validated; do not pretend otherwise.
  if (found.value.includes('…')) {
    return { exposure: 'unknown', provider: found.probe.name, detail: 'literal truncated before validation' };
  }

  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(found.probe.url, {
      method: 'GET',
      headers: found.probe.header(found.value),
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });

    if (response.status === 401 || response.status === 403) {
      // "not accepted" rather than "revoked": a 401 cannot tell a key that was
      // withdrawn from one that never worked, and only one of those means
      // somebody already noticed.
      return {
        exposure: 'inactive',
        provider: found.probe.name,
        detail: `${found.probe.name} did not accept it (HTTP ${response.status})`,
      };
    }
    if (response.ok) {
      return { exposure: 'verified_live', provider: found.probe.name, detail: 'credential accepted' };
    }
    return { exposure: 'unknown', provider: found.probe.name, detail: `inconclusive (HTTP ${response.status})` };
  } catch (error) {
    return {
      exposure: 'unknown',
      provider: found.probe.name,
      detail: error instanceof Error ? error.message : 'probe failed',
    };
  }
}

/**
 * Validates the credential as it exists in the file, not as it was displayed.
 *
 * Findings carry a *redacted* snippet — `sk_live_51H8…` — because a finding is
 * rendered, logged, and written to SARIF, and a full secret must not travel
 * through any of those. Validation is the one operation that needs the real
 * value, and it was being handed the redacted one: every probe saw a truncated
 * literal and returned `unknown`, so `--validate-secrets` could never verify
 * anything at all.
 *
 * The real value is read here, used once against the provider's own endpoint,
 * and never returned to the caller.
 */
export async function checkExposureAt(
  filePath: string,
  line: number,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ exposure: Exposure; provider?: string; detail?: string }> {
  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return { exposure: 'unknown', detail: 'file could not be read for validation' };
  }

  const text = source.split('\n')[line - 1];
  if (text === undefined) {
    return { exposure: 'unknown', detail: 'line no longer exists' };
  }

  return checkExposure(text, options);
}

/**
 * Validates secrets as they stream past, so the verdict reaches the finding.
 *
 * Validation used to run in the threat stage, after every finding had already
 * been printed — so `⚠ VERIFIED LIVE` could only ever appear in a summary line
 * further down, never on the finding it describes. A live credential is the
 * single most urgent thing this tool can tell someone; it belongs on the line
 * that names the file.
 *
 * Only `secrets` findings are probed, and only when the user asked.
 */
export async function* validateFrames(
  frames: AsyncIterable<WsFrame>,
  root: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): AsyncGenerator<WsFrame> {
  // Repricing a finding without correcting the headline leaves the footer
  // quoting a total its own findings no longer add up to — and the gap is
  // silent, because both numbers look plausible on their own. `applyPolicy`
  // has the same problem and solves it this way; the delta is tracked as it
  // goes past and applied to the completed frame at the end.
  let repriced = 0;

  for await (const frame of frames) {
    if (frame.type === 'scan.completed') {
      const total = (frame as { money_at_risk_inr?: number }).money_at_risk_inr;
      if (typeof total === 'number' && repriced !== 0) {
        yield { ...frame, money_at_risk_inr: Math.max(0, total + repriced) } as WsFrame;
        continue;
      }
    }

    if (frame.type === 'finding' && frame.finding?.category === 'secrets') {
      const finding = frame.finding;
      const verdict = await checkExposureAt(resolve(root, finding.file), finding.line, options);

      if (verdict.exposure === 'verified_live') finding.validity = 'verified_live';
      else if (verdict.exposure === 'inactive') finding.validity = 'inactive';
      else finding.validity = 'unknown';

      // The figure was estimated before anyone asked the provider. Now that
      // there is an answer, it should say what the answer implies rather than
      // keep quoting a ceiling for a credential that has just been refused.
      if (verdict.exposure !== 'unknown' && finding.money_at_risk_inr) {
        const { estimateExposure } = await import('./exposure-model.js');
        const revised = estimateExposure({
          ruleId: finding.rule_id,
          severity: finding.severity,
          ...(verdict.exposure === 'verified_live' ? { verifiedLive: true } : { confirmedInactive: true }),
        });
        repriced += revised.amount - finding.money_at_risk_inr;
        finding.money_at_risk_inr = revised.amount;
      }
    }

    yield frame;
  }
}

// ---------------------------------------------------------------- archaeology

/**
 * The longest run of the literal that survived redaction — everything before
 * the ellipsis. Long enough to find the commit, short enough not to be a usable
 * credential.
 */
export function extractSearchablePrefix(snippet: string): string | undefined {
  const quoted = /['"]([^'"]{8,})['"]/.exec(snippet);
  const candidate = quoted?.[1] ?? snippet;
  const beforeEllipsis = candidate.split('…')[0] ?? '';
  const trimmed = beforeEllipsis.trim();
  return trimmed.length >= 8 ? trimmed.slice(0, 40) : undefined;
}

export interface Provenance {
  commit: string;
  author: string;
  date: string;
  ageDays: number;
}

/**
 * When a secret entered history, via `git log -S` — a pickaxe search for the
 * commit that introduced the literal, not the one that last touched the line.
 * `git blame` would credit whoever reformatted the file last.
 */
export function findIntroduction(repoRoot: string, path: string, needle: string): Provenance | undefined {
  // Snippets are redacted at detection, so the full literal is gone by now —
  // searching for it would never match. The surviving prefix before the
  // ellipsis is both long enough to identify the line and short enough that we
  // are not reconstituting a secret in order to look for it.
  const searchable = extractSearchablePrefix(needle);
  if (!searchable) return undefined;

  try {
    const out = execFileSync(
      'git',
      ['-C', repoRoot, 'log', '-S', searchable, '--reverse', '--format=%H%x00%an%x00%aI', '--', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 },
    ).trim();

    const first = out.split('\n')[0];
    if (!first) return undefined;

    const [commit, author, date] = first.split('\0');
    if (!commit || !date) return undefined;

    const ageDays = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
    return { commit: commit.slice(0, 12), author: author ?? 'unknown', date, ageDays };
  } catch {
    // Not a repo, no history, or git is unavailable. Absence of provenance is
    // not evidence of safety, so callers treat undefined as "unknown".
    return undefined;
  }
}

// ---------------------------------------------------------------- attack paths

export interface AttackStep {
  finding: Finding;
  role: string;
}

export interface AttackPath {
  id: string;
  title: string;
  severity: Severity;
  steps: AttackStep[];
  /** Combined exposure, which exceeds the sum of the individual findings. */
  money_at_risk_inr: number;
  narrative: string;
}

const has = (findings: Finding[], predicate: (f: Finding) => boolean) => findings.filter(predicate);

/**
 * Chains findings into routes an attacker can actually walk.
 *
 * The value is in the composition: an unauthenticated endpoint is a medium
 * finding, and PAN in the logs is a high one, but an unauthenticated endpoint
 * that writes PAN to a log an attacker can already read is a breach path. Each
 * pattern below is a way in, a way through, and something worth taking.
 */
export function buildAttackPaths(findings: Finding[]): AttackPath[] {
  const paths: AttackPath[] = [];

  const liveSecrets = has(findings, (f) => f.category === 'secrets' && f.validity === 'verified_live');
  const anySecrets = has(findings, (f) => f.category === 'secrets');
  const authGaps = has(findings, (f) => f.category === 'auth');
  const piiLeaks = has(findings, (f) => f.category === 'pii' || f.category === 'logging');
  const injections = has(findings, (f) => f.category === 'injection');
  const transport = has(findings, (f) => f.rule_id === 'SIR-SEC-041');

  // 1. A live key is a way in that needs no exploitation at all.
  const entry = liveSecrets[0] ?? anySecrets[0];
  if (entry && piiLeaks.length > 0) {
    const target = piiLeaks[0]!;
    const live = entry.validity === 'verified_live';
    paths.push({
      id: 'AP-1',
      title: live ? 'Live credential to cardholder data' : 'Leaked credential to cardholder data',
      severity: live ? 'critical' : 'high',
      steps: [
        { finding: entry, role: live ? 'entry — credential still valid' : 'entry — credential leaked' },
        { finding: target, role: 'target — cardholder data readable' },
      ],
      money_at_risk_inr: (entry.money_at_risk_inr ?? 0) + (target.money_at_risk_inr ?? 0) + (live ? 2_000_000 : 0),
      narrative: live
        ? 'The leaked key is accepted by the provider right now. Anyone with the repository has API access, and cardholder data reaches the logs that access can read.'
        : 'A leaked key reaches an API, and cardholder data reaches logs. If the key is still valid, this is a live breach path.',
    });
  }

  // 2. Reach an endpoint without credentials, then pivot through it.
  if (authGaps.length > 0 && (injections.length > 0 || piiLeaks.length > 0)) {
    const gap = authGaps[0]!;
    const pivot = injections[0] ?? piiLeaks[0]!;
    paths.push({
      id: 'AP-2',
      title: 'Unauthenticated endpoint to database',
      severity: 'critical',
      steps: [
        { finding: gap, role: 'entry — no authentication required' },
        { finding: pivot, role: pivot.category === 'injection' ? 'pivot — query is attacker-controlled' : 'target — data exposed' },
      ],
      money_at_risk_inr: (gap.money_at_risk_inr ?? 0) + (pivot.money_at_risk_inr ?? 0) + 1_500_000,
      narrative:
        'The endpoint accepts unauthenticated requests, and a downstream query is built from the input it receives. No credential is needed to reach the database.',
    });
  }

  // 3. Plaintext transport turns a passive observer into a credential holder.
  if (transport.length > 0 && anySecrets.length > 0) {
    const wire = transport[0]!;
    paths.push({
      id: 'AP-3',
      title: 'Plaintext transport to credential capture',
      severity: 'high',
      steps: [
        { finding: wire, role: 'entry — traffic observable in transit' },
        { finding: anySecrets[0]!, role: 'target — credential travels this path' },
      ],
      money_at_risk_inr: (wire.money_at_risk_inr ?? 0) + 500_000,
      narrative:
        'Cardholder data crosses the network without TLS, so anyone on the path reads it. Credentials used on the same path are captured with it.',
    });
  }

  return paths;
}
