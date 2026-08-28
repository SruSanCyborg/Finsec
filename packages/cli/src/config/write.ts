/**
 * Writing `~/.config/sirius/config.toml`.
 *
 * Kept separate from `load.ts` because this is the only module that mutates the
 * user's credentials, and it has one rule: the file holds secrets, so it is
 * created 0600 and never printed back in full.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

import { CliError } from '../api/errors.js';
import { configTomlPath } from './load.js';
import { configTomlSchema } from './schema.js';
import type { ConfigToml } from './schema.js';

export interface ProfileCredentials {
  api_key?: string;
  api_url?: string;
  ws_url?: string;
  project_id?: string;
}

function readRaw(): ConfigToml {
  const path = configTomlPath();
  if (!existsSync(path)) return {};
  try {
    return configTomlSchema.parse(parseToml(readFileSync(path, 'utf8')) ?? {});
  } catch (cause) {
    throw new CliError(`${path} is not valid`, {
      hint: 'Fix or delete it, then run `sirius login` again.',
      cause,
    });
  }
}

function writeRaw(config: ConfigToml): string {
  const path = configTomlPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyToml(config as Record<string, unknown>) + '\n', 'utf8');
  // Credentials: owner read/write only. Do this after every write, not just on
  // create, in case the file already existed with looser permissions.
  chmodSync(path, 0o600);
  return path;
}

/** Merge credentials into a profile, creating the file if needed. */
export function saveProfile(profileName: string, credentials: ProfileCredentials): string {
  const config = readRaw();
  const profiles = { ...(config.profile ?? {}) };
  profiles[profileName] = { ...(profiles[profileName] ?? {}), ...prune(credentials) };

  return writeRaw({
    ...config,
    default_profile: config.default_profile ?? profileName,
    profile: profiles,
  });
}

/** Remove a profile entirely. Returns false when it was not there to begin with. */
export function removeProfile(profileName: string): { path: string; existed: boolean } {
  const config = readRaw();
  const profiles = { ...(config.profile ?? {}) };
  const existed = profileName in profiles;
  delete profiles[profileName];

  const next: ConfigToml = { ...config, profile: profiles };
  // Do not leave `default_profile` pointing at something that no longer exists.
  if (next.default_profile === profileName) {
    next.default_profile = Object.keys(profiles)[0];
    if (next.default_profile === undefined) delete next.default_profile;
  }

  return { path: writeRaw(next), existed };
}

export function listProfiles(): Array<{ name: string; isDefault: boolean; hasKey: boolean; apiUrl?: string }> {
  const config = readRaw();
  const defaultName = config.default_profile;
  return Object.entries(config.profile ?? {}).map(([name, profile]) => ({
    name,
    isDefault: name === defaultName,
    hasKey: Boolean(profile.api_key),
    ...(profile.api_url ? { apiUrl: profile.api_url } : {}),
  }));
}

/**
 * `sk_live_abc…xyz` → `sk_l…3f9a`. Enough to recognize which key is stored,
 * never enough to use it.
 */
export function maskKey(key: string): string {
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function prune<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}
