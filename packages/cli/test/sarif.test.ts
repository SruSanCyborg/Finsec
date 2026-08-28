/**
 * SARIF output. The interesting part is the severity collapse (decisions.md
 * D-006), because it is a judgement call the PRD leaves open and GitHub's
 * Security tab depends on it.
 */

import { describe, expect, it } from 'vitest';

import { buildSarif, sarifLevel } from '../src/render/sarif.js';
import type { Finding } from '../src/domain.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    file: 'src/config.py',
    line: 14,
    severity: 'critical',
    rule_id: 'FIN-SEC-001',
    category: 'secrets',
    message: 'Hardcoded Stripe secret key',
    compliance_ref: ['PCI-DSS:8.6.2'],
    fingerprint: 'fp_1',
    baseline_state: 'new',
    ...overrides,
  } as Finding;
}

describe('severity → SARIF level', () => {
  it.each([
    ['critical', 'error'],
    ['high', 'error'],
    ['medium', 'warning'],
    ['low', 'note'],
    ['info', 'note'],
  ] as const)('%s maps to %s', (severity, level) => {
    expect(sarifLevel(severity)).toBe(level);
  });
});

describe('buildSarif', () => {
  const sarif = buildSarif(
    [
      finding(),
      finding({ id: 'f2', rule_id: 'FIN-SEC-030', severity: 'high', baseline_state: 'unchanged' }),
      finding({ id: 'f3', rule_id: 'FIN-SEC-050', severity: 'medium' }),
      finding({ id: 'f4', rule_id: 'FIN-SEC-060', severity: 'low', suppressed: true }),
    ],
    { toolVersion: '0.4.0' },
  ) as any;

  it('declares SARIF 2.1.0', () => {
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
  });

  it('emits one rule per distinct finsec rule', () => {
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(4);
    expect(sarif.runs[0].tool.driver.rules[0].id).toBe('FIN-SEC-001');
  });

  it('carries baselineState through unchanged — SARIF already uses our tokens', () => {
    const states = sarif.runs[0].results.map((r: any) => r.baselineState);
    expect(states).toEqual(['new', 'unchanged', 'new', 'new']);
  });

  it('exposes the fingerprint as a partialFingerprint so GitHub can track findings', () => {
    expect(sarif.runs[0].results[0].partialFingerprints.finsecFingerprint).toBe('fp_1');
  });

  it('marks suppressed findings as suppressed rather than dropping them', () => {
    expect(sarif.runs[0].results[3].suppressions).toHaveLength(1);
    expect(sarif.runs[0].results[0].suppressions).toBeUndefined();
  });

  it('sets security-severity so GitHub buckets alerts correctly', () => {
    expect(sarif.runs[0].tool.driver.rules[0].properties['security-severity']).toBe('9.5');
  });

  it('locates findings by file and line', () => {
    const region = sarif.runs[0].results[0].locations[0].physicalLocation;
    expect(region.artifactLocation.uri).toBe('src/config.py');
    expect(region.region.startLine).toBe(14);
  });
});
