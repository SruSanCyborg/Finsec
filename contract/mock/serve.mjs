#!/usr/bin/env node
/**
 * Runs both halves of the mock backend together:
 *   - Prism serving REST from contract/openapi.yaml on :4010
 *   - the WebSocket frame replayer on :4011
 *
 * Point the CLI at it with SIRIUS_API_URL=http://localhost:4010.
 */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REST_PORT = process.env.REST_PORT ?? '4010';
const WS_PORT = process.env.WS_PORT ?? '4011';

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
