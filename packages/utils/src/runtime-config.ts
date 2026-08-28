/**
 * The daemon connection this window is actually using, updated after the app
 * has already started running.
 *
 * `sirius serve` mints a fresh port and token every launch — there is nothing
 * to bake into a build. Under `pnpm dev` that's fine, `getSiriusEnv()`'s
 * `VITE_*` vars cover it. Packaged into Tauri, the Rust side spawns the daemon
 * itself and hands the config back over IPC once it's actually listening,
 * which happens after this module has already been imported and after
 * `SiriusApiClient` has already been constructed against the `VITE_*`
 * fallback. Rather than delay constructing the client until an async value
 * resolves — which every module importing it would then have to await too —
 * this is a mutable box the client reads live and `bootstrapDaemon()` (in the
 * desktop app) fills in once, before the app renders anything that would issue
 * a request.
 */
import { getSiriusEnv } from './env';

export interface RuntimeConfig {
  apiUrl: string;
  wsUrl: string;
  token: string;
}

const env = getSiriusEnv();

export const runtimeConfig: RuntimeConfig = {
  apiUrl: env.VITE_API_URL,
  wsUrl: env.VITE_WS_URL,
  token: env.VITE_API_TOKEN,
};

export function setRuntimeConfig(next: Partial<RuntimeConfig>): void {
  Object.assign(runtimeConfig, next);
}
