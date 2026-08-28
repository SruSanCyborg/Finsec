"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { AttackLink, AttackNode, Severity } from "@/types";
import { SEVERITY_ORDER } from "@/lib/constants";

const SEV_COLOR: Record<Severity, string> = {
  critical: "#E5484D",
  high: "#E8874E",
  medium: "#E3B341",
  low: "#5CA7FF",
  info: "#8E8E93",
};

function Node({ node, selected, onSelect }: { node: AttackNode; selected: boolean; onSelect: (n: AttackNode) => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const color = node.kind === "actor" ? "#C8A96A" : SEV_COLOR[node.severity ?? "info"];
  const scale = node.kind === "actor" ? 0.55 : 0.34 + (node.severity === "critical" ? 0.14 : 0);

  useFrame((state) => {
    if (mesh.current) {
      const s = scale * (selected ? 1.35 : 1 + Math.sin(state.clock.elapsedTime * 2 + node.x) * 0.05);
      mesh.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh ref={mesh} onClick={() => onSelect(node)}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.4 : 0.55} roughness={0.3} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[0.62, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.12} />
        </mesh>
      )}
      <Html center distanceFactor={14} zIndexRange={[10, 0]}>
        <div
          className="-translate-y-8 cursor-pointer select-none whitespace-nowrap rounded border border-line bg-base/80 px-2 py-0.5 font-mono text-[10px] text-zinc-300 backdrop-blur"
          onClick={() => onSelect(node)}
        >
          {node.label}
        </div>
      </Html>
    </group>
  );
}

function Link({ from, to, active }: { from: AttackNode; to: AttackNode; active: boolean }) {
  const start = useMemo(() => new THREE.Vector3(from.x, from.y, from.z), [from]);
  const end = useMemo(() => new THREE.Vector3(to.x, to.y, to.z), [to]);
  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints([start, end]), [start, end]);
  const pulse = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (pulse.current && active) {
      const t = (state.clock.elapsedTime * 0.35 + from.x * 0.13) % 1;
      pulse.current.position.lerpVectors(start, end, t);
      const s = 0.09 * Math.sin(t * Math.PI);
      pulse.current.scale.setScalar(Math.max(0.02, s));
    }
  });

  return (
    <group>
      <line>
        <primitive object={geom} attach="geometry" />
        <lineBasicMaterial color={active ? "#E5484D" : "#2A2A30"} transparent opacity={active ? 0.6 : 0.22} />
      </line>
      {active && (
        <mesh ref={pulse}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color="#F06460" />
        </mesh>
      )}
    </group>
  );
}

export default function AttackPathScene({
  nodes,
  links,
  selectedId,
  onSelect,
}: {
  nodes: AttackNode[];
  links: AttackLink[];
  selectedId?: string;
  onSelect: (n: AttackNode) => void;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 50 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[6, 6, 8]} intensity={40} color="#C8A96A" />
      <pointLight position={[-6, -4, -6]} intensity={30} color="#F4F4F5" />
      {links.map((l, i) => {
        const a = nodeMap.get(l.from);
        const b = nodeMap.get(l.to);
        return a && b ? <Link key={i} from={a} to={b} active={l.active} /> : null;
      })}
      {nodes.map((n) => (
        <Node key={n.id} node={n} selected={n.id === selectedId} onSelect={onSelect} />
      ))}
      <OrbitControls enablePan={false} minDistance={8} maxDistance={20} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
}

export { SEV_COLOR };
