/**
 * Indian digit grouping. The PRD's mockup shows ₹42,00,000 — lakh grouping —
 * and a Western-grouped figure on stage would undercut the India-relevance
 * argument the whole pitch is built on.
 */

import { describe, expect, it } from 'vitest';

import { formatInr, formatInrCompact, formatInrOrDash, sumInr } from '../src/money.js';

describe('formatInr', () => {
  it.each([
    [4_200_000, '₹42,00,000'],
    [5_120_000, '₹51,20,000'],
    [100_000, '₹1,00,000'],
    [1_00_00_000, '₹1,00,00,000'],
    [999, '₹999'],
    [1_000, '₹1,000'],
    [10_000, '₹10,000'],
    [0, '₹0'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatInr(input)).toBe(expected);
  });

  it('groups the last three digits, then in twos — not Western thousands', () => {
    expect(formatInr(4_200_000)).not.toBe('₹4,200,000');
  });

  it('returns empty string for absent amounts', () => {
    expect(formatInr(null)).toBe('');
    expect(formatInr(undefined)).toBe('');
    expect(formatInr(Number.NaN)).toBe('');
  });

  it('renders a dash when asked for a placeholder', () => {
    expect(formatInrOrDash(null)).toBe('—');
    expect(formatInrOrDash(4_200_000)).toBe('₹42,00,000');
  });
});

describe('formatInrCompact', () => {
  it.each([
    [4_200_000, '₹42L'],
    [51_200_000, '₹5.1Cr'],
    [1_00_00_000, '₹1Cr'],
    [5_000, '₹5K'],
    [999, '₹999'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatInrCompact(input)).toBe(expected);
  });
});

describe('sumInr', () => {
  it('totals the demo fixture to the mockup figure', () => {
    expect(sumInr([4_200_000, 350_000, 400_000, 90_000, 80_000])).toBe(5_120_000);
    expect(formatInr(sumInr([4_200_000, 350_000, 400_000, 90_000, 80_000]))).toBe('₹51,20,000');
  });

  it('treats missing amounts as zero', () => {
    expect(sumInr([100, null, undefined, 200])).toBe(300);
  });
});
