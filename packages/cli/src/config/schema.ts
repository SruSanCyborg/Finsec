/**
 * Config schemas and the resolved shape everything else reads.
 *
 * Four files feed in, and the PRD never states how they compose — the
 * precedence below is decided in AGENTS.md and enforced in `load.ts`. Each file
 * has a narrow job:
 *
 *   ~/.config/finsec/config.toml   auth and profiles only (Stripe's model)
 *   finsec.yaml                    project: rules, policy, project id
 *   .finseclintrc                  per-directory overrides
 *   .finsecignore                  path globs (a result filter, not config)
 */

import { z } from 'zod';

const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
const failOn = z.enum(['all', 'new', 'verified-secrets']);

/** `~/.config/finsec/config.toml` — credentials, keyed by profile. */
export const configTomlSchema = z.object({
  default_profile: z.string().optional(),
  profile: z
    .record(
      z.string(),
      z.object({
        api_key: z.string().optional(),
        api_url: z.string().url().optional(),
        ws_url: z.string().optional(),
        project_id: z.string().optional(),
      }),
    )
    .optional(),
});

/** `finsec.yaml` — project settings. Also the shape `finsec init` scaffolds. */
export const projectConfigSchema = z.object({
  project_id: z.string().optional(),
  api_url: z.string().url().optional(),
  ws_url: z.string().optional(),
  rulesets: z.array(z.string()).optional(),
  severity_threshold: severity.optional(),
  fail_on: failOn.optional(),
  validate_secrets: z.boolean().optional(),
  diff_aware: z.boolean().optional(),
  baseline_commit: z.string().optional(),
  exclude: z.array(z.string()).optional(),
  policy: z
    .object({
      fail_on_severity: severity.optional(),
      max_new_findings: z.number().int().nonnegative().nullable().optional(),
      require_no_verified_secrets: z.boolean().optional(),
      min_compliance_score: z.number().min(0).max(100).nullable().optional(),
    })
    .optional(),
});

/** `.finseclintrc` — the same keys, applied per directory. */
export const rcConfigSchema = projectConfigSchema;

export type ConfigToml = z.infer<typeof configTomlSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Flags and env, which sit above every file. */
export interface ConfigOverrides {
  apiUrl?: string | undefined;
  wsUrl?: string | undefined;
  apiKey?: string | undefined;
  projectId?: string | undefined;
  profile?: string | undefined;
  rulesets?: string[] | undefined;
  severityThreshold?: ProjectConfig['severity_threshold'];
  failOn?: ProjectConfig['fail_on'];
  validateSecrets?: boolean | undefined;
  diffAware?: boolean | undefined;
  baselineCommit?: string | undefined;
  configFile?: string | undefined;
}

/** What commands actually read. Every field resolved, nothing optional-by-accident. */
export interface ResolvedConfig {
  apiUrl: string;
  wsUrl: string | undefined;
  apiKey: string | undefined;
  projectId: string | undefined;
  rulesets: string[];
  severityThreshold: NonNullable<ProjectConfig['severity_threshold']>;
  failOn: NonNullable<ProjectConfig['fail_on']>;
  validateSecrets: boolean;
  diffAware: boolean;
  baselineCommit: string | undefined;
  exclude: string[];
  policy: NonNullable<ProjectConfig['policy']> | undefined;
  /** Where each value came from, for `finsec config` and for debugging. */
  sources: Record<string, string>;
}

export const DEFAULTS = {
  apiUrl: 'https://api.finsec.dev/api/v1',
  severityThreshold: 'high',
  failOn: 'all',
  rulesets: ['p/fintech-core'],
  validateSecrets: false,
  diffAware: false,
} as const;
