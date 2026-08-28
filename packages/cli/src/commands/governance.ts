/**
 * `sirius report`, `badge`, `suppress`, `baseline`.
 *
 * Three of these hit endpoints the contract marks session/JWT-only while the
 * CLI authenticates with a Bearer API key — the K/S contradiction recorded in
 * docs/decisions.md. They are implemented against the contract as written; if
 * the `auto` owner does not widen those endpoints to accept API keys, they will
 * work interactively and fail in CI.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig, findProjectRoot } from '../config/load.js';
import { loadLastScan, locateLastScan } from '../session.js';
import type { LastScan } from '../session.js';
import { VERSION } from '../branding.js';

interface GlobalFlags {
  apiUrl?: string;
  project?: string;
  profile?: string;
  /** Force local state even when a project is configured. */
  local?: boolean;
}

function resolved(globals: GlobalFlags) {
  const cwd = process.cwd();
  const config = loadConfig({
    cwd,
    overrides: { apiUrl: globals.apiUrl, projectId: globals.project, profile: globals.profile },
  });
  return { config, client: new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey }) };
}

function requireProject(config: { projectId?: string | undefined }): string {
  if (!config.projectId) {
    throw new CliError('No project id configured.', {
      hint: 'Run `sirius init`, pass --project <id>, or set SIRIUS_PROJECT_ID.',
    });
  }
  return config.projectId;
}

/** Falls back to the last scan when no id is given, like `fix` does. */
function resolveScanId(explicit: string | undefined): string {
  if (explicit) return explicit;

  const cwd = process.cwd();
  const root = findProjectRoot(cwd)?.dir ?? cwd;
  const cache = loadLastScan(root);

  if (!cache) {
    throw new CliError('No scan id given and no recent scan to fall back on.', {
      hint: 'Run `sirius scan .` first, or pass a scan id.',
    });
  }
  if (cache.scan_id === 'replay') {
    throw new CliError('The last scan was a replay, so there is no server-side scan.', {
      hint: 'Run `sirius scan .` against a real API first.',
    });
  }
  return cache.scan_id;
}

/**
 * Where local state lives, and whether to use it.
 *
 * Same test the rest of the CLI uses: with no project configured there is no
 * hosted anything, and baselines and suppressions belong beside the code they
 * describe — in the repo, reviewable in a pull request, which is where an
 * exception granted to a security finding ought to be argued anyway.
 */
function localRoot(globals: GlobalFlags, explicit?: string): string | undefined {
  const config = loadConfig({
    cwd: process.cwd(),
    overrides: {
      apiUrl: globals.apiUrl,
      profile: globals.profile,
      ...(globals.project ? { projectId: globals.project } : {}),
    },
  });
  if (config.projectId && !globals.local) return undefined;

  const cwd = process.cwd();
  if (explicit) return resolve(cwd, explicit);
  return findProjectRoot(cwd)?.dir ?? locateLastScan(cwd)?.root ?? cwd;
}

// ---- report ---------------------------------------------------------------

export async function runReport(
  scanId: string | undefined,
  flags: { format?: string; output?: string; verify?: string; target?: string },
  globals: GlobalFlags,
): Promise<void> {
  // Verifying is the other half of signing, and it must work on a machine that
  // has never run a scan — a CI gate checks an artefact someone else produced.
  if (flags.verify) return verifyReport(flags.verify);

  const format = (flags.format ?? 'json') as 'pdf' | 'json' | 'sarif';
  if (!['pdf', 'json', 'sarif'].includes(format)) {
    throw new CliError(`Unknown report format "${format}".`, { hint: 'Expected pdf, json, or sarif.' });
  }

  // No hosted scan to download: build the report from what was actually
  // scanned, and sign it here. A report that only exists if a backend is
  // running is not something a pipeline can gate on today.
  const found = locateLastScan(process.cwd(), flags.target);
  if (found && (!scanId || scanId === found.cache.scan_id) && found.cache.source !== 'api') {
    return writeLocalReport(found.root, found.cache, flags, format);
  }

  const { client } = resolved(globals);
  const id = resolveScanId(scanId);
  const report = (await client.getReport(id, format)) as Record<string, unknown>;

  const signature = typeof report.jws_signature === 'string' ? report.jws_signature : undefined;
  const uri = typeof report.uri === 'string' ? report.uri : undefined;

  const target = flags.output
    ? isAbsolute(flags.output)
      ? flags.output
      : resolve(process.cwd(), flags.output)
    : resolve(process.cwd(), `sirius-report-${id.slice(0, 8)}.${format === 'pdf' ? 'json' : format}`);

  writeFileSync(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`Report written to ${target}\n`);

  if (format === 'pdf' && uri) {
    process.stdout.write(`PDF available at ${uri}\n`);
  }

  // Signature verification needs the issuer's ES256 public key, which the
  // contract does not expose yet. Report presence honestly rather than implying
  // the signature was checked.
  if (signature) {
    process.stdout.write(`Detached JWS present (${signature.length} chars), signed ${report.signed_at ?? 'unknown'}\n`);
    process.stdout.write('note: signature not verified — no public key endpoint in the contract yet.\n');
  } else {
    process.stdout.write('warning: report carries no signature.\n');
  }
}

// ---- badge ----------------------------------------------------------------

export async function runBadge(flags: { markdown?: boolean }, globals: GlobalFlags): Promise<void> {
  const { config } = resolved(globals);
  const projectId = requireProject(config);

  // The badge endpoint is public, so this is pure string assembly — no request.
  const url = `${config.apiUrl.replace(/\/+$/, '')}/projects/${projectId}/badge.svg`;

  if (flags.markdown === false) {
    process.stdout.write(`${url}\n`);
    return;
  }

  process.stdout.write(`${url}\n\n`);
  process.stdout.write(`![sirius compliance](${url})\n\n`);
  process.stdout.write(`<img src="${url}" alt="sirius compliance" />\n`);
}

// ---- suppress -------------------------------------------------------------

export async function runSuppress(
  ruleId: string | undefined,
  flags: { reason?: string; expires?: string; path?: string; target?: string },
  globals: GlobalFlags,
): Promise<void> {
  if (!ruleId) {
    throw new CliError('Which rule?', { hint: 'e.g. sirius suppress SIR-SEC-010 --reason "..."' });
  }

  // The DDL makes `reason` NOT NULL, and a suppression without one is how a
  // codebase quietly stops being audited. Enforce it here too.
  if (!flags.reason?.trim()) {
    throw new CliError('A suppression needs a reason.', {
      hint: 'e.g. --reason "false positive: test fixture, not a live key"',
    });
  }

  const expiresAt = flags.expires ? parseExpiry(flags.expires) : undefined;

  const root = localRoot(globals, flags.target);
  if (root) return localSuppress(ruleId, flags.reason.trim(), expiresAt ?? null, flags.path, root);

  const { client, config } = resolved(globals);
  const suppression = await client.createSuppression({
    project_id: requireProject(config),
    rule_id: ruleId,
    ...(flags.path ? { path_glob: flags.path } : {}),
    reason: flags.reason.trim(),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  });

  process.stdout.write(`Suppressed ${ruleId}${flags.path ? ` in ${flags.path}` : ''}\n`);
  process.stdout.write(`  reason:  ${flags.reason.trim()}\n`);
  process.stdout.write(
    expiresAt
      ? `  expires: ${expiresAt}\n`
      : '  expires: never — consider --expires so this gets revisited\n',
  );
  if (suppression.id) process.stdout.write(`  id:      ${suppression.id}\n`);
}

/** Accepts `2026-09-01` or a full ISO-8601 timestamp; stores ISO-8601. */
export function parseExpiry(input: string): string {
  const value = input.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new CliError(`Cannot read "${input}" as a date.`, { hint: 'Use YYYY-MM-DD, e.g. --expires 2026-09-01.' });
  }
  if (date.getTime() <= Date.now()) {
    throw new CliError(`${value} is in the past.`, { hint: 'A suppression that expires immediately does nothing.' });
  }
  return date.toISOString();
}

// ---- baseline -------------------------------------------------------------

export async function runBaseline(
  subcommand: string | undefined,
  flags: { commit?: string; scan?: string; target?: string },
  globals: GlobalFlags,
): Promise<void> {
  const root = localRoot(globals, flags.target);
  if (root) return localBaseline(subcommand ?? 'show', flags, root);

  const { client, config } = resolved(globals);
  const projectId = requireProject(config);

  switch (subcommand ?? 'show') {
    case 'show': {
      const baselines = await client.listBaselines(projectId);
      if (baselines.length === 0) {
        process.stdout.write('No baseline set.\n');
        process.stdout.write('Set one with:  sirius baseline set\n');
        return;
      }
      for (const baseline of baselines) {
        const count = baseline.fingerprints?.length ?? 0;
        process.stdout.write(
          `${(baseline.commit_sha ?? '').slice(0, 12).padEnd(14)} ${count} finding${count === 1 ? '' : 's'}  ${baseline.created_at ?? ''}\n`,
        );
      }
      return;
    }

    case 'set': {
      const commit = flags.commit ?? currentCommit();
      const scanId = flags.scan ?? resolveScanId(undefined);

      // Fingerprints are computed server-side — the CLI has no engine, so it
      // sends the scan to take them from rather than computing them itself.
      const baseline = await client.createBaseline({
        project_id: projectId,
        commit_sha: commit,
        scan_id: scanId,
      });

      const count = baseline.fingerprints?.length ?? 0;
      process.stdout.write(`Baseline set at ${commit.slice(0, 12)} (${count} finding${count === 1 ? '' : 's'})\n`);
      process.stdout.write('Findings present here will now report baseline_state=unchanged.\n');
      process.stdout.write('Gate only on what is new with:  sirius scan . --fail-on new\n');
      return;
    }

    default:
      throw new CliError(`Unknown subcommand "${subcommand}".`, { hint: 'Expected: set, show.' });
  }
}

function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new CliError('Not in a git repository, so there is no commit to baseline against.', {
      hint: 'Pass --commit <sha> explicitly.',
    });
  }
}


// ---- local, signed reports -------------------------------------------------

/**
 * Builds the report from the last scan and signs it.
 *
 * The signature is the point. Without one, a "compliance report" is a JSON file
 * any step of a pipeline could rewrite between producing it and acting on it.
 */
async function writeLocalReport(
  root: string,
  cache: LastScan,
  flags: { output?: string },
  format: 'pdf' | 'json' | 'sarif',
): Promise<void> {
  if (format === 'pdf') {
    throw new CliError('PDF reports need the hosted renderer.', {
      hint: 'Use --format json for a signed local report.',
    });
  }

  const { attest } = await import('../engine/attest.js');
  const { countBySeverity } = await import('../ui/ScanView.js');

  const counts = countBySeverity(cache.findings as never);
  const money = cache.findings.reduce((sum, f) => sum + (f.money_at_risk_inr ?? 0), 0);

  const payload = {
    schema: 'sirius.report/v1',
    scan_id: cache.scan_id,
    scanned_at: cache.scanned_at,
    root,
    source: cache.source ?? 'local',
    tool: { name: 'sirius', version: VERSION },
    summary: {
      findings: cache.findings.length,
      counts,
      money_at_risk_inr: money,
    },
    // The clauses are why this is a compliance report and not a bug list.
    compliance_refs: [...new Set(cache.findings.flatMap((f) => f.compliance_ref ?? []))].sort(),
    findings: cache.findings.map((f) => ({
      rule_id: f.rule_id,
      severity: f.severity,
      file: f.file,
      line: f.line,
      message: f.message,
      compliance_ref: f.compliance_ref ?? [],
      money_at_risk_inr: f.money_at_risk_inr ?? 0,
      fingerprint: f.fingerprint,
    })),
  };

  const attestation = attest(payload);
  const document = { ...payload, attestation };

  const target = flags.output
    ? isAbsolute(flags.output)
      ? flags.output
      : resolve(process.cwd(), flags.output)
    : resolve(process.cwd(), `sirius-report-${cache.scan_id.slice(0, 8)}.json`);

  writeFileSync(target, JSON.stringify(document, null, 2) + '\n', 'utf8');

  process.stdout.write(`Report written to ${target}\n`);
  process.stdout.write(`Signed ed25519 · key ${attestation.key_id} · ${attestation.signed_at}\n`);
  process.stdout.write(`Verify with:  sirius report --verify ${target}\n`);
}

/** Checks a signed report and says exactly what the check does and does not prove. */
async function verifyReport(path: string): Promise<void> {
  const file = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (!existsSync(file)) {
    throw new CliError(`No such report: ${path}`, { hint: 'Generate one with `sirius report`.' });
  }

  const { verifyAttested } = await import('../engine/attest.js');

  let document: unknown;
  try {
    document = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CliError(`${path} is not valid JSON.`, {
      hint: error instanceof Error ? error.message : undefined,
    });
  }

  const result = verifyAttested(document);

  if (!result.ok) {
    process.stdout.write(`FAILED  ${path}\n        ${result.reason}\n`);
    // Exit 1, so a pipeline step gates on this without parsing the output.
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`OK      ${path}\n`);
  process.stdout.write(`        signed ${result.signedAt} by key ${result.keyId}\n`);
  // Say what was proved. A tick that implies more than it earned is worse than
  // no tick, in a report whose whole purpose is being trusted downstream.
  process.stdout.write(
    `        the report is unmodified since signing. Pin key ${result.keyId} to\n` +
      `        also prove who signed it — the key travels inside the file.\n`,
  );
}

// ---- local baselines and suppressions --------------------------------------

/** `baseline show|set` against the file beside the project. */
async function localBaseline(
  subcommand: string,
  flags: { commit?: string; target?: string },
  root: string,
): Promise<void> {
  const { loadBaseline, saveBaseline, baselinePath } = await import('../engine/store.js');

  if (subcommand === 'show') {
    const baseline = loadBaseline(root);
    if (!baseline) {
      process.stdout.write('No baseline set.\n');
      process.stdout.write('Set one with:  sirius baseline set\n');
      return;
    }
    const where = baseline.commit_sha ? baseline.commit_sha.slice(0, 12) : 'no commit';
    process.stdout.write(`${where.padEnd(14)} ${baseline.fingerprints.length} finding(s)  ${baseline.created_at}\n`);
    process.stdout.write(`${baselinePath(root)}\n`);
    return;
  }

  if (subcommand !== 'set') {
    throw new CliError(`Unknown subcommand "${subcommand}".`, { hint: 'Expected show or set.' });
  }

  const found = locateLastScan(process.cwd(), flags.target);
  if (!found) {
    throw new CliError('No recent scan to take a baseline from.', {
      hint: 'Run `sirius scan .` first — the baseline is the findings it found.',
    });
  }

  // Fingerprints come from the scan, not from a server. They are deliberately
  // line-insensitive, so reformatting a file does not invalidate the baseline.
  const fingerprints = found.cache.findings
    .map((f) => f.fingerprint)
    .filter((f): f is string => typeof f === 'string');

  const missing = found.cache.findings.length - fingerprints.length;
  if (fingerprints.length === 0 && found.cache.findings.length > 0) {
    throw new CliError('That scan has no fingerprints to baseline.', {
      hint: 'Re-run `sirius scan .` — older scan caches did not record them.',
    });
  }

  const commit = flags.commit ?? currentCommit();
  const baseline = saveBaseline(found.root, commit || null, fingerprints);

  process.stdout.write(
    `Baseline set${baseline.commit_sha ? ` at ${baseline.commit_sha.slice(0, 12)}` : ''} ` +
      `(${baseline.fingerprints.length} finding${baseline.fingerprints.length === 1 ? '' : 's'})\n`,
  );
  if (missing > 0) process.stdout.write(`  ${missing} finding(s) had no fingerprint and were skipped\n`);
  process.stdout.write(`  ${baselinePath(found.root)}\n`);
  process.stdout.write('Findings present here now report baseline_state=unchanged.\n');
  process.stdout.write('Gate only on what is new with:  sirius scan . --fail-on new\n');
}

/** `suppress <rule>` against the file beside the project. */
async function localSuppress(
  ruleId: string,
  reason: string,
  expiresAt: string | null,
  pathGlob: string | undefined,
  root: string,
): Promise<void> {
  const { addSuppression, suppressionsPath } = await import('../engine/store.js');
  const { localRule } = await import('../engine/catalog.js');

  // Catch a typo now rather than at the next scan, when the finding it was
  // meant to silence turns up anyway and nobody knows why.
  if (!localRule(ruleId, VERSION)) {
    throw new CliError(`No rule "${ruleId}" in the local engine.`, {
      hint: 'Run `sirius rules list` to see them.',
    });
  }

  addSuppression(root, {
    rule_id: ruleId.toUpperCase(),
    ...(pathGlob ? { path_glob: pathGlob } : {}),
    reason,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });

  process.stdout.write(`Suppressed ${ruleId.toUpperCase()}${pathGlob ? ` in ${pathGlob}` : ''}\n`);
  process.stdout.write(`  reason:  ${reason}\n`);
  process.stdout.write(
    expiresAt
      ? `  expires: ${expiresAt}\n`
      : '  expires: never — consider --expires so this gets revisited\n',
  );
  process.stdout.write(`  ${suppressionsPath(root)}\n`);
  process.stdout.write('Commit this file: an exception to a security finding belongs in review.\n');
}
