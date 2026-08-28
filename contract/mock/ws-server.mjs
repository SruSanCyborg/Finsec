#!/usr/bin/env node
/**
 * WebSocket mock for `WS /api/v1/scans/{id}/stream`.
 *
 * Prism mocks REST from the OpenAPI spec but has no WebSocket support, so this
 * replays a recorded JSONL frame timeline instead. It ignores the scan id in the
 * path — whatever id the REST mock handed out, this streams the same fixture.
 *
 *   PORT=4011 FIXTURE=contract/fixtures/demo.jsonl SPEED=1 node ws-server.mjs
 *
 * SPEED scales every delay: SPEED=0 replays instantly (for tests), SPEED=3 runs
 * three times slower (useful when rehearsing the demo).
 */

import { readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 4011);
const SPEED = Number(process.env.SPEED ?? 1);
const FIXTURE = process.env.FIXTURE ?? 'contract/fixtures/demo.jsonl';

const fixturePath = isAbsolute(FIXTURE) ? FIXTURE : join(ROOT, FIXTURE);

function loadFrames() {
  return readFileSync(fixturePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`${fixturePath}:${i + 1} is not valid JSON — ${err.message}`);
      }
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// No `path` filter: accept any /api/v1/scans/{id}/stream, whatever id the REST
// mock handed out.
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // D-004: Bearer header on the upgrade, ?token= fallback for browsers.
  // Auth failure closes with 4401, matching the PRD.
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const token = bearer || url.searchParams.get('token');
  if (!token) {
    ws.close(4401, 'missing credentials');
    return;
  }

  const scanId = url.pathname.match(/\/scans\/([^/]+)\/stream/)?.[1] ?? '(unknown)';
  console.log(`→ stream opened for scan ${scanId}`);

  let frames;
  try {
    frames = loadFrames(); // re-read per connection so edits take effect live
  } catch (err) {
    ws.close(1011, err.message);
    return;
  }

  let closed = false;
  ws.on('close', () => {
    closed = true;
    console.log(`← stream closed for scan ${scanId}`);
  });

  for (const { delay_ms, ...frame } of frames) {
    if (closed) return;
    if (delay_ms && SPEED > 0) await sleep(delay_ms * SPEED);
    if (closed || ws.readyState !== ws.OPEN) return;
    // The scan id the client asked for wins over the one baked into the fixture.
    if (frame.type === 'scan.started') frame.scan_id = scanId;
    ws.send(JSON.stringify(frame));
  }

  ws.close(1000, 'scan complete');
});

wss.on('listening', () => {
  console.log(`ws mock  ws://localhost:${PORT}/api/v1/scans/{id}/stream`);
  console.log(`         fixture ${FIXTURE}${SPEED === 1 ? '' : ` (speed ×${SPEED})`}`);
});
