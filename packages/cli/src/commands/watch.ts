/**
 * `sirius watch` — re-scan when files change.
 *
 * The PRD names `stripe listen` as the UX model, but that is a passive event
 * tailer; this actually re-runs work, so it needs the things a re-runner needs
 * and the PRD does not specify: a debounce, an ignore list, and a policy for
 * what happens when a save lands mid-scan.
 *
 * Choices made here:
 *   - 400ms debounce, because editors write several times per save
 *   - a save during a scan queues exactly one follow-up, never a backlog
 *   - the process exit code reflects the *last* scan, so `watch` is still
 *     usable as a foreground signal
 *
 * Node's recursive fs.watch is used rather than a watcher dependency: it is
 * available on macOS, Windows, and Linux from Node 20, and this package already
 * requires Node 22.
 */

import { watch } from 'node:fs';
import { existsSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { CliError, NoTargetError } from '../api/errors.js';
import { loadIgnorePatterns } from '../config/load.js';

interface WatchFlags {
  debounce?: number;
  [key: string]: unknown;
}

const DEFAULT_DEBOUNCE_MS = 400;

/** Directories never worth watching; they generate noise and no findings. */
const ALWAYS_IGNORED = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.sirius',
  '.next',
  'coverage',
];

export function shouldIgnore(relativePath: string, extraPatterns: readonly string[] = []): boolean {
  const segments = relativePath.split(sep);
  if (segments.some((segment) => ALWAYS_IGNORED.includes(segment))) return true;

  // Editor scratch files: vim swap, emacs autosave, JetBrains, and the backups
  // this CLI writes itself — re-scanning because of our own backup would loop.
  const name = segments.at(-1) ?? '';
  if (/^\.#|~$|\.swp$|\.swx$|^\.DS_Store$|\.sirius-backup$/.test(name)) return true;

  return extraPatterns.some((pattern) => {
    const normalized = pattern.replace(/\/$/, '');
    return relativePath === normalized || relativePath.startsWith(`${normalized}${sep}`);
  });
}

export async function runWatch(path: string, flags: WatchFlags, globals: Record<string, unknown>): Promise<void> {
  const target = resolve(process.cwd(), path || '.');
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new NoTargetError(`Not a directory: ${path || '.'}`, 'Point watch at a directory to observe.');
  }

  const debounceMs = Number.isFinite(flags.debounce) ? Number(flags.debounce) : DEFAULT_DEBOUNCE_MS;
  const ignorePatterns = loadIgnorePatterns(target);

  // Imported lazily so `watch` reuses the exact scan pipeline rather than a
  // parallel copy of it that can drift.
  const { runScan } = await import('./scan.js');

  // `watch` owns the exit code, so the inner scans must not set it as they go.
  const scanFlags = { ...flags, debounce: undefined };

  let scanning = false;
  let queued = false;
  let timer: NodeJS.Timeout | undefined;
  let runs = 0;

  const runOnce = async (): Promise<void> => {
    scanning = true;
    runs += 1;
    const startedAt = Date.now();
    process.stdout.write(`\n${runs === 1 ? 'scanning' : 're-scanning'}…\n\n`);

    try {
      await runScan(target, scanFlags as never, globals as never);
    } catch (error) {
      // A failed scan must not kill the watcher — the next save may well fix it.
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`scan failed: ${message}\n`);
      process.exitCode = error instanceof CliError ? error.exitCode : 2;
    }

    process.stdout.write(`\nwatching ${relative(process.cwd(), target) || '.'} — ${Date.now() - startedAt}ms. Ctrl-C to stop.\n`);
    scanning = false;

    if (queued) {
      queued = false;
      await runOnce();
    }
  };

  const trigger = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // Exactly one follow-up, no backlog: a burst of saves during a long scan
      // should produce one more scan, not one per save.
      if (scanning) queued = true;
      else void runOnce();
    }, debounceMs);
  };

  const debug = Boolean(process.env.SIRIUS_DEBUG);
  const watcher = watch(target, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const name = filename.toString();
    if (shouldIgnore(name, ignorePatterns)) {
      if (debug) process.stderr.write(`[watch] ignored ${event} ${name}\n`);
      return;
    }
    if (debug) process.stderr.write(`[watch] ${event} ${name}\n`);
    trigger();
  });

  const stop = (): void => {
    watcher.close();
    if (timer) clearTimeout(timer);
    process.stdout.write('\nstopped.\n');
  };
  process.on('SIGINT', () => {
    stop();
    process.exit(process.exitCode ?? 0);
  });

  await runOnce();

  // Hold the process open for the watcher.
  await new Promise<void>(() => {});
}
