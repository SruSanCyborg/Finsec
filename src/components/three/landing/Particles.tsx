"use client";

// Ambient particle field. A soft, drifting dust of gold/green motes that
// surrounds the whole system. Speed and density respond to risk; at DECISION
// the field freezes — the whole environment holds its breath.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story } from "@/lib/landing/story";
import type { SceneRefs } from "./refs";

export function ParticleField({ refs, count }: { refs: SceneRefs; count: number }) {
  const base = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2.5 + Math.random() * 6.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.7;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      seeds[i] = Math.random() * Math.PI * 2;
    }
    return { positions, seeds };
  }, [count]);

  useFrame((state, dt) => {
    if (!refs.particles || !refs.particlesMat) return;
    const t = state.clock.elapsedTime;
    const risk = story.risk;
    const speed = story.locked ? 0 : 0.18 * (1 - risk * 0.7);
    const pos = refs.particles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const s = base.seeds[i];
      arr[i * 3] += Math.sin(t * 0.5 + s) * 0.002 * speed;
      arr[i * 3 + 1] += Math.cos(t * 0.4 + s * 1.3) * 0.002 * speed;
      arr[i * 3 + 2] += Math.sin(t * 0.45 + s * 0.8) * 0.002 * speed;
    }
    pos.needsUpdate = true;
    // color shifts from calm green-gold toward risk amber/red
    const target = story.state === "decision" || story.state === "escalation" ? "#7a3b33" : risk > 0.5 ? "#6b5a2e" : "#2a3a34";
    refs.particlesMat.color.lerp(new THREE.Color(target), 0.04);
    refs.particlesMat.size = story.locked ? 0.012 : 0.02;
    void dt;
  });

  return (
    <points
      ref={(node) => {
        if (node) refs.particles = node;
      }}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[base.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={(mat) => {
          if (mat) refs.particlesMat = mat;
        }}
        color="#2a3a34"
        size={0.02}
        transparent
        opacity={0.7}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
