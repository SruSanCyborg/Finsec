"use client";

// Post-processing — subtle additive bloom on desktop only, plus tone mapping
// tweaks. Everything is kept light: no SSR, mipmap blur, low intensity.

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

export function PostFX({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer>
      <Bloom
        intensity={0.55}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        mipmapBlur
        radius={0.7}
      />
      <Vignette eskil={false} offset={0.22} darkness={0.72} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  );
}
