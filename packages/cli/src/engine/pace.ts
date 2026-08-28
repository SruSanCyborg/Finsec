/**
 * Pacing for the local engine's frame stream.
 *
 * The hosted path streams over a WebSocket, so findings arrive as the worker
 * produces them and the terminal shows them one at a time. The local engine has
 * no such gap: on a small repo it emits every frame in the same millisecond, so
 * a terminal viewport paints once and the user sees only the last screenful.
 * On a three-file fixture that means the findings and the summary never appear
 * at all — the transcript jumps straight to the tail.
 *
 * Pacing restores the behaviour the streamed path gets for free. It is applied
 * only when a human is watching: never for `--json`, `--sarif`, a pipe, or CI,
 * where the frames must arrive as fast as they are produced.
 */

import type { WsFrame } from '../domain.js';

/** Milliseconds between findings when pacing is on. */
const DEFAULT_FINDING_MS = 260;

/** Progress frames are filler; they move faster than the findings do. */
const DEFAULT_PROGRESS_MS = 45;

/** Time before the first frame. Kept small — time-to-first-finding is a demo metric. */
const DEFAULT_LEAD_MS = 90;

export interface PaceOptions {
  /** Per-finding delay in ms. 0 disables pacing entirely. */
  findingMs?: number;
  progressMs?: number;
  leadMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves the pace from the environment.
 *
 * `SIRIUS_SCAN_PACE` is the per-finding delay in milliseconds; `0` turns pacing
 * off. Returning 0 for a non-TTY is the important default: a CI run must not
 * pay a few seconds of deliberate delay to look good for nobody.
 */
export function resolvePace(interactive: boolean): PaceOptions {
  const raw = process.env.SIRIUS_SCAN_PACE;

  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return {
        findingMs: parsed,
        progressMs: Math.min(DEFAULT_PROGRESS_MS, parsed / 4),
        leadMs: Math.min(DEFAULT_LEAD_MS, parsed),
      };
    }
  }

  if (!interactive) return { findingMs: 0, progressMs: 0, leadMs: 0 };

  return { findingMs: DEFAULT_FINDING_MS, progressMs: DEFAULT_PROGRESS_MS, leadMs: DEFAULT_LEAD_MS };
}

/**
 * Wraps a frame stream, spacing frames out so a terminal can paint between them.
 *
 * A pass-through when `findingMs` is 0, so the fast path stays genuinely fast
 * rather than accumulating a pile of zero-length timers.
 */
export async function* pace(
  frames: AsyncIterable<WsFrame>,
  options: PaceOptions = {},
): AsyncGenerator<WsFrame> {
  const findingMs = options.findingMs ?? DEFAULT_FINDING_MS;

  if (findingMs <= 0) {
    yield* frames;
    return;
  }

  const progressMs = options.progressMs ?? DEFAULT_PROGRESS_MS;
  const leadMs = options.leadMs ?? DEFAULT_LEAD_MS;

  let first = true;

  for await (const frame of frames) {
    if (first) {
      first = false;
      if (leadMs > 0) await sleep(leadMs);
      yield frame;
      continue;
    }

    switch (frame.type) {
      case 'finding':
        await sleep(findingMs);
        break;
      case 'file.scanning':
      case 'progress':
        await sleep(progressMs);
        break;
      default:
        // scan.started, scan.completed, and errors are structural: delaying them
        // adds dead air without showing anything new.
        break;
    }

    yield frame;
  }
}

/**
 * Writes lines with a pause between them, so a viewport can paint as they land.
 *
 * The threat report is emitted after the stream has ended, so frame pacing does
 * not cover it: a single write of twenty lines scrolls nineteen of them past
 * unseen. Grouped by blank line, because an attack path reads as a unit and
 * pausing inside one just looks like stutter.
 */
export async function writePaced(lines: readonly string[], perBlockMs: number): Promise<void> {
  if (perBlockMs <= 0) {
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  let block: string[] = [];
  const flush = async () => {
    if (block.length === 0) return;
    process.stdout.write(block.join('\n') + '\n');
    block = [];
    await sleep(perBlockMs);
  };

  for (const line of lines) {
    if (line.trim() === '' && block.length > 0) {
      await flush();
      process.stdout.write('\n');
      continue;
    }
    block.push(line);
  }

  if (block.length > 0) process.stdout.write(block.join('\n') + '\n');
}
