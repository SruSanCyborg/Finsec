"use client";

// SceneDirector — the single persistent 3D canvas for the whole landing page.
// It reads the shared StoryBus (driven by the page's GSAP master timeline) and
// lerps every subsystem toward its state target. Camera choreography happens
// here on the rig group.

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSceneRefs, type SceneRefs } from "./refs";
import { AgentCore } from "./AgentCore";
import { Infrastructure } from "./Infrastructure";
import { Pipelines, Packet, PacketGlow } from "./Pipelines";
import { RiskLayer, BehaviourRing, PolicyShell, CallRing, LockRing } from "./Layers";
import { ParticleField } from "./Particles";
import { CameraRig } from "./CameraRig";
import { PostFX } from "./PostFX";
import { story } from "@/lib/landing/story";
import type { QualityProfile } from "@/lib/landing/quality";

const GOLD = "#C8A96A";
const CYAN = "#74C69D";

function World({ refs, quality }: { refs: SceneRefs; quality: QualityProfile }) {
  // Mutable ref (React 19 RefObject.current is readonly).
  const worldRef = useRef<THREE.Group | null>(null);

  useFrame((state, dt) => {
    if (!worldRef.current) return;
    const risk = story.risk;
    // subtle world lean with risk — the whole system tilts under pressure
    worldRef.current.rotation.z += ((risk > 0.6 ? -0.06 : 0.02) - worldRef.current.rotation.z) * Math.min(1, dt * 1.6);
    // scroll drift — the world settles as you scroll deeper
    worldRef.current.position.y += (-story.progress * 0.25 - worldRef.current.position.y) * Math.min(1, dt * 1.2);

    // Camera rig: position tweens driven by GSAP (refs.cameraRig) — here we
    // only apply the state-based zoom for decision + reveal.
    if (refs.cameraRig) {
      const rig = refs.cameraRig;
      const targetZ = story.state === "reveal" ? 4.6 : story.state === "decision" || story.state === "escalation" ? 2.6 : 0;
      rig.position.z += (targetZ - rig.position.z) * Math.min(1, dt * 1.4);
      const targetY = story.state === "reveal" ? 1.1 : 0;
      rig.position.y += (targetY - rig.position.y) * Math.min(1, dt * 1.4);
    }

    // light choreography
    if (refs.keyLight) {
      refs.keyLight.intensity = 90 + risk * 40;
      refs.keyLight.position.x = Math.sin(state.clock.elapsedTime * 0.3) * 1.4;
    }
    if (refs.accentLight) {
      refs.accentLight.intensity = story.locked ? 70 : 30 + risk * 30;
      refs.accentLight.color.set(story.state === "decision" || story.state === "escalation" ? "#E5484D" : GOLD);
    }
    if (refs.fillLight) {
      refs.fillLight.intensity = 14 + Math.sin(state.clock.elapsedTime * 0.5) * 3;
    }
  });

  return (
    <group
      ref={(node) => {
        if (node) {
          worldRef.current = node;
          refs.world = node;
        }
      }}
    >
      <AgentCore refs={refs} detail={quality.detail} />
      <Infrastructure refs={refs} transmission={quality.transmission} detail={quality.detail} />
      <Pipelines refs={refs} />
      <Packet refs={refs} />
      <PacketGlow refs={refs} />
      <RiskLayer refs={refs} />
      <BehaviourRing refs={refs} />
      <PolicyShell refs={refs} />
      <CallRing refs={refs} />
      <LockRing refs={refs} />
      <ParticleField refs={refs} count={quality.particles} />
      <CameraRig refs={refs} />
    </group>
  );
}

export default function SceneDirector({ quality }: { quality: QualityProfile }) {
  const refs = useMemo(() => createSceneRefs(), []);

  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 42 }}
        dpr={[1, quality.dpr]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight ref={(l) => { refs.keyLight = l; }} position={[0, 2.5, 4]} intensity={90} color={GOLD} />
          <pointLight ref={(l) => { refs.accentLight = l; }} position={[-4, -1, 3]} intensity={30} color={CYAN} />
          <pointLight ref={(l) => { refs.fillLight = l; }} position={[0, -2, -3]} intensity={14} color="#4a6a8a" />
          <World refs={refs} quality={quality} />
          {quality.bloom && <PostFX enabled />}
        </Suspense>
      </Canvas>
    </div>
  );
}
