/**
 * The PDF writer, and the parts of a PDF that have to be exactly right.
 *
 * `report --format pdf` used to answer "PDF reports need the hosted renderer",
 * which was the last thing in the CLI that needed a backend. It never needed
 * one: a PDF is a text format with a byte-offset table at the end, and the
 * fourteen base fonts are in every conforming reader, so a text document needs
 * no embedding and no rasteriser.
 *
 * Most of a PDF is forgiving. Two things are not, and both fail as "the file
 * opens but is empty" rather than as an error:
 *
 *   the xref offsets   a reader seeks by them instead of scanning
 *   string escaping    an unescaped `)` ends the literal early and every
 *                      object after it is garbage
 *
 * So those are what is asserted here, along with the one substitution the
 * encoding forces on us.
 */

import { describe, expect, it } from 'vitest';

import { RULE, measure, renderPdf, wrapToWidth } from '../src/engine/pdf.js';
import { reportToPdf } from '../src/engine/report-pdf.js';

const read = (pdf: Buffer): string => pdf.toString('latin1');

/** Every `(…) Tj` in the file — what a reader would actually draw. */
function textRuns(pdf: Buffer): string[] {
  return [...read(pdf).matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((match) =>
    (match[1] as string).replace(/\\([()\\])/g, '$1'),
  );
}

describe('the file a reader has to parse', () => {
  const pdf = renderPdf([{ text: 'Hello', size: 12 }, RULE, { text: 'World' }], { title: 'probe' });

  it('starts with a version header and ends with the trailer', () => {
    const text = read(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('records a byte offset for every object, and each one lands on that object', () => {
    // The check that separates a PDF from a text file with the right extension.
    // A reader seeks straight to these offsets; if they are computed after the
    // fact rather than taken while writing, the file opens blank.
    const text = read(pdf);
    const table = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text);
    expect(table).not.toBeNull();

    const entries = (table![2] as string).trim().split('\n');
    expect(entries).toHaveLength(Number(table![1]));

    // Entry zero is the free-list head; the rest must point at "N 0 obj".
    entries.slice(1).forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + 20)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
  });

  it('declares a page count matching the pages it wrote', () => {
    const declared = Number(/\/Type \/Pages \/Count (\d+)/.exec(read(pdf))![1]);
    const actual = [...read(pdf).matchAll(/\/Type \/Page[^s]/g)].length;
    expect(declared).toBe(actual);
  });

  it('breaks onto a second page rather than off the bottom of the first', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ text: `line ${i}` }));
    const long = renderPdf(many, { title: 'long' });
    expect(Number(/\/Type \/Pages \/Count (\d+)/.exec(read(long))![1])).toBeGreaterThan(1);
  });
});

describe('escaping, which fails silently when it is wrong', () => {
  it('keeps parentheses and backslashes from ending the string early', () => {
    const pdf = renderPdf([{ text: 'a (nested) case \\ here' }], { title: 't' });
    expect(textRuns(pdf)).toEqual(['a (nested) case \\ here']);
    // And the object structure survived it.
    expect(read(pdf)).toContain('endobj');
  });

  it('writes the rupee as Rs. rather than guessing at a glyph', () => {
    // WinAnsiEncoding has no ₹. Substituting a similar-looking character would
    // quietly change a currency symbol in a signed compliance document.
    const pdf = renderPdf([{ text: '₹42,00,000 at risk' }], { title: 't' });
    expect(textRuns(pdf)[0]).toBe('Rs.42,00,000 at risk');
  });

  it('replaces characters the encoding cannot carry instead of emitting them', () => {
    const pdf = renderPdf([{ text: 'em—dash and a 漢 character' }], { title: 't' });
    const run = textRuns(pdf)[0] as string;
    expect(run).toContain('em-dash');
    expect(run).toContain('?');
    // Every byte in the file stays inside latin-1, or a reader mis-maps it.
    expect([...read(pdf)].every((c) => c.charCodeAt(0) <= 255)).toBe(true);
  });
});

describe('layout', () => {
  it('wraps to the width it is given', () => {
    const lines = wrapToWidth('one two three four five six seven eight nine ten', 60, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(60);
  });

  it('measures bold as wider than regular', () => {
    expect(measure('Compliance', 10, true)).toBeGreaterThan(measure('Compliance', 10, false));
  });
});

describe('the compliance report itself', () => {
  const document = {
    scan_id: 'local-9dbc06228217',
    scanned_at: '2026-08-27T10:24:47.981Z',
    root: '/repo',
    source: 'local',
    tool: { name: 'sirius', version: '0.4.0' },
    summary: {
      findings: 2,
      counts: { critical: 1, medium: 1 },
      money_at_risk_inr: 8_930_000,
      compliance_score: 60,
      files_scanned: 3,
    },
    compliance_refs: ['PCI-DSS:8.6.2', 'RBI-DPSC'],
    findings: [
      {
        rule_id: 'SIR-SEC-050',
        severity: 'medium',
        file: 'src/webhooks.py',
        line: 38,
        message: 'Money-movement endpoint without a rate limit',
        compliance_ref: ['PCI-DSS:6.2.4'],
        money_at_risk_inr: 250_000,
      },
      {
        rule_id: 'SIR-SEC-001',
        severity: 'critical',
        file: 'src/config.py',
        line: 14,
        message: 'Hardcoded Stripe secret key',
        compliance_ref: ['PCI-DSS:8.6.2'],
        money_at_risk_inr: 4_200_000,
      },
    ],
    attestation: {
      algorithm: 'ed25519',
      key_id: '6947844440ba90c4',
      signed_at: '2026-08-27T10:24:48.130Z',
      payload_sha256: 'abc123',
    },
  };

  const runs = textRuns(reportToPdf(document));
  const joined = runs.join('\n');

  it('leads with the numbers somebody signs off against', () => {
    expect(joined).toContain('Compliance score  60/100');
    expect(joined).toContain('Money at risk  Rs.89,30,000');
    expect(joined).toContain('2 findings across 3 files');
  });

  it('keeps Indian digit grouping', () => {
    // 89,30,000 — not 8,930,000. The symbol changes in this encoding; the
    // grouping is a convention the document still owes the reader.
    expect(joined).toContain('Rs.89,30,000');
    expect(joined).not.toContain('8,930,000');
  });

  it('names the clauses, which are why it is a compliance report', () => {
    expect(joined).toContain('Clauses engaged');
    expect(joined).toContain('PCI-DSS:8.6.2');
  });

  it('orders findings by severity, not by the order they were found', () => {
    expect(joined.indexOf('CRITICAL   SIR-SEC-001')).toBeLessThan(joined.indexOf('MEDIUM   SIR-SEC-050'));
  });

  it('says the money is an estimate on the page carrying the money', () => {
    expect(joined).toContain('order-of-magnitude estimate');
  });

  it('says what the signature does and does not cover', () => {
    // The PDF is not the signed artefact. A compliance document that implies
    // otherwise is worse than one with no signature line at all.
    expect(joined).toContain('signature covers the report payload, not this PDF');
    expect(joined).toContain('6947844440ba90c4');
  });
});
