/**
 * `sirius scan [path]` — the demo centerpiece.
 *
 * Shape of the command: resolve config, decide where frames come from (the API
 * or a recorded fixture), consume the stream, compute the gate locally, and
 * emit whichever representation was asked for. Rendering is a pure function of
 * the collected findings, so the rich, plain, JSON, and SARIF views are four
 * views over one model rather than four code paths.
 */

/** Pause between blocks of the threat report, so each one is readable as it lands. */
const TAIL_PACE_MS = 420;

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { render } from 'ink';
import React from 'react';

import { ApiClient } from '../api/client.js';
import { CliError, NoTargetError } from '../api/errors.js';
import { openStream, replayStream } from '../api/stream.js';
import { loadConfig, findProjectRoot, loadIgnorePatterns } from '../config/load.js';
import { evaluateGate } from '../gate.js';
import { ExitCode } from '../domain.js';
import { buildJsonEnvelope } from '../render/json.js';
import { renderFinding, renderFindingDetail, renderFindingList, renderPlainReport } from '../render/plain.js';
import type { RenderOptions } from '../render/plain.js';
import { buildSarif } from '../render/sarif.js';
import { saveLastScan, toCached } from '../session.js';
import { asciiRequested, plural, toAscii } from '../ui/kit.js';
import { ScanView, countBySeverity } from '../ui/ScanView.js';
import { detectCapabilities, glyphsFor } from '../ui/theme.js';
import type { ScanOutcome } from '../ui/ScanView.js';
import type { FailOn, Severity, WsFrame } from '../domain.js';

const VERSION = '0.4.0';

interface ScanFlags {
  local?: boolean;
  threat?: boolean;
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

/**
 * Writes plain output, transliterated when `SIRIUS_ASCII=1` asked for it.
 *
 * The glyph table covers drawing characters, but prose punctuation never went
 * near it, so the projector fallback left `—`, `…`, `§` and `≥` on screen. The
 * threat stage and every paced surface get this through `writePaced`; these two
 * writes are the ones that bypass it.
 */
function writePlain(text: string): void {
  process.stdout.write(asciiRequested() ? toAscii(text) : text);
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
  let scanSource = '';
  let scanId: string | null = null;
  let fallbackReason: string | undefined;
  // Only the local engine paces: a hosted scan is already spaced out by the
  // network, and a replay carries its own recorded timing.
  let interactivePacing = false;
  let policy: import('../engine/policy.js').PolicyOutcome | undefined;
  // How many rules this scan ran, for the banner. Only the local engine knows;
  // a hosted scan or a replay is not ours to count, and the banner omits the
  // `(N rules)` clause rather than printing a number it made up.
  let ruleCount: number | undefined;

  // The local engine is the default. It needs no backend, and it is what makes
  // `sirius scan .` an actual scanner rather than a client for one — the Core
  // API is an option for teams that want history and policy, not a requirement
  // for detection.
  const useLocalEngine = flags.local === true || (!flags.replay && !config.projectId);

  if (flags.replay) {
    const fixture = isAbsolute(flags.replay) ? flags.replay : resolve(process.cwd(), flags.replay);
    if (!existsSync(fixture)) {
      throw new CliError(`Replay fixture not found: ${flags.replay}`, {
        hint: 'Generate one with `pnpm fixtures`.',
      });
    }
    const speed = process.env.SIRIUS_REPLAY_SPEED ? Number(process.env.SIRIUS_REPLAY_SPEED) : 1;
    frames = replayStream(fixture, Number.isFinite(speed) ? speed : 1);
    scanSource = `replay · ${flags.replay} (recorded, not a live analysis)`;
  } else if (useLocalEngine) {
    const { scanDirectory } = await import('../engine/scanner.js');
    const { pace, resolvePace } = await import('../engine/pace.js');

    // Paced, because the engine is faster than a terminal can paint. Without
    // this a small repo emits every frame in one tick, the viewport repaints
    // once, and the findings and summary are never shown at all — the screen
    // jumps straight to whatever landed last. Off for machine output and
    // non-TTYs; see engine/pace.ts.
    interactivePacing =
      !machineMode &&
      !flags.sarif &&
      (process.env.SIRIUS_STREAM_PLAIN === '1' || Boolean(process.stdout.isTTY));

    // `rulesets:` was written into every scaffolded sirius.yaml and read by
    // nobody: the engine ran all twelve rules whatever it said. Narrowing a
    // scan and getting the full catalogue anyway is a quiet way to mistrust the
    // config file.
    const { rulesFor } = await import('../engine/catalog.js');
    const { RULES } = await import('../engine/rules.js');
    let rules;
    try {
      rules = rulesFor(config.rulesets);
    } catch (failure) {
      throw new CliError(failure instanceof Error ? failure.message : String(failure), {
        hint: 'Set `rulesets:` in sirius.yaml, or pass --ruleset.',
      });
    }

    ruleCount = rules.length;

    // Nothing to scan is not a clean bill of health.
    //
    // A directory holding no supported file used to stream zero findings and
    // land on `Compliance 100/100 · PASSED`, exit 0 — a perfect score for a
    // scan that opened nothing. Point CI at the wrong subdirectory and it goes
    // green, which is the one answer a security tool must never give by
    // accident. `NoTargetError`'s own docstring already claimed to cover "an
    // empty directory"; only the missing-path branch ever raised it.
    //
    // Checked here rather than after the stream, so no score is computed and
    // no verdict is rendered over a scan that never happened.
    const { collectFiles } = await import('../engine/scanner.js');
    const { SUPPORTED_EXTENSIONS } = await import('../engine/parse.js');
    const ignorePatterns = [...config.exclude, ...loadIgnorePatterns(findProjectRoot(target)?.dir ?? target)];

    if (collectFiles(target, { manifests: true, ignorePatterns }).length === 0) {
      throw new NoTargetError(
        `Nothing to scan under ${path} — no supported files found.`,
        `Looked for ${SUPPORTED_EXTENSIONS.join(' ')} and package manifests. ` +
          `Check the path, or whether .siriusignore and \`exclude:\` rule everything out.`,
      );
    }

    // Both halves counted, not written down. The catalogue grew to 13 while this
    // read `rules.length < 12`, so selecting twelve of thirteen rules narrowed
    // the scan and said nothing — the failure mode of every number kept by hand.
    if (rules.length < RULES.length && !machineMode) {
      process.stderr.write(
        `note: ${config.rulesets.join(', ')} — ${rules.length} of ${RULES.length} rules\n`,
      );
    }

    let source: AsyncIterable<WsFrame> = scanDirectory(target, {
      // `.siriusignore` as well as the config's `exclude:`. AGENTS.md documents
      // the file as one of three suppression layers and `init` writes one, but
      // nothing was reading it during a scan — only `watch` ever did.
      ignorePatterns,
      rules,
    });

    // Probing happens before the finding is rendered, so a live credential is
    // announced on its own line rather than in a footnote after every finding
    // has already scrolled past.
    if (config.validateSecrets) {
      const { validateFrames } = await import('../engine/threat.js');
      source = validateFrames(source, target);
    }

    // The project's own policy: what it has already accepted, and what it has
    // explicitly excused. Applied before rendering, so a suppressed finding is
    // never shown and then silently uncounted.
    const { applyPolicy, emptyPolicyOutcome } = await import('../engine/policy.js');
    policy = emptyPolicyOutcome();
    source = applyPolicy(source, findProjectRoot(target)?.dir ?? target, policy, {
      diffOnly: config.diffAware,
    });

    frames = pace(source, resolvePace(interactivePacing));
    scanSource = 'local engine · tree-sitter AST analysis';
  } else {
    // Unreachable in practice — a missing project id routes to the local engine
    // above — but the API needs one and the type system is right to insist.
    if (!config.projectId) {
      throw new CliError('No project id configured for a hosted scan.', {
        hint: 'Run `sirius init --project <id>`, or drop --project to scan locally.',
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
    scanSource = `api · ${config.apiUrl.replace(/^https?:\/\//, '')}`;

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
    ? await renderInteractive({ frames, config, glyphs, capabilities, computeGate, flags, ruleCount })
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
  }

  // Held back until after the threat stage. The summary is the conclusion —
  // the gate verdict, the total at risk, what was actually scanned — and it
  // used to be printed before the attack paths, which meant twenty lines of
  // threat analysis pushed it off the top of the screen. The last thing on
  // screen should be the thing the reader is meant to act on.
  const streamed = process.env.SIRIUS_STREAM_PLAIN === '1';

  // When findings were not streamed line by line, they still have to appear
  // before the threat stage — that stage reasons about them by rule id, and
  // reading it first is reading conclusions about evidence not yet shown.
  if (!flags.json && !capabilities.tty && !streamed && outcome.findings.length > 0) {
    writePlain(renderFindingList(outcome.findings, lineRenderOptions(capabilities)).join('\n') + '\n');
  }

  const printSummary = () => {
    if (flags.json || capabilities.tty) return;
    const counts =
      Object.keys(outcome.counts).length > 0 ? outcome.counts : countBySeverity(outcome.findings);
    // Findings were already streamed line by line in that mode; printing the
    // full report again would duplicate every one of them.
    writePlain(
      renderPlainReport({
        outcome,
        gate,
        counts,
        // Printed above (streamed, or listed just before the threat stage).
        findingsAlreadyPrinted: true,
        options: lineRenderOptions(capabilities),
        source: scanSource,
        target,
      }),
    );
  };

  // ---- Threat stage
  //
  // Runs after detection because it reasons *about* findings: which are
  // reachable, which are live, and how long they have been exposed.
  if (!flags.json && outcome.findings.length > 0) {
    const { buildAttackPaths, checkExposureAt, findIntroduction } = await import('../engine/threat.js');
    const { renderThreatReport } = await import('../render/threat.js');
    const { writePaced } = await import('../engine/pace.js');

    const exposure = new Map<string, { exposure: string; provider?: string; detail?: string }>();
    const provenance = new Map<string, ReturnType<typeof findIntroduction>>();

    // Archaeology only for confirmed provider keys. A high-entropy string is a
    // guess, and pickaxing history for each one produced a page of identical
    // lines that told the reader nothing.
    const secrets = outcome.findings.filter((f) => f.category === 'secrets');
    const traceable = secrets.filter((f) => f.rule_id === 'SIR-SEC-001');

    for (const finding of secrets) {
      // Opt-in only: probing uses someone else's credential against their API.
      // Already probed while streaming when the engine ran, so reuse the verdict
      // rather than asking the provider a second time about the same key.
      if (config.validateSecrets) {
        exposure.set(
          finding.id,
          finding.validity && finding.validity !== 'unknown'
            ? {
                exposure: finding.validity,
                detail: 'asked the provider during this scan',
              }
            : await checkExposureAt(resolve(target, finding.file), finding.line),
        );
      }
      // git needs a path it can resolve from the repo, not one relative to the
      // scan target, which may be several directories inside it.
      if (!traceable.includes(finding)) continue;
      const origin = findIntroduction(target, resolve(target, finding.file), finding.snippet ?? '');
      if (origin) provenance.set(finding.id, origin);
    }

    // Exposure feeds back into detection: a live key is a different finding
    // from a leaked one, and the attack paths are chained on that distinction.
    for (const finding of outcome.findings) {
      const verdict = exposure.get(finding.id);
      if (verdict?.exposure === 'verified_live') finding.validity = 'verified_live';
      else if (verdict?.exposure === 'inactive') finding.validity = 'inactive';
    }

    const threatLines = renderThreatReport(
      outcome.findings,
      {
        paths: buildAttackPaths(outcome.findings),
        provenance: provenance as Map<string, NonNullable<ReturnType<typeof findIntroduction>>>,
        exposure,
        validated: config.validateSecrets,
      },
      lineRenderOptions(capabilities),
    );

    if (threatLines.length > 0 && !capabilities.tty) {
      // Paced for the same reason the frames are: emitted in one write, the
      // whole block lands between two repaints and the reader sees only
      // whatever happened to be last.
      await writePaced(threatLines, interactivePacing ? TAIL_PACE_MS : 0);
    }
  }

  // Said out loud. Findings withheld by a suppression are still decisions the
  // reader is entitled to see, and a lapsed exception is one that needs
  // retaking rather than quietly re-firing.
  if (policy && !flags.json && !capabilities.tty) {
    if (policy.unchanged > 0) {
      process.stdout.write(
        ` ${'Baseline'.padEnd(11)}${policy.unchanged} unchanged since ` +
          `${policy.baselineCommit ? policy.baselineCommit.slice(0, 12) : 'the baseline'}\n`,
      );
    }
    if (policy.suppressed.length > 0) {
      const rules = [...new Set(policy.suppressed.map((s) => s.rule_id))].join(', ');
      process.stdout.write(` ${'Suppressed'.padEnd(11)}${plural(policy.suppressed.length, 'finding')} — ${rules}\n`);
    }
    for (const entry of policy.expired) {
      process.stdout.write(
        ` ${'Expired'.padEnd(11)}suppression for ${entry.rule_id ?? entry.path_glob} lapsed ` +
          `(${entry.expires_at}) — its findings are reported again\n`,
      );
    }
  }

  printSummary();

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
        // A local scan is a real scan and gets a real id. It used to be filed
        // as `replay`, which read as "recorded, nothing here is live" — so
        // `triage` refused to open it and `doctor` reported it as a rehearsal.
        scan_id: scanId ?? (flags.replay ? 'replay' : localScanId()),
        // So `fix` can tell a local-engine scan (fixable from source on disk)
        // from a replayed fixture (nothing real to fix).
        source: flags.replay ? 'replay' : useLocalEngine ? 'local' : 'api',
        project_id: config.projectId ?? null,
        root,
        // The headline numbers as this scan reported them, so a badge or a
        // signed report shows what the developer saw rather than a figure
        // re-derived later from a subset of the inputs.
        summary: {
          counts: outcome.counts as Record<string, number>,
          money_at_risk_inr: outcome.moneyAtRisk ?? 0,
          compliance_score: outcome.complianceScore,
          files_scanned: outcome.filesScanned ?? null,
        },
        findings: outcome.findings.map(toCached),
      });
    } catch {
      // A read-only working tree should not fail an otherwise good scan.
    }
  }

  process.exitCode = gate.exitCode;
}

/**
 * An id for a scan that no server issued.
 *
 * Prefixed rather than a bare UUID so that anything printing it — a report
 * filename, `doctor`, a support paste — says at a glance that this scan was run
 * here and has no server-side record to look up.
 */
function localScanId(): string {
  return `local-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** Renders the live Ink view and resolves once the stream is finished. */
function renderInteractive(args: {
  frames: AsyncIterable<WsFrame>;
  config: ReturnType<typeof loadConfig>;
  glyphs: ReturnType<typeof glyphsFor>;
  capabilities: ReturnType<typeof detectCapabilities>;
  computeGate: (outcome: ScanOutcome) => ReturnType<typeof evaluateGate>;
  flags: ScanFlags;
  ruleCount: number | undefined;
}): Promise<ScanOutcome> {
  const { frames, config, glyphs, capabilities, computeGate, flags, ruleCount } = args;

  return new Promise<ScanOutcome>((resolvePromise, rejectPromise) => {
    let settled = false;

    const instance = render(
      <ScanView
        frames={frames}
        version={VERSION}
        project={config.projectId ? shortId(config.projectId) : undefined}
        ruleset={config.rulesets[0]}
        ruleCount={ruleCount}
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
      case 'scan.started':
        outcome.filesScanned = frame.total_files ?? 0;
        break;
      case 'finding':
        outcome.findings.push(frame.finding);
        // The full-screen shell captures this pipe and renders each line into
        // its transcript as it arrives, so findings still stream in live rather
        // than appearing all at once when the scan ends.
        if (options.stream) {
          process.stdout.write(renderFinding(frame.finding, options.render).join('\n') + '\n');
          // Evidence, emitted always but marked so the shell can keep it folded
          // away until Ctrl+O. Sending it up front avoids re-running the scan
          // just to answer "why did you flag that?".
          for (const line of renderFindingDetail(frame.finding, options.render)) {
            process.stdout.write(`::sirius-why::${line}\n`);
          }
        }
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
