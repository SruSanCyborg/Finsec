/**
 * The scanner half of the local API.
 *
 * Every route here answers from the same code the CLI command of the same name
 * runs. `GET /rules` is `sirius rules list`; `GET /scans/{id}/report` is `sirius
 * report`; `POST .../fix` is `sirius fix --dry-run`. Where a route has no CLI
 * equivalent it is a projection of something the engine already computed, never
 * a second implementation of it.
 *
 * The wire vocabulary is the contract's — snake_case fields, `money_at_risk_inr`
 * in whole rupees (`guard` counts in paise; the two subsystems have always
 * differed and the field names say which is which), the five-value severity
 * enum, `canceled` with one L. The GUI adapts
 * to this rather than the reverse: there is one contract, it is written down,
 * and a surface that invents its own shape is how four surfaces stopped agreeing
 * in the first place.
 */

import { readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { HANDLED, HttpError, Router, sendJson } from './http.js';
import type { RequestContext } from './http.js';
import { listProjects, register, rootFor, storeRoot } from './projects.js';
import { deleteScan, listScans, loadScan } from './scans.js';
import type { StoredScan } from './scans.js';
import type { ScanRegistry } from './runner.js';
import type { CachedFinding } from '../session.js';
import type { Severity } from '../domain.js';

export interface ServerContext {
  /** The directory the daemon was started in. Every unqualified request is about this. */
  root: string;
  version: string;
  scans: ScanRegistry;
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function severityOr(value: string | null, fallback: Severity): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : fallback;
}

/** The scan a route is about, or a 404 that names it. */
function requireScan(root: string, id: string): StoredScan {
  const stored = loadScan(root, id);
  if (!stored) throw new HttpError(404, `No such scan: ${id}`);
  return stored;
}

/**
 * A question plus whatever the composer already said in this session — the
 * part that gives Cerebus's chat memory. `history` is trusted only as far as
 * shape: each turn becomes one message to the model, nothing more.
 */
function parseAskBody(body: unknown): { question: string; history: { role: 'user' | 'assistant'; content: string }[] } {
  const parsed = (body ?? {}) as { question?: string; history?: unknown };
  const question = parsed.question?.trim();
  if (!question) throw new HttpError(400, 'Ask needs a `question`.');

  const history = Array.isArray(parsed.history)
    ? parsed.history
        .filter(
          (turn): turn is { role: 'user' | 'assistant'; content: string } =>
            Boolean(turn) &&
            (turn.role === 'user' || turn.role === 'assistant') &&
            typeof turn.content === 'string',
        )
        // Bounded, so a long-running session sends a growing prompt at a
        // fixed rate rather than one that grows with the whole conversation.
        .slice(-12)
    : [];

  return { question, history };
}

export function registerScannerRoutes(router: Router, ctx: ServerContext): void {
  // ------------------------------------------------------------------ health

  router.get('/healthz', () => ({
    status: 'ok',
    version: ctx.version,
    engine: 'local',
    root: ctx.root,
  }));

  // ---------------------------------------------------------------- projects

  router.get('/projects', () => listProjects(ctx.root).map((p) => projectView(p.id, p.name, p.path)));

  router.get('/projects/:id', ({ params }: RequestContext) => {
    const { dir } = rootFor(ctx.root, params.id);
    const project = listProjects(ctx.root).find((p) => p.id === params.id);
    if (!project) throw new HttpError(404, `No such project: ${params.id}`);
    return projectView(project.id, project.name, dir);
  });

  router.post('/projects', ({ body }: RequestContext) => {
    const path = (body as { path?: string } | undefined)?.path;
    if (!path) throw new HttpError(400, 'A project needs a `path` — the directory to scan.');
    const record = register(path);
    return projectView(record.id, record.name, record.path);
  });

  router.get('/projects/:id/history', ({ params, query }: RequestContext) => {
    const { dir, store } = rootFor(ctx.root, params.id);
    const limit = Number(query.get('limit') ?? 25);
    // `store` is where `.sirius/scans/` physically lives — the nearest
    // `sirius.yaml` above `dir`, which several registered projects can share.
    // Filtering to `dir` is what keeps one project's history from showing
    // every scan ever run against any of its siblings.
    return listScans(store, Number.isFinite(limit) ? limit : 25, dir).map(scanView);
  });

  // ------------------------------------------------------------------- scans

  router.get('/scans', ({ query }: RequestContext) => {
    const projectId = query.get('projectId') ?? query.get('project_id');
    const { dir, store } = rootFor(ctx.root, projectId);
    const limit = Number(query.get('limit') ?? 25);
    const status = query.get('status');
    // Only scoped when a project was actually named — the unfiltered call
    // (no projectId) is the daemon's own root's global feed and stays as-is.
    return listScans(store, Number.isFinite(limit) ? limit : 25, projectId ? dir : undefined)
      .filter((scan) => !status || scan.status === status)
      .map(scanView);
  });

  router.post('/scans', ({ body }: RequestContext) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const projectId = (input.project_id ?? input.projectId ?? null) as string | null;
    const { dir, store } = rootFor(ctx.root, projectId);

    // `target` is resolved *inside* the project, and a path that escapes it is
    // refused. Without this the daemon would scan any directory named in a
    // request body, which turns a token leak into read access to the whole
    // filesystem rather than to the projects the user opened.
    const requested = typeof input.target === 'string' && input.target.trim() ? input.target.trim() : '.';
    const target = resolve(dir, requested);
    const inside = relative(dir, target);
    if (inside.startsWith('..')) {
      throw new HttpError(400, `Scan target is outside the project: ${requested}`, 'SIRIUS_ERR_NO_TARGET');
    }

    const rulesets = Array.isArray(input.rulesets)
      ? (input.rulesets as string[])
      : typeof input.ruleset === 'string'
        ? [input.ruleset as string]
        : ['p/fintech-core'];

    const running = ctx.scans.start({
      target,
      root: store,
      projectId,
      rulesets,
      severityThreshold: severityOr((input.severity_threshold ?? input.severityThreshold ?? null) as string | null, 'high'),
      failOn: ((input.fail_on ?? input.failOn ?? 'all') as 'all' | 'new' | 'verified-secrets'),
      validateSecrets: Boolean(input.validate_secrets ?? input.validateSecrets),
      diffOnly: Boolean(input.diff_aware ?? input.diffOnly),
    });

    return scanView(running.record);
  });

  router.get('/scans/:id', ({ params, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    // A scan still running has no file on disk yet — it is only in the
    // registry. Checking there first is what lets the GUI poll a scan it just
    // started instead of getting a 404 for the id it was handed.
    const live = ctx.scans.get(params.id as string);
    return scanView(live?.record ?? requireScan(store, params.id as string));
  });

  router.delete('/scans/:id', ({ params, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const id = params.id as string;
    if (ctx.scans.cancel(id)) return { canceled: true, scan_id: id };
    if (deleteScan(store, id)) return { deleted: true, scan_id: id };
    throw new HttpError(404, `No such scan: ${id}`);
  });

  // ---------------------------------------------------------------- findings

  router.get('/scans/:id/results', ({ params, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scan = requireScan(store, params.id as string);

    const severity = query.get('severity');
    let items = scan.findings.map((f) => findingView(f, scan));
    if (severity) items = items.filter((f) => f.severity === severity);

    // A cursor that never advances is how `sirius triage` hung forever against
    // the mock. The whole result set fits in one page here, so the honest
    // answer is a null cursor rather than an echo of the one we were given.
    return { items, next_cursor: null, total: items.length };
  });

  router.get('/findings', ({ query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scanId = query.get('scanId') ?? query.get('scan_id');
    const scan = scanId ? requireScan(store, scanId) : listScans(store, 1)[0];
    if (!scan) return [];

    const severity = query.get('severity');
    const search = query.get('search')?.toLowerCase();

    return scan.findings
      .map((f) => findingView(f, scan))
      .filter((f) => !severity || f.severity === severity)
      .filter(
        (f) =>
          !search ||
          f.message.toLowerCase().includes(search) ||
          f.file.toLowerCase().includes(search) ||
          f.rule_id.toLowerCase().includes(search),
      );
  });

  router.get('/findings/:id', ({ params, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    for (const scan of listScans(store)) {
      const found = scan.findings.find((f) => f.id === params.id);
      if (found) return findingView(found, scan);
    }
    throw new HttpError(404, `No such finding: ${params.id}`);
  });

  /**
   * Triage, written where `sirius triage` reads it.
   *
   * Both surfaces record decisions into `.sirius/triage.json` through the same
   * function, so a finding accepted in the window is already accepted when the
   * terminal next opens the list. That shared file is most of what "the two
   * surfaces talk to each other" means in practice.
   */
  router.patch('/scans/:id/findings/:fid', async ({ params, query, body }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scan = requireScan(store, params.id as string);
    const finding = scan.findings.find((f) => f.id === params.fid);
    if (!finding) throw new HttpError(404, `No such finding in ${scan.id}: ${params.fid}`);

    const input = (body ?? {}) as { status?: string; state?: string; reason?: string; comment?: string };
    const state = normaliseTriage(input.state ?? input.status);

    const { recordTriage } = await import('../engine/store.js');
    recordTriage(store, {
      rule_id: finding.rule_id,
      file: finding.file,
      line: finding.line,
      ...(finding.fingerprint ? { fingerprint: finding.fingerprint } : {}),
      state,
      // Required for everything except `accepted`, and the GUI's dialog makes
      // it required there too. A dismissal with no reason is the same
      // unexplained hole a suppression with no reason is.
      ...(state === 'accepted' ? {} : { reason: input.reason ?? input.comment ?? 'Triaged from the desktop app' }),
      decided_at: new Date().toISOString(),
    });

    return { ...findingView(finding, scan), triage_state: state };
  });

  router.post('/scans/:id/findings/:fid/validate-secret', async ({ params, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scan = requireScan(store, params.id as string);
    const finding = scan.findings.find((f) => f.id === params.fid);
    if (!finding) throw new HttpError(404, `No such finding in ${scan.id}: ${params.fid}`);

    // Read from the file, not from the finding.
    //
    // `--validate-secrets` once probed the finding's own snippet, which is
    // redacted before it ever leaves the engine — so every provider check
    // returned `unknown` and the feature could not have verified anything. The
    // source on disk is the only place the full credential exists.
    const { checkExposureAt } = await import('../engine/threat.js');
    const probe = await checkExposureAt(join(scan.target, finding.file), finding.line);

    return {
      validity: probe.exposure,
      ...(probe.provider ? { provider: probe.provider } : {}),
      ...(probe.detail ? { detail: probe.detail } : {}),
      checked_at: new Date().toISOString(),
    };
  });

  // ----------------------------------------------------------------- cerebus

  /**
   * A proposed fix, built and verified but never written.
   *
   * `sirius fix` prompts before it writes; the daemon has nobody to prompt, so
   * this is the `--dry-run` half only. Applying it is a separate, explicit
   * request — a background HTTP call that edits source files because a webview
   * rendered a panel is not a thing this should be able to do.
   */
  router.post('/scans/:id/findings/:fid/fix', async ({ params, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scan = requireScan(store, params.id as string);
    const finding = scan.findings.find((f) => f.id === params.fid);
    if (!finding) throw new HttpError(404, `No such finding in ${scan.id}: ${params.fid}`);

    const absolute = join(scan.target, finding.file);
    let source: string;
    try {
      source = readFileSync(absolute, 'utf8');
    } catch {
      throw new HttpError(409, `The file this finding is in has moved or been deleted: ${finding.file}`);
    }

    const { buildLocalFix } = await import('../engine/fix.js');
    const { findAuthConvention } = await import('../engine/conventions.js');

    // The same project context the CLI's `fix` discovers, so a template that
    // reaches for the project's own auth decorator finds it here too.
    const auth = findAuthConvention(scan.target);

    const fix = await buildLocalFix({
      filePath: absolute,
      source,
      line: finding.line,
      ruleId: finding.rule_id,
      action: finding.fix_action ?? '',
      ...(auth ? { context: { auth: { name: auth.name, ...(auth.importLine ? { importLine: auth.importLine } : {}) } } } : {}),
    });

    if (!fix) {
      // No template covers this rule. Saying so is the point: a panel that
      // renders a plausible patch nobody generated is worse than an empty one.
      throw new HttpError(422, `No fix template covers ${finding.rule_id} yet.`, 'SIRIUS_ERR_NO_FIX');
    }

    return fixView(finding, fix);
  });

  /**
   * Actually writes the fix.
   *
   * The command line prompts before writing unless `--apply` is given; a
   * button in a window has nobody to prompt, so this route is the `--apply`
   * half — it writes immediately. Machine-applicable fixes only: a template
   * flagged `maybe-incorrect` or `has-placeholders` needs a person reading the
   * diff before it lands, on either surface, and skipping that check here
   * would make the desktop app less careful than the terminal it is a client
   * of.
   */
  router.post('/scans/:id/findings/:fid/fix/apply', async ({ params, query }: RequestContext) => {
    const store = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id')).store;
    const scan = requireScan(store, params.id as string);
    const finding = scan.findings.find((f) => f.id === params.fid);
    if (!finding) throw new HttpError(404, `No such finding in ${scan.id}: ${params.fid}`);

    const absolute = join(scan.target, finding.file);
    let source: string;
    try {
      source = readFileSync(absolute, 'utf8');
    } catch {
      throw new HttpError(409, `The file this finding is in has moved or been deleted: ${finding.file}`);
    }

    const { buildLocalFix } = await import('../engine/fix.js');
    const { findAuthConvention } = await import('../engine/conventions.js');
    const auth = findAuthConvention(scan.target);

    const fix = await buildLocalFix({
      filePath: absolute,
      source,
      line: finding.line,
      ruleId: finding.rule_id,
      action: finding.fix_action ?? '',
      ...(auth ? { context: { auth: { name: auth.name, ...(auth.importLine ? { importLine: auth.importLine } : {}) } } } : {}),
    });

    if (!fix) throw new HttpError(422, `No fix template covers ${finding.rule_id} yet.`, 'SIRIUS_ERR_NO_FIX');

    if (fix.applicability !== 'machine-applicable') {
      throw new HttpError(
        409,
        `This fix is ${fix.applicability} and needs a person reading the diff — the same rule \`sirius fix\` applies without --unsafe-fixes.`,
        'SIRIUS_ERR_UNSAFE_FIX',
      );
    }

    const { writeFileSync } = await import('node:fs');
    writeFileSync(absolute, fix.patched, 'utf8');
    for (const effect of fix.sideEffects) writeFileSync(effect.file, effect.content, 'utf8');

    return { ...fixView(finding, fix), applied: true, applied_at: new Date().toISOString() };
  });

  /**
   * Cerebus's chat: a real model answer, grounded in one finding's own
   * recorded facts and the conversation so far. See `engine/ask.ts` for what
   * it is and isn't allowed to see.
   */
  router.post('/scans/:id/findings/:fid/ask', async ({ params, query, body }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scan = requireScan(store, params.id as string);
    const finding = scan.findings.find((f) => f.id === params.fid);
    if (!finding) throw new HttpError(404, `No such finding in ${scan.id}: ${params.fid}`);

    const { question, history } = parseAskBody(body);
    const { askCerebus } = await import('../engine/ask.js');
    const answer = await askCerebus(finding, null, question, history);
    return { answer };
  });

  /**
   * The same chat, with no finding selected — grounded in the project's most
   * recent scan instead of one finding's facts. Real numbers either way, just
   * a coarser grain when nothing more specific is in view.
   */
  router.post('/cerebus/ask', async ({ query, body }: RequestContext) => {
    const { dir, store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const { question, history } = parseAskBody(body);

    const [latest] = listScans(store, 1, dir);
    const project =
      latest?.summary
        ? {
            name: basename(dir),
            counts: latest.summary.counts,
            moneyAtRiskInr: latest.summary.money_at_risk_inr,
            complianceScore: latest.summary.compliance_score,
          }
        : null;

    const { askCerebus } = await import('../engine/ask.js');
    const answer = await askCerebus(null, project, question, history);
    return { answer };
  });

  router.get('/cerebus/fix-result/:fid', () => {
    // There is no pipeline to poll: the fix is built synchronously by the
    // request above and returned whole. Kept so a client written against the
    // hosted shape gets a clear answer rather than a hang.
    throw new HttpError(
      501,
      'Fixes are built synchronously by the local engine — POST the fix endpoint and read the response.',
    );
  });

  // --------------------------------------------------------------- analytics

  router.get('/analytics/money-at-risk', ({ query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const history = listScans(store, 25);
    const latest = history[0];

    const bySeverity: Record<string, number> = {};
    const byFinding: Record<string, number> = {};
    for (const finding of latest?.findings ?? []) {
      const amount = finding.money_at_risk_inr ?? 0;
      bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + amount;
      byFinding[finding.id] = amount;
    }

    return {
      // The footer total the scan reported, not a re-addition of the findings.
      // Those are two different numbers when anything was suppressed, and the
      // one the user saw is the one that must be shown again here.
      total_inr: latest?.summary?.money_at_risk_inr ?? 0,
      by_severity_inr: bySeverity,
      by_finding_inr: byFinding,
      model_version: 'exposure-model/1',
      trend: history
        .filter((scan) => scan.summary)
        .map((scan) => ({ at: scan.finished_at ?? scan.started_at, amount_inr: scan.summary?.money_at_risk_inr ?? 0 }))
        .reverse(),
    };
  });

  router.get('/compliance/frameworks', async ({ query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const latest = listScans(store, 1)[0];
    const { localRules } = await import('../engine/catalog.js');

    // Every clause the catalogue checks is a control, and a control fails when
    // the latest scan has a finding referencing it. A framework view built only
    // from the failures would show 100% on a project nobody has scanned.
    const failing = new Set<string>();
    for (const finding of latest?.findings ?? []) {
      for (const ref of finding.compliance_ref ?? []) failing.add(ref);
    }

    const frameworks = new Map<string, { controls: Map<string, { rules: string[]; failing: boolean }> }>();
    for (const rule of localRules(ctx.version)) {
      for (const ref of rule.compliance_ref ?? []) {
        const [family = ref, clause = '—'] = ref.split(':');
        const entry = frameworks.get(family) ?? { controls: new Map() };
        const control = entry.controls.get(clause) ?? { rules: [], failing: false };
        control.rules.push(rule.id);
        control.failing = control.failing || failing.has(ref);
        entry.controls.set(clause, control);
        frameworks.set(family, entry);
      }
    }

    return [...frameworks.entries()].map(([id, entry]) => {
      const controls = [...entry.controls.entries()].map(([clause, control]) => ({
        clause,
        rules: control.rules,
        status: control.failing ? 'failing' : 'passing',
      }));
      const failed = controls.filter((c) => c.status === 'failing').length;
      return {
        id,
        name: id,
        version: id === 'PCI-DSS' ? 'v4.0' : null,
        total_controls: controls.length,
        failing_controls: failed,
        passing_controls: controls.length - failed,
        controls,
        scanned_at: latest?.finished_at ?? null,
      };
    });
  });

  router.get('/attack-paths', async ({ query }: RequestContext) => {
    const { dir, store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const latest = listScans(store, 1, dir)[0];
    if (!latest) return [];

    const { buildAttackPaths } = await import('../engine/threat.js');
    // `buildAttackPaths` wants findings, and the cache stores the subset that
    // survives being written down. Everything the graph reads is in that subset.
    const paths = buildAttackPaths(latest.findings.map((f) => findingView(f, latest) as never));

    // Reshaped onto the wire vocabulary rather than passed through: the
    // engine's own `AttackPath` nests a full `Finding` per step, which is not
    // the shape any other route sends over the wire and would leak whatever
    // fields `findingView` normally strips. `finding_id` is enough for the
    // client to cross-reference the finding it already has.
    return paths.map((path) => ({
      id: path.id,
      title: path.title,
      severity: path.severity,
      narrative: path.narrative,
      money_at_risk_inr: path.money_at_risk_inr,
      steps: path.steps.map((step, i) => ({
        order: i,
        role: step.role,
        finding_id: step.finding.id,
        rule_id: step.finding.rule_id,
        file: step.finding.file,
        severity: step.finding.severity,
      })),
    }));
  });

  /**
   * A real narrative for one attack chain — the client already has the full
   * path (it just fetched it from the route above), so this takes the steps
   * in the request body rather than re-deriving a path by id from a store
   * that never gave attack paths a stable, addressable identity to begin with.
   */
  router.post('/attack-paths/explain', async ({ body }: RequestContext) => {
    const input = (body ?? {}) as {
      title?: string;
      narrative?: string;
      steps?: { role?: string; ruleId?: string; file?: string; severity?: string }[];
      moneyAtRiskInr?: number;
    };

    if (!input.title || !Array.isArray(input.steps) || input.steps.length === 0) {
      throw new HttpError(400, 'Explain needs a `title` and at least one step.');
    }

    const steps = input.steps.map((s) => ({
      role: s.role ?? 'step',
      ruleId: s.ruleId ?? 'unknown',
      file: s.file ?? 'unknown',
      severity: s.severity ?? 'medium',
    }));

    const { explainAttackPath } = await import('../engine/explain-attack-path.js');
    const explanation = await explainAttackPath({
      title: input.title,
      narrative: input.narrative,
      steps,
      moneyAtRiskInr: input.moneyAtRiskInr ?? 0,
    });
    return { explanation };
  });

  // ------------------------------------------------------------------ rules

  router.get('/rules', async ({ query }: RequestContext) => {
    const { localRules } = await import('../engine/catalog.js');
    const category = query.get('category');
    return localRules(ctx.version).filter((rule) => !category || rule.category === category);
  });

  router.post('/rules/validate', async ({ body }: RequestContext) => {
    const yamlBody = (body as { yaml_body?: string } | undefined)?.yaml_body;
    if (typeof yamlBody !== 'string') throw new HttpError(400, 'Expected a `yaml_body` string.');

    const { validateRuleDocument } = await import('../engine/rule-schema.js');
    return validateRuleDocument(yamlBody);
  });

  // ------------------------------------------------------------- governance

  router.get('/suppressions', async ({ query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const { isExpired, loadSuppressions } = await import('../engine/store.js');
    const now = new Date();
    return loadSuppressions(store).map((entry) => ({ ...entry, expired: isExpired(entry, now) }));
  });

  router.post('/suppressions', async ({ body, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const input = (body ?? {}) as Record<string, string | undefined>;

    // The reason is mandatory here for the same reason it is mandatory on the
    // command line: a suppression with no stated reason is an unexplained hole
    // in the report, and the person who has to defend it later is not the
    // person who clicked the button.
    const reason = input.reason?.trim();
    if (!reason) throw new HttpError(400, 'A suppression needs a reason.');

    const { addSuppression } = await import('../engine/store.js');
    const entry = {
      ...(input.rule_id ? { rule_id: input.rule_id } : {}),
      ...(input.path_glob ? { path_glob: input.path_glob } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
      reason,
      expires_at: input.expires_at ?? null,
      created_at: new Date().toISOString(),
    };
    addSuppression(store, entry);
    return entry;
  });

  /**
   * `.sirius/suppressions.json` only ever keys a suppression by rule id — see
   * `engine/store.ts`'s `removeSuppression`. A suppression scoped to a path
   * glob or a single fingerprint cannot be revoked individually through this
   * route; the CLI has the same limit today. Revoking removes every
   * suppression for the rule, which is the same thing `sirius suppress`
   * overwriting an entry does.
   */
  router.delete('/suppressions/:ruleId', async ({ params, query }: RequestContext) => {
    const store = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id')).store;
    const { removeSuppression } = await import('../engine/store.js');
    const result = removeSuppression(store, params.ruleId as string);
    if (result.removed === 0) throw new HttpError(404, `No suppression for rule ${params.ruleId}.`);
    return { removed: result.removed };
  });

  router.get('/baselines', async ({ query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const { loadBaseline } = await import('../engine/store.js');
    const baseline = loadBaseline(store);
    return baseline ? [baseline] : [];
  });

  router.post('/baselines', async ({ body, query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const input = (body ?? {}) as { scan_id?: string; commit_sha?: string };

    const scan = input.scan_id ? requireScan(store, input.scan_id) : listScans(store, 1)[0];
    if (!scan) throw new HttpError(409, 'Nothing to baseline — run a scan first.');

    const fingerprints = scan.findings
      .map((f) => f.fingerprint)
      .filter((fp): fp is string => typeof fp === 'string');

    const { saveBaseline } = await import('../engine/store.js');
    return saveBaseline(store, input.commit_sha ?? null, fingerprints);
  });

  // ---------------------------------------------------------------- reports

  router.get('/reports', ({ query }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    return listScans(store)
      .filter((scan) => scan.status === 'completed')
      .map((scan) => ({
        scan_id: scan.id,
        created_at: scan.finished_at,
        compliance_score: scan.summary?.compliance_score ?? null,
        money_at_risk_inr: scan.summary?.money_at_risk_inr ?? 0,
        formats: ['json', 'sarif'],
      }));
  });

  router.get('/scans/:id/report', async ({ params, query, res }: RequestContext) => {
    const { store } = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id'));
    const scan = requireScan(store, params.id as string);
    const format = query.get('format') ?? 'json';

    if (format === 'sarif') {
      const { buildSarif } = await import('../render/sarif.js');
      return buildSarif(scan.findings.map((f) => findingView(f, scan) as never), { toolVersion: ctx.version });
    }

    // The same payload `sirius report` signs, from the same builder, so a
    // report downloaded from the window verifies with `sirius report --verify`
    // and carries a signature over identical bytes.
    const { buildReportPayload } = await import('../engine/report-document.js');
    const { attest } = await import('../engine/attest.js');
    const payload = buildReportPayload({
      root: store,
      scanId: scan.id,
      scannedAt: scan.finished_at ?? scan.started_at,
      source: scan.source,
      version: ctx.version,
      findings: scan.findings,
      summary: scan.summary,
      counts: scan.summary?.counts ?? {},
    });
    const document = { ...payload, attestation: attest(payload) };

    if (format === 'json') return document;

    if (format === 'pdf') {
      const { reportToPdf } = await import('../engine/report-pdf.js');
      const pdf = reportToPdf(document as never);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': `attachment; filename="sirius-report-${scan.id}.pdf"`,
      });
      res.end(pdf);
      return HANDLED;
    }

    throw new HttpError(400, `Unknown report format: ${format}. Expected json, sarif or pdf.`);
  });

  // --------------------------------------------------------------- settings

  /**
   * The project's own `sirius.yaml`, read the way every scan already reads it.
   *
   * Not editable from here — writing config is `sirius init`'s job, and a
   * button in the desktop app editing YAML on disk needs more care than a
   * settings toggle. This exists so the app's policy panel can show the
   * severity threshold and fail-on predicate a scan will actually use, rather
   * than a value nobody configured.
   */
  router.get('/config', async ({ query }: RequestContext) => {
    const store = rootFor(ctx.root, query.get('projectId') ?? query.get('project_id')).store;
    const { loadConfig } = await import('../config/load.js');
    const config = loadConfig({ cwd: store });
    return {
      rulesets: config.rulesets,
      severity_threshold: config.severityThreshold,
      fail_on: config.failOn,
      diff_aware: config.diffAware,
      validate_secrets: config.validateSecrets,
      project_id: config.projectId ?? null,
    };
  });

  router.get('/settings/integrations', () => []);
  router.get('/notifications', () => []);
}

// ------------------------------------------------------------------- views

function projectView(id: string, name: string, path: string) {
  // `.sirius/scans/` may live above `path`, not inside it — the same reason
  // `/projects/:id/history` reads `store` rather than `dir`. Scoped to `path`
  // itself so a sibling project's more recent scan doesn't get shown here.
  const latest = listScans(storeRoot(path), 1, path)[0];
  return {
    id,
    name,
    path,
    // A local directory has no repository URL and inventing one would put a
    // link in the UI that goes nowhere. The path is what identifies it here.
    last_scan_id: latest?.id ?? null,
    last_scan_at: latest?.finished_at ?? null,
    compliance_score: latest?.summary?.compliance_score ?? null,
    money_at_risk_inr: latest?.summary?.money_at_risk_inr ?? 0,
    counts: latest?.summary?.counts ?? {},
  };
}

function scanView(scan: StoredScan) {
  const counts = scan.summary?.counts ?? {};
  return {
    id: scan.id,
    project_id: scan.project_id,
    target: scan.target,
    status: scan.status,
    source: scan.source,
    origin: scan.origin,
    started_at: scan.started_at,
    finished_at: scan.finished_at,
    exit_code: scan.exit_code,
    rulesets: scan.rulesets,
    severity_threshold: scan.severity_threshold,
    fail_on: scan.fail_on,
    counts,
    total_findings: Object.values(counts).reduce((a, b) => a + b, 0),
    money_at_risk_inr: scan.summary?.money_at_risk_inr ?? 0,
    compliance_score: scan.summary?.compliance_score ?? null,
    files_scanned: scan.summary?.files_scanned ?? null,
    ...(scan.error ? { error: scan.error } : {}),
  };
}

function findingView(finding: CachedFinding, scan: StoredScan) {
  return {
    id: finding.id,
    scan_id: scan.id,
    project_id: scan.project_id,
    rule_id: finding.rule_id,
    file: finding.file,
    line: finding.line,
    severity: finding.severity,
    category: finding.category ?? 'secrets',
    message: finding.message ?? finding.rule_id,
    compliance_ref: finding.compliance_ref ?? [],
    money_at_risk_inr: finding.money_at_risk_inr ?? 0,
    fingerprint: finding.fingerprint ?? null,
    validity: finding.validity ?? 'unknown',
    fix_action: finding.fix_action ?? null,
    // Deliberately absent: `snippet`. The cache does not store it — it carries
    // the redacted secret — and the daemon does not go back to the file to
    // reconstruct one for the wire.
  };
}

function fixView(finding: CachedFinding, fix: Awaited<ReturnType<typeof import('../engine/fix.js').buildLocalFix>>) {
  if (!fix) throw new HttpError(500, 'fixView called without a fix');
  return {
    finding_id: finding.id,
    rule_id: finding.rule_id,
    action: fix.action,
    diff: fix.diff,
    patched: fix.patched,
    // `template selector`, not `quarantined model`: no LLM runs here, and the
    // panel must not imply one did.
    provenance: 'template selector',
    verifier_status: fix.verifierStatus,
    verifier_detail: fix.verifierDetail,
    applicability: fix.applicability,
    confidence: fix.confidence,
    escalate: fix.escalate,
    stages: fix.stages,
    side_effects: fix.sideEffects,
    ...(fix.behaviourNote ? { behaviour_note: fix.behaviourNote } : {}),
  };
}

/**
 * The GUI's status vocabulary, mapped onto the one on disk.
 *
 * `.sirius/triage.json` has three states and `sirius triage` reads them; the
 * GUI's own type has a longer list. Anything unrecognised lands on `dismissed`
 * rather than being written through, because a state the CLI cannot read is a
 * decision that silently disappears the next time someone opens the terminal.
 */
function normaliseTriage(value: string | undefined): 'accepted' | 'dismissed' | 'suppressed' {
  switch ((value ?? '').toLowerCase()) {
    case 'accepted':
    case 'accept':
    case 'confirmed':
    case 'open':
      return 'accepted';
    case 'suppressed':
    case 'suppress':
    case 'ignored':
      return 'suppressed';
    default:
      return 'dismissed';
  }
}
