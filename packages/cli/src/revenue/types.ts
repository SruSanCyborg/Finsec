/**
 * The vocabulary of revenue at risk.
 *
 * Money is in **paise, as integers**, everywhere below this line. Rupees only
 * exist at the edge, in the formatter. A reconciliation that matches a ₹1,04,732.55
 * settlement against a ledger entry has to be exact, and floating-point rupees
 * lose that argument before it starts — 0.1 + 0.2 is the oldest bug in finance
 * software and it has no place in a tool that claims to count money.
 *
 * Every enum here is closed on purpose. An agent that can invent a new
 * intervention is an agent whose blast radius nobody can state, and the whole
 * design of this feature is that the blast radius is stated up front.
 */

/** How the money was being moved. India-specific because the failure modes are. */
export type Rail =
  | 'upi_collect'
  | 'upi_intent'
  | 'card'
  | 'netbanking'
  | 'nach_mandate'
  | 'emandate_upi';

/**
 * Why it failed, in the class the response depends on.
 *
 * Grouped rather than raw gateway codes: `insufficient_funds` recovers on the
 * salary cycle, `network_timeout` recovers in minutes on another rail, and
 * `risk_block` must never be retried at all. Three different answers, so three
 * different classes.
 */
export type FailureCode =
  | 'insufficient_funds'
  | 'issuer_decline'
  | 'do_not_honor'
  | 'network_timeout'
  | 'psp_degraded'
  | 'mandate_expired'
  | 'mandate_revoked'
  | 'authentication_failed'
  | 'risk_block'
  | 'card_expired'
  | 'limit_exceeded';

export type RecordKind = 'payment' | 'checkout' | 'invoice';

/** Communication channels, each with its own consent flag and its own limits. */
export type Channel = 'email' | 'sms' | 'whatsapp' | 'voice';

/**
 * What the agent is allowed to do. Closed vocabulary, deliberately small.
 *
 * `wait` and `write_off` are real choices, not absences of one: the audit trail
 * has to show that the agent considered a record and decided against acting,
 * otherwise "we did nothing" and "we never looked" are indistinguishable.
 */
export type Intervention =
  | 'retry_now'
  | 'retry_after_cooldown'
  | 'switch_rail'
  | 'mandate_represent'
  | 'mandate_reauth'
  | 'dunning_email'
  | 'dunning_sms'
  | 'whatsapp_nudge'
  | 'checkout_recovery_link'
  | 'ptp_followup'
  | 'human_review'
  | 'wait'
  | 'write_off';

/** A customer, carrying the consent and history the policy has to respect. */
export interface Party {
  id: string;
  /** Tenure in days. A three-year customer and a first-timer are not the same risk. */
  tenure_days: number;
  successful_payments: number;
  failed_payments: number;
  /** DPDP §6: consent is per purpose and per channel, and it is revocable. */
  consent: Record<Channel, boolean>;
  /** Communications already sent in the last 24h, from any earlier run. */
  contacts_24h: number;
  /** Set when the customer has registered a DND preference. */
  dnd: boolean;
}

/**
 * The hidden truth a synthetic batch carries so the detector can be scored.
 *
 * `self_heals` is the field that makes the metrics honest. A failed payment
 * that would have succeeded on the customer's own next attempt is not revenue
 * the agent recovered — intervening on it costs a retry fee and a message
 * somebody did not need, and counting it as a win is how recovery tools come to
 * claim more than they earn.
 */
export interface GroundTruth {
  /** Recoverable at all, by anyone, with the right action. */
  recoverable: boolean;
  /** Would have come back on its own, with no intervention. */
  self_heals: boolean;
  /** The action that actually works on this record, when one does. */
  best_action: Intervention;
  /** What is recoverable, in paise. Partial recovery is normal on invoices. */
  recoverable_paise: number;
}

export interface RiskRecord {
  id: string;
  kind: RecordKind;
  /** ISO-8601. When the loss event happened, not when it was noticed. */
  occurred_at: string;
  amount_paise: number;
  currency: 'INR';
  party: Party;

  // ---- payment and mandate shape
  rail?: Rail;
  psp?: string;
  failure_code?: FailureCode;
  /** Attempts already made against this obligation, by anyone. */
  attempts: number;
  last_attempt_at?: string;
  /** Set while a dispute or chargeback is open: a regulatory hold on contact. */
  in_dispute?: boolean;

  // ---- checkout shape
  /** Where the session stopped. `payment` drop-offs are worth far more than `cart`. */
  drop_off_stage?: 'cart' | 'address' | 'payment' | 'otp';

  // ---- invoice shape
  due_at?: string;
  days_overdue?: number;
  /** A promise to pay already made, and whether it was kept before. */
  promise_to_pay_at?: string;
  broken_promises?: number;

  /**
   * Weak identity signals, for ring detection.
   *
   * Present on payments and checkouts only, and deliberately coarse: a card BIN
   * (six digits — the issuer, never the card), a device hash, and the network
   * the request came from. Nothing here identifies a person, which is the point:
   * ring detection works on shared infrastructure, not on identity.
   */
  signals?: {
    device_hash?: string;
    bin?: string;
    ip_asn?: string;
  };

  /**
   * Present only in generated batches, and written to a *separate file*.
   *
   * The detector never receives this field. Keeping the labels in a different
   * file is not tidiness — it makes leakage structurally impossible rather than
   * a matter of discipline, which is the only way a held-out metric means
   * anything a week after the person who wrote it stopped watching.
   */
  truth?: GroundTruth;
}

/** One reason the score moved, in the words a human would use to argue with it. */
export interface Evidence {
  feature: string;
  detail: string;
  /** Signed contribution to the score, in points. */
  points: number;
}

export interface Assessment {
  record_id: string;
  kind: RecordKind;
  /** 0–100. Not a probability; a scorecard total, and it says so. */
  score: number;
  /** Above the operating threshold — the agent will act on this. */
  flagged: boolean;
  amount_paise: number;
  /** What the agent expects to recover if it acts, in paise. */
  expected_recovery_paise: number;
  evidence: Evidence[];
  /** Filled in by the policy stage, not the detector. */
  intervention?: Intervention;
}

/** Where a record sits in the train/test split. Split by hash of id, not by time. */
export type Split = 'train' | 'test';
