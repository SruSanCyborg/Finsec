// ── Landing quality tiers ────────────────────────────────────────────────────
// Detects device capability once, on the client, so the 3D scene can scale
// particle counts, geometry detail, post-processing and camera choreography.

export type QualityTier = "high" | "low" | "reduced";

export interface QualityProfile {
  tier: QualityTier;
  /** Cap for devicePixelRatio. */
  dpr: number;
  /** Particle budget for the ambient field. */
  particles: number;
  /** Master particle drift speed multiplier. */
  speed: number;
  /** Use bloom post-processing. */
  bloom: boolean;
  /** Use physical transmission materials (glass). */
  transmission: boolean;
  /** Use full GSAP scroll choreography (camera dolly/orbit). */
  cinematic: boolean;
  /** Simpler geometry (fewer vault chests, lower icosahedron detail). */
  detail: "full" | "simple";
  reducedMotion: boolean;
}

function detectTier(): QualityProfile {
  if (typeof window === "undefined") {
    return { tier: "high", dpr: 1.75, particles: 240, speed: 1, bloom: true, transmission: true, cinematic: true, detail: "full", reducedMotion: false };
  }

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // WebGL support check
  let webgl = false;
  try {
    const canvas = document.createElement("canvas");
    webgl = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    webgl = false;
  }

  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const small = window.innerWidth < 768;
  const weak = cores <= 4 && mobile;

  if (reducedMotion) {
    return { tier: "reduced", dpr: 1, particles: 40, speed: 0, bloom: false, transmission: false, cinematic: false, detail: "simple", reducedMotion: true };
  }
  if (!webgl) {
    return { tier: "reduced", dpr: 1, particles: 0, speed: 0, bloom: false, transmission: false, cinematic: false, detail: "simple", reducedMotion };
  }
  if (mobile || weak || small) {
    return { tier: "low", dpr: 1.25, particles: 70, speed: 0.7, bloom: false, transmission: false, cinematic: false, detail: "simple", reducedMotion };
  }
  return { tier: "high", dpr: 1.75, particles: 240, speed: 1, bloom: true, transmission: true, cinematic: true, detail: "full", reducedMotion };
}

let cached: QualityProfile | null = null;

export function getQuality(): QualityProfile {
  if (!cached) cached = detectTier();
  return cached;
}

export function resetQuality() {
  cached = null;
}
