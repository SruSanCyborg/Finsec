/**
 * Config schemas and the resolved shape everything else reads.
 *
 * Four files feed in, and the PRD never states how they compose — the
 * precedence below is decided in AGENTS.md and enforced in `load.ts`. Each file
 * has a narrow job:
 *
 *   ~/.config/sirius/config.toml   auth and profiles only (Stripe's model)
 *   sirius.yaml                    project: rules, policy, project id
 *   .siriuslintrc                  per-directory overrides
 *   .siriusignore                  path globs (a result filter, not config)
 */

import { z } from 'zod';

const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
const failOn = z.enum(['all', 'new', 'verified-secrets']);

/** `~/.config/sirius/config.toml` — credentials, keyed by profile. */
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

/**
 * What the recovery agent is allowed to do, in the project's own file.
 *
 * The stopping rules were described everywhere as "configured policy, not legal
 * advice — the numbers are a compliance team's to change", and the only way to
 * change them was to edit TypeScript. A limit nobody can set is not policy, it
 * is a constant with a good comment.
 *
 * Every field is optional and falls back to the built-in default, so an existing
 * `sirius.yaml` keeps working and a team can pin only the numbers it argues
 * about. Bounds are enforced here rather than at the call site: a negative
 * cooldown or a 25-hour quiet-hours window should be rejected when the file is
 * read, naming the file, not silently clamped three layers down.
 */
const hour = z.number().int().min(0).max(23);

export const revenueConfigSchema = z.object({
  /** Interventions available in one run. */
  capacity: z.number().int().positive().optional(),
  /** Rupees the run may spend, converted to paise on load. */
  budget_inr: z.number().nonnegative().optional(),
  /** Times one record may be worked before the agent gives up on it. */
  max_steps: z.number().int().min(1).max(10).optional(),
  mandate_attempts: z.number().int().min(1).max(10).optional(),
  payment_attempts: z.number().int().min(1).max(20).optional(),
  cooldown_hours: z
    .object({
      default: z.number().min(0).max(720).optional(),
      insufficient_funds: z.number().min(0).max(720).optional(),
    })
    .optional(),
  quiet_hours: z.object({ from: hour, to: hour }).optional(),
  contacts_per_day: z.number().int().min(0).max(20).optional(),
  /** IANA zone the quiet hours are read in. Not the machine's. */
  timezone: z.string().optional(),
  circuit_breaker: z
    .object({
      after_attempts: z.number().int().positive().optional(),
      min_realised_share: z.number().min(0).max(1).optional(),
    })
    .optional(),
  /**
   * What being wrong costs. `annoyance_inr` is the most contestable number in
   * the whole model — the charge for contacting somebody who would have paid
   * anyway — which is exactly why it belongs in a file a team can argue over.
   */
  costs: z
    .object({
      retry_inr: z.number().nonnegative().optional(),
      email_inr: z.number().nonnegative().optional(),
      sms_inr: z.number().nonnegative().optional(),
      whatsapp_inr: z.number().nonnegative().optional(),
      voice_inr: z.number().nonnegative().optional(),
      human_review_inr: z.number().nonnegative().optional(),
      annoyance_inr: z.number().nonnegative().optional(),
      margin: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type RevenueConfig = z.infer<typeof revenueConfigSchema>;

/** `sirius.yaml` — project settings. Also the shape `sirius init` scaffolds. */
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
  revenue: revenueConfigSchema.optional(),
});

/** `.siriuslintrc` — the same keys, applied per directory. */
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
  /** The recovery agent's limits, as far as the project file sets them. */
  revenue: RevenueConfig | undefined;
  /** Where each value came from, for `sirius config` and for debugging. */
  sources: Record<string, string>;
}

export const DEFAULTS = {
  apiUrl: 'https://api.sirius.dev/api/v1',
  severityThreshold: 'high',
  failOn: 'all',
  rulesets: ['p/fintech-core'],
  validateSecrets: false,
  diffAware: false,
} as const;
