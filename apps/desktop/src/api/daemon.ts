/**
 * Waits for the real daemon, when there is one to wait for.
 *
 * Two environments this app runs in:
 *
 * - `pnpm dev`, in a browser: no Tauri, no daemon to spawn. `runtimeConfig`
 *   already has the `VITE_*` fallback from module load, so this resolves
 *   immediately.
 * - Packaged into Tauri: `src-tauri/src/lib.rs` spawns `sirius serve` during
 *   its own setup and exposes `get_daemon_config` over IPC, resolving to
 *   `null` until the child process has actually printed its config line. This
 *   polls once, then subscribes to the `daemon-ready` event Rust emits when
 *   the child does print it — polling is the fast path when the daemon won by
 *   the time this runs (Rust's setup and this module's first paint race, and
 *   most repos are small enough to be no contest); the event covers the slow
 *   path without a retry loop's fixed cadence to tune.
 *
 * `@tauri-apps/api` is imported dynamically so the browser build carries none
 * of it — a bare `import` at module scope would run its top-level code, which
 * assumes a Tauri host, on every `pnpm dev` load.
 */
import { runtimeConfig, setRuntimeConfig } from '@sirius/utils';
import { applyDaemonUrl } from './client';

interface DaemonConfig {
  url: string;
  ws_url: string;
  token: string;
  root: string;
  version: string;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function apply(config: DaemonConfig): void {
  setRuntimeConfig({ apiUrl: config.url, wsUrl: config.ws_url, token: config.token });
  applyDaemonUrl();
}

export async function bootstrapDaemon(): Promise<void> {
  if (!isTauri()) return; // pnpm dev: runtimeConfig's VITE_* fallback is already correct.

  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  const existing = await invoke<DaemonConfig | null>('get_daemon_config');
  if (existing) {
    apply(existing);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let unlisten: (() => void) | undefined;

    const timeout = setTimeout(() => {
      unlisten?.();
      reject(new Error('sirius serve did not start within 15s — see the app logs for what the daemon printed.'));
    }, 15_000);

    listen<DaemonConfig>('daemon-ready', (event) => {
      clearTimeout(timeout);
      unlisten?.();
      apply(event.payload);
      resolve();
    }).then((fn) => {
      unlisten = fn;
    });
  });
}

/** Whatever the daemon itself reported about the process it's serving. */
export function currentApiUrl(): string {
  return runtimeConfig.apiUrl;
}
