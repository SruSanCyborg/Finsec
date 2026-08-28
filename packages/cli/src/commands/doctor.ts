/**
 * `sirius doctor` — preflight.
 *
 * Written for the five minutes before a live demo, when the questions are
 * "is the backend up", "which key am I actually using", and "will this
 * terminal draw ₹ and box characters". Every check answers one of those and
 * says where the answer came from, because a config value from the wrong layer
 * is the failure mode that wastes the most time.
 */

import { WebSocket } from 'ws';

import { ApiClient } from '../api/client.js';
import { deriveWsUrl } from '../api/stream.js';
import { loadConfig, configTomlPath, findProjectRoot, loadIgnorePatterns } from '../config/load.js';
import { maskKey } from '../config/write.js';
import { loadLastScan } from '../session.js';
import { detectCapabilities, glyphsFor } from '../ui/theme.js';
import { nativeSelectionKey } from '../ui/screen.js';

interface GlobalFlags {
  apiUrl?: string;
  wsUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

type Status = 'ok' | 'warn' | 'fail';

interface Check {
  status: Status;
  label: string;
  detail: string;
  hint?: string;
}

export async function runDoctor(_flags: unknown, globals: GlobalFlags): Promise<void> {
  const cwd = process.cwd();
  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const glyphs = glyphsFor(capabilities);
  const checks: Check[] = [];

  // ---- config

  const project = findProjectRoot(cwd);
  checks.push(
    project
      ? { status: 'ok', label: 'project config', detail: project.file }
      : {
          status: 'warn',
          label: 'project config',
          detail: 'no sirius.yaml found',
          hint: 'Run `sirius init` to create one.',
        },
  );

  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig({
      cwd,
      overrides: {
        apiUrl: globals.apiUrl,
        wsUrl: globals.wsUrl,
        projectId: globals.project,
        profile: globals.profile,
      },
    });
  } catch (error) {
    process.stdout.write(`\n  config could not be loaded: ${error instanceof Error ? error.message : String(error)}\n\n`);
    process.exitCode = 2;
    return;
  }

  const from = (key: string) => (config.sources[key] ? ` (from ${config.sources[key]})` : ' (default)');

  checks.push({ status: 'ok', label: 'api url', detail: `${config.apiUrl}${from('apiUrl')}` });

  checks.push(
    config.apiKey
      ? { status: 'ok', label: 'credentials', detail: `${maskKey(config.apiKey)}${from('apiKey')}` }
      : {
          status: 'fail',
          label: 'credentials',
          detail: 'no API key',
          hint: `Run \`sirius login\`, set SIRIUS_API_KEY, or add one to ${configTomlPath()}.`,
        },
  );

  checks.push(
    config.projectId
      ? { status: 'ok', label: 'project id', detail: `${config.projectId}${from('projectId')}` }
      : {
          status: 'fail',
          label: 'project id',
          detail: 'not set',
          hint: 'Run `sirius init --project <id>`, or set SIRIUS_PROJECT_ID.',
        },
  );

  checks.push({
    status: 'ok',
    label: 'gate',
    detail: `severity≥${config.severityThreshold}, fail-on=${config.failOn}`,
  });

  const ignores = loadIgnorePatterns(project?.dir ?? cwd);
  if (ignores.length > 0) {
    checks.push({ status: 'ok', label: 'ignore rules', detail: `${ignores.length} pattern(s) in .siriusignore` });
  }

  // ---- connectivity

  const client = new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey, timeoutMs: 8000 });
  try {
    const health = await client.health();
    checks.push({
      status: 'ok',
      label: 'api reachable',
      detail: `${health.status ?? 'ok'}${health.version ? ` · v${health.version}` : ''}`,
    });
  } catch (error) {
    checks.push({
      status: 'fail',
      label: 'api reachable',
      detail: error instanceof Error ? error.message : String(error),
      hint: 'Start the backend, or run `pnpm mock` for the local one.',
    });
  }

  // The WebSocket is the demo's most fragile dependency, so probe it directly
  // rather than discovering it is down mid-scan.
  const wsOrigin = deriveWsUrl(config.apiUrl, config.wsUrl);
  checks.push(await probeWebSocket(wsOrigin, config.apiKey));

  // ---- terminal

  const glyphMode = capabilities.unicode ? 'unicode' : 'ascii';
  checks.push({
    status: capabilities.unicode ? 'ok' : 'warn',
    label: 'terminal',
    detail: `${capabilities.width} cols · ${capabilities.color ? 'color' : 'no color'} · ${glyphMode}`,
    ...(capabilities.unicode
      ? {}
      : { hint: 'Box drawing and ₹ will use ASCII fallbacks. Check LANG is a UTF-8 locale.' }),
  });

  // Mouse capture used to be the sharpest friction point: while the shell holds
  // the mouse, the terminal's own click-drag selection stops working, and people
  // reasonably read that as a broken terminal. The shell now draws the selection
  // itself and copies on release, so both halves work — but say which clipboard
  // tool will be used, because a missing one turns copying into a silent no-op.
  const { mouseReportingAvailable } = await import('../ui/screen.js');
  const { clipboardAvailable } = await import('../ui/clipboard.js');
  checks.push(
    mouseReportingAvailable()
      ? {
          status: clipboardAvailable() ? 'ok' : 'warn',
          label: 'mouse',
          detail: clipboardAvailable()
            ? 'wheel scrolls · drag selects and copies on release'
            : 'wheel scrolls · drag selects, but no clipboard tool to copy into',
          ...(clipboardAvailable()
            ? {}
            : {
                hint:
                  'Install xclip (X11) or wl-clipboard (Wayland) to make drag-to-copy work. ' +
                  `Hold ${nativeSelectionKey()} for the terminal's own selection either way.`,
              }),
        }
      : {
          status: 'ok',
          label: 'mouse',
          detail: 'wheel scrolls via alternate scroll; click and drag stay native',
          hint:
            'If the wheel does nothing, your terminal lacks alternate scroll — ' +
            'use the arrows, or SIRIUS_MOUSE=1 to capture it (costs selection).',
        },
  );

  // Render the glyphs that carry the demo, so a font problem is visible now.
  const sample = `${glyphs.severity.critical} ${glyphs.elbow} ${glyphs.warning} ${glyphs.rupee}42,00,000 ${glyphs.barLeftCap}${glyphs.barFull.repeat(4)}${glyphs.barRightCap} ${glyphs.check}`;
  checks.push({ status: 'ok', label: 'glyphs', detail: sample });

  if (capabilities.width < 70) {
    checks.push({
      status: 'warn',
      label: 'width',
      detail: `${capabilities.width} columns is narrow`,
      hint: 'Findings drop to a compact layout below ~70 columns. Widen before demoing.',
    });
  }

  // ---- state

  const cache = loadLastScan(project?.dir ?? cwd);
  if (cache) {
    checks.push({
      status: cache.scan_id === 'replay' ? 'warn' : 'ok',
      label: 'last scan',
      detail:
        cache.scan_id === 'replay'
          ? `replay, ${cache.findings.length} findings — fix and triage need a real scan`
          : `${cache.scan_id.slice(0, 8)} · ${cache.findings.length} findings · ${cache.scanned_at}`,
    });
  }

  // ---- report

  const width = Math.max(...checks.map((c) => c.label.length));
  const mark: Record<Status, string> = {
    ok: capabilities.unicode ? '✓' : 'ok  ',
    warn: capabilities.unicode ? '!' : 'warn',
    fail: capabilities.unicode ? '✗' : 'FAIL',
  };

  process.stdout.write('\n');
  for (const check of checks) {
    process.stdout.write(`  ${mark[check.status]}  ${check.label.padEnd(width)}  ${check.detail}\n`);
    if (check.hint) process.stdout.write(`     ${' '.repeat(width)}  ${check.hint}\n`);
  }

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  process.stdout.write(
    failed > 0
      ? `\n  ${plural(failed, 'problem', 'problems')} would stop a scan.\n\n`
      : warned > 0
        ? `\n  Ready, with ${plural(warned, 'thing', 'things')} worth knowing.\n\n`
        : '\n  Ready.\n\n',
  );

  if (failed > 0) process.exitCode = 2;
}

/** Opens the scan stream endpoint just far enough to learn whether it answers. */
function probeWebSocket(origin: string, apiKey: string | undefined): Promise<Check> {
  return new Promise<Check>((resolve) => {
    // A syntactically valid but nonexistent scan id: we are testing the
    // transport and the credentials, not fetching a real scan.
    const url = `${origin}/api/v1/scans/00000000-0000-4000-8000-000000000000/stream`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(url, apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {});
    } catch (error) {
      resolve({
        status: 'fail',
        label: 'stream reachable',
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const settle = (check: Check) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closing; nothing to do.
      }
      resolve(check);
    };

    const timer = setTimeout(
      () =>
        settle({
          status: 'warn',
          label: 'stream reachable',
          detail: `${origin} did not respond in 5s`,
          hint: 'Scans will fall back to polling. Consider --replay for the demo.',
        }),
      5000,
    );

    socket.on('open', () => settle({ status: 'ok', label: 'stream reachable', detail: origin }));

    socket.on('close', (code) => {
      if (code === 4401) {
        settle({
          status: 'fail',
          label: 'stream reachable',
          detail: 'credentials rejected (4401)',
          hint: 'Run `sirius login` — the REST key and the stream key must match.',
        });
      }
    });

    socket.on('error', (error) =>
      settle({
        status: 'fail',
        label: 'stream reachable',
        // A refused connection often arrives with an empty message; saying
        // "unreachable" beats printing a dangling dash.
        detail: error.message ? `${origin} — ${error.message}` : `${origin} unreachable`,
        hint: 'Scans will fall back to polling. `pnpm mock` serves this on :4011.',
      }),
    );
  });
}
