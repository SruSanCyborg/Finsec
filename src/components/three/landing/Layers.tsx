"use client";

// Storybeat layers that appear around the transaction as the narrative
// progresses: risk bubble, behaviour distribution ring, policy shell, and the
// call/escalation ring. Each is a distinct visual language element that responds
// to the shared story bus.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story } from "@/lib/landing/story";
import type { SceneRefs } from "./refs";

const GOLD = "#C8A96A";

function riskColor(risk: number) {
  if (risk >= 0.85) return "#E5484D";
  if (risk >= 0.55) return "#E8874E";
  if (risk >= 0.3) return "#E3B341";
  return "#74C69D";
}

/** Mutable object refs (avoid React 19's readonly RefObject for assignment). */
function useMutable<T>() {
  return useRef<T | null>(null);
}

/** Semi-transparent bubble around the packet; color and opacity track risk. */
export function RiskLayer({ refs }: { refs: SceneRefs }) {
  const mat = useMutable<THREE.MeshBasicMaterial>();

  useFrame(() => {
    if (!mat.current) return;
    const risk = story.risk;
    const target: THREE.Color = new THREE.Color(riskColor(risk));
    mat.current.color.lerp(target, 0.08);
    mat.current.opacity = 0.05 + risk * 0.16;
  });

  return (
    <mesh
      ref={(node) => {
        if (node) refs.riskLayer = node;
      }}
      position={[1.5, 0.1, 0.1]}
      visible={false}
    >
      <sphereGeometry args={[1.3, 24, 24]} />
      <meshBasicMaterial
        ref={(m) => {
          if (m) mat.current = m;
        }}
        color={GOLD}
        transparent
        opacity={0.05}
        wireframe
        depthWrite={false}
      />
    </mesh>
  );
}

/** Distribution band showing the normal behaviour range (₹10K–₹2L) with a
 *  marker that jumps to ₹18.5L when the deviation is revealed. */
export function BehaviourRing({ refs }: { refs: SceneRefs }) {
  const marker = useMutable<THREE.Mesh>();
  const band = useMutable<THREE.Mesh>();

  useFrame((state, dt) => {
    if (!refs.behaviourRing || !marker.current || !band.current) return;
    const t = state.clock.elapsedTime;
    refs.behaviourRing.position.y += (0.7 - refs.behaviourRing.position.y) * Math.min(1, dt * 2);
    // marker sweeps from normal band (0.25) to attempt (0.95) during behaviour
    const target = story.state === "behaviour" || story.state === "policy" ? 0.95 : 0.25;
    marker.current.rotation.z += (target * Math.PI * 2 - marker.current.rotation.z) * Math.min(1, dt * 3);
    (band.current.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 1.8) * 0.04;
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.behaviourRing = node;
      }}
      position={[0.6, 0.7, 0.6]}
      rotation={[0.6, 0.4, 0]}
      visible={false}
    >
      <mesh
        ref={(node) => {
          if (node) band.current = node;
        }}
      >
        <torusGeometry args={[1.35, 0.03, 8, 96]} />
        <meshBasicMaterial color="#74C69D" transparent opacity={0.14} />
      </mesh>
      <mesh rotation={[0, 0, 0.25]}>
        <torusGeometry args={[1.35, 0.012, 6, 96, Math.PI * 0.42]} />
        <meshBasicMaterial color="#5CA7FF" transparent opacity={0.5} />
      </mesh>
      <mesh
        ref={(node) => {
          if (node) marker.current = node;
        }}
        position={[0, 0, 0]}
      >
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#f0d9a8" />
      </mesh>
      {/* centre axis */}
      <mesh position={[0, 0, -0.3]}>
        <cylinderGeometry args={[0.012, 0.012, 1.7, 6]} />
        <meshBasicMaterial color="#74C69D" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

/** Policy shell — three shards that converge to bracket the transaction path. */
export function PolicyShell({ refs }: { refs: SceneRefs }) {
  const a = useMutable<THREE.Mesh>();
  const b = useMutable<THREE.Mesh>();
  const c = useMutable<THREE.Mesh>();

  useFrame((state, dt) => {
    if (!refs.policyShell || !a.current || !b.current || !c.current) return;
    const active = story.state === "policy" || story.state === "decision";
    const closed = story.state === "decision";
    // shards converge from wide positions toward the path axis
    const spread = active ? (closed ? 0.25 : 0.7) : 2.4;
    a.current.position.x += (spread - a.current.position.x) * Math.min(1, dt * 2.4);
    b.current.position.x += (-spread - b.current.position.x) * Math.min(1, dt * 2.4);
    c.current.position.y += ((closed ? 0.9 : 0.4) - c.current.position.y) * Math.min(1, dt * 2.4);
    (a.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.7 : 0.12;
    (b.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.7 : 0.12;
    (c.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.5 : 0.1;
    void state;
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.policyShell = node;
      }}
      position={[1.2, 0.15, 0.1]}
      visible={false}
    >
      <mesh
        ref={(node) => {
          if (node) a.current = node;
        }}
        position={[2.2, 0, 0]}
      >
        <boxGeometry args={[0.02, 1.1, 0.9]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.12} />
      </mesh>
      <mesh
        ref={(node) => {
          if (node) b.current = node;
        }}
        position={[-2.2, 0, 0]}
      >
        <boxGeometry args={[0.02, 1.1, 0.9]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.12} />
      </mesh>
      <mesh
        ref={(node) => {
          if (node) c.current = node;
        }}
        position={[0, 0.4, 0.5]}
      >
        <boxGeometry args={[1.4, 0.02, 0.02]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

/** Call/escalation ring — concentric pulse rings that expand when escalation fires. */
export function CallRing({ refs }: { refs: SceneRefs }) {
  const r1 = useMutable<THREE.Mesh>();
  const r2 = useMutable<THREE.Mesh>();
  const r3 = useMutable<THREE.Mesh>();
  const glow = useMutable<THREE.Mesh>();

  useFrame((state, dt) => {
    if (!refs.callRing || !r1.current || !r2.current || !r3.current) return;
    const t = state.clock.elapsedTime;
    const active = story.state === "escalation" || story.state === "resolution";
    const p = (t * 0.5) % 1;
    r1.current.scale.setScalar(0.6 + p * 1.6);
    r2.current.scale.setScalar(0.6 + ((p + 0.33) % 1) * 1.6);
    r3.current.scale.setScalar(0.6 + ((p + 0.66) % 1) * 1.6);
    const o = active ? (1 - p) * 0.5 : 0.06;
    (r1.current.material as THREE.MeshBasicMaterial).opacity = o;
    (r2.current.material as THREE.MeshBasicMaterial).opacity = o;
    (r3.current.material as THREE.MeshBasicMaterial).opacity = o;
    refs.callRing.position.y += (0.2 - refs.callRing.position.y) * Math.min(1, dt * 2);
    if (glow.current) {
      (glow.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.18 : 0;
    }
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.callRing = node;
      }}
      position={[1.4, 0.2, 0]}
      visible={false}
    >
      <mesh
        ref={(node) => {
          if (node) r1.current = node;
        }}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.5, 0.56, 64]} />
        <meshBasicMaterial color="#E5484D" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        ref={(node) => {
          if (node) r2.current = node;
        }}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.5, 0.56, 64]} />
        <meshBasicMaterial color="#E8874E" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        ref={(node) => {
          if (node) r3.current = node;
        }}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.5, 0.56, 64]} />
        <meshBasicMaterial color="#C8A96A" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        ref={(node) => {
          if (node) glow.current = node;
        }}
      >
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#E5484D" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Lock ring — forms around the contained transaction at DECISION. */
export function LockRing({ refs }: { refs: SceneRefs }) {
  const ring = useMutable<THREE.Mesh>();

  useFrame((state, dt) => {
    if (!refs.lockRing || !ring.current) return;
    const locked = story.locked;
    refs.lockRing.scale.setScalar(locked ? 1 : 0.01);
    if (locked) {
      ring.current.rotation.z += dt * 0.6;
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
    }
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.lockRing = node;
      }}
      position={[1.5, 0.15, 0.1]}
      scale={0.01}
    >
      <mesh
        ref={(node) => {
          if (node) ring.current = node;
        }}
        rotation={[Math.PI / 2.4, 0.3, 0]}
      >
        <torusGeometry args={[0.85, 0.03, 8, 72]} />
        <meshBasicMaterial color="#E5484D" transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0.3, 0]}>
        <torusGeometry args={[1.05, 0.014, 6, 72]} />
        <meshBasicMaterial color="#E8874E" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
