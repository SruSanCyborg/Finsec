/**
 * `sirius init` — scaffold `sirius.yaml` and `.siriusignore`.
 *
 * The PRD names both files but never says what goes in them, so the templates
 * here are the definition. They are written with comments: the config file is
 * the most likely place someone learns what the tool can do, and a commented
 * default beats a wiki page nobody reads.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { CliError } from '../api/errors.js';
import { DEFAULTS } from '../config/schema.js';

interface InitFlags {
  force?: boolean;
  project?: string;
}

interface GlobalFlags {
  project?: string;
  apiUrl?: string;
}

/** Best-effort project name: the git remote's repo name, else the directory. */
function guessProjectName(dir: string): string {
  try {
    const remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const name = remote.replace(/\.git$/, '').split(/[/:]/).pop();
    if (name) return name;
  } catch {
    // Not a git repo, or no origin. The directory name is a fine fallback.
  }
  return basename(resolve(dir));
}

function projectTemplate(name: string, projectId: string | undefined): string {
  return `# sirius — project configuration
# Docs: https://sirius.dev/docs/config
#
# Precedence, highest first:
#   CLI flags > SIRIUS_* env > .siriuslintrc (nearest dir) > this file
#   > ~/.config/sirius/config.toml > built-in defaults

# Project this repo reports to. Get one with \`sirius login\` or from the dashboard.
${projectId ? `project_id: ${projectId}` : '# project_id: 00000000-0000-0000-0000-000000000000'}

# Rulesets to run. p/fintech-core is the full catalogue; p/<category> narrows to
# one — p/secrets, p/injection, p/auth, p/pii, p/crypto, p/ratelimit, p/logging.
rulesets:
  - ${DEFAULTS.rulesets[0]}
  # - p/secrets

# --- gating -----------------------------------------------------------------
# severity_threshold sets the BAR: which severities are considered at all.
severity_threshold: ${DEFAULTS.severityThreshold}

# fail_on selects the PREDICATE: which of those actually block the build.
#   all              every finding at or above the bar
#   new              only findings absent from the baseline
#   verified-secrets only secrets confirmed still live
fail_on: ${DEFAULTS.failOn}

# Live secret checking makes a read-only call to the provider to see whether a
# leaked key still works. Off by default: it touches third-party APIs.
validate_secrets: false

# --- optional ---------------------------------------------------------------
# Diff-aware scanning: only report what this commit introduced.
# diff_aware: true
# baseline_commit: main

# Paths to skip, in addition to .siriusignore and .gitignore.
# exclude:
#   - "vendor/**"

# Server-side quality gate. Each check can block on its own.
# policy:
#   fail_on_severity: high
#   max_new_findings: 0
#   require_no_verified_secrets: true
#   min_compliance_score: 80

# --- the recovery agent ------------------------------------------------------
# What \`sirius revenue recover\` is allowed to do. Every line is optional and
# falls back to a documented default, so pin only what you argue about.
#
# These are your numbers, not ours. The frameworks named in the output (NPCI
# NACH re-presentment limits, TRAI contact rules, DPDP §6 consent) are pointers
# to obligations you should check against your own compliance advice — the
# thresholds below are what sirius will actually enforce.
# revenue:
#   capacity: 200            # interventions available in one run
#   budget_inr: 50000        # what the run may spend, total
#   contacts_per_day: 2      # messages to one party in a rolling day
#   quiet_hours: { from: 21, to: 9 }
#   timezone: Asia/Kolkata   # the zone quiet hours are read in, not the server's
#   mandate_attempts: 3      # re-presentments against one mandate per cycle
#   payment_attempts: 4      # attempts against one payment, all rails
#   cooldown_hours: { default: 6, insufficient_funds: 30 }
#   circuit_breaker: { after_attempts: 40, min_realised_share: 0.25 }
#   costs:
#     retry_inr: 3
#     sms_inr: 0.18
#     human_review_inr: 85
#     annoyance_inr: 12      # the charge for chasing someone who'd have paid
#                            # anyway. The most contestable number here, which
#                            # is why it is yours to set. At zero, the model
#                            # will happily chase every self-healing payment.

# Scanned project: ${name}
`;
}

const IGNORE_TEMPLATE = `# Paths sirius should not scan, gitignore syntax.
# .gitignore is honored too; this file is for things you track but do not want scanned.

# Dependencies and build output
node_modules/
vendor/
dist/
build/
*.min.js

# Test fixtures often contain deliberately fake secrets
**/fixtures/**
**/__snapshots__/**

# Generated code
*.pb.go
*_pb2.py
`;

export async function runInit(flags: InitFlags, globals: GlobalFlags): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, 'sirius.yaml');
  const ignorePath = join(cwd, '.siriusignore');

  const existing = [configPath, ignorePath].filter((p) => existsSync(p));
  if (existing.length > 0 && !flags.force) {
    throw new CliError(`Already initialized: ${existing.map((p) => basename(p)).join(', ')}`, {
      hint: 'Pass --force to overwrite.',
    });
  }

  const name = guessProjectName(cwd);
  const projectId = flags.project ?? globals.project ?? process.env.SIRIUS_PROJECT_ID;

  writeFileSync(configPath, projectTemplate(name, projectId), 'utf8');
  writeFileSync(ignorePath, IGNORE_TEMPLATE, 'utf8');

  process.stdout.write(`Initialized sirius for "${name}"\n`);
  process.stdout.write(`  sirius.yaml\n  .siriusignore\n\n`);

  process.stdout.write('Next:  sirius scan .\n');

  if (!projectId) {
    // This used to read "set project_id in sirius.yaml, then sirius scan ." —
    // written when a scan meant a call to the API. It no longer does, and
    // telling someone to go get an account before their first scan is the
    // opposite of what this tool should ask for.
    process.stdout.write(
      '       Scans run locally. Set project_id later if you want hosted\n' +
        '       history, policy and the team dashboard.\n',
    );
  }
}
