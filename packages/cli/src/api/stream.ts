/**
 * Live scan stream.
 *
 * Exposes the scan as an async iterable of contract frames, from any of three
 * sources that the rest of the CLI cannot tell apart:
 *
 *   websocket  the real thing
 *   replay     a recorded JSONL timeline (`--replay`), no network at all
 *   polling    the fallback when the socket will not open
 *
 * The PRD's risk register calls WebSocket instability a demo-stage risk, so
 * replay is a first-class source rather than a test-only affordance
 * (decisions.md D-010).
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

import { CliError } from './errors.js';
import type { ApiClient } from './client.js';
import type { WsFrame } from '../domain.js';

export type FrameStream = AsyncGenerator<WsFrame, void, undefined>;

export interface StreamOptions {
  scanId: string;
  /** Base REST URL; the WebSocket URL is derived from it unless `wsUrl` is set. */
  baseUrl: string;
  /** Explicit WebSocket origin, e.g. ws://localhost:4011 for the local mock. */
  wsUrl?: string | undefined;
  apiKey: string | undefined;
  signal?: AbortSignal | undefined;
}

/** http(s):// → ws(s)://, preserving host and port. */
export function deriveWsUrl(baseUrl: string, override?: string): string {
  const origin = (override ?? baseUrl).replace(/\/+$/, '');
  return origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

/**
 * Replays a recorded timeline. `delay_ms` is honored so the demo paces like a
 * real scan; SPEED=0 in the environment makes it instant, which is what the
 * tests use.
 */
export async function* replayStream(fixturePath: string, speed = 1): FrameStream {
  const lines = createInterface({
    input: createReadStream(fixturePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  try {
    for await (const line of lines) {
      lineNo += 1;
      if (!line.trim()) continue;

      let parsed: WsFrame & { delay_ms?: number };
      try {
        parsed = JSON.parse(line);
      } catch (cause) {
        throw new CliError(`${fixturePath}:${lineNo} is not valid JSON`, {
          hint: 'Regenerate the fixture with `pnpm fixtures`.',
          cause,
        });
      }

      const { delay_ms: pause, ...frame } = parsed;
      if (pause && speed > 0) await delay(pause * speed);
      yield frame as WsFrame;
    }
  } finally {
    lines.close();
  }
}

/**
 * Opens the WebSocket and yields frames until the server closes.
 *
 * Frames are buffered in a queue rather than delivered by callback, so a slow
 * consumer (React committing state) cannot drop frames from a fast producer.
 */
export async function* websocketStream(options: StreamOptions): FrameStream {
  const origin = deriveWsUrl(options.baseUrl, options.wsUrl);
  const url = `${origin}/api/v1/scans/${encodeURIComponent(options.scanId)}/stream`;

  // D-004: Bearer on the upgrade request; ?token= exists for browsers, which
  // cannot set headers on a WebSocket handshake. Node can, so we use the header.
  const ws = new WebSocket(url, {
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
  });

  const queue: WsFrame[] = [];
  let notify: (() => void) | null = null;
  let done = false;
  let failure: Error | null = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  ws.on('message', (data) => {
    try {
      queue.push(JSON.parse(data.toString()) as WsFrame);
    } catch {
      // A malformed frame is the server's bug, not a reason to abandon the scan.
      queue.push({ type: 'error', code: 'FIN_ERR_FRAME', detail: 'Malformed frame from server' } as WsFrame);
    }
    wake();
  });

  ws.on('error', (err) => {
    failure = err;
    done = true;
    wake();
  });

  ws.on('close', (code, reason) => {
    if (code === 4401) {
      failure = new CliError('The API rejected these credentials on the scan stream.', {
        hint: 'Run `finsec login`, or set FINSEC_API_KEY.',
      });
    } else if (code !== 1000 && queue.length === 0 && !failure) {
      failure = new CliError(`Scan stream closed unexpectedly (${code}${reason ? `: ${reason}` : ''})`);
    }
    done = true;
    wake();
  });

  const abort = () => {
    done = true;
    ws.close();
    wake();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    while (true) {
      while (queue.length > 0) yield queue.shift()!;
      if (done) break;
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
    }
    // Drain anything that arrived alongside the close frame.
    while (queue.length > 0) yield queue.shift()!;
    if (failure) throw failure;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
  }
}

/**
 * Fallback when the socket will not open: poll `GET /scans/{id}` until the scan
 * reaches a terminal state, synthesizing the frames a stream would have sent.
 *
 * Findings do not arrive incrementally here — the caller fetches them from
 * `/results` once `scan.completed` lands. Honest degradation: progress is
 * coarse, but the scan still completes and the gate still works.
 */
export async function* pollingStream(client: ApiClient, scanId: string, intervalMs = 1000): FrameStream {
  yield { type: 'scan.started', scan_id: scanId, total_files: 0 } as WsFrame;

  while (true) {
    const scan = await client.getScan(scanId);

    if (scan.status === 'completed') {
      yield {
        type: 'scan.completed',
        counts: scan.counts ?? {},
        compliance_score: scan.compliance_score ?? undefined,
        money_at_risk_inr: scan.money_at_risk_inr ?? undefined,
        exit_code: scan.exit_code ?? undefined,
      } as WsFrame;
      return;
    }

    if (scan.status === 'failed' || scan.status === 'canceled') {
      throw new CliError(`Scan ${scan.status}.`, {
        hint: scan.status === 'failed' ? 'Check the scan logs on the server.' : undefined,
      });
    }

    await delay(intervalMs);
  }
}

/**
 * Opens the stream, falling back to polling if the socket cannot be established.
 *
 * The fallback is deliberately narrow: it covers a socket that never opens, not
 * one that dies mid-scan. A mid-scan reconnect would replay findings from the
 * start and double-count them, and the contract has no resume cursor to prevent
 * that (tracked as an open question in docs/cli-surface.md).
 */
export async function* openStream(
  options: StreamOptions & { client: ApiClient; onFallback?: (reason: string) => void },
): FrameStream {
  const { client, onFallback, ...streamOptions } = options;

  const stream = websocketStream(streamOptions);
  let first: IteratorResult<WsFrame>;

  try {
    first = await stream.next();
  } catch (err) {
    // Credential rejection is not a transport problem — polling would fail too.
    if (err instanceof CliError && err.message.includes('credentials')) throw err;
    onFallback?.(err instanceof Error ? err.message : String(err));
    yield* pollingStream(client, options.scanId);
    return;
  }

  if (!first.done) yield first.value;
  yield* stream;
}
