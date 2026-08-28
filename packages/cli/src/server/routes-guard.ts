/**
 * `guard` over HTTP.
 *
 * The GUI had eleven views and every one of them was about the scanner, which
 * made the desktop app an answer to a problem statement nobody set. The control
 * layer is the lead surface — whether an autonomous agent may move money, judged
 * per action — so it needs a window of its own.
 *
 * Nothing is judged here. `evaluateFeed` is the same fold the command runs, in
 * the same order, off the same feed on disk; these routes shape its output for a
 * client. A second implementation of the six stages living behind an HTTP
 * handler is precisely how the verdict a demo shows stops being the verdict the
 * tool reaches.
 */

import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { HttpError, Router } from './http.js';
import type { RequestContext } from './http.js';
import { rootFor } from './projects.js';
import type { ServerContext } from './routes.js';
import type { Decision, ProposedAction, Tier } from '../guard/types.js';

const TIERS: Tier[] = ['allow', 'verify', 'constrain', 'block'];

/**
 * The feed directory a request is about, constrained to the project.
 *
 * Same reasoning as the scan target: a directory named in a query string is
 * attacker-controlled the moment the token is, and a daemon that will read any
 * path on the machine is a file-disclosure endpoint wearing a product's name.
 */
function feedDir(root: string, requested: string | null): string {
  const dir = resolve(root, requested?.trim() || 'feed');
  if (relative(root, dir).startsWith('..')) {
    throw new HttpError(400, `Feed directory is outside the project: ${requested}`);
  }
  if (!existsSync(dir)) {
    throw new HttpError(404, `No agent feed at ${dir}.`, 'SIRIUS_ERR_NO_FEED');
  }
  return dir;
}

/**
 * One evaluation of a feed, cached by directory.
 *
 * Four of the six routes below need the same fold, and folding a 278-action
 * feed on every request would make a page that renders four panels do the work
 * four times. Keyed by directory and dropped whenever the feed's own files are
 * newer, so editing the feed does not leave the window showing yesterday's
 * verdicts.
 */
interface Folded {
  decisions: Decision[];
  actions: ProposedAction[];
  agents: Awaited<ReturnType<typeof import('../guard/store.js').loadFeed>>['agents'];
  truth: Record<string, string>;
}

const cache = new Map<string, { at: number; value: Folded }>();
const TTL_MS = 5_000;

async function fold(dir: string): Promise<Folded> {
  const hit = cache.get(dir);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { loadFeed } = await import('../guard/store.js');
  const { evaluateFeed } = await import('../guard/loop.js');

  const feed = loadFeed(dir);

  // Baselines start empty, every time.
  //
  // `guard eval` is idempotent by default and this must be too: it once
  // persisted baselines and reloaded them, so a second run over the same feed
  // folded its own actions in twice and blocked 259 of 278. A read-only HTTP
  // GET that changes its own answer when you refresh the page is the same bug
  // with a worse blast radius.
  const { decisions } = evaluateFeed(feed.actions, feed.agents, { baselines: {} });

  const value: Folded = {
    decisions,
    actions: feed.actions,
    agents: feed.agents,
    truth: feed.truth as unknown as Record<string, string>,
  };
  cache.set(dir, { at: Date.now(), value });
  return value;
}

export function registerGuardRoutes(router: Router, ctx: ServerContext): void {
  // The feed is a directory in the project, so it is resolved against the
  // project itself — not against `.sirius/`'s home, which may be above it.
  const dirFor = (query: URLSearchParams): string =>
    feedDir(rootFor(ctx.root, query.get('projectId') ?? query.get('project_id')).dir, query.get('feed'));

  // ------------------------------------------------------------------ agents

  router.get('/guard/agents', async ({ query }: RequestContext) => {
    const { agents, decisions, actions } = await fold(dirFor(query));

    const byAgent = new Map<string, Decision[]>();
    for (const decision of decisions) {
      byAgent.set(decision.agent_id, [...(byAgent.get(decision.agent_id) ?? []), decision]);
    }
    const requested = new Map(actions.map((a) => [a.id, a.amount_paise]));

    return agents.map((agent) => {
      const mine = byAgent.get(agent.id) ?? [];
      const counts: Record<string, number> = { allow: 0, verify: 0, constrain: 0, block: 0 };
      for (const d of mine) counts[d.tier] = (counts[d.tier] ?? 0) + 1;

      return {
        id: agent.id,
        name: agent.name,
        objective: agent.objective,
        limits: agent.limits,
        actions: mine.length,
        counts,
        // The share that went through untouched. This is the number an
        // operator actually feels: a layer that stops every attack and also
        // interrupts most of the ordinary work gets switched off in a week.
        autonomy: mine.length ? (counts.allow ?? 0) / mine.length : null,
        requested_paise: mine.reduce((sum, d) => sum + (requested.get(d.action_id) ?? 0), 0),
      };
    });
  });

  // -------------------------------------------------------------- decisions

  router.get('/guard/decisions', async ({ query }: RequestContext) => {
    const { decisions, actions } = await fold(dirFor(query));
    const byId = new Map(actions.map((a) => [a.id, a]));

    const tier = query.get('tier');
    if (tier && !TIERS.includes(tier as Tier)) {
      throw new HttpError(400, `Unknown tier: ${tier}. Expected ${TIERS.join(', ')}.`);
    }
    const agent = query.get('agent');
    const limitRaw = Number(query.get('limit') ?? 200);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 0 ? limitRaw : 200;

    const rows = decisions
      .filter((d) => !tier || d.tier === tier)
      .filter((d) => !agent || d.agent_id === agent);

    return {
      total: rows.length,
      items: rows.slice(0, limit).map((d) => decisionView(d, byId.get(d.action_id))),
    };
  });

  router.get('/guard/decisions/:actionId', async ({ params, query }: RequestContext) => {
    const { decisions, actions } = await fold(dirFor(query));
    const decision = decisions.find((d) => d.action_id === params.actionId);
    if (!decision) throw new HttpError(404, `No such action in this feed: ${params.actionId}`);
    const action = actions.find((a) => a.id === params.actionId);

    return {
      ...decisionView(decision, action),
      // Every signal, not just the deciding one — the explanation is what the
      // other five stages saw and chose not to raise.
      signals: decision.signals,
      action: action ?? null,
    };
  });

  // ------------------------------------------------------------------ score

  /**
   * How the layer did against what was actually planted.
   *
   * Reported per planted kind, and with the ordinary-traffic rate beside it,
   * because "94% accurate" over a feed that is 90% routine says nothing. The
   * two failures — missing an attack, and interrupting ordinary work — have
   * different costs and only one of them shows up in a catch count.
   */
  router.get('/guard/score', async ({ query }: RequestContext) => {
    const dir = dirFor(query);
    const { decisions, truth } = await fold(dir);

    if (Object.keys(truth).length === 0) {
      throw new HttpError(
        409,
        `No truth file in ${dir} — only a generated feed can be scored, because the planted cases are what it is scored against.`,
      );
    }

    const byId = new Map(decisions.map((d) => [d.action_id, d]));
    const groups = new Map<string, Record<string, number>>();
    for (const [actionId, planted] of Object.entries(truth)) {
      const tier = byId.get(actionId)?.tier ?? 'allow';
      const row = groups.get(planted) ?? {};
      row[tier] = (row[tier] ?? 0) + 1;
      groups.set(planted, row);
    }

    const ordinary = groups.get('none') ?? {};
    const ordinaryTotal = Object.values(ordinary).reduce((a, b) => a + b, 0);
    const intervened = ordinaryTotal - (ordinary.allow ?? 0);

    const attacks = [...groups.entries()].filter(([planted]) => planted !== 'none');
    const attackTotal = attacks.reduce((sum, [, row]) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);
    const attackStopped = attacks.reduce((sum, [, row]) => sum + (row.block ?? 0) + (row.constrain ?? 0) + (row.verify ?? 0), 0);

    return {
      by_planted: Object.fromEntries(groups),
      attacks_total: attackTotal,
      attacks_stopped: attackStopped,
      ordinary_total: ordinaryTotal,
      ordinary_intervened: intervened,
      ordinary_intervention_rate: ordinaryTotal ? intervened / ordinaryTotal : 0,
      autonomy: ordinaryTotal ? (ordinary.allow ?? 0) / ordinaryTotal : null,
    };
  });

  // ------------------------------------------------------------------ money

  router.get('/guard/summary', async ({ query }: RequestContext) => {
    const { decisions, actions } = await fold(dirFor(query));
    const { tally, moneyMoved } = await import('../guard/loop.js');
    return {
      actions: decisions.length,
      counts: tally(decisions),
      money: moneyMoved(decisions, actions),
    };
  });

  // ------------------------------------------------------------------ trail

  /**
   * The signed decision trail.
   *
   * Produced on request rather than read from a file, so the trail the window
   * offers is a trail over the decisions currently on screen — and it is signed
   * by the same key `sirius guard --verify` checks against.
   */
  router.get('/guard/trail', async ({ query }: RequestContext) => {
    const dir = dirFor(query);
    const { decisions, actions } = await fold(dir);

    const { GuardTrailLog } = await import('../guard/trail.js');
    const byId = new Map(actions.map((a) => [a.id, a]));

    // The run id is derived from the feed rather than minted, so asking for the
    // trail twice over an unchanged feed produces the same document. A trail
    // whose identity changes on every GET cannot be compared with the one
    // somebody saved a minute ago.
    const startedAt = decisions[0]?.at ?? new Date(0).toISOString();
    const log = new GuardTrailLog(`gui-${relative(ctx.root, dir) || 'feed'}`, dir, startedAt, 'simulated');

    for (const decision of decisions) {
      log.append(decision, byId.get(decision.action_id)?.amount_paise ?? decision.amount_paise);
    }
    return log.seal();
  });
}

function decisionView(decision: Decision, action: ProposedAction | undefined) {
  return {
    action_id: decision.action_id,
    agent_id: decision.agent_id,
    at: decision.at,
    tier: decision.tier,
    amount_paise: decision.amount_paise,
    requested_paise: action?.amount_paise ?? decision.amount_paise,
    ...(decision.constrained_from_paise !== undefined
      ? { constrained_from_paise: decision.constrained_from_paise }
      : {}),
    // The verdict is the strongest signal raised, never a weighted score, so
    // the deciding signal is the whole explanation of the tier.
    deciding: decision.deciding ?? null,
    signal_count: decision.signals.length,
    ...(action
      ? {
          kind: action.kind,
          counterparty: action.counterparty,
          instruction_source: action.instruction?.source ?? null,
        }
      : {}),
  };
}
