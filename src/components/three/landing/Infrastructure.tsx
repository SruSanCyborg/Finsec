"use client";

// Financial infrastructure around the core: a ring of glass treasury vaults
// (instanced gold bars inside) and a ring of counterparty nodes. The vault ring
// slowly orbits; the counterparty ring rotates into view when context activates.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story } from "@/lib/landing/story";
import type { SceneRefs } from "./refs";

const VAULT_COUNT = 7;
const BAR_COUNT = 12;

function VaultChest({
  refs,
  position,
  transmission,
  index,
}: {
  refs: SceneRefs;
  position: [number, number, number];
  transmission: boolean;
  index: number;
}) {
  const chest = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Mesh>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (lid.current && refs.core) {
      // Lids catch the core's glow — subtle open/close breathing.
      const open = 0.12 + Math.sin(state.clock.elapsedTime * 1.4 + index) * 0.05;
      lid.current.rotation.x = open;
    }
    if (bars.current) {
      for (let i = 0; i < BAR_COUNT; i++) {
        dummy.position.set((i % 3 - 1) * 0.16, 0.02, Math.floor(i / 3) * 0.16 - 0.16);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        bars.current.setMatrixAt(i, dummy.matrix);
      }
      bars.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={chest} position={position}>
      {/* glass case */}
      <mesh>
        <boxGeometry args={[0.62, 0.42, 0.62]} />
        {transmission ? (
          <meshPhysicalMaterial
            color="#0d1412"
            metalness={0.1}
            roughness={0.12}
            transmission={0.92}
            thickness={0.4}
            ior={1.35}
            transparent
            opacity={0.85}
            envMapIntensity={1.2}
          />
        ) : (
          <meshStandardMaterial color="#101a17" metalness={0.5} roughness={0.35} transparent opacity={0.55} />
        )}
      </mesh>
      {/* lid */}
      <mesh ref={lid} position={[0, 0.23, 0]}>
        <boxGeometry args={[0.62, 0.05, 0.62]} />
        <meshStandardMaterial color="#6e5a2e" metalness={0.9} roughness={0.28} emissive="#3a2c10" emissiveIntensity={0.6} />
      </mesh>
      {/* gold bars */}
      <instancedMesh ref={bars} args={[undefined, undefined, BAR_COUNT]}>
        <boxGeometry args={[0.12, 0.06, 0.12]} />
        <meshStandardMaterial color="#d4af37" metalness={1} roughness={0.18} emissive="#7a5c1e" emissiveIntensity={0.35} />
      </instancedMesh>
      {/* inner glow */}
      <pointLight position={[0, 0.1, 0]} intensity={6} distance={1.4} color="#d4af37" />
    </group>
  );
}

function CounterpartyNode({
  position,
  index,
  refs,
}: {
  position: [number, number, number];
  index: number;
  refs: SceneRefs;
}) {
  const node = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const red = index === 0; // the "new counterparty" target is red

  useFrame((state) => {
    if (!node.current) return;
    const t = state.clock.elapsedTime;
    node.current.position.y = position[1] + Math.sin(t * 0.8 + index * 1.7) * 0.06;
    if (ring.current) {
      const s = 1 + Math.sin(t * 2 + index) * 0.06;
      ring.current.scale.setScalar(s);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = red ? 0.55 + Math.sin(t * 3) * 0.15 : 0.28;
    }
  });

  return (
    <group ref={node} position={position}>
      <mesh>
        <octahedronGeometry args={[red ? 0.2 : 0.15, 0]} />
        <meshStandardMaterial
          color={red ? "#E5484D" : "#2c3a36"}
          emissive={red ? "#E5484D" : "#74C69D"}
          emissiveIntensity={red ? 1.6 : 0.5}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.2, 0.4, 0]}>
        <torusGeometry args={[0.28, 0.008, 8, 48]} />
        <meshBasicMaterial color={red ? "#E5484D" : "#74C69D"} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

export function Infrastructure({
  refs,
  transmission,
  detail,
}: {
  refs: SceneRefs;
  transmission: boolean;
  detail: "full" | "simple";
}) {
  // Mutable refs (React 19's RefObject.current is readonly — use a plain holder).
  const vaultRef = useRef<THREE.Group | null>(null);
  const counterpartiesRef = useRef<THREE.Group | null>(null);

  const vaultPositions = useMemo(() => {
    const count = detail === "full" ? VAULT_COUNT : 5;
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      return [Math.cos(a) * 2.7, Math.sin(a * 3) * 0.25 - 0.1, Math.sin(a) * 2.7] as [number, number, number];
    });
  }, [detail]);

  const counterpartyPositions = useMemo(() => {
    const count = detail === "full" ? 8 : 5;
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      return [Math.cos(a) * 3.6, Math.sin(a * 5) * 0.4 + 0.15, Math.sin(a) * 3.6] as [number, number, number];
    });
  }, [detail]);

  useFrame((state, dt) => {
    if (!vaultRef.current || !counterpartiesRef.current) return;
    const risk = story.risk;
    // Vault ring drifts slowly; speeds up slightly under risk.
    vaultRef.current.rotation.y += dt * 0.05 * (1 + risk * 0.4);
    // Counterparty ring holds position normally, rotates the red node into view
    // when context/behaviour activate.
    const targetY = story.state === "context" || story.state === "behaviour" || story.state === "policy" ? -0.9 : 0;
    counterpartiesRef.current.rotation.y += (targetY - counterpartiesRef.current.rotation.y) * Math.min(1, dt * 1.8);
  });

  return (
    <>
      <group
        ref={(node) => {
          if (node) {
            vaultRef.current = node;
            refs.vault = node;
          }
        }}
      >
        {vaultPositions.map((p, i) => (
          <VaultChest key={i} refs={refs} position={p} transmission={transmission} index={i} />
        ))}
      </group>
      <group
        ref={(node) => {
          if (node) {
            counterpartiesRef.current = node;
            refs.counterparties = node;
          }
        }}
      >
        {counterpartyPositions.map((p, i) => (
          <CounterpartyNode key={i} refs={refs} position={p} index={i} />
        ))}
      </group>
    </>
  );
}
