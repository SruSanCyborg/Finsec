/**
 * `sirius login` / `logout`.
 *
 * The PRD specifies login as an OAuth device flow, but no `/auth/device/*`
 * endpoints exist in the API table — that is one of the items blocked on the
 * `auto` branch. So this stores a project API key directly, which is what CI
 * needs anyway, and says plainly that the browser flow is not wired up rather
 * than pretending to start one.
 */

import { createInterface } from 'node:readline/promises';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig, configTomlPath } from '../config/load.js';
import { listProfiles, maskKey, removeProfile, saveProfile } from '../config/write.js';

interface LoginFlags {
  apiKey?: string;
  list?: boolean;
  noVerify?: boolean;
}

interface GlobalFlags {
  apiUrl?: string;
  wsUrl?: string;
  project?: string;
  profile?: string;
}

const DEFAULT_PROFILE = 'default';

/** Prompt without echoing, so a pasted key does not linger on screen. */
async function promptForKey(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new CliError('No API key supplied and stdin is not a terminal.', {
      hint: 'Pass --api-key <key>, or set SIRIUS_API_KEY.',
    });
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    // Node's readline has no built-in masking; muting the output stream while
    // the answer is typed is the standard workaround.
    const output = rl as unknown as { output?: NodeJS.WriteStream; _writeToOutput?: (s: string) => void };
    const original = output._writeToOutput;
    output._writeToOutput = function (stringToWrite: string) {
      if (stringToWrite.includes('\n')) original?.call(this, stringToWrite);
    };
    const answer = await rl.question('API key: ');
    output._writeToOutput = original;
    process.stdout.write('\n');
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function runLogin(flags: LoginFlags, globals: GlobalFlags): Promise<void> {
  if (flags.list) {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      process.stdout.write(`No profiles in ${configTomlPath()}\n`);
      return;
    }
    for (const profile of profiles) {
      const marks = [profile.isDefault ? 'default' : undefined, profile.hasKey ? 'has key' : 'no key']
        .filter(Boolean)
        .join(', ');
      process.stdout.write(`${profile.name.padEnd(16)} ${profile.apiUrl ?? ''}  (${marks})\n`);
    }
    return;
  }

  const profileName = globals.profile ?? DEFAULT_PROFILE;
  const apiKey = flags.apiKey ?? process.env.SIRIUS_API_KEY ?? (await promptForKey());

  if (!apiKey) throw new CliError('No API key given.');

  const config = loadConfig({ cwd: process.cwd(), overrides: { apiUrl: globals.apiUrl } });
  const apiUrl = globals.apiUrl ?? config.apiUrl;

  // Verify before storing, so a typo surfaces now rather than mid-demo.
  if (!flags.noVerify) {
    const client = new ApiClient({ baseUrl: apiUrl, apiKey, timeoutMs: 10_000 });
    try {
      await client.health();
    } catch (error) {
      throw new CliError(`Could not reach ${apiUrl} to verify the key.`, {
        hint: 'Use --no-verify to store it anyway, or check --api-url.',
        cause: error,
      });
    }
  }

  const path = saveProfile(profileName, {
    api_key: apiKey,
    ...(globals.apiUrl ? { api_url: globals.apiUrl } : {}),
    ...(globals.wsUrl ? { ws_url: globals.wsUrl } : {}),
    ...(globals.project ? { project_id: globals.project } : {}),
  });

  process.stdout.write(`Stored key ${maskKey(apiKey)} in profile "${profileName}"\n`);
  process.stdout.write(`  ${path} (mode 0600)\n`);
}

export async function runLogout(globals: GlobalFlags): Promise<void> {
  const profileName = globals.profile ?? DEFAULT_PROFILE;
  const { path, existed } = removeProfile(profileName);

  if (!existed) {
    process.stdout.write(`No profile "${profileName}" to remove.\n`);
    return;
  }

  process.stdout.write(`Removed profile "${profileName}" from ${path}\n`);
  // Being explicit beats a confusing "still authenticated" surprise later.
  if (process.env.SIRIUS_API_KEY) {
    process.stdout.write('note: SIRIUS_API_KEY is still set in this environment and will override the file.\n');
  }
}
