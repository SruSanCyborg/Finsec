/**
 * `sirius triage` — review a scan's findings interactively.
 *
 * Distinct from `fix`: fix changes code, triage records a human judgement about
 * whether a finding matters. The two meet at `f`, which prints the fix command
 * rather than launching it — nesting one full-screen Ink app inside another is
 * a reliable way to corrupt the terminal.
 *
 * Two backends, one screen. Against a hosted project the decisions are PATCHed
 * to the API. With no project — the configuration everything defaults to — they
 * are written to `.sirius/triage.json` beside the code, and a dismissal or a
 * suppression additionally becomes a real suppression that the next scan
 * honours. Triage that records a judgement nothing ever reads is theatre.
 */

import { render } from 'ink';
import React from 'react';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig } from '../config/load.js';
import { addSuppression, loadTriage, recordTriage, triageKey } from '../engine/store.js';
import { localRule } from '../engine/catalog.js';
import { VERSION } from '../branding.js';
import { locateLastScan } from '../session.js';
import type { CachedFinding, LastScan } from '../session.js';
import { TriageView } from '../ui/TriageView.js';
import { detectCapabilities, glyphsFor } from '../ui/theme.js';
import type { TriageSummary } from '../ui/TriageView.js';
import type { Category, Finding, TriageState } from '../domain.js';

interface TriageFlags {
  scan?: string;
  severity?: string;
  all?: boolean;
  target?: string;
}

interface GlobalFlags {
  apiUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

/** How a decision is saved, and what to say once the screen closes. */
interface Backend {
  findings: Finding[];
  decide: (finding: Finding, state: TriageState, reason?: string) => Promise<void>;
  /** Printed after the summary line — where the decisions went. */
  epilogue?: string;
}

export async function runTriage(flags: TriageFlags, globals: GlobalFlags): Promise<void> {
  const capabilities = detectCapabilities({ noColor: globals.color === false });

  // Both halves matter. stdout being a terminal is not enough: if stdin is a
  // pipe, the keypresses this screen waits for can never arrive and it would
  // hang forever instead of failing.
  if (!capabilities.tty || !process.stdin.isTTY) {
    throw new CliError('`sirius triage` needs an interactive terminal.', {
      hint: !capabilities.tty
        ? 'Use `sirius scan . --json` in a pipeline instead.'
        : 'stdin is not a terminal — triage cannot read keypresses.',
    });
  }

  const cwd = process.cwd();
  const config = loadConfig({
    cwd,
    overrides: { apiUrl: globals.apiUrl, projectId: globals.project, profile: globals.profile },
  });

  const backend = flags.scan
    ? await hostedBackend(flags, config, flags.scan)
    : await backendForLastScan(flags, config, cwd);

  if (backend.findings.length === 0) {
    process.stdout.write('Nothing to triage — this scan has no findings.\n');
    return;
  }

  const summary = await renderTriage({
    findings: backend.findings,
    decide: backend.decide,
    capabilities,
    glyphs: glyphsFor(capabilities),
  });

  const parts = [
    summary.accepted ? `${summary.accepted} accepted` : undefined,
    summary.dismissed ? `${summary.dismissed} dismissed` : undefined,
    summary.suppressed ? `${summary.suppressed} suppressed` : undefined,
  ].filter(Boolean);

  process.stdout.write(
    parts.length > 0
      ? `Triaged: ${parts.join(', ')}. ${summary.remaining} still open.\n`
      : `Nothing triaged. ${summary.remaining} still open.\n`,
  );

  if (parts.length > 0 && backend.epilogue) process.stdout.write(backend.epilogue);

  // A decision that was not saved is worse than no decision, because the user
  // believes it was recorded. Surface it and fail.
  if (summary.failed > 0) {
    throw new CliError(`${summary.failed} decision(s) could not be saved.`, {
      hint: 'Check your connection and re-run `sirius triage`.',
    });
  }
}

/** Picks the backend from what the last scan actually was. */
async function backendForLastScan(
  flags: TriageFlags,
  config: ReturnType<typeof loadConfig>,
  cwd: string,
): Promise<Backend> {
  const found = locateLastScan(cwd, flags.target);
  if (!found) {
    throw new CliError('No scan id given and no recent scan to fall back on.', {
      hint: 'Run `sirius scan .` first, or pass --scan <id>.',
    });
  }

  const { cache, root } = found;

  // A replay is a recording. There is nothing on a server to update and nothing
  // on disk the decisions would describe.
  if (cache.source === 'replay') {
    throw new CliError('The last scan was a replay, so there is nothing to triage.', {
      hint: 'Run `sirius scan .` to produce findings from your own code.',
    });
  }

  if (cache.source === 'api') return hostedBackend(flags, config, cache.scan_id);

  return localBackend(flags, root, cache);
}

/** Decisions go to the API, against a scan it issued. */
async function hostedBackend(
  flags: TriageFlags,
  config: ReturnType<typeof loadConfig>,
  scanId: string,
): Promise<Backend> {
  if (scanId.startsWith('local-')) {
    throw new CliError(`${scanId} is a local scan, so the API has never heard of it.`, {
      hint: 'Drop --scan to triage it here, or pass a scan id the API issued.',
    });
  }

  const client = new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });

  const findings = await client.getAllResults(scanId, {
    ...(flags.severity ? { severity: flags.severity } : {}),
    // Suppressed findings are hidden by default — they have already been judged.
    ...(flags.all ? { include_suppressed: true } : {}),
  });

  return {
    findings,
    decide: async (finding, state, reason) => {
      await client.triageFinding(scanId, finding.id, {
        triage_state: state,
        ...(reason ? { reason } : {}),
      });
    },
  };
}

/**
 * Decisions go to `.sirius/`, beside the code they describe.
 *
 * `accepted` is recorded and nothing else: an acknowledged risk is still a risk
 * and must keep failing the gate. `dismissed` and `suppressed` also write a
 * suppression, because a judgement the next scan ignores is not a judgement.
 * Both require a reason before the screen will submit them.
 *
 * Exported because this is where the behaviour lives — the screen above it is a
 * keymap, and a full-screen TUI cannot be driven through a pipe.
 */
export async function localBackend(flags: TriageFlags, root: string, cache: LastScan): Promise<Backend> {
  const decided = new Map(loadTriage(root).map((entry) => [triageKey(entry), entry]));

  const findings = cache.findings
    .map((cached) => hydrate(cached, cache.scan_id))
    .filter((finding) => !flags.severity || finding.severity === flags.severity)
    .map((finding) => {
      const previous = decided.get(triageKey(finding));
      return previous ? { ...finding, triage_state: previous.state } : finding;
    })
    // Already judged, so out of the way unless asked for. Note that after the
    // next scan they will be gone anyway: the suppression withholds them.
    .filter((finding) => flags.all || !finding.triage_state || finding.triage_state === 'open');

  return {
    findings,
    epilogue:
      `Recorded in ${root}/.sirius/triage.json` +
      ` — dismissed and suppressed findings are now in .sirius/suppressions.json\n` +
      `and will be withheld by the next scan. Commit both to review them.\n`,
    decide: async (finding, state, reason) => {
      if (state === 'open') return;

      recordTriage(root, {
        rule_id: finding.rule_id,
        file: finding.file,
        line: finding.line,
        ...(finding.fingerprint ? { fingerprint: finding.fingerprint } : {}),
        state,
        ...(reason ? { reason } : {}),
        decided_at: new Date().toISOString(),
      });

      if (state === 'accepted') return;

      // Scoped as tightly as the finding allows: the fingerprint when there is
      // one, otherwise this rule in this file. A decision about one finding must
      // never silence a rule across the repo.
      addSuppression(root, {
        rule_id: finding.rule_id,
        ...(finding.fingerprint
          ? { fingerprint: finding.fingerprint }
          : { path_glob: finding.file }),
        reason: reason ?? `${state} in triage`,
        // Permanent, matching `sirius suppress` with no --expires. A dismissal
        // is a claim the finding was wrong, which does not expire on its own.
        expires_at: null,
        created_at: new Date().toISOString(),
      });
    },
  };
}

/**
 * A cached finding back into the shape the screen renders.
 *
 * The cache stores what `fix` and `report` need, not a whole finding — and
 * deliberately never the snippet, which carries the redacted secret. Category
 * and message come from the compiled rule catalogue when the cache lacks them,
 * so this invents nothing.
 */
function hydrate(cached: CachedFinding, scanId: string): Finding {
  const rule = localRule(cached.rule_id, VERSION);

  return {
    id: cached.id,
    scan_id: scanId,
    file: cached.file,
    line: cached.line,
    severity: cached.severity,
    rule_id: cached.rule_id,
    category: (cached.category ?? rule?.category ?? 'secrets') as Category,
    message: cached.message ?? rule?.message ?? cached.rule_id,
    ...(cached.compliance_ref ? { compliance_ref: cached.compliance_ref } : {}),
    ...(cached.fingerprint ? { fingerprint: cached.fingerprint } : {}),
    ...(cached.money_at_risk_inr ? { money_at_risk_inr: cached.money_at_risk_inr } : {}),
    ...(cached.validity ? { validity: cached.validity as Finding['validity'] } : {}),
  } as Finding;
}

function renderTriage(args: {
  findings: Finding[];
  decide: (finding: Finding, state: TriageState, reason?: string) => Promise<void>;
  capabilities: ReturnType<typeof detectCapabilities>;
  glyphs: ReturnType<typeof glyphsFor>;
}): Promise<TriageSummary> {
  const { findings, decide, capabilities, glyphs } = args;

  return new Promise<TriageSummary>((resolvePromise) => {
    let settled = false;

    const instance = render(
      <TriageView
        findings={findings}
        glyphs={glyphs}
        capabilities={capabilities}
        onDecide={decide}
        onQuit={(summary) => {
          if (settled) return;
          settled = true;
          resolvePromise(summary);
        }}
      />,
    );

    instance.waitUntilExit().then(() => {
      if (!settled) {
        settled = true;
        resolvePromise({ accepted: 0, dismissed: 0, suppressed: 0, remaining: findings.length, failed: 0 });
      }
    });
  });
}
