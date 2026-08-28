"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Network({ count = 130, radius = 6.5 }: { count?: number; radius?: number }) {
  const group = useRef<THREE.Group>(null);

  const { positions, linePositions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = radius * (0.75 + Math.random() * 0.35);
      const v = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.72,
        r * Math.cos(phi)
      );
      pts.push(v);
      pos.set([v.x, v.y, v.z], i * 3);
      // gold and dim white mix
      const isGold = Math.random() > 0.4;
      col.set(isGold ? [0.78, 0.66, 0.42] : [0.55, 0.55, 0.57], i * 3);
    }
    const linePts: number[] = [];
    const maxDist = radius * 0.62;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (pts[i].distanceTo(pts[j]) < maxDist && Math.random() > 0.82) {
          linePts.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        }
      }
    }
    return {
      positions: pos,
      colors: col,
      linePositions: new Float32Array(linePts),
    };
  }, [count, radius]);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.05;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, state.pointer.y * 0.12, 0.03);
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, state.pointer.x * 0.08, 0.03);
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.075} vertexColors transparent opacity={0.9} sizeAttenuation depthWrite={false} />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#C8A96A" transparent opacity={0.1} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

export default function NetworkScene({
  className,
  count = 80,
  interactive = true,
}: {
  className?: string;
  count?: number;
  interactive?: boolean;
}) {
  return (
    <div className={className} style={{ pointerEvents: interactive ? "auto" : "none" }}>
      <Canvas
        camera={{ position: [0, 0, 13.5], fov: 55 }}
        dpr={[1, 1.4]}
        gl={{ antialias: true, alpha: true, powerPreference: "default" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={0.6} />
        <Network count={count} />
      </Canvas>
    </div>
  );
}
