/**
 * Pacing, wrapping, and the order the report is assembled in.
 *
 * All three come from the same rehearsal bug, which a green suite did not
 * catch: the local engine emitted every frame in one tick, the shell's viewport
 * painted once, and the findings and the summary were never shown at all — the
 * screen jumped straight to the last screenful. Everything the demo is meant to
 * show was in the transcript and invisible.
 */

import { describe, expect, it } from 'vitest';

import { pace, resolvePace, writeLinesPaced, writePaced } from '../src/engine/pace.js';
import { wrapText, wrapLabelled } from '../src/wrap.js';
import { explain } from '../src/engine/exposure-model.js';
import type { WsFrame } from '../src/domain.js';

async function* frames(...types: string[]): AsyncGenerator<WsFrame> {
  for (const type of types) yield { type } as WsFrame;
}

const drain = async (source: AsyncIterable<WsFrame>) => {
  const seen: WsFrame[] = [];
  for await (const frame of source) seen.push(frame);
  return seen;
};

describe('pacing spaces frames out for a human', () => {
  it('passes every frame through unchanged', async () => {
    const seen = await drain(pace(frames('scan.started', 'finding', 'scan.completed'), { findingMs: 1 }));
    expect(seen.map((f) => f.type)).toEqual(['scan.started', 'finding', 'scan.completed']);
  });

  it('takes real time between findings', async () => {
    const started = Date.now();
    await drain(pace(frames('scan.started', 'finding', 'finding', 'finding'), { findingMs: 40, leadMs: 0 }));

    // Three findings after the first frame: at least two gaps of 40ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(80);
  });

  it('does not delay structural frames', async () => {
    const started = Date.now();
    await drain(pace(frames('scan.started', 'scan.completed'), { findingMs: 200, leadMs: 0 }));
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('is a pass-through at zero, with no accumulated timers', async () => {
    const started = Date.now();
    const many = Array.from({ length: 300 }, () => 'finding');
    const seen = await drain(pace(frames(...many), { findingMs: 0 }));

    expect(seen).toHaveLength(300);
    expect(Date.now() - started).toBeLessThan(150);
  });
});

describe('pace is off wherever nobody is watching', () => {
  const withEnv = (value: string | undefined, run: () => void) => {
    const previous = process.env.SIRIUS_SCAN_PACE;
    if (value === undefined) delete process.env.SIRIUS_SCAN_PACE;
    else process.env.SIRIUS_SCAN_PACE = value;
    try {
      run();
    } finally {
      if (previous === undefined) delete process.env.SIRIUS_SCAN_PACE;
      else process.env.SIRIUS_SCAN_PACE = previous;
    }
  };

  it('is zero for a non-interactive run', () => {
    // A CI job must not pay seconds of deliberate delay to look good for nobody.
    withEnv(undefined, () => expect(resolvePace(false).findingMs).toBe(0));
  });

  it('is non-zero for an interactive one', () => {
    withEnv(undefined, () => expect(resolvePace(true).findingMs).toBeGreaterThan(0));
  });

  it('honours SIRIUS_SCAN_PACE, including 0 to disable', () => {
    withEnv('0', () => expect(resolvePace(true).findingMs).toBe(0));
    withEnv('500', () => expect(resolvePace(true).findingMs).toBe(500));
  });

  it('ignores a nonsense value rather than stalling forever', () => {
    withEnv('banana', () => expect(resolvePace(false).findingMs).toBe(0));
    withEnv('-5', () => expect(resolvePace(false).findingMs).toBe(0));
  });
});

describe('writePaced', () => {
  const capture = async (lines: string[], ms: number) => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      written.push(chunk);
      return true;
    };
    try {
      await writePaced(lines, ms);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = original;
    }
    return written.join('');
  };

  it('writes every line', async () => {
    const out = await capture(['one', '', 'two', 'three'], 1);
    expect(out).toContain('one');
    expect(out).toContain('two');
    expect(out).toContain('three');
  });

  it('writes in more than one chunk when paced, so a viewport can paint', async () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      written.push(chunk);
      return true;
    };
    try {
      await writePaced(['a', '', 'b', '', 'c'], 1);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = original;
    }
    expect(written.length).toBeGreaterThan(1);
  });

  it('writes exactly one chunk when not paced', async () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      written.push(chunk);
      return true;
    };
    try {
      await writePaced(['a', '', 'b', '', 'c'], 0);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = original;
    }
    expect(written).toHaveLength(1);
  });
});

describe('the reasoning lines wrap instead of truncating', () => {
  it('wraps without splitting words', () => {
    const wrapped = wrapText('the quick brown fox jumps over the lazy dog', 15);
    expect(wrapped.every((l) => l.length <= 15)).toBe(true);
    expect(wrapped.join(' ')).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('aligns continuation lines under the text, not the label', () => {
    const [first, second] = wrapLabelled('  basis', 'alpha bravo charlie delta echo', 30, 11);
    expect(first).toMatch(/^ {2}basis/);
    expect(second).toMatch(/^ {11}\S/);
  });

  it('keeps the whole basis and anchor at 80 columns', () => {
    const lines = explain({ ruleId: 'SIR-SEC-001', severity: 'critical' }, 80);

    // The truncation bug: these carry the reasoning behind a rupee figure, and
    // they were being cut off mid-sentence with an ellipsis.
    expect(lines.some((l) => l.includes('…'))).toBe(false);
    expect(lines.every((l) => l.length <= 80)).toBe(true);

    const body = lines.join(' ');
    expect(body).toContain('reissue and reconciliation cost');
    expect(body).toContain('IBM Cost of a Data Breach 2024');
  });

  it('still fits at a narrow width', () => {
    const lines = explain({ ruleId: 'SIR-SEC-001', severity: 'critical' }, 60);
    expect(lines.every((l) => l.length <= 60)).toBe(true);
  });
});

/**
 * The line pacer, and the trap that made the first version of it a no-op.
 *
 * `writePaced` groups by blank line and sleeps between *blocks*. Handed one
 * line it writes it in the final flush and never sleeps at all — so the revenue
 * timeline, "paced" a line at a time through that function, still arrived in a
 * single paint. The two functions do different jobs and the tests say which.
 */
describe('writeLinesPaced', () => {
  const capture = () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      written.push(String(chunk));
      return true;
    };
    return { written, restore: () => ((process.stdout as never as { write: unknown }).write = original) };
  };

  it('writes every line, in order', async () => {
    const { written, restore } = capture();
    try {
      await writeLinesPaced(['one', 'two', 'three'], 0);
    } finally {
      restore();
    }
    expect(written.join('')).toBe('one\ntwo\nthree\n');
  });

  it('actually sleeps between lines, which is the whole point', async () => {
    const { written, restore } = capture();
    const started = Date.now();
    try {
      await writeLinesPaced(['a', 'b', 'c', 'd'], 12);
    } finally {
      restore();
    }
    // Four lines at 12ms cannot finish instantly. The bug this catches made the
    // same call return in under a millisecond.
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
    expect(written).toHaveLength(4);
  });

  it('is a plain write when pacing is off', async () => {
    const { written, restore } = capture();
    const started = Date.now();
    try {
      await writeLinesPaced(['a', 'b', 'c'], 0);
    } finally {
      restore();
    }
    expect(Date.now() - started).toBeLessThan(20);
    // One write, not three: a pipeline should not pay for the loop either.
    expect(written).toHaveLength(1);
  });

  it('writes nothing at all for no lines', async () => {
    const { written, restore } = capture();
    try {
      await writeLinesPaced([], 0);
    } finally {
      restore();
    }
    expect(written).toHaveLength(0);
  });
});
