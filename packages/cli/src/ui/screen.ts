/**
 * Alternate screen buffer management.
 *
 * The full-screen shell takes over the terminal's drawing surface the way `vim`
 * and `htop` do, which is how an agent CLI's fullscreen renderer works: the
 * transcript lives in the alternate buffer and the input stays pinned at the
 * bottom instead of drifting as output streams in.
 *
 * The dangerous part is not entering — it is leaving. A process that dies while
 * the alternate buffer is active, or with the cursor hidden, leaves the user
 * with a terminal that looks broken and needs `reset`. Every exit path is
 * covered here, once, so no caller has to remember.
 */

const ENTER_ALT = '\u001b[?1049h';
const LEAVE_ALT = '\u001b[?1049l';
const HIDE_CURSOR = '\u001b[?25l';
const SHOW_CURSOR = '\u001b[?25h';
// 3J clears the scrollback as well as the visible screen. Without it, some
// terminals leave the previous session's output sitting above ours, so the
// takeover looks half-finished.
const CLEAR = '\u001b[3J\u001b[2J\u001b[H';

let active = false;
let teardownRegistered = false;

/**
 * Whether the alternate screen should be used at all.
 *
 * Honors an explicit opt-out, because it genuinely breaks in some places —
 * notably `tmux -CC` integration mode — and because a user who wants their
 * native scrollback back should not have to argue with us for it.
 */
export function alternateScreenAvailable(): boolean {
  const env = process.env;
  if (env.SIRIUS_NO_ALT_SCREEN === '1') return false;
  if (env.TERM === 'dumb' || !env.TERM) return false;
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

/** Restores the terminal. Safe to call repeatedly and from a signal handler. */
export function leaveAlternateScreen(): void {
  if (!active) return;
  active = false;
  // Cursor first: if the write after it fails, at least the cursor is back.
  process.stdout.write(SHOW_CURSOR);
  process.stdout.write(LEAVE_ALT);
}

export function enterAlternateScreen(): void {
  if (active) return;
  active = true;
  process.stdout.write(ENTER_ALT);
  process.stdout.write(CLEAR);

  if (teardownRegistered) return;
  teardownRegistered = true;

  // Every way this process can end, including the ones nobody plans for.
  process.on('exit', leaveAlternateScreen);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      leaveAlternateScreen();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  process.on('uncaughtException', (error) => {
    leaveAlternateScreen();
    process.stderr.write(`\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(1);
  });
}

/**
 * Runs `fn` with the alternate screen suspended, so a child process can own the
 * real terminal — used when a command needs the genuine TTY rather than having
 * its output captured.
 */
export async function withAlternateScreenSuspended<T>(fn: () => Promise<T>): Promise<T> {
  const wasActive = active;
  if (wasActive) leaveAlternateScreen();
  try {
    return await fn();
  } finally {
    if (wasActive) {
      active = false; // force a genuine re-enter rather than a no-op
      enterAlternateScreen();
    }
  }
}

export function isAlternateScreenActive(): boolean {
  return active;
}

export { HIDE_CURSOR, SHOW_CURSOR };
