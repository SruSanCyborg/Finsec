// ── Landing story: chapters + shared story bus ──────────────────────────────
// The single source of truth for the immersive scroll narrative. The 3D scene
// reads `story.state` (and risk intensity) through the mutable StoryBus, so
// GSAP can drive states without re-rendering React on every scroll tick.

export type StoryState =
  | "normal" // 0 — agent operating calmly, ambient flows
  | "intent" // 1 — transfer ₹18,50,000 generated, packet departs
  | "context" // 2 — counterparty / exposure / frequency / protocol surface
  | "behaviour" // 3 — normal band vs attempt → 94% deviation
  | "policy" // 4 — ₹5,00,000 cap shell closes around the transaction
  | "decision" // 5 — path breaks, packet contained, HIGH RISK / BLOCKED
  | "escalation" // 6 — security team call alert, pulse rings
  | "resolution" // 7 — incident acknowledged → resolved, eases back
  | "autonomy" // 8 — safe flows resume, spectrum revealed
  | "reveal"; // 9 — camera pulls back into the dashboard mockup

export const STORY_ORDER: StoryState[] = [
  "normal",
  "intent",
  "context",
  "behaviour",
  "policy",
  "decision",
  "escalation",
  "resolution",
  "autonomy",
  "reveal",
];

export interface Chapter {
  id: StoryState;
  marker: string;
  eyebrow: string;
  title: string;
  body: string;
  /** 0..1 risk intensity used by the 3D scene (drives materials/particles). */
  risk: number;
}

export const CHAPTERS: Chapter[] = [
  {
    id: "normal",
    marker: "00 / OBSERVATION",
    eyebrow: "Continuous security",
    title: "Autonomous financial agents are already making decisions.",
    body: "TreasuryBot is moving capital on its own. Every action flows through one system that watches intent, context, behaviour, policy and exposure in real time.",
    risk: 0,
  },
  {
    id: "intent",
    marker: "01 / INTENT",
    eyebrow: "The agent acts",
    title: "A decision is generated.",
    body: "TreasuryBot intends to transfer ₹18,50,000 to a new counterparty. The instruction is valid. The intent is clear. That is where Sirius Line begins.",
    risk: 0.25,
  },
  {
    id: "context",
    marker: "02 / CONTEXT",
    eyebrow: "Should it?",
    title: "Intent is only the beginning.",
    body: "Every action is placed inside its live context: a new counterparty, high exposure, unusual frequency, an unfamiliar protocol.",
    risk: 0.45,
  },
  {
    id: "behaviour",
    marker: "03 / BEHAVIOUR",
    eyebrow: "Pattern recognition",
    title: "Behaviour tells another story.",
    body: "This agent normally moves between ₹10,000 and ₹2,00,000. This request is ₹18,50,000 — a 94% deviation from everything it has ever done.",
    risk: 0.6,
  },
  {
    id: "policy",
    marker: "04 / POLICY",
    eyebrow: "The boundary",
    title: "Policy turns judgement into a system.",
    body: "The treasury transfer policy permits ₹5,00,000 to a new counterparty. This action is outside the boundary — before money ever moves.",
    risk: 0.75,
  },
  {
    id: "decision",
    marker: "05 / DECISION",
    eyebrow: "Risk determines autonomy",
    title: "High risk is where autonomy stops.",
    body: "The path breaks. The transaction is contained. Sirius Line blocks the action and preserves the evidence behind the decision.",
    risk: 1,
  },
  {
    id: "escalation",
    marker: "06 / ESCALATION",
    eyebrow: "Human signal",
    title: "Escalate the moment, not the noise.",
    body: "A security incident is created. The on-call team is called with context, a clear reason, and one action to acknowledge.",
    risk: 0.85,
  },
  {
    id: "resolution",
    marker: "07 / RESOLUTION",
    eyebrow: "Selective intervention",
    title: "Safe actions keep moving.",
    body: "The incident is acknowledged and resolved. Sirius Line does not block everything — it intervenes exactly where it should.",
    risk: 0.3,
  },
  {
    id: "autonomy",
    marker: "08 / AUTONOMY",
    eyebrow: "The line",
    title: "Low risk stays autonomous. High risk stops.",
    body: "Low risk flows. Medium risk is constrained or verified. High risk is blocked and escalated. That is the whole system.",
    risk: 0.15,
  },
  {
    id: "reveal",
    marker: "09 / COMMAND",
    eyebrow: "The product",
    title: "Let your agents move money. Without letting them move blindly.",
    body: "One command center for every decision your agents make — active agents, transactions, risk, incidents, calls and exposure.",
    risk: 0.1,
  },
];

/** Maps risk intensity to a lerp target + accent color used across the scene. */
export function riskColor(risk: number): string {
  if (risk >= 0.85) return "#E5484D";
  if (risk >= 0.55) return "#E8874E";
  if (risk >= 0.3) return "#E3B341";
  return "#74C69D";
}

export interface StoryBusShape {
  /** 0..1 overall scroll progress through the whole narrative. */
  progress: number;
  /** Current chapter index (0-based). */
  index: number;
  /** 0..1 risk intensity, smoothly lerped. */
  risk: number;
  /** True once the user has scrolled past the hero (used to gate idle motion). */
  active: boolean;
  /** Previous/current state for transition detection. */
  prev: StoryState;
  state: StoryState;
  /** Mutable helpers the scene uses to expose HUD data. */
  packetProgress: number;
  callPulse: number;
  locked: boolean;
}

export class StoryBus implements StoryBusShape {
  progress = 0;
  index = 0;
  risk = 0;
  active = false;
  prev: StoryState = "normal";
  state: StoryState = "normal";
  packetProgress = 0;
  callPulse = 0;
  locked = false;

  /** Update from the scroll master; lerps derived values for buttery motion. */
  step(dt: number) {
    const targetRisk = CHAPTERS[this.index]?.risk ?? 0;
    this.risk += (targetRisk - this.risk) * Math.min(1, dt * 3);
    const targetState: StoryState = STORY_ORDER[this.index] ?? "normal";
    if (targetState !== this.state) {
      this.prev = this.state;
      this.state = targetState;
    }
  }

  setIndex(index: number) {
    this.index = index;
  }
}

/** Singleton shared between the page, GSAP timeline and the R3F scene. */
export const story = new StoryBus();
