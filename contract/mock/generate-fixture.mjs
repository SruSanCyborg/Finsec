#!/usr/bin/env node
/**
 * Generates the canonical demo frame timeline: contract/fixtures/demo.jsonl
 *
 * One fixture format, three consumers — the WebSocket mock server, the CLI's
 * `--replay` flag, and the deterministic streaming tests. Each line is one
 * `WsFrame` from contract/openapi.yaml, prefixed with a `delay_ms` field the
 * replayers honor and the schema ignores.
 *
 * The totals here deliberately reproduce the PRD's ANSI mockup exactly:
 *   2 critical / 5 high / 9 medium / 3 low, ₹51,20,000, score 72.5, exit 1.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'contract', 'fixtures', 'demo.jsonl');

const SCAN_ID = '7f3c1e88-4a2b-4f10-9c55-2b6d0a1e9f44';
const TOTAL_FILES = 128;

/** Deterministic UUIDs so snapshots stay stable across regeneration. */
const fid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * The three findings the mockup renders in full, plus the remainder that make
 * the footer counters add up. `col` points at the offending token so the CLI
 * can align its `╰──` underline (see decisions.md D-005).
 */
const FINDINGS = [
  {
    rule_id: 'SIR-SEC-001', severity: 'critical', category: 'secrets',
    // col 14 is the opening quote of the literal, so the `╰──` elbow lands
    // under the secret rather than partway through it.
    file: 'src/config.py', line: 14, col: 14,
    message: 'Hardcoded Stripe secret key',
    compliance_ref: ['PCI-DSS:8.6.2', 'DPDP:8'],
    snippet: 'STRIPE_KEY = "sk_live_51H8xR2eZv…"',
    validity: 'verified_live', money_at_risk_inr: 4_200_000,
    fix_action: 'env_lookup',
  },
  {
    rule_id: 'SIR-SEC-010', severity: 'critical', category: 'injection',
    file: 'src/ledger.py', line: 88, col: 17,
    message: 'SQL built with string formatting',
    compliance_ref: ['PCI-DSS:6.2.4', 'CWE-89'],
    snippet: 'cur.execute("SELECT * FROM txns WHERE id = %s" % uid)',
    fix_action: 'parameterize_query',
  },
  {
    rule_id: 'SIR-SEC-030', severity: 'high', category: 'logging',
    file: 'src/webhooks.py', line: 52, col: 22,
    message: 'PAN written to application log',
    compliance_ref: ['PCI-DSS:3.4.1', 'GDPR:Art.5'],
    snippet: 'log.info("charge for card %s", card.number)',
    fix_action: 'redact_pii_log',
  },
  {
    rule_id: 'SIR-SEC-021', severity: 'high', category: 'auth',
    file: 'src/auth.py', line: 31, col: 24,
    message: 'JWT decoded without signature verification',
    compliance_ref: ['PCI-DSS:8.4.2', 'RBI-DPSC'],
    snippet: 'jwt.decode(token, verify=False)',
    money_at_risk_inr: 350_000, fix_action: 'enforce_jwt_verify',
  },
  {
    rule_id: 'SIR-SEC-031', severity: 'high', category: 'pii',
    file: 'src/models/card.py', line: 19, col: 5,
    message: 'Full PAN stored unmasked',
    compliance_ref: ['PCI-DSS:3.5.1', 'RBI-DPSC'],
    snippet: 'pan = Column(String(19))',
    money_at_risk_inr: 400_000, fix_action: 'tokenize_pan',
  },
  {
    rule_id: 'SIR-SEC-041', severity: 'high', category: 'crypto',
    file: 'src/client.py', line: 12, col: 15,
    message: 'Cardholder data sent over plain HTTP',
    compliance_ref: ['PCI-DSS:4.2.1', 'RBI-DPSC'],
    snippet: 'BASE_URL = "http://payments.internal/v1"',
    money_at_risk_inr: 90_000, fix_action: 'enforce_tls',
  },
  {
    rule_id: 'SIR-SEC-002', severity: 'high', category: 'secrets',
    file: 'src/settings.py', line: 7, col: 14,
    message: 'High-entropy string in configuration',
    compliance_ref: ['PCI-DSS:8.6.2', 'DPDP:8'],
    snippet: 'WEBHOOK_SECRET = "whsec_9Jq2LmT4…"',
    validity: 'inactive', money_at_risk_inr: 80_000, fix_action: 'env_lookup',
  },
];

// Nine medium and three low findings, spread across the tree. They never render
// as cards in the demo but they must exist for the footer counters to be true.
const FILLER = [
  ['SIR-SEC-050', 'medium', 'ratelimit', 'src/api/transfer.py', 44, 'Money-movement endpoint without a rate limit', ['PCI-DSS:6.2.4'], 'add_rate_limit'],
  ['SIR-SEC-051', 'medium', 'ratelimit', 'src/api/transfer.py', 61, 'Money POST without an idempotency key', [], 'add_idempotency_key'],
  ['SIR-SEC-050', 'medium', 'ratelimit', 'src/api/payout.py', 28, 'Money-movement endpoint without a rate limit', ['PCI-DSS:6.2.4'], 'add_rate_limit'],
  ['SIR-SEC-051', 'medium', 'ratelimit', 'src/api/payout.py', 39, 'Money POST without an idempotency key', [], 'add_idempotency_key'],
  ['SIR-SEC-051', 'medium', 'ratelimit', 'src/api/refund.py', 22, 'Money POST without an idempotency key', [], 'add_idempotency_key'],
  ['SIR-SEC-040', 'medium', 'crypto', 'src/util/hash.py', 9, 'Weak hash algorithm (MD5)', ['PCI-DSS:6.2.4'], 'upgrade_crypto'],
  ['SIR-SEC-040', 'medium', 'crypto', 'src/util/token.py', 15, 'Static initialization vector', ['PCI-DSS:3.6.1'], 'upgrade_crypto'],
  ['SIR-SEC-020', 'medium', 'auth', 'src/api/admin.py', 12, 'Route missing an auth decorator', ['PCI-DSS:8.4.2'], 'add_auth_decorator'],
  ['SIR-SEC-020', 'medium', 'auth', 'src/api/reports.py', 8, 'Route missing an auth decorator', ['PCI-DSS:8.4.2'], 'add_auth_decorator'],
  ['SIR-SEC-060', 'low', 'supplychain', 'requirements.txt', 14, 'Dependency runs an install script', ['PCI-DSS:6.3.2'], 'pin_or_remove_dep'],
  ['SIR-SEC-060', 'low', 'supplychain', 'requirements.txt', 21, 'Dependency pinned to a floating range', ['PCI-DSS:6.3.2'], 'pin_or_remove_dep'],
  ['SIR-SEC-002', 'low', 'secrets', 'tests/fixtures/sample.json', 3, 'High-entropy string in test fixture', ['PCI-DSS:8.6.2'], 'env_lookup'],
].map(([rule_id, severity, category, file, line, message, compliance_ref, fix_action]) => ({
  rule_id, severity, category, file, line, col: 5, message, compliance_ref, fix_action,
  snippet: null,
}));

const ALL = [...FINDINGS, ...FILLER].map((f, i) => ({
  id: fid(i + 1),
  scan_id: SCAN_ID,
  end_line: null,
  fingerprint: `fp_${f.rule_id.toLowerCase()}_${i + 1}`,
  baseline_state: 'new',
  validity: f.validity ?? (f.category === 'secrets' ? 'unknown' : null),
  money_at_risk_inr: f.money_at_risk_inr ?? null,
  suppressed: false,
  ...f,
}));

const counts = ALL.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {});
const money = ALL.reduce((sum, f) => sum + (f.money_at_risk_inr ?? 0), 0);

// The files the progress bar walks. Every file appears exactly once — several
// findings share a file, and a duplicated entry would replay their findings
// twice. Files with findings come first so the demo's cards appear early.
const FILES_WITH_FINDINGS = [...new Set(ALL.map((f) => f.file))];
const FILE_LIST = [
  ...FILES_WITH_FINDINGS,
  ...Array.from(
    { length: TOTAL_FILES - FILES_WITH_FINDINGS.length },
    (_, i) => `src/pkg${Math.floor(i / 12)}/module_${i}.py`,
  ),
];

const frames = [];
const push = (delay_ms, frame) => frames.push({ delay_ms, ...frame });

push(0, { type: 'scan.started', scan_id: SCAN_ID, total_files: TOTAL_FILES, ts: '2026-08-16T15:04:05Z' });

let emitted = 0;
FILE_LIST.forEach((path, i) => {
  push(28, { type: 'file.scanning', path, index: i + 1, total: TOTAL_FILES });
  for (const f of ALL.filter((x) => x.file === path)) {
    emitted += 1;
    push(90, { type: 'finding', finding: f });
  }
  if ((i + 1) % 16 === 0) {
    push(10, { type: 'progress', scanned: i + 1, total: TOTAL_FILES, findings_so_far: emitted });
  }
});

// One non-fatal parse error, so clients are forced to handle the branch.
push(20, { type: 'error', code: 'SIRIUS_ERR_PARSE', path: 'src/vendor/minified.js', detail: 'Unsupported syntax; file skipped' });

push(150, {
  type: 'scan.completed',
  compliance_score: 72.5,
  money_at_risk_inr: money,
  counts: { critical: counts.critical ?? 0, high: counts.high ?? 0, medium: counts.medium ?? 0, low: counts.low ?? 0, info: 0 },
  exit_code: 1,
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, frames.map((f) => JSON.stringify(f)).join('\n') + '\n');

console.log(`wrote ${frames.length} frames → contract/fixtures/demo.jsonl`);
console.log(`  findings: ${ALL.length} (${JSON.stringify(counts)})`);
console.log(`  money at risk: ₹${new Intl.NumberFormat('en-IN').format(money)}`);

if (money !== 5_120_000) {
  console.error(`\n  ⚠ money total is ₹${new Intl.NumberFormat('en-IN').format(money)}, the mockup shows ₹51,20,000`);
  process.exitCode = 1;
}
