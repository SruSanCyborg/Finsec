/**
 * Replay and the plain renderer, driven by the real demo fixture.
 *
 * These are the tests that would catch the fixture and the renderer drifting
 * apart from the PRD's mockup — the totals asserted here are the ones printed
 * on stage.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { deriveWsUrl, replayStream } from '../src/api/stream.js';
import { evaluateGate } from '../src/gate.js';
import { renderFindingLine, renderPlainReport } from '../src/render/plain.js';
import type { Finding, Severity, WsFrame } from '../src/domain.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO_ROOT, 'contract', 'fixtures', 'demo.jsonl');

async function drain(): Promise<WsFrame[]> {
  const frames: WsFrame[] = [];
  // speed 0 replays instantly; the delays exist for the demo, not for tests.
  for await (const frame of replayStream(FIXTURE, 0)) frames.push(frame);
  return frames;
}

describe('deriveWsUrl', () => {
  it('upgrades the scheme', () => {
    expect(deriveWsUrl('http://localhost:4010')).toBe('ws://localhost:4010');
    expect(deriveWsUrl('https://api.finsec.dev/api/v1')).toBe('wss://api.finsec.dev/api/v1');
  });

  it('prefers an explicit override, since the mock splits REST and WS ports', () => {
    expect(deriveWsUrl('http://localhost:4010', 'http://localhost:4011')).toBe('ws://localhost:4011');
  });

  it('drops trailing slashes so the path does not double up', () => {
    expect(deriveWsUrl('http://localhost:4010/')).toBe('ws://localhost:4010');
  });
});

describe('the demo fixture', () => {
  it('exists — regenerate with `pnpm fixtures` if this fails', () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });

  it('exercises all six frame types', async () => {
    const types = new Set((await drain()).map((f) => f.type));
    expect([...types].sort()).toEqual(
      ['error', 'file.scanning', 'finding', 'progress', 'scan.completed', 'scan.started'].sort(),
    );
  });

  it('reproduces the mockup totals exactly', async () => {
    const frames = await drain();
    const completed = frames.find((f) => f.type === 'scan.completed');

    expect(completed).toBeDefined();
    expect((completed as any).counts).toEqual({ critical: 2, high: 5, medium: 9, low: 3, info: 0 });
    expect((completed as any).money_at_risk_inr).toBe(5_120_000);
    expect((completed as any).compliance_score).toBe(72.5);
  });

  it('streams exactly one finding per planted vulnerability', async () => {
    const findings = (await drain()).filter((f) => f.type === 'finding');
    expect(findings).toHaveLength(19);
    // Duplicate file entries in the timeline once caused findings to replay twice.
    expect(new Set(findings.map((f: any) => f.finding.id)).size).toBe(19);
  });

  it('carries the demo hero finding with its column, validity, and rupee figure', async () => {
    const frames = await drain();
    const hero = frames.find((f) => f.type === 'finding' && (f as any).finding.rule_id === 'FIN-SEC-001') as any;

    expect(hero.finding).toMatchObject({
      file: 'src/config.py',
      line: 14,
      col: 14,
      severity: 'critical',
      validity: 'verified_live',
      money_at_risk_inr: 4_200_000,
    });
    // A full key must never cross the wire, even a fake one.
    expect(hero.finding.snippet).toContain('…');
  });

  it('gates to exit 1 under the default policy', async () => {
    const findings = (await drain())
      .filter((f): f is Extract<WsFrame, { type: 'finding' }> => f.type === 'finding')
      .map((f) => f.finding);

    const gate = evaluateGate({ findings, severityThreshold: 'high', failOn: 'all' });
    expect(gate.blocked).toBe(true);
    expect(gate.exitCode).toBe(1);
    expect(gate.triggering).toHaveLength(7);
  });
});

describe('plain renderer', () => {
  it('renders one grep-friendly line per finding', () => {
    const line = renderFindingLine({
      id: 'f1',
      file: 'src/config.py',
      line: 14,
      severity: 'critical',
      rule_id: 'FIN-SEC-001',
      category: 'secrets',
      message: 'Hardcoded Stripe secret key',
      compliance_ref: ['PCI-DSS:8.6.2', 'DPDP:8'],
      validity: 'verified_live',
      money_at_risk_inr: 4_200_000,
    } as Finding);

    expect(line).toBe(
      'CRITICAL FIN-SEC-001 src/config.py:14 Hardcoded Stripe secret key ' +
        '[PCI-DSS:8.6.2, DPDP:8] (VERIFIED LIVE, ₹42,00,000 at risk)',
    );
  });

  it('emits no ANSI escapes', async () => {
    const findings = (await drain())
      .filter((f): f is Extract<WsFrame, { type: 'finding' }> => f.type === 'finding')
      .map((f) => f.finding);

    const counts: Partial<Record<Severity, number>> = { critical: 2, high: 5, medium: 9, low: 3 };
    const report = renderPlainReport({
      outcome: {
        findings,
        counts,
        complianceScore: 72.5,
        moneyAtRisk: 5_120_000,
        serverExitCode: 1,
        errors: [],
      },
      gate: evaluateGate({ findings, severityThreshold: 'high', failOn: 'all' }),
      counts,
    });

    // eslint-disable-next-line no-control-regex
    expect(report).not.toMatch(/\x1b\[/);
    expect(report).toContain('Money@risk: ₹51,20,000');
    expect(report).toContain('Compliance: 72/100');
    expect(report).toContain('-> BLOCKED (exit 1)');
  });

  it('sorts most severe first so output is stable regardless of arrival order', async () => {
    const findings = (await drain())
      .filter((f): f is Extract<WsFrame, { type: 'finding' }> => f.type === 'finding')
      .map((f) => f.finding);

    const report = renderPlainReport({
      outcome: { findings, counts: {}, complianceScore: null, moneyAtRisk: null, serverExitCode: null, errors: [] },
      gate: evaluateGate({ findings, severityThreshold: 'high', failOn: 'all' }),
      counts: { critical: 2, high: 5, medium: 9, low: 3 },
    });

    const severities = report
      .split('\n')
      .filter((l) => /^(CRITICAL|HIGH|MEDIUM|LOW)/.test(l))
      .map((l) => l.split(' ')[0]);

    expect(severities.slice(0, 2)).toEqual(['CRITICAL', 'CRITICAL']);
    expect(severities.at(-1)).toBe('LOW');
  });
});
