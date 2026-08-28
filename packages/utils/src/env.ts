/// <reference types="vite/client" />
import { z } from 'zod';

/**
 * The `pnpm dev` fallback: a daemon a developer started by hand, outside
 * Tauri. Port 4020 is `sirius serve`'s own default, not the mock server's old
 * 4010/4011.
 *
 * Packaged into Tauri, these values are never actually used — the Rust side
 * spawns `sirius serve` itself and hands back its real port and token over
 * IPC once it's listening, since a build cannot know either ahead of time
 * (`sirius serve` mints a fresh token and picks a free port every launch).
 * `bootstrapDaemon()` in `apps/desktop/src/api/daemon.ts` fills `runtimeConfig`
 * in with that value before the app renders anything that would issue a
 * request; see `runtime-config.ts` for why it's a separate mutable module
 * rather than something read back through here.
 */
const envSchema = z.object({
  VITE_API_URL: z.string().url().default('http://127.0.0.1:4020/api/v1'),
  VITE_WS_URL: z.string().url().default('ws://127.0.0.1:4020/api/v1'),
  VITE_API_TOKEN: z.string().default(''),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

export type SiriusEnv = z.infer<typeof envSchema>;

export function getSiriusEnv(): SiriusEnv {
  const rawEnv = {
    VITE_API_URL: import.meta.env?.VITE_API_URL,
    VITE_WS_URL: import.meta.env?.VITE_WS_URL,
    VITE_API_TOKEN: import.meta.env?.VITE_API_TOKEN,
    VITE_APP_ENV: import.meta.env?.VITE_APP_ENV,
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    console.warn('⚠️ SIRIUS environment validation warning:', parsed.error.format());
    return envSchema.parse({});
  }

  return parsed.data;
}
