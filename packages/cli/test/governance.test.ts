/**
 * Expiry parsing and credential storage.
 *
 * Both are small, but both are places where a quiet mistake is expensive: a
 * suppression that never expires silently stops auditing a rule forever, and a
 * config file with loose permissions leaks an API key.
 */

import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseExpiry } from '../src/commands/governance.js';
import { listProfiles, maskKey, removeProfile, saveProfile } from '../src/config/write.js';
import { configTomlPath } from '../src/config/load.js';

describe('parseExpiry', () => {
  it('accepts a plain date and normalizes it to ISO-8601 UTC', () => {
    expect(parseExpiry('2099-09-01')).toBe('2099-09-01T00:00:00.000Z');
  });

  it('accepts a full timestamp', () => {
    expect(parseExpiry('2099-09-01T12:30:00Z')).toBe('2099-09-01T12:30:00.000Z');
  });

  it('rejects a date in the past — it would suppress nothing', () => {
    expect(() => parseExpiry('2020-01-01')).toThrow(/in the past/);
  });

  it('rejects unparseable input with a usable hint', () => {
    expect(() => parseExpiry('next tuesday')).toThrow(/Cannot read/);
  });
});

describe('maskKey', () => {
  it('shows enough to recognize a key and not enough to use it', () => {
    expect(maskKey('sk_live_abcdef123456')).toBe('sk_l…3456');
  });

  it('reveals nothing at all for short keys', () => {
    expect(maskKey('abc')).toBe('•••');
  });
});

describe('credential storage', () => {
  let home: string;
  const savedXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'sirius-xdg-'));
    process.env.XDG_CONFIG_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
  });

  it('writes the file readable only by its owner', () => {
    const path = saveProfile('default', { api_key: 'secret-key' });
    // 0o777 masks off the file-type bits, leaving the permission bits.
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('sets the first profile written as the default', () => {
    saveProfile('work', { api_key: 'k1' });
    const [profile] = listProfiles();
    expect(profile).toMatchObject({ name: 'work', isDefault: true, hasKey: true });
  });

  it('merges into an existing profile rather than replacing it', () => {
    saveProfile('default', { api_key: 'k1', api_url: 'https://a.example' });
    saveProfile('default', { project_id: 'p1' });

    const contents = readFileSync(configTomlPath(), 'utf8');
    expect(contents).toContain('k1');
    expect(contents).toContain('https://a.example');
    expect(contents).toContain('p1');
  });

  it('keeps profiles independent', () => {
    saveProfile('default', { api_key: 'k1' });
    saveProfile('staging', { api_key: 'k2' });
    expect(listProfiles().map((p) => p.name).sort()).toEqual(['default', 'staging']);
  });

  it('drops empty values instead of storing blanks', () => {
    saveProfile('default', { api_key: 'k1', project_id: '' });
    expect(readFileSync(configTomlPath(), 'utf8')).not.toContain('project_id');
  });

  it('removes a profile and reports whether it was there', () => {
    saveProfile('default', { api_key: 'k1' });
    expect(removeProfile('default').existed).toBe(true);
    expect(removeProfile('default').existed).toBe(false);
    expect(listProfiles()).toEqual([]);
  });

  it('never leaves default_profile pointing at a removed profile', () => {
    saveProfile('default', { api_key: 'k1' });
    saveProfile('staging', { api_key: 'k2' });
    removeProfile('default');

    const contents = readFileSync(configTomlPath(), 'utf8');
    expect(contents).not.toMatch(/default_profile\s*=\s*"default"/);
    expect(listProfiles()).toHaveLength(1);
  });
});
