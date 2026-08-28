/**
 * Running a scan on behalf of the GUI, and streaming it.
 *
 * The pipeline here is the same one `sirius scan` builds — `scanDirectory`,
 * then optional secret validation, then the project's own policy — assembled in
 * the same order and from the same modules. That is the whole point: two
 * surfaces that compute their own numbers eventually disagree about them, and
 * the first time anyone notices is on stage. The GUI gets the CLI's figures
 * because it is the CLI's engine producing them, once.
 *
 * One deliberate difference: no pacing. `engine/pace.ts` exists because a
 * terminal repaints faster than a human reads and an unpaced scan finishes in
 * one frame with nothing legible on screen. A webview animates its own arrivals
 * and re-renders on a schedule the browser controls, so pacing here would only
 * make the GUI slower than the CLI at the same work.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { evaluateGate } from '../gate.js';
import { saveLastScan, toCached } from '../session.js';
import { saveScan } from './scans.js';
import type { StoredScan } from './scans.js';
import type { Finding, Severity, WsFrame } from '../domain.js';

export interface RunScanRequest {
  /** Directory to scan, already resolved against the daemon's root. */
  target: string;
  /** Where `.sirius/` lives — the project root, which may be above the target. */
  root: string;
  projectId: string | null;
  rulesets: string[];
  severityThreshold: Severity;
  failOn: 'all' | 'new' | 'verified-secrets';
  validateSecrets: boolean;
  diffOnly: boolean;
}

type Subscriber = (frame: WsFrame) => void;

/**
 * A scan in flight, and its frames.
 *
 * Every frame is retained and replayed to a subscriber that arrives late. The
 * GUI does `POST /scans` and then opens the WebSocket with the id it got back,
 * which is two round trips — and the engine is fast enough to finish a small
 * repo inside them. Without the replay the first scan of a fixture showed an
 * empty console and a spinner that never resolved, which is the browser's
 * version of the bug that `pnpm rehearse` was written to catch.
 */
export class RunningScan {
  readonly frames: WsFrame[] = [];
  private readonly subscribers = new Set<Subscriber>();
  private settled = false;

  constructor(readonly record: StoredScan) {}

  subscribe(fn: Subscriber): () => void {
    for (const frame of this.frames) fn(frame);
    if (this.settled) return () => undefined;
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  emit(frame: WsFrame): void {
    this.frames.push(frame);
    for (const fn of this.subscribers) {
      try {
        fn(frame);
      } catch {
        // A subscriber whose socket died mid-write must not take down the scan
        // that every other subscriber is still watching.
      }
    }
  }

  /** No further frames. Late subscribers still get the replay; nothing new arrives. */
  finish(): void {
    this.settled = true;
    this.subscribers.clear();
  }

  get done(): boolean {
    return this.settled;
  }
}

export class ScanRegistry {
  private readonly live = new Map<string, RunningScan>();
  private readonly cancelled = new Set<string>();

  get(id: string): RunningScan | undefined {
    return this.live.get(id);
  }

  cancel(id: string): boolean {
    if (!this.live.has(id)) return false;
    this.cancelled.add(id);
    return true;
  }

  isCancelled(id: string): boolean {
    return this.cancelled.has(id);
  }

  /**
   * Starts a scan and returns its record immediately.
   *
   * The scan runs on after this resolves. `POST /scans` answering only once the
   * scan had finished would make the streaming endpoint pointless — the client
   * would have every finding before it could open the socket to watch them
   * arrive.
   */
  start(request: RunScanRequest): RunningScan {
    const id = `local-${randomUUID().slice(0, 8)}`;
    const record: StoredScan = {
      schema_version: 1,
      id,
      project_id: request.projectId,
      target: resolve(request.target),
      status: 'running',
      started_at: new Date().toISOString(),
      finished_at: null,
      source: 'local',
      origin: 'gui',
      rulesets: request.rulesets,
      severity_threshold: request.severityThreshold,
      fail_on: request.failOn,
      exit_code: null,
      summary: null,
      findings: [],
    };

    const running = new RunningScan(record);
    this.live.set(id, running);

    void this.drive(running, request).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      record.status = 'failed';
      record.error = message;
      record.finished_at = new Date().toISOString();
      running.emit({ type: 'error', code: 'SIRIUS_ERR_SCAN_FAILED', detail: message });
      saveScan(request.root, record);
      running.finish();
    });

    return running;
  }

  private async drive(running: RunningScan, request: RunScanRequest): Promise<void> {
    const record = running.record;

    const { scanDirectory } = await import('../engine/scanner.js');
    const { rulesFor } = await import('../engine/catalog.js');
    const { applyPolicy, emptyPolicyOutcome } = await import('../engine/policy.js');
    const { loadIgnorePatterns } = await import('../config/load.js');

    const rules = rulesFor(request.rulesets);
    const ignorePatterns = loadIgnorePatterns(request.root);

    let source: AsyncIterable<WsFrame> = scanDirectory(record.target, { ignorePatterns, rules });

    if (request.validateSecrets) {
      const { validateFrames } = await import('../engine/threat.js');
      source = validateFrames(source, record.target);
    }

    const policy = emptyPolicyOutcome();
    source = applyPolicy(source, request.root, policy, { diffOnly: request.diffOnly });

    const findings: Finding[] = [];
    // Only `scan.started` carries it, so it is the only frame counting files —
    // the same field `sirius scan` reads for the figure in its footer.
    let filesScanned: number | null = null;

    for await (const frame of source) {
      // Checked between frames rather than by tearing the generator down, so
      // the engine closes the file it is parsing instead of being abandoned
      // holding a handle to it.
      if (this.isCancelled(record.id)) {
        record.status = 'canceled';
        record.finished_at = new Date().toISOString();
        running.emit({ type: 'scan.completed', counts: {} });
        break;
      }

      if (frame.type === 'scan.started') {
        filesScanned = frame.total_files ?? 0;
        // The client asked for a scan under an id it already holds; the engine
        // minted its own. `scan.started` is the one frame that carries an id,
        // so it is the one that has to be rewritten for the two to agree.
        running.emit({ ...frame, scan_id: record.id });
        continue;
      }

      if (frame.type === 'finding' && frame.finding) findings.push(frame.finding);

      if (frame.type === 'scan.completed') {
        const gate = evaluateGate({
          findings,
          severityThreshold: request.severityThreshold,
          failOn: request.failOn,
          complianceScore: frame.compliance_score,
        });

        record.status = 'completed';
        record.finished_at = new Date().toISOString();
        record.exit_code = gate.exitCode;
        record.summary = {
          counts: frame.counts ?? {},
          money_at_risk_inr: frame.money_at_risk_inr ?? 0,
          compliance_score: frame.compliance_score ?? null,
          files_scanned: filesScanned,
        };

        // The exit code the GUI shows is the one the CLI would have exited
        // with, computed here by the same function for the same reason it is
        // computed client-side there: a gate that is not deterministic offline
        // is not a gate. The engine's own advisory `exit_code` is overwritten.
        running.emit({ ...frame, exit_code: gate.exitCode });
        continue;
      }

      running.emit(frame);
    }

    record.findings = findings.map(toCached);
    saveScan(request.root, record);

    // Written for the CLI's benefit, not the GUI's. This is what lets someone
    // start a scan in the window and then run `sirius fix SIR-SEC-001` or
    // `sirius report` in a shell against the result they are looking at.
    if (record.status === 'completed') {
      saveLastScan(request.root, {
        scan_id: record.id,
        project_id: record.project_id,
        root: request.root,
        source: 'local',
        ...(record.summary ? { summary: record.summary } : {}),
        findings: record.findings,
      });
    }

    running.finish();
  }
}
