/**
 * Loads `packages/cli/.env` into `process.env`, without overwriting anything
 * the shell already set.
 *
 * Not `dotenv` — this file has two lines in it (`GROQ_API_KEY`, `GROQ_MODEL`)
 * and needs none of quoting, expansion, or multiline values. Resolved from
 * this module's own location rather than `process.cwd()`, so it finds the
 * package root the same way whether it's `tsx src/cli.ts` or `dist/cli.js`
 * invoked from some other directory entirely.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

export function loadEnvFile(): void {
  if (loaded) return;
  loaded = true;

  const here = dirname(fileURLToPath(import.meta.url));
  // src/config -> src -> package root, or dist/config -> dist -> package root.
  const envPath = join(here, '..', '..', '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
