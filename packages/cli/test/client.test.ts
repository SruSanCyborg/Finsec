/**
 * Pagination safety.
 *
 * A server that returns a cursor which never advances used to spin here
 * forever, and the symptom was a command that looked frozen with no error —
 * `sirius triage` hung on exactly this against the mock, because Prism returns
 * a constant `next_cursor` of "string".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../src/api/client.js';
import type { Finding } from '../src/domain.js';

const finding = (id: string): Finding =>
  ({ id, file: 'a.py', line: 1, severity: 'high', rule_id: 'SIR-SEC-001', category: 'secrets', message: 'x' }) as Finding;

function mockFetch(pages: Array<{ items: Finding[]; next_cursor?: string | null }>) {
  let call = 0;
  const spy = vi.fn(async () => {
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = () => new ApiClient({ baseUrl: 'http://test.local', apiKey: 'k' });

describe('getAllResults', () => {
  it('walks every page', async () => {
    mockFetch([
      { items: [finding('a')], next_cursor: 'p2' },
      { items: [finding('b')], next_cursor: 'p3' },
      { items: [finding('c')], next_cursor: null },
    ]);

    const all = await client().getAllResults('scan-1');
    expect(all.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('stops instead of hanging when the cursor never advances', async () => {
    // Every page returns the same cursor — the exact shape Prism produces.
    const spy = mockFetch([{ items: [finding('a')], next_cursor: 'string' }]);

    const all = await client().getAllResults('scan-1');

    // It terminates, and the repeated page does not inflate the count.
    expect(all).toHaveLength(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('de-duplicates findings that appear on more than one page', async () => {
    mockFetch([
      { items: [finding('a'), finding('b')], next_cursor: 'p2' },
      { items: [finding('b'), finding('c')], next_cursor: null },
    ]);

    const all = await client().getAllResults('scan-1');
    expect(all.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('stops on an empty page even when a cursor is still set', async () => {
    const spy = mockFetch([{ items: [], next_cursor: 'p2' }]);

    const all = await client().getAllResults('scan-1');

    expect(all).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('handles a single page with no cursor', async () => {
    const spy = mockFetch([{ items: [finding('a'), finding('b')] }]);

    const all = await client().getAllResults('scan-1');

    expect(all).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
