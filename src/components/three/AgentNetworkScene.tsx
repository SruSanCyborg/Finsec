"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const NODE_POSITIONS: [number, number, number][] = [
  [0, 2.8, 0],       // agent (top)
  [-2.2, 1.0, 0.5],  // wallet
  [2.2, 1.0, -0.5],  // account
  [-1.4, -0.8, 0.3], // counterparty
  [1.4, -0.8, -0.3], // protocol
  [0, -2.6, 0],       // transaction (bottom)
  [-3.0, 0, -1],      // risk node left
  [3.0, 0, 1],        // risk node right
  [0, 0, -2],         // depth node
  [-0.6, 1.8, 0.8],   // mid wallet-agent
  [0.6, 1.8, -0.8],   // mid account-agent
  [0, -1.6, 1.2],     // mid tx-left
  [0, -1.6, -1.2],    // mid tx-right
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 9], [0, 10],
  [1, 3], [2, 4], [1, 6], [2, 7],
  [3, 5], [4, 5], [6, 8], [7, 8],
  [9, 1], [10, 2], [11, 5], [12, 5],
  [6, 3], [7, 4], [8, 5],
];

function AgentNetwork() {
  const group = useRef<THREE.Group>(null);
  const particleRef = useRef<THREE.Points>(null);
  const edgeRefs = useRef<THREE.Line[]>([]);
  const nodeRefs = useRef<THREE.Mesh[]>([]);

  const nodeGeo = useMemo(() => new THREE.IcosahedronGeometry(0.12, 2), []);
  const agentGeo = useMemo(() => new THREE.IcosahedronGeometry(0.22, 3), []);

  const particlePositions = useMemo(() => {
    const count = 200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return pos;
  }, []);

  const edgeGeos = useMemo(() => {
    return EDGES.map(([a, b]) => {
      const pa = NODE_POSITIONS[a];
      const pb = NODE_POSITIONS[b];
      const points = [new THREE.Vector3(...pa), new THREE.Vector3(...pb)];
      return new THREE.BufferGeometry().setFromPoints(points);
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.08) * 0.15;
      group.current.rotation.x = Math.sin(t * 0.05) * 0.05;
    }

    nodeRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const isAgent = i === 0;
      const baseScale = isAgent ? 1 : 0.6 + Math.sin(t * 1.5 + i * 0.7) * 0.15;
      mesh.scale.setScalar(baseScale);
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.emissiveIntensity = isAgent
          ? 0.8 + Math.sin(t * 2) * 0.3
          : 0.3 + Math.sin(t * 1.2 + i) * 0.15;
      }
    });

    edgeRefs.current.forEach((line, i) => {
      if (!line || !(line.material instanceof THREE.LineBasicMaterial)) return;
      const pulse = Math.sin(t * 2 + i * 0.5) * 0.5 + 0.5;
      line.material.opacity = 0.08 + pulse * 0.12;
    });

    if (particleRef.current) {
      particleRef.current.rotation.y = t * 0.015;
      particleRef.current.rotation.x = Math.sin(t * 0.03) * 0.1;
    }
  });

  return (
    <group ref={group}>
      {NODE_POSITIONS.map((pos, i) => {
        const isAgent = i === 0;
        const isRisk = i === 6 || i === 7 || i === 8;
        const color = isAgent ? "#C8A96A" : isRisk ? "#E5484D" : "#5CA7FF";
        return (
          <mesh
            key={i}
            ref={(el) => { if (el) nodeRefs.current[i] = el; }}
            position={pos}
            geometry={isAgent ? agentGeo : nodeGeo}
          >
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.4}
              roughness={0.3}
              metalness={0.6}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}

      {edgeGeos.map((geo, i) => (
        <primitive
          key={i}
          ref={(el: THREE.Line | null) => { if (el) edgeRefs.current[i] = el; }}
          object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#C8A96A", transparent: true, opacity: 0.12 }))}
        />
      ))}

      <points ref={particleRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.025} color="#C8A96A" transparent opacity={0.35} sizeAttenuation depthWrite={false} />
      </points>

      <pointLight position={[0, 3, 3]} intensity={8} color="#C8A96A" />
      <pointLight position={[-3, -2, 2]} intensity={4} color="#5CA7FF" />
      <pointLight position={[3, -2, -2]} intensity={3} color="#E5484D" />
    </group>
  );
}

export default function AgentNetworkScene({
  className,
  interactive = true,
}: {
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div className={className} style={{ pointerEvents: interactive ? "auto" : "none" }}>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 1.4]}
        gl={{ antialias: true, alpha: true, powerPreference: "default" }}
      >
        <ambientLight intensity={0.3} />
        <AgentNetwork />
      </Canvas>
    </div>
  );
}
