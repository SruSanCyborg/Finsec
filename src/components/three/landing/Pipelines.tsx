"use client";

// Transaction pipelines. A set of curved light-paths from the agent core toward
// the counterparty ring; transaction packets travel along them. At DECISION the
// path breaks and the packet stops; at RESOLUTION flow resumes at a calmer pace.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story } from "@/lib/landing/story";
import type { SceneRefs } from "./refs";

const CURVE_COUNT = 3;

function makeCurve(i: number) {
  const a = (i / CURVE_COUNT) * Math.PI * 2 + 0.4;
  const x = Math.cos(a) * 2.5;
  const z = Math.sin(a) * 2.5;
  const points = [
    new THREE.Vector3(1.2, 0.15, 0),
    new THREE.Vector3(1.6 + x * 0.25, 0.35 + Math.sin(i * 2) * 0.25, z * 0.2),
    new THREE.Vector3(x * 0.85, 0.15, z * 0.85),
    new THREE.Vector3(x, 0, z),
  ];
  return new THREE.CatmullRomCurve3(points);
}

export function Pipelines({ refs }: { refs: SceneRefs }) {
  const curves = useMemo(() => Array.from({ length: CURVE_COUNT }, (_, i) => makeCurve(i)), []);

  useFrame((state) => {
    const risk = story.risk;
    if (refs.path) {
      // Flow speed decays as risk rises; hard stop at decision/lock.
      const speed = story.locked ? 0 : 0.22 * (1 - risk * 0.82);
      refs.path.userData.speed = speed;
      void state;
    }
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.path = node;
      }}
    >
      {curves.map((c, i) => {
        const points = c.getPoints(48);
        return (
          <mesh key={i}>
            <tubeGeometry args={[c, 48, 0.035, 6, false]} />
            <meshBasicMaterial
              color={i === 1 ? "#C8A96A" : "#74C69D"}
              transparent
              opacity={0.16}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      {/* a faint "break" marker at the policy boundary */}
      <mesh position={[1.1, 0.05, 0.1]}>
        <torusGeometry args={[0.42, 0.006, 6, 48]} />
        <meshBasicMaterial color="#E8874E" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

export function Packet({ refs }: { refs: SceneRefs }) {
  const curve = useMemo(() => makeCurve(1), []);

  useFrame((state, dt) => {
    if (!refs.packet || !refs.packetGlow) return;
    const t = state.clock.elapsedTime;
    // progress toward the red counterparty; the page's GSAP drives story.packetProgress
    const p = story.packetProgress;
    const pos = curve.getPoint(p);
    refs.packet.position.copy(pos);

    // wobble + scale pulse
    refs.packet.position.y += Math.sin(t * 3.2) * 0.02;
    const s = 0.55 + Math.sin(t * 5) * 0.12 + (story.locked ? 0.25 : 0);
    refs.packet.scale.setScalar(s);

    const g = refs.packetGlow;
    g.position.copy(pos);
    g.scale.setScalar(0.5 + Math.sin(t * 5) * 0.08 + (story.locked ? 0.4 : 0));
    (g.material as THREE.MeshBasicMaterial).opacity = 0.5 + (story.state === "decision" ? 0.25 : 0);
    void dt;
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.packet = node;
      }}
    >
      <mesh>
        <octahedronGeometry args={[0.2, 0]} />
        <meshBasicMaterial color="#f0d9a8" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function PacketGlow({ refs }: { refs: SceneRefs }) {
  return (
    <mesh
      ref={(node) => {
        if (node) refs.packetGlow = node;
      }}
      visible={false}
    >
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color="#f0d9a8" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}
