/**
 * `sirius doctor` — preflight.
 *
 * Written for the five minutes before a live demo, when the questions are
 * "will a scan run", "which key am I actually using", and "will this terminal
 * draw ₹ and box characters". Every check answers one of those and says where
 * the answer came from, because a config value from the wrong layer is the
 * failure mode that wastes the most time.
 *
 * What counts as a problem depends on where the scan will run. With no project
 * configured the scan uses the local engine and needs no backend at all — so
 * doctor used to end "4 problems would stop a scan" on a machine that scans
 * perfectly well. A preflight that cries wolf gets skipped, which is worse than
 * not having one. Missing credentials are now reported for what they are, and
 * the checks that matter locally — the engine loading, and its rules firing —
 * are checked instead.
 */

import { existsSync, statSync } from 'node:fs';

import { WebSocket } from 'ws';

import { ApiClient } from '../api/client.js';
import { deriveWsUrl } from '../api/stream.js';
import { keyPath, loadOrCreateKey } from '../engine/attest.js';
import { loadConfig, configTomlPath, findProjectRoot, loadIgnorePatterns } from '../config/load.js';
import { maskKey } from '../config/write.js';
import { loadLastScan } from '../session.js';
import { detectCapabilities, glyphsFor } from '../ui/theme.js';
import { note, padVisible, visibleWidth } from '../ui/kit.js';
import { nativeSelectionKey } from '../ui/screen.js';

interface GlobalFlags {
  apiUrl?: string;
  wsUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

/** `info` states a fact that is not a problem: it never gates the summary. */
type Status = 'ok' | 'info' | 'warn' | 'fail';

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

  // ---- where

  const project = findProjectRoot(cwd);

  // First, because every other line is relative to it. A report that says "no
  // sirius.yaml found" and "92 findings" without naming the directory it looked
  // in is a report that cannot be acted on — and inside the shell, where the
  // working directory is wherever the shell was started or last `/cd`'d to,
  // that is a genuinely easy thing to lose track of.
  checks.push({
    status: 'ok',
    label: 'working dir',
    detail: cwd,
    ...(project && project.dir !== cwd
      ? { hint: `config and state come from the project root at ${project.dir}` }
      : {}),
  });

  // ---- config

  checks.push(
    project
      ? { status: 'ok', label: 'project config', detail: project.file }
      : {
          status: 'warn',
          label: 'project config',
          detail: 'no sirius.yaml found here or above',
          hint: `Run \`sirius init\` in ${cwd} to create one.`,
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

  // The same test `scan` makes: with no project id there is no hosted anything,
  // and the local engine runs. Everything below reads off this.
  const hosted = Boolean(config.projectId);

  checks.push({
    status: 'ok',
    label: 'scan mode',
    detail: hosted
      ? `hosted · ${config.apiUrl}${from('apiUrl')}`
      : 'local engine · tree-sitter AST analysis, no backend needed',
    ...(hosted ? {} : { hint: 'Add a project id to scan against the API instead.' }),
  });

  checks.push(
    config.projectId
      ? { status: 'ok', label: 'project id', detail: `${config.projectId}${from('projectId')}` }
      : { status: 'info', label: 'project id', detail: 'not set — scanning locally' },
  );

  checks.push(
    config.apiKey
      ? { status: 'ok', label: 'credentials', detail: `${maskKey(config.apiKey)}${from('apiKey')}` }
      : hosted
        ? {
            status: 'fail',
            label: 'credentials',
            detail: 'no API key, but a project is configured',
            hint: `Run \`sirius login\`, set SIRIUS_API_KEY, or add one to ${configTomlPath()}.`,
          }
        : {
            status: 'info',
            label: 'credentials',
            detail: 'no API key — not needed for a local scan',
            hint: `\`sirius login\` stores one at ${configTomlPath()} when you want hosted scans.`,
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

  // ---- the engines, which is what a local run actually depends on

  checks.push(await probeEngine(glyphs.check));
  checks.push(await probeRevenue(glyphs.check));
  checks.push(probeSigningKey());

  // ---- connectivity

  // Only when a scan would use it. Probing an API nobody configured costs
  // thirteen seconds of timeouts before a demo and reports a failure that is
  // not one.
  if (hosted) {
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
  } else {
    checks.push({
      status: 'info',
      label: 'api',
      detail: 'not contacted — nothing here needs it',
      hint: `\`rules test\` and PDF reports still do. ${config.apiUrl} is where they would go.`,
    });
  }

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

  const cacheRoot = project?.dir ?? cwd;
  const cache = loadLastScan(cacheRoot);
  if (cache) {
    const replayed = cache.source === 'replay';
    checks.push({
      status: replayed ? 'warn' : 'ok',
      label: 'last scan',
      detail: replayed
        ? `replay, ${cache.findings.length} findings — fix and triage need a real scan`
        : `${cache.scan_id.slice(0, 14)} · ${cache.source ?? 'local'} · ${cache.findings.length} findings · ${cache.scanned_at}`,
      // Which tree those findings are about. `fix` will edit files under it, so
      // "92 findings" with no address is the one number here worth pinning down.
      hint: `of ${cache.root}, read from ${cacheRoot}/.sirius/last-scan.json`,
    });
  }

  // ---- report

  const width = Math.max(...checks.map((c) => c.label.length));
  const termWidth = process.stdout.columns && process.stdout.columns > 20 ? process.stdout.columns : 80;
  const mark: Record<Status, string> = {
    ok: capabilities.unicode ? '✓' : 'ok  ',
    info: capabilities.unicode ? '·' : 'note',
    warn: capabilities.unicode ? '!' : 'warn',
    fail: capabilities.unicode ? '✗' : 'FAIL',
  };

  // Paced a check at a time when a human is watching.
  //
  // Twenty lines written in one tick scroll past the interactive shell's
  // viewport before it repaints, and the line that goes first is the working
  // directory — the one somebody running `/doctor` to ask "where is this even
  // running?" most needs to see. Off for a pipe and for CI, where the exit code
  // is the output and delay buys nothing.
  const { writeLinesPaced } = await import('../engine/pace.js');
  const perLine = process.stdout.isTTY || process.env.SIRIUS_STREAM_PLAIN === '1' ? 45 : 0;

  // Detail and hint both wrap under the label rather than running off the
  // right edge. This is the command a person runs *because* something looks
  // wrong, and its longest hint was 153 columns — the sentence explaining what
  // to do about a problem, scrolled off the side of the terminal reporting it.
  const rendered: string[] = [''];
  for (const check of checks) {
    const head = `  ${mark[check.status]}  ${padVisible(check.label, width)}  `;
    // Measured, not guessed. The status mark carries colour, so the gutter has
    // to come from the head's visible width or every continuation line sits a
    // few columns left of the text it continues.
    const gutter = visibleWidth(head);
    const room = Math.max(24, termWidth - gutter);

    const [first, ...rest] = note(check.detail, { indent: 0, width: room });
    rendered.push(head + (first ?? ''));
    for (const line of rest) rendered.push(' '.repeat(gutter) + line);

    if (check.hint) {
      for (const line of note(check.hint, { indent: gutter, width: termWidth })) rendered.push(line);
    }
  }
  await writeLinesPaced(rendered, perLine);

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const ready = hosted ? 'Ready to scan against the API.' : 'Ready to scan locally.';

  // "Ready to scan locally." and then nothing is a dead end. It is the answer
  // to a question nobody asked — what someone runs `doctor` to find out is
  // whether they can start, and the useful reply to "yes" is the command that
  // starts. Named in the form that works where they are: inside the shell that
  // is `/scan .`, from their own prompt it is `sirius scan .`.
  const inShell = process.env.SIRIUS_IN_SHELL === '1';
  const next = (command: string): string => (inShell ? `/${command}` : `sirius ${command}`);

  const steps: [string, string][] = [];
  if (failed === 0) {
    steps.push(['scan .', 'find money at risk in this code']);
    // Only worth offering once there is something to act on.
    if (cache) {
      steps.push(['triage', 'decide about what it found']);
      steps.push(['report', 'a signed report of it']);
    }
    steps.push(['revenue gen batch', 'the operations side, on synthetic data']);
  }

  const column = Math.max(...steps.map(([command]) => next(command).length), 0);
  const suggestions = steps.map(
    ([command, why]) => `      ${padVisible(next(command), column)}   ${why}`,
  );

  process.stdout.write(
    failed > 0
      ? `\n  ${plural(failed, 'problem', 'problems')} would stop a scan.\n` +
          `  Fix those first, then run ${next('doctor')} again.\n\n`
      : warned > 0
        ? `\n  ${ready} ${plural(warned, 'thing', 'things')} worth knowing.\n\n${suggestions.join('\n')}\n\n`
        : `\n  ${ready}\n\n${suggestions.join('\n')}\n\n`,
  );

  if (failed > 0) process.exitCode = 2;
}

/**
 * Runs the local engine end to end on a snippet with a known finding.
 *
 * Cheap and worth doing: the grammars are WASM loaded at runtime, so a bad
 * install fails at the first parse rather than at build time — which, before
 * this check, meant discovering it mid-demo. Asserting a rule actually fires
 * proves the whole path, not just that the module imported.
 */
async function probeEngine(check: string): Promise<Check> {
  const SAMPLE = 'STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Ctest"\n';

  try {
    const { parseSource } = await import('../engine/parse.js');
    const { RULES, runRules } = await import('../engine/rules.js');

    const parsed = await parseSource('doctor-probe.py', SAMPLE);
    if (!parsed) {
      return {
        status: 'fail',
        label: 'engine',
        detail: 'the python grammar did not load',
        hint: 'Reinstall dependencies — the tree-sitter WASM grammars are missing.',
      };
    }

    const found = runRules(parsed);
    if (found.length === 0) {
      return {
        status: 'fail',
        label: 'engine',
        detail: `${RULES.length} rules loaded, none fired on a known-bad sample`,
        hint: 'The engine parses but does not match. This build is not fit to scan with.',
      };
    }

    // Derived, not written down. This line used to be the literal string
    // "python, javascript, typescript, go" — so `doctor` advertised Go, which
    // no rule has ever declared, and kept advertising JavaScript for eleven
    // rules that silently matched nothing there. A health check that composes
    // its own good news cannot report bad news.
    const { localRules } = await import('../engine/catalog.js');

    // The supply-chain rule uses `languages` to name the manifests it reads —
    // `package.json`, `requirements.txt` — which are files, not languages. Only
    // the ones the parser actually has a grammar for are reported here; the
    // manifests are counted separately so neither claim borrows the other's
    // credibility.
    const declared = new Set(localRules('local').flatMap((rule) => rule.languages ?? []));
    const languages = [...declared].filter((each): each is string => Boolean(each) && !each.includes('.')).sort();
    const manifests = [...declared].filter((each) => Boolean(each) && each.includes('.')).length;

    return {
      status: 'ok',
      label: 'engine',
      detail:
        `${RULES.length} rules · ${languages.join(', ')}` +
        (manifests > 0 ? ` · ${manifests} manifest kinds` : '') +
        ` · self-test ${found[0]?.rule_id} ${check}`,
    };
  } catch (error) {
    return {
      status: 'fail',
      label: 'engine',
      detail: error instanceof Error ? error.message : String(error),
      hint: 'The local engine could not start, so no scan can run. Reinstall dependencies.',
    };
  }
}

/**
 * Runs the revenue detector end to end on a batch generated in memory.
 *
 * The same argument as the scan self-test: this path is only exercised when
 * somebody points the tool at a batch, so a preflight that says nothing about
 * it is a preflight that lets `revenue detect` fail on stage. Cheap enough to
 * run every time — a forty-record batch fits and scores in milliseconds.
 *
 * It asserts the holds as well as the scoring, because a detector that flags
 * everything would pass a test that only counted findings, and the holds are
 * the property this surface actually promises.
 */
async function probeRevenue(check: string): Promise<Check> {
  try {
    const { generateBatch } = await import('../revenue/synth.js');
    const { fitModel, assessBatch, isHeld } = await import('../revenue/model.js');
    const { analyzeBatch } = await import('../revenue/features.js');

    const batch = generateBatch({ seed: 'doctor-probe', payments: 120, checkouts: 30, invoices: 20 });
    const model = fitModel(batch.records, batch.truth);
    const context = analyzeBatch(batch.records);
    const { assessments } = assessBatch(batch.records, model, { context });

    const flagged = assessments.filter((assessment) => assessment.flagged).length;
    const held = assessments.filter(isHeld).length;

    if (flagged === 0) {
      return {
        status: 'fail',
        label: 'revenue engine',
        detail: 'the model fitted but flagged nothing at all',
        hint: 'Nothing would be worked on any batch. This build is not fit to run a recovery with.',
      };
    }

    if (held === 0) {
      return {
        status: 'warn',
        label: 'revenue engine',
        detail: `${flagged} records flagged, but nothing was held`,
        hint: 'Disputes and shared-signal clusters should always be held. Check the hold rules.',
      };
    }

    return {
      status: 'ok',
      label: 'revenue engine',
      detail:
        `model fits on ${model.trained_on} · ${flagged} flagged, ${held} held · ` +
        `self-test ${check}`,
    };
  } catch (error) {
    return {
      status: 'fail',
      label: 'revenue engine',
      detail: error instanceof Error ? error.message : String(error),
      hint: '`revenue` and `reconcile` cannot run. Reinstall dependencies.',
    };
  }
}

/**
 * The signing key behind every signed report and every audit trail.
 *
 * Generated on first use, so its absence is not a failure — but its *mode* is.
 * A private key at 0644 is one `cat` away from being someone else's signature,
 * and a trail signed with a key anyone could copy proves nothing about who ran
 * the agent.
 */
function probeSigningKey(): Check {
  const path = keyPath();

  if (!existsSync(path)) {
    return {
      status: 'info',
      label: 'signing key',
      detail: 'not created yet — generated on the first signed report or recovery run',
    };
  }

  try {
    const mode = statSync(path).mode & 0o777;
    const { keyId } = loadOrCreateKey(path);

    if (mode !== 0o600) {
      return {
        status: 'fail',
        label: 'signing key',
        detail: `${path} is ${mode.toString(8).padStart(3, '0')}, not 600`,
        hint: `Anyone who can read it can forge a signature. Fix with: chmod 600 ${path}`,
      };
    }

    return { status: 'ok', label: 'signing key', detail: `${keyId} · 0600 · ${path}` };
  } catch (error) {
    return {
      status: 'fail',
      label: 'signing key',
      detail: error instanceof Error ? error.message : String(error),
      hint: 'Reports and audit trails cannot be signed until this key is readable.',
    };
  }
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
