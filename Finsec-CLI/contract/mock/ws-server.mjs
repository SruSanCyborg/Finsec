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

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 4011);
const SPEED = Number(process.env.SPEED ?? 1);
const FIXTURE = process.env.FIXTURE ?? 'contract/fixtures/demo.jsonl';
const USE_MOCK_FIXTURE = process.env.USE_MOCK_FIXTURE === 'true';

const fixturePath = isAbsolute(FIXTURE) ? FIXTURE : join(ROOT, FIXTURE);

// Import compiled live local Tree-Sitter scanner engine
let scanDirectory = null;
try {
  const scannerModule = await import(join(ROOT, 'packages/cli/dist/engine/scanner.js'));
  scanDirectory = scannerModule.scanDirectory;
} catch (err) {
  console.warn('⚠️ Could not load live scanner module, will fall back to JSONL replayer:', err.message);
}

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

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const token = bearer || url.searchParams.get('token');
  if (!token) {
    ws.close(4401, 'missing credentials');
    return;
  }

  const scanId = url.pathname.match(/\/scans\/([^/]+)\/stream/)?.[1] ?? `local-${Date.now()}`;
  console.log(`→ stream opened for scan ${scanId}`);

  let closed = false;
  ws.on('close', () => {
    closed = true;
    console.log(`← stream closed for scan ${scanId}`);
  });

  // Execute Live Tree-Sitter AST Scanner if available and not explicitly forced to fixture mode
  if (scanDirectory && !USE_MOCK_FIXTURE) {
    const targetDir = process.env.SCAN_TARGET
      ? (isAbsolute(process.env.SCAN_TARGET) ? process.env.SCAN_TARGET : join(ROOT, process.env.SCAN_TARGET))
      : join(ROOT, 'contract/fixtures/rule-gallery');

    console.log(`🚀 [REAL ENGINE] Scanning target directory with Tree-Sitter AST engine: ${targetDir}`);

    try {
      for await (const frame of scanDirectory(targetDir)) {
        if (closed || ws.readyState !== ws.OPEN) return;
        if (frame.type === 'scan.started') frame.scan_id = scanId;
        ws.send(JSON.stringify(frame));
        if (SPEED > 0) await sleep(30 * SPEED);
      }
      ws.close(1000, 'scan complete');
      return;
    } catch (err) {
      console.error('❌ Live engine scan failed:', err);
      if (!closed && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'scan.failed', scan_id: scanId, error_message: err.message }));
        ws.close(1011, err.message);
      }
      return;
    }
  }

  // Fallback to fixture JSONL replay if scanner dist is missing or fixture mode enabled
  let frames;
  try {
    frames = loadFrames();
  } catch (err) {
    ws.close(1011, err.message);
    return;
  }

  for (const { delay_ms, ...frame } of frames) {
    if (closed) return;
    if (delay_ms && SPEED > 0) await sleep(delay_ms * SPEED);
    if (closed || ws.readyState !== ws.OPEN) return;
    if (frame.type === 'scan.started') frame.scan_id = scanId;
    ws.send(JSON.stringify(frame));
  }

  ws.close(1000, 'scan complete');
});

wss.on('listening', () => {
  console.log(`ws mock  ws://localhost:${PORT}/api/v1/scans/{id}/stream`);
  console.log(`         fixture ${FIXTURE}${SPEED === 1 ? '' : ` (speed ×${SPEED})`}`);
});

// Without this, a port clash prints a twenty-line stack trace that buries the
// one fact worth knowing: something else is already listening.
wss.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use — another mock is probably still running.\n`);
    console.error(`  Find it:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
    console.error(`  Stop it:  pkill -f contract/mock`);
    console.error(`  Or use a different port:  WS_PORT=4021 pnpm mock\n`);
  } else {
    console.error(`\nWebSocket mock failed: ${error.message}\n`);
  }
  process.exit(1);
});
