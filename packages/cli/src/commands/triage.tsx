/**
 * `sirius triage` — review a scan's findings interactively.
 *
 * Distinct from `fix`: fix changes code, triage records a human judgement about
 * whether a finding matters. The two meet at `f`, which prints the fix command
 * rather than launching it — nesting one full-screen Ink app inside another is
 * a reliable way to corrupt the terminal.
 */

import { render } from 'ink';
import React from 'react';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig, findProjectRoot } from '../config/load.js';
import { loadLastScan } from '../session.js';
import { TriageView } from '../ui/TriageView.js';
import { detectCapabilities, glyphsFor } from '../ui/theme.js';
import type { TriageSummary } from '../ui/TriageView.js';
import type { Finding, TriageState } from '../domain.js';

interface TriageFlags {
  scan?: string;
  severity?: string;
  all?: boolean;
}

interface GlobalFlags {
  apiUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

export async function runTriage(flags: TriageFlags, globals: GlobalFlags): Promise<void> {
  const capabilities = detectCapabilities({ noColor: globals.color === false });

  // Both halves matter. stdout being a terminal is not enough: if stdin is a
  // pipe, the keypresses this screen waits for can never arrive and it would
  // hang forever instead of failing.
  if (!capabilities.tty || !process.stdin.isTTY) {
    throw new CliError('`sirius triage` needs an interactive terminal.', {
      hint: !capabilities.tty
        ? 'Use `sirius scan . --json` in a pipeline instead.'
        : 'stdin is not a terminal — triage cannot read keypresses.',
    });
  }

  const cwd = process.cwd();
  const root = findProjectRoot(cwd)?.dir ?? cwd;

  let scanId = flags.scan;
  if (!scanId) {
    const cache = loadLastScan(root);
    if (!cache) {
      throw new CliError('No scan id given and no recent scan to fall back on.', {
        hint: 'Run `sirius scan .` first, or pass --scan <id>.',
      });
    }
    if (cache.scan_id === 'replay') {
      throw new CliError('The last scan was a replay, so there is nothing on the server to triage.', {
        hint: 'Run `sirius scan .` against a real API first.',
      });
    }
    scanId = cache.scan_id;
  }

  const config = loadConfig({
    cwd: root,
    overrides: { apiUrl: globals.apiUrl, projectId: globals.project, profile: globals.profile },
  });
  const client = new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });

  const findings = await client.getAllResults(scanId, {
    ...(flags.severity ? { severity: flags.severity } : {}),
    // Suppressed findings are hidden by default — they have already been judged.
    ...(flags.all ? { include_suppressed: true } : {}),
  });

  if (findings.length === 0) {
    process.stdout.write('Nothing to triage — this scan has no findings.\n');
    return;
  }

  const summary = await renderTriage({
    findings,
    client,
    scanId,
    capabilities,
    glyphs: glyphsFor(capabilities),
  });

  const parts = [
    summary.accepted ? `${summary.accepted} accepted` : undefined,
    summary.dismissed ? `${summary.dismissed} dismissed` : undefined,
    summary.suppressed ? `${summary.suppressed} suppressed` : undefined,
  ].filter(Boolean);

  process.stdout.write(
    parts.length > 0
      ? `Triaged: ${parts.join(', ')}. ${summary.remaining} still open.\n`
      : `Nothing triaged. ${summary.remaining} still open.\n`,
  );

  // A decision the server rejected is worse than no decision, because the user
  // believes it was recorded. Surface it and fail.
  if (summary.failed > 0) {
    throw new CliError(`${summary.failed} decision(s) could not be saved.`, {
      hint: 'Check your connection and re-run `sirius triage`.',
    });
  }
}

function renderTriage(args: {
  findings: Finding[];
  client: ApiClient;
  scanId: string;
  capabilities: ReturnType<typeof detectCapabilities>;
  glyphs: ReturnType<typeof glyphsFor>;
}): Promise<TriageSummary> {
  const { findings, client, scanId, capabilities, glyphs } = args;

  return new Promise<TriageSummary>((resolvePromise) => {
    let settled = false;

    const instance = render(
      <TriageView
        findings={findings}
        glyphs={glyphs}
        capabilities={capabilities}
        onDecide={async (finding, state: TriageState, reason) => {
          await client.triageFinding(scanId, finding.id, {
            triage_state: state,
            ...(reason ? { reason } : {}),
          });
        }}
        onQuit={(summary) => {
          if (settled) return;
          settled = true;
          resolvePromise(summary);
        }}
      />,
    );

    instance.waitUntilExit().then(() => {
      if (!settled) {
        settled = true;
        resolvePromise({ accepted: 0, dismissed: 0, suppressed: 0, remaining: findings.length, failed: 0 });
      }
    });
  });
}
