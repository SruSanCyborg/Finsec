/**
 * The triage screen, driven through ink-testing-library.
 *
 * Worth testing at the component level rather than end to end: the keymap and
 * the optimistic-update rollback are where the behavior actually lives, and a
 * full-screen TUI cannot be driven through a pipe.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { TriageView } from '../src/ui/TriageView.js';
import { detectCapabilities, glyphsFor } from '../src/ui/theme.js';
import type { Finding } from '../src/domain.js';

const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const glyphs = glyphsFor(capabilities);

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    file: 'src/config.py',
    line: 14,
    severity: 'critical',
    rule_id: 'SIR-SEC-001',
    category: 'secrets',
    message: 'Hardcoded Stripe secret key',
    compliance_ref: ['PCI-DSS:8.6.2'],
    ...overrides,
  } as Finding;
}

/** Ink processes input on a tick; give it one. */
const settle = () => new Promise((r) => setTimeout(r, 20));

function setup(findings: Finding[], onDecide = vi.fn().mockResolvedValue(undefined)) {
  const onQuit = vi.fn();
  const app = render(
    <TriageView
      findings={findings}
      glyphs={glyphs}
      capabilities={capabilities}
      onDecide={onDecide}
      onQuit={onQuit}
    />,
  );
  return { ...app, onDecide, onQuit };
}

describe('TriageView', () => {
  it('lists findings, most severe first', () => {
    const { lastFrame } = setup([
      finding({ id: 'a', severity: 'low', rule_id: 'SIR-SEC-060' }),
      finding({ id: 'b', severity: 'critical', rule_id: 'SIR-SEC-001' }),
    ]);

    const frame = lastFrame() ?? '';
    expect(frame.indexOf('SIR-SEC-001')).toBeLessThan(frame.indexOf('SIR-SEC-060'));
  });

  it('shows how many are still open', () => {
    const { lastFrame } = setup([finding({ id: 'a' }), finding({ id: 'b' })]);
    expect(lastFrame()).toContain('2 open');
  });

  it('accepts with `a` and does not ask for a reason', async () => {
    const { stdin, onDecide } = setup([finding()]);
    stdin.write('a');
    await settle();

    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide.mock.calls[0]?.[1]).toBe('accepted');
    expect(onDecide.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('asks for a reason before dismissing', async () => {
    const { stdin, lastFrame, onDecide } = setup([finding()]);
    stdin.write('d');
    await settle();

    expect(lastFrame()).toContain('reason for dismissed');
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('will not submit an empty reason', async () => {
    const { stdin, onDecide } = setup([finding()]);
    stdin.write('d');
    await settle();
    stdin.write('\r');
    await settle();

    expect(onDecide).not.toHaveBeenCalled();
  });

  it('submits the typed reason', async () => {
    const { stdin, onDecide } = setup([finding()]);
    stdin.write('s');
    await settle();
    stdin.write('test fixture');
    await settle();
    stdin.write('\r');
    await settle();

    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide.mock.calls[0]?.[1]).toBe('suppressed');
    expect(onDecide.mock.calls[0]?.[2]).toBe('test fixture');
  });

  it('rolls the row back when the server rejects the decision', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('offline'));
    const { stdin, lastFrame } = setup([finding()], onDecide);

    stdin.write('a');
    await settle();
    await settle();

    expect(lastFrame()).toContain('could not save');
    // Rolled back, so it is open again rather than falsely marked accepted.
    expect(lastFrame()).toContain('1 open');
  });

  it('filters with `/`', async () => {
    const { stdin, lastFrame } = setup([
      finding({ id: 'a', rule_id: 'SIR-SEC-001', file: 'src/config.py' }),
      finding({ id: 'b', rule_id: 'SIR-SEC-030', file: 'src/webhooks.py' }),
    ]);

    stdin.write('/');
    await settle();
    stdin.write('webhooks');
    await settle();

    expect(lastFrame()).toContain('SIR-SEC-030');
    expect(lastFrame()).not.toContain('SIR-SEC-001');
  });

  it('quits with `q` and reports what was decided', async () => {
    const { stdin, onQuit } = setup([finding({ id: 'a' }), finding({ id: 'b' })]);

    stdin.write('a');
    await settle();
    stdin.write('q');
    await settle();

    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(onQuit.mock.calls[0]?.[0]).toMatchObject({ accepted: 1, remaining: 1 });
  });

  it('points at the fix command rather than launching a nested app', async () => {
    const { stdin, lastFrame } = setup([finding()]);
    stdin.write('f');
    await settle();

    expect(lastFrame()).toContain('sirius fix SIR-SEC-001');
  });

  it('surfaces the money at risk on the selected finding', () => {
    const { lastFrame } = setup([finding({ money_at_risk_inr: 4_200_000, validity: 'verified_live' })]);
    expect(lastFrame()).toContain('₹42,00,000 at risk');
    expect(lastFrame()).toContain('VERIFIED LIVE');
  });
});
