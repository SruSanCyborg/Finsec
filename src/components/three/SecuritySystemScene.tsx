"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

function Packet({
  phase,
  color,
  blocked,
}: {
  phase: number;
  color: string;
  blocked: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const progress = (state.clock.elapsedTime * 0.12 + phase) % 1;
    const position = blocked ? Math.min(progress, 0.62) : progress;
    ref.current.position.set(
      1.2 - position * 5.3,
      0.18 + Math.sin(position * 8) * 0.12,
      0.35 + Math.sin(position * 5) * 0.18,
    );
    ref.current.scale.setScalar(0.07 + Math.sin(position * Math.PI) * 0.05);
  });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function System({ state }: { state: number }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();
  const points = useMemo(() => {
    const count = viewport.width < 7 ? 70 : 180;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    return positions;
  }, [viewport.width]);
  const risk = state >= 3 && state <= 6;
  useFrame((frame, delta) => {
    const time = frame.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        frame.pointer.x * 0.16 + (state - 1) * 0.08,
        0.04,
      );
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        frame.pointer.y * 0.08,
        0.04,
      );
      group.current.position.y = THREE.MathUtils.lerp(
        group.current.position.y,
        state >= 4 ? 0.1 : 0,
        0.04,
      );
    }
    if (ring.current) {
      ring.current.rotation.z += delta * (risk ? 0.18 : 0.05);
      ring.current.scale.setScalar(1 + Math.sin(time * 2) * 0.025);
    }
  });
  return (
    <group ref={group} scale={viewport.width < 7 ? 0.8 : 1.15}>
      <mesh position={[0, 0.2, 0]}>
        <icosahedronGeometry args={[0.72, 3]} />
        <meshStandardMaterial
          color="#e0b96d"
          emissive="#a67c37"
          emissiveIntensity={1.8}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.012, 8, 96]} />
        <meshBasicMaterial color="#e0b96d" transparent opacity={0.65} />
      </mesh>
      <mesh ref={ring} position={[-1.4, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.025, 8, 96]} />
        <meshBasicMaterial
          color={risk ? "#d66b5f" : "#7fa99a"}
          transparent
          opacity={0.65}
        />
      </mesh>
      <mesh position={[-2.9, 0.15, 0]}>
        <boxGeometry args={[0.55, 1.25, 0.7]} />
        <meshStandardMaterial
          color="#202a28"
          emissive="#27443b"
          emissiveIntensity={0.6}
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[1.8, -0.4, -0.1]}>
        <cylinderGeometry args={[0.7, 0.7, 0.12, 48]} />
        <meshStandardMaterial
          color="#18201e"
          emissive="#16352d"
          emissiveIntensity={0.8}
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[1.8, -0.32, -0.1]}>
        <torusGeometry args={[0.45, 0.02, 8, 48]} />
        <meshBasicMaterial color="#74c69d" transparent opacity={0.7} />
      </mesh>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([-0.55, 0.2, 0, -1.4, 0.1, 0, -2.62, 0.15, 0]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={risk ? "#d66b5f" : "#d9b56d"}
          transparent
          opacity={0.45}
        />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0.55, 0.2, 0, 1.8, -0.35, -0.1]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#74c69d" transparent opacity={0.45} />
      </line>
      {Array.from({ length: viewport.width < 7 ? 3 : 6 }, (_, index) => (
        <Packet
          key={index}
          phase={index / 6}
          color={state >= 5 ? "#d66b5f" : "#e0b96d"}
          blocked={state >= 5}
        />
      ))}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={risk ? "#b47761" : "#8ca69a"}
          size={0.025}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </points>
      <pointLight
        position={[0, 1, 2]}
        color="#e0b96d"
        intensity={8}
        distance={7}
      />
      <pointLight
        position={[-2, 0, 1]}
        color={risk ? "#c96a5b" : "#74c69d"}
        intensity={5}
        distance={6}
      />
    </group>
  );
}

export default function SecuritySystemScene({
  className,
  state = 0,
}: {
  className?: string;
  state?: number;
}) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 43 }}
        dpr={[1, 1.35]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <ambientLight intensity={0.35} />
        <System state={state} />
      </Canvas>
    </div>
  );
}
