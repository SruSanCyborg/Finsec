/**
 * The control layer for agents that can move money on their own.
 *
 * `scan` asks whether the *code* is safe. `revenue` decides what a workflow may
 * do to a batch of records. This asks the question in between, at the moment it
 * matters: an autonomous agent is about to move money — should it?
 *
 * The distinction the whole surface rests on is that **a technically valid
 * action is not automatically legitimate behaviour**. A transfer can be
 * correctly signed, properly authenticated, inside the agent's credentials, and
 * still be the wrong thing: an amount the agent has never sent, to a
 * counterparty it has never used, at an hour it never operates, because a web
 * page it was reading told it to.
 *
 * So an action is judged on six axes, not one:
 *
 *   identity     is this agent allowed to do this kind of thing at all?
 *   intent       does what it says it is doing match what it was authorised to do?
 *   policy       does it breach an explicit spending, exposure or frequency limit?
 *   context      how risky is this counterparty, this protocol, this amount?
 *   behaviour    is this consistent with how this agent has actually behaved?
 *   manipulation is the instruction behind it trustworthy?
 *
 * And the answer is graduated. Blocking everything unusual makes an autonomous
 * agent useless; allowing everything signed makes it a liability. Most actions
 * should pass without anyone being asked.
 */

/** The four responses, in increasing order of intervention. */
export type Tier = 'allow' | 'verify' | 'constrain' | 'block';

/** Ordered weakest to strongest — the verdict is the strongest signal raised. */
export const TIER_ORDER: readonly Tier[] = ['allow', 'verify', 'constrain', 'block'];

export const tierRank = (tier: Tier): number => TIER_ORDER.indexOf(tier);

/** The kinds of thing an agent can propose. */
export type ActionKind = 'transfer' | 'payment' | 'swap' | 'allocate' | 'approve' | 'withdraw';

/** Where an instruction came from. Not all sources deserve equal trust. */
export type InstructionSource = 'operator' | 'user' | 'tool' | 'web' | 'email' | 'agent';

export interface Counterparty {
  id: string;
  kind: 'vendor' | 'wallet' | 'contract' | 'exchange' | 'employee';
  /** ISO date the agent first transacted with them, absent if never. */
  first_seen?: string;
  /** 0..1, where 1 is a long-standing, verified relationship. */
  reputation?: number;
  /** Sanctions, fraud reports, or an operator's own deny decision. */
  flags?: string[];
}

export interface Protocol {
  name: string;
  audited: boolean;
  age_days?: number;
  tvl_paise?: number;
}

/** The instruction that produced the action — where manipulation shows up. */
export interface Instruction {
  source: InstructionSource;
  text: string;
  /** True when the content was fetched rather than given by a person. */
  untrusted?: boolean;
}

/** What the agent wants to do, before anything has happened. */
export interface ProposedAction {
  id: string;
  agent_id: string;
  /** Virtual wall-clock of the proposal, ISO-8601. */
  at: string;
  kind: ActionKind;
  amount_paise: number;
  counterparty: Counterparty;
  protocol?: Protocol;
  /** What the agent says it is doing, in its own words. */
  intent: string;
  instruction?: Instruction;
}

/** An agent's grant: what it may do, and how much. */
export interface AgentLimits {
  /** The most one action may move. */
  per_action_paise: number;
  /** The most it may move in a rolling day. */
  daily_paise: number;
  /** The most that may be outstanding to any one counterparty. */
  exposure_paise: number;
  /** Actions per rolling hour — a burst is a signal even when each is small. */
  max_actions_per_hour: number;
  /** When absent, any counterparty is permitted subject to the other checks. */
  allowed_counterparties?: string[];
  blocked_counterparties?: string[];
  /** When absent, any protocol is permitted subject to the risk checks. */
  allowed_protocols?: string[];
  /** Local hours the agent may not move money, e.g. { from: 22, to: 7 }. */
  quiet_hours?: { from: number; to: number };
}

export interface Agent {
  id: string;
  name: string;
  /** What the agent exists to do, in words. Intent is judged against this. */
  objective: string;
  /** The action kinds inside its grant. Anything else is out of scope. */
  scopes: ActionKind[];
  limits: AgentLimits;
  /** Which instruction sources this agent is allowed to act on unprompted. */
  trusted_sources: InstructionSource[];
}

/**
 * One reason, from one evaluator.
 *
 * `says` is what a person reads. `basis` is the obligation or limit it answers
 * to — the same discipline the revenue surface holds: a rule quotes the limit
 * actually in force, so a run under one project's policy is legible to someone
 * who knows a different one.
 */
export interface Signal {
  /** Stable id, e.g. `identity.out_of_scope`. */
  id: string;
  stage: Stage;
  tier: Tier;
  says: string;
  basis?: string;
  /** Set when the signal proposes a smaller action rather than refusing. */
  constrain_to_paise?: number;
}

export type Stage = 'identity' | 'intent' | 'policy' | 'context' | 'behaviour' | 'manipulation';

export const STAGES: readonly Stage[] = [
  'identity',
  'intent',
  'policy',
  'context',
  'behaviour',
  'manipulation',
];

/** The decision, and everything that produced it. */
export interface Decision {
  action_id: string;
  agent_id: string;
  at: string;
  tier: Tier;
  /** Present when the verdict is `constrain`: what it was cut down to. */
  amount_paise: number;
  constrained_from_paise?: number;
  signals: Signal[];
  /** The single signal that set the tier. */
  deciding?: Signal;
}

/**
 * What the agent has actually done, which is what "expected behaviour" means.
 *
 * Kept as running aggregates rather than a full history: a baseline that needs
 * every past action to answer a question cannot run in front of a live agent.
 */
export interface Baseline {
  agent_id: string;
  /** Actions seen. Below `MIN_OBSERVATIONS` the behavioural stage abstains. */
  n: number;
  /** Welford accumulators over log-amount, so a heavy tail does not dominate. */
  log_mean: number;
  log_m2: number;
  /** Counterparties transacted with, and how often. */
  counterparties: Record<string, number>;
  kinds: Record<string, number>;
  /** Hour-of-day histogram, 24 buckets. */
  hours: number[];
  /** Rolling spend, keyed by ISO date, for the daily cap. */
  spend_by_day: Record<string, number>;
  /**
   * Concentration per counterparty, as day → paise, within a rolling window.
   *
   * Not lifetime spend. The first version accumulated forever, so an agent
   * paying the same ten vendors every week eventually breached its own
   * exposure limit doing exactly the job it was set up to do — the limit
   * measured loyalty rather than risk. What a concentration limit is actually
   * for is catching a counterparty being paid unusually *hard* in a short
   * period, which is the slow-drain shape.
   */
  exposure_by_day: Record<string, Record<string, number>>;
  /** Recent action timestamps, for the per-hour rate. */
  recent: string[];
  updated_at: string;
}

export function emptyBaseline(agentId: string): Baseline {
  return {
    agent_id: agentId,
    n: 0,
    log_mean: 0,
    log_m2: 0,
    counterparties: {},
    kinds: {},
    hours: Array.from({ length: 24 }, () => 0),
    spend_by_day: {},
    exposure_by_day: {},
    recent: [],
    updated_at: new Date(0).toISOString(),
  };
}

/**
 * Observations needed before behaviour is judged.
 *
 * Below this the stage says nothing rather than guessing. An agent's third
 * action is not "anomalous" because there were only two before it, and a
 * control layer that cries wolf on day one is one an operator turns off.
 */
export const MIN_OBSERVATIONS = 12;

/** Days the concentration limit looks back over. */
export const EXPOSURE_WINDOW_DAYS = 7;

/**
 * Observations before the hour-of-day test says anything.
 *
 * Much higher than `MIN_OBSERVATIONS`: a pattern over the clock needs to have
 * seen the clock. At twelve actions the histogram is three hours wide and every
 * fourth hour looks unprecedented — which is how the first version came to flag
 * 194 of 252 ordinary payments as out-of-hours.
 */
export const MIN_HOURS_OBSERVED = 60;

/** What happened after a decision, fed back so the baseline stays true. */
export interface Outcome {
  action_id: string;
  /** Whether the action actually went ahead, post-decision. */
  executed: boolean;
  /** Set when an executed action later turned out to be harmful. */
  reverted?: boolean;
  settled_paise?: number;
}
