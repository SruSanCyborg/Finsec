/**
 * `sirius scan [path]` — the demo centerpiece.
 *
 * Shape of the command: resolve config, decide where frames come from (the API
 * or a recorded fixture), consume the stream, compute the gate locally, and
 * emit whichever representation was asked for. Rendering is a pure function of
 * the collected findings, so the rich, plain, JSON, and SARIF views are four
 * views over one model rather than four code paths.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { render } from 'ink';
import React from 'react';

import { ApiClient } from '../api/client.js';
import { CliError, NoTargetError } from '../api/errors.js';
import { openStream, replayStream } from '../api/stream.js';
import { loadConfig, findProjectRoot } from '../config/load.js';
import { evaluateGate } from '../gate.js';
import { ExitCode } from '../domain.js';
import { buildJsonEnvelope } from '../render/json.js';
import { renderFindingLine, renderPlainReport } from '../render/plain.js';
import type { RenderOptions } from '../render/plain.js';
import { buildSarif } from '../render/sarif.js';
import { saveLastScan, toCached } from '../session.js';
import { ScanView, countBySeverity } from '../ui/ScanView.js';
import { detectCapabilities, glyphsFor } from '../ui/theme.js';
import type { ScanOutcome } from '../ui/ScanView.js';
import type { FailOn, Severity, WsFrame } from '../domain.js';

const VERSION = '0.4.0';

interface ScanFlags {
  diff?: boolean;
  baseline?: string;
  severityThreshold?: Severity;
  failOn?: FailOn;
  config?: string;
  ruleset?: string[];
  json?: boolean;
  sarif?: string;
  validateSecrets?: boolean;
  report?: string;
  replay?: string;
  maxFindings?: number;
}

interface GlobalFlags {
  apiUrl?: string;
  wsUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

/**
 * A scan needs something to scan. An empty or missing directory is exit 3
 * ("no supported target found"), not a crash and not a clean pass.
 */
function assertTarget(path: string): string {
  const target = isAbsolute(path) ? path : resolve(process.cwd(), path);

  if (!existsSync(target)) {
    throw new NoTargetError(`No such path: ${path}`, 'Pass a directory or file that exists.');
  }

  const stats = statSync(target);
  if (stats.isFile()) return dirname(target);

  return target;
}

export async function runScan(path: string, flags: ScanFlags, globals: GlobalFlags): Promise<void> {
  const target = assertTarget(path);

  // Only --json has to own stdout. --sarif writes to a file, so the rich view
  // can still render alongside it — which is what the CI beat of the demo wants:
  // a human-readable scan that also drops a SARIF artifact.
  const machineMode = Boolean(flags.json);
  const capabilities = detectCapabilities({
    noColor: globals.color === false,
    machineMode,
  });
  const glyphs = glyphsFor(capabilities);

  const config = loadConfig({
    cwd: target,
    overrides: {
      apiUrl: globals.apiUrl,
      wsUrl: globals.wsUrl,
      projectId: globals.project,
      profile: globals.profile,
      configFile: flags.config,
      rulesets: flags.ruleset,
      severityThreshold: flags.severityThreshold,
      failOn: flags.failOn,
      validateSecrets: flags.validateSecrets,
      diffAware: flags.diff,
      baselineCommit: flags.baseline,
    },
  });

  const client = new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });

  // ---- decide where frames come from

  let frames: AsyncIterable<WsFrame>;
  let scanId: string | null = null;
  let fallbackReason: string | undefined;

  if (flags.replay) {
    const fixture = isAbsolute(flags.replay) ? flags.replay : resolve(process.cwd(), flags.replay);
    if (!existsSync(fixture)) {
      throw new CliError(`Replay fixture not found: ${flags.replay}`, {
        hint: 'Generate one with `pnpm fixtures`.',
      });
    }
    const speed = process.env.SIRIUS_REPLAY_SPEED ? Number(process.env.SIRIUS_REPLAY_SPEED) : 1;
    frames = replayStream(fixture, Number.isFinite(speed) ? speed : 1);
  } else {
    if (!config.projectId) {
      throw new CliError('No project id configured.', {
        hint: 'Run `sirius init`, pass --project <id>, or set SIRIUS_PROJECT_ID.',
      });
    }

    const scan = await client.createScan({
      project_id: config.projectId,
      source: 'upload',
      rulesets: config.rulesets,
      validate_secrets: config.validateSecrets,
      diff_aware: config.diffAware,
      ...(config.baselineCommit ? { baseline_commit: config.baselineCommit } : {}),
      severity_threshold: config.severityThreshold,
      fail_on: config.failOn,
    });

    if (!scan.id) throw new CliError('The API accepted the scan but returned no scan id.');
    scanId = scan.id;

    frames = openStream({
      scanId: scan.id,
      baseUrl: config.apiUrl,
      wsUrl: config.wsUrl,
      apiKey: config.apiKey,
      client,
      onFallback: (reason) => {
        fallbackReason = reason;
      },
    });
  }

  const computeGate = (outcome: ScanOutcome) =>
    evaluateGate({
      findings: outcome.findings,
      severityThreshold: config.severityThreshold,
      failOn: config.failOn,
      policy: config.policy,
      complianceScore: outcome.complianceScore,
    });

  // ---- consume

  const outcome = capabilities.tty
    ? await renderInteractive({ frames, config, glyphs, capabilities, computeGate, flags })
    : await collect(frames, {
        stream: process.env.SIRIUS_STREAM_PLAIN === '1',
        render: lineRenderOptions(capabilities),
      });

  const gate = computeGate(outcome);

  // The polling fallback loses per-finding streaming, so backfill from /results.
  if (fallbackReason && scanId && outcome.findings.length === 0) {
    outcome.findings = await client.getAllResults(scanId);
  }

  // ---- emit

  if (flags.sarif) {
    const sarifPath = isAbsolute(flags.sarif) ? flags.sarif : resolve(process.cwd(), flags.sarif);
    mkdirSync(dirname(sarifPath), { recursive: true });
    writeFileSync(sarifPath, JSON.stringify(buildSarif(outcome.findings, { toolVersion: VERSION }), null, 2) + '\n');
    if (!flags.json) process.stderr.write(`SARIF written to ${flags.sarif}\n`);
  }

  if (flags.json) {
    const envelope = buildJsonEnvelope(scanId, outcome, gate, {
      severityThreshold: config.severityThreshold,
      failOn: config.failOn,
    });
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  } else if (!capabilities.tty) {
    const counts =
      Object.keys(outcome.counts).length > 0 ? outcome.counts : countBySeverity(outcome.findings);
    // Findings were already streamed line by line in that mode; printing the
    // full report again would duplicate every one of them.
    process.stdout.write(
      renderPlainReport({
        outcome,
        gate,
        counts,
        findingsAlreadyPrinted: process.env.SIRIUS_STREAM_PLAIN === '1',
        options: lineRenderOptions(capabilities),
      }),
    );
  }

  if (fallbackReason && !flags.json) {
    process.stderr.write(`note: live stream unavailable (${fallbackReason}); polled for status instead\n`);
  }

  // D-002: the server also proposes an exit code. Ours wins, but a mismatch is
  // worth surfacing — it means the client and server disagree about the gate.
  if (
    outcome.serverExitCode !== null &&
    outcome.serverExitCode !== gate.exitCode &&
    process.env.SIRIUS_DEBUG
  ) {
    process.stderr.write(
      `note: server proposed exit ${outcome.serverExitCode}, local gate computed ${gate.exitCode}\n`,
    );
  }

  // ---- remember, so `sirius fix SIR-SEC-001` can resolve a rule id later

  if (outcome.findings.length > 0) {
    const root = findProjectRoot(target)?.dir ?? target;
    try {
      saveLastScan(root, {
        scan_id: scanId ?? 'replay',
        project_id: config.projectId ?? null,
        root,
        findings: outcome.findings.map(toCached),
      });
    } catch {
      // A read-only working tree should not fail an otherwise good scan.
    }
  }

  process.exitCode = gate.exitCode;
}

/** Renders the live Ink view and resolves once the stream is finished. */
function renderInteractive(args: {
  frames: AsyncIterable<WsFrame>;
  config: ReturnType<typeof loadConfig>;
  glyphs: ReturnType<typeof glyphsFor>;
  capabilities: ReturnType<typeof detectCapabilities>;
  computeGate: (outcome: ScanOutcome) => ReturnType<typeof evaluateGate>;
  flags: ScanFlags;
}): Promise<ScanOutcome> {
  const { frames, config, glyphs, capabilities, computeGate, flags } = args;

  return new Promise<ScanOutcome>((resolvePromise, rejectPromise) => {
    let settled = false;

    const instance = render(
      <ScanView
        frames={frames}
        version={VERSION}
        project={config.projectId ? shortId(config.projectId) : undefined}
        ruleset={config.rulesets[0]}
        glyphs={glyphs}
        capabilities={capabilities}
        maxFindings={flags.maxFindings}
        computeGate={computeGate}
        onDone={(outcome, error) => {
          if (settled) return;
          settled = true;
          if (error) rejectPromise(error);
          else resolvePromise(outcome);
        }}
      />,
    );

    instance.waitUntilExit().then(() => {
      if (!settled) {
        settled = true;
        rejectPromise(new CliError('Scan ended before producing a result.', { exitCode: ExitCode.CLI_ERROR }));
      }
    });
  });
}

/** Consume a stream headlessly, for pipes and machine modes. */
async function collect(
  frames: AsyncIterable<WsFrame>,
  options: { stream?: boolean; render?: RenderOptions } = {},
): Promise<ScanOutcome> {
  const outcome: ScanOutcome = {
    findings: [],
    counts: {},
    complianceScore: null,
    moneyAtRisk: null,
    serverExitCode: null,
    errors: [],
  };

  for await (const frame of frames) {
    switch (frame.type) {
      case 'finding':
        outcome.findings.push(frame.finding);
        // The full-screen shell captures this pipe and renders each line into
        // its transcript as it arrives, so findings still stream in live rather
        // than appearing all at once when the scan ends.
        if (options.stream) process.stdout.write(renderFindingLine(frame.finding, options.render) + '\n');
        break;
      case 'error':
        outcome.errors.push({ code: frame.code, path: frame.path, detail: frame.detail });
        break;
      case 'scan.completed':
        outcome.counts = (frame.counts ?? {}) as Partial<Record<Severity, number>>;
        outcome.complianceScore = frame.compliance_score ?? null;
        outcome.moneyAtRisk = frame.money_at_risk_inr ?? null;
        outcome.serverExitCode = frame.exit_code ?? null;
        break;
    }
  }

  return outcome;
}

/**
 * Line-renderer settings.
 *
 * When the full-screen shell captures this output it is not a TTY, so the width
 * has to be handed over explicitly — `SIRIUS_WIDTH` — or every line would be
 * composed for a default 80 columns and then wrapped by the transcript.
 */
function lineRenderOptions(capabilities: ReturnType<typeof detectCapabilities>): RenderOptions {
  const declared = Number.parseInt(process.env.SIRIUS_WIDTH ?? '', 10);
  return {
    color: capabilities.color,
    unicode: capabilities.unicode,
    width: Number.isFinite(declared) && declared > 20 ? declared : capabilities.width,
  };
}

/** UUIDs make a poor banner subtitle; show a recognizable stub. */
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
