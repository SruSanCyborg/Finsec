#!/usr/bin/env node
/**
 * Runs both halves of the mock backend together:
 *   - Prism serving REST from contract/openapi.yaml on :4010
 *   - the WebSocket frame replayer on :4011
 *
 * Point the CLI at it with SIRIUS_API_URL=http://localhost:4010.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REST_PORT = process.env.REST_PORT ?? '4010';
const WS_PORT = process.env.WS_PORT ?? '4011';

/** Resolves true when nothing is listening on the port. */
function portFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(Number(port), '0.0.0.0');
  });
}

// Check both ports up front. Starting one half and having the other die leaves
// a confusing partial backend and a stack trace, which is exactly what happens
// when a previous `pnpm mock` was not shut down cleanly.
const busy = [];
for (const [name, port] of [
  ['REST', REST_PORT],
  ['WS', WS_PORT],
]) {
  if (!(await portFree(port))) busy.push({ name, port });
}

if (busy.length > 0) {
  const list = busy.map((b) => `${b.port} (${b.name})`).join(' and ');
  console.error(`\n  Port ${list} already in use — a previous mock is probably still running.\n`);
  console.error('  Stop it:');
  console.error('    pkill -f contract/mock\n');
  console.error('  Or see what is holding it:');
  console.error(`    lsof -nP ${busy.map((b) => `-iTCP:${b.port}`).join(' ')} -sTCP:LISTEN\n`);
  console.error('  Or run on different ports:');
  console.error('    REST_PORT=4020 WS_PORT=4021 pnpm mock\n');
  process.exit(1);
}

const children = [];

function run(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${name}]`;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of chunk.split('\n')) if (line.trim()) console.log(`${tag} ${line}`);
    });
  }
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`${tag} exited (${signal ?? code}) — shutting down`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('rest', 'npx', ['prism', 'mock', 'contract/openapi.yaml', '--port', REST_PORT]);
run('ws', process.execPath, ['contract/mock/ws-server.mjs'], { PORT: WS_PORT });

console.log(`
  sirius mock backend
    REST  http://localhost:${REST_PORT}
    WS    ws://localhost:${WS_PORT}/api/v1/scans/{id}/stream

  SIRIUS_API_URL=http://localhost:${REST_PORT} pnpm cli scan .
`);
