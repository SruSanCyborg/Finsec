/**
 * What being wrong costs, in rupees.
 *
 * Every number here is a dial with a default, printed with the results, and
 * meant to be argued with. A recovery tool that reports precision and recall
 * but not the cost of a false positive is reporting the half of the story that
 * flatters it: the cheapest way to a high recall is to chase everybody, and the
 * bill for that lands on the customer as a message they did not need and on the
 * business as a fee it did not have to pay.
 *
 * Costs are in paise, like everything else.
 */

import type { Intervention, RecordKind } from './types.js';

export interface CostModel {
  /** A retry costs a gateway fee whether or not it succeeds. */
  retry_paise: number;
  email_paise: number;
  sms_paise: number;
  whatsapp_paise: number;
  /** Voice is the expensive channel and the intrusive one. Both are the point. */
  voice_paise: number;
  /** An analyst's time, at the rate a queue of these actually costs. */
  human_review_paise: number;
  /**
   * The charge for contacting somebody who was going to pay anyway.
   *
   * Not a real invoice, and the most contestable number here — which is why it
   * is a named dial rather than a constant buried in a scoring function. Set it
   * to zero and the model will happily chase every self-healing payment, which
   * is what tools that ignore it do.
   */
  annoyance_paise: number;
  /**
   * Share of recovered revenue that is actually worth something.
   *
   * 1.0 for a failed payment — the sale already happened. Lower it for cases
   * where recovery costs goods or a discount.
   */
  margin: number;
}

export const DEFAULT_COSTS: CostModel = {
  retry_paise: 300,
  email_paise: 10,
  sms_paise: 18,
  whatsapp_paise: 75,
  voice_paise: 250,
  human_review_paise: 8500,
  annoyance_paise: 1200,
  margin: 1,
};

/** What one intervention costs to perform. `wait` is the only free one. */
export function interventionCost(action: Intervention, costs: CostModel = DEFAULT_COSTS): number {
  switch (action) {
    case 'retry_now':
    case 'retry_after_cooldown':
    case 'switch_rail':
    case 'mandate_represent':
      return costs.retry_paise;
    case 'mandate_reauth':
    case 'dunning_email':
    case 'checkout_recovery_link':
      return costs.email_paise;
    case 'dunning_sms':
      return costs.sms_paise;
    case 'whatsapp_nudge':
      return costs.whatsapp_paise;
    case 'ptp_followup':
      return costs.email_paise + costs.sms_paise;
    case 'human_review':
      return costs.human_review_paise;
    case 'write_off':
    case 'wait':
      return 0;
  }
}

/**
 * What acting on a record of this kind is likely to cost, before the policy has
 * chosen anything.
 *
 * The detector needs a cost to set its threshold against, and it runs before
 * the policy stage. This is the estimate it uses; `recover` reports what was
 * actually spent, and the two are shown side by side rather than one standing
 * in for the other.
 */
export function estimatedCost(kind: RecordKind, costs: CostModel = DEFAULT_COSTS): number {
  switch (kind) {
    case 'payment':
      return costs.retry_paise + costs.sms_paise;
    case 'checkout':
      return costs.email_paise + costs.whatsapp_paise;
    case 'invoice':
      return costs.email_paise + costs.sms_paise;
  }
}
