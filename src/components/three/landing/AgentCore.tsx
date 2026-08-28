"use client";

// The agent core — the heart of the system. A large gold-metal icosahedron with
// a fresnel rim and an inner energy shell. It pulses quietly when calm and
// sharpens/speeds when risk rises. Never spins continuously: motion is
// state-driven and subtle.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story } from "@/lib/landing/story";
import type { SceneRefs } from "./refs";

export function AgentCore({ refs, detail }: { refs: SceneRefs; detail: "full" | "simple" }) {
  const group = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const pulse = useRef(0);

  const { positions, indices } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.1, detail === "full" ? 4 : 3);
    return { positions: geo.attributes.position.array as Float32Array, indices: geo.index?.array as Uint16Array };
  }, [detail]);

  const wireGeo = useMemo(() => new THREE.IcosahedronGeometry(1.32, 2), []);

  useFrame((state, dt) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const risk = story.risk;

    // Idle: slow breathing rotation, never a continuous spin.
    group.current.rotation.y += dt * 0.08 * (1 - risk * 0.55);
    group.current.rotation.x = Math.sin(t * 0.21) * 0.14;
    group.current.position.y = Math.sin(t * 0.5) * 0.06;

    // Pulse: calm breathing when risk is low, tighter faster pulse when high.
    const targetPulse = 1 + (risk > 0.5 ? 0.16 : 0.06) * Math.sin(t * (risk > 0.5 ? 5 : 2));
    pulse.current += (targetPulse - pulse.current) * Math.min(1, dt * 4);
    if (glow.current) glow.current.scale.setScalar(pulse.current);
    if (shell.current) {
      const m = shell.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.28 + (risk > 0.5 ? 0.18 : 0) + Math.sin(t * (risk > 0.5 ? 5 : 2)) * 0.08;
    }

    // Core rotation eases toward a "tilt" as risk rises (visceral lean).
    const tilt = risk > 0.75 ? -0.35 : 0;
    group.current.rotation.z += (tilt - group.current.rotation.z) * Math.min(1, dt * 2.5);

    if (refs.coreLight) {
      refs.coreLight.intensity = 30 + risk * 60 + Math.sin(t * (risk > 0.5 ? 5 : 2)) * 10;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={(m) => { refs.coreMesh = m; }}>
        <icosahedronGeometry args={[1.1, detail === "full" ? 4 : 3]} />
        <meshStandardMaterial
          color="#8a6d3b"
          metalness={0.92}
          roughness={0.22}
          emissive="#5c4216"
          emissiveIntensity={0.5}
          envMapIntensity={1.4}
        />
      </mesh>
      <mesh ref={shell} scale={1.02}>
        <icosahedronGeometry args={[1.1, 1]} />
        <meshBasicMaterial color="#C8A96A" wireframe transparent opacity={0.24} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={glow} position={[0, 0, 0]}>
        <sphereGeometry args={[1.35, 24, 24]} />
        <meshBasicMaterial color="#C8A96A" transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* fresh energy in */}
      <mesh position={[0.85, 0.3, 0.25]} rotation={[0.5, 0.2, 0]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial color="#74C69D" toneMapped={false} />
      </mesh>
      <mesh position={[-0.8, -0.25, 0.3]} rotation={[0.3, 0.4, 0.1]}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshBasicMaterial color="#8fb8ff" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function CoreWire({ refs }: { refs: SceneRefs }) {
  const wire = useRef<THREE.LineSegments>(null);
  useFrame((state, dt) => {
    if (!wire.current) return;
    wire.current.rotation.y += dt * 0.05;
  });
  void refs;
  return (
    <lineSegments ref={wire}>
      <edgesGeometry args={[new THREE.IcosahedronGeometry(1.32, 2)]} />
      <lineBasicMaterial color="#C8A96A" transparent opacity={0.14} />
    </lineSegments>
  );
}
