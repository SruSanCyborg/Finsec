#!/usr/bin/env node
/**
 * Smoke-tests the mock backend. Run `pnpm mock` in another shell first.
 *
 * Checks the handful of behaviors every client depends on: the 202 + scan_id
 * handshake, the RFC-7807 envelope, WebSocket auth rejection with close code
 * 4401, and a complete frame replay whose totals match the PRD's ANSI mockup.
 */

import WebSocket from 'ws';

const REST = process.env.FINSEC_API_URL ?? 'http://localhost:4010';
const WS = process.env.FINSEC_WS_URL ?? 'ws://localhost:4011';
const KEY = 'smoke-test-key';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

console.log('\nREST');

const created = await fetch(`${REST}/scans`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: '11111111-1111-4111-8111-111111111111',
    source: 'upload',
    severity_threshold: 'high',
    fail_on: 'verified-secrets',
  }),
});
const scan = await created.json();
check('POST /scans returns 202', created.status === 202, `got ${created.status}`);
check('…with a scan id', typeof scan.id === 'string' && scan.id.length > 0, scan.id);
check('…queued', scan.status === 'queued', scan.status);

const problem = await fetch(`${REST}/scans`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'code=422' },
  body: '{}',
}).then((r) => r.json());
check('422 uses the RFC-7807 envelope', 'title' in problem && 'code' in problem, problem.code);

const health = await fetch(`${REST}/healthz`).then((r) => r.json());
check('GET /healthz is public', health.status === 'ok');

console.log('\nWebSocket');

const streamUrl = `${WS}/api/v1/scans/${scan.id}/stream`;

const unauth = await new Promise((resolve) => {
  const ws = new WebSocket(streamUrl);
  ws.on('close', (code) => resolve(code));
  ws.on('error', () => {});
});
check('unauthenticated upgrade closes 4401', unauth === 4401, `got ${unauth}`);

const seen = {};
let firstFindingMs = null;
let completed = null;
let startedScanId = null;
const t0 = Date.now();

await new Promise((resolve, reject) => {
  const ws = new WebSocket(streamUrl, { headers: { Authorization: `Bearer ${KEY}` } });
  const timer = setTimeout(() => { ws.terminate(); reject(new Error('stream timed out after 60s')); }, 60_000);
  ws.on('message', (buf) => {
    const frame = JSON.parse(buf);
    seen[frame.type] = (seen[frame.type] ?? 0) + 1;
    if (frame.type === 'scan.started') startedScanId = frame.scan_id;
    if (frame.type === 'finding' && firstFindingMs === null) firstFindingMs = Date.now() - t0;
    if (frame.type === 'scan.completed') completed = frame;
  });
  ws.on('close', () => { clearTimeout(timer); resolve(); });
  ws.on('error', (err) => { clearTimeout(timer); reject(err); });
});

const elapsed = Date.now() - t0;

check('scan.started echoes the requested scan id', startedScanId === scan.id);
check('all six frame types are exercised',
  ['scan.started', 'file.scanning', 'finding', 'progress', 'scan.completed', 'error'].every((t) => seen[t] > 0),
  JSON.stringify(seen));
check('19 findings streamed', seen.finding === 19, `got ${seen.finding}`);
check('counts match the mockup', JSON.stringify(completed?.counts) === JSON.stringify({ critical: 2, high: 5, medium: 9, low: 3, info: 0 }), JSON.stringify(completed?.counts));
check('money at risk is ₹51,20,000', completed?.money_at_risk_inr === 5_120_000, `₹${new Intl.NumberFormat('en-IN').format(completed?.money_at_risk_inr ?? 0)}`);
check('compliance score is 72.5', completed?.compliance_score === 72.5);
check('server proposes exit code 1', completed?.exit_code === 1);

console.log('\nTiming');
check('time-to-first-finding under 10s', firstFindingMs !== null && firstFindingMs < 10_000, `${firstFindingMs}ms`);
console.log(`  · full replay took ${(elapsed / 1000).toFixed(1)}s`);

console.log(failures === 0 ? '\nmock backend OK\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
