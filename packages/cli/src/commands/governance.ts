/**
 * `sirius report`, `badge`, `suppress`, `baseline`.
 *
 * Three of these hit endpoints the contract marks session/JWT-only while the
 * CLI authenticates with a Bearer API key — the K/S contradiction recorded in
 * docs/decisions.md. They are implemented against the contract as written; if
 * the `auto` owner does not widen those endpoints to accept API keys, they will
 * work interactively and fail in CI.
 */

import { writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig, findProjectRoot } from '../config/load.js';
import { loadLastScan } from '../session.js';

interface GlobalFlags {
  apiUrl?: string;
  project?: string;
  profile?: string;
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

// ---- report ---------------------------------------------------------------

export async function runReport(
  scanId: string | undefined,
  flags: { format?: string; output?: string },
  globals: GlobalFlags,
): Promise<void> {
  const format = (flags.format ?? 'json') as 'pdf' | 'json' | 'sarif';
  if (!['pdf', 'json', 'sarif'].includes(format)) {
    throw new CliError(`Unknown report format "${format}".`, { hint: 'Expected pdf, json, or sarif.' });
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
  flags: { reason?: string; expires?: string; path?: string },
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
  flags: { commit?: string; scan?: string },
  globals: GlobalFlags,
): Promise<void> {
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
