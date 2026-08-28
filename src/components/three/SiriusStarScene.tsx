"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sceneState } from "@/lib/scene-store";

/**
 * The Sirius system — the brightest star in the night sky, blue-white.
 * A luminous core (the star) with orbiting rule/severity nodes and a
 * continuous stream of finding particles along elliptical lanes.
 * Scroll drives camera + intensity via sceneState.
 */

const ACCENT = new THREE.Color("#7C3AED");
const STAR = new THREE.Color("#cdd8ff");
const RED = new THREE.Color("#ff5c5c");
const AMBER = new THREE.Color("#ffbc33");
const GREEN = new THREE.Color("#04B575");

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.6)");
  g.addColorStop(0.5, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const CAM_KF: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [
  { pos: new THREE.Vector3(0, 0.4, 10.5), look: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(3.2, 1.2, 8.2), look: new THREE.Vector3(0.6, 0, 0) },
  { pos: new THREE.Vector3(-3.6, 2.4, 7.6), look: new THREE.Vector3(-0.4, 0.2, 0) },
  { pos: new THREE.Vector3(0.4, 4.6, 6.8), look: new THREE.Vector3(0.2, -0.2, 0) },
  { pos: new THREE.Vector3(2.2, -1.4, 7.2), look: new THREE.Vector3(0.8, 0.3, 0) },
  { pos: new THREE.Vector3(-1.8, 0.2, 5.8), look: new THREE.Vector3(-0.3, 0, 0.4) },
  { pos: new THREE.Vector3(0, 0.8, 11.8), look: new THREE.Vector3(0, 0, 0) },
];

function StarSystem() {
  const { camera } = useThree();
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const innerGlowRef = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const scanRef = useRef<THREE.Mesh>(null);
  const riskLightRef = useRef<THREE.PointLight>(null);
  const look = useRef(new THREE.Vector3(0, 0, 0));

  const glowTex = useMemo(makeGlowTexture, []);

  // Rule nodes orbiting the star — one per severity band.
  const nodeOrbits = useMemo(
    () => [
      { r: 2.6, speed: 0.22, tilt: 0.15, color: RED, size: 0.09, phase: 0 },
      { r: 3.1, speed: -0.17, tilt: -0.25, color: AMBER, size: 0.075, phase: 1.3 },
      { r: 3.6, speed: 0.13, tilt: 0.4, color: ACCENT, size: 0.065, phase: 2.8 },
      { r: 4.1, speed: -0.1, tilt: -0.5, color: GREEN, size: 0.055, phase: 4.2 },
    ],
    []
  );

  // Finding particles streaming along elliptical lanes.
  const stream = useMemo(() => {
    const count = sceneState.isMobile ? 60 : 140;
    const lanes = nodeOrbits.map((o) => o.r);
    const data = Array.from({ length: count }, (_, i) => ({
      lane: i % lanes.length,
      t: Math.random(),
      speed: 0.05 + Math.random() * 0.1,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const colors = new Float32Array(count * 3);
    data.forEach((d, i) => {
      const c = nodeOrbits[d.lane].color;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    });
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTex,
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    return { points: new THREE.Points(geo, mat), data, lanes };
  }, [glowTex, nodeOrbits]);

  // Ambient starfield.
  const field = useMemo(() => {
    const count = sceneState.isMobile ? 150 : 380;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 9 + Math.random() * 14;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.65;
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTex,
      color: "#6b7280",
      size: 0.05,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }, [glowTex]);

  const nodeMeshes = useRef<THREE.Mesh[]>([]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = sceneState;
    st.vis += (st.stateIndex - st.vis) * Math.min(1, dt * 2.2);
    const vis = st.vis;
    const t = state.clock.elapsedTime;

    // Camera along keyframes with parallax.
    let i = Math.floor(vis);
    let f = vis - i;
    if (i >= CAM_KF.length - 1) { i = CAM_KF.length - 2; f = 1; }
    if (i < 0) { i = 0; f = 0; }
    const sm = f * f * (3 - 2 * f);
    const tp = new THREE.Vector3().copy(CAM_KF[i].pos).lerp(CAM_KF[i + 1].pos, sm);
    const tl = new THREE.Vector3().copy(CAM_KF[i].look).lerp(CAM_KF[i + 1].look, sm);
    if (!st.reducedMotion) {
      tp.x += st.mouse.x * 0.55;
      tp.y += st.mouse.y * 0.4;
    }
    camera.position.lerp(tp, Math.min(1, dt * 2.4));
    look.current.lerp(tl, Math.min(1, dt * 2.4));
    camera.lookAt(look.current);

    // Star core breathing, hotter as the scan progresses.
    const heat = clamp01((vis - 1.2) / 3.5);
    if (coreRef.current) {
      const s = 1 + Math.sin(t * 1.8) * 0.04;
      coreRef.current.scale.setScalar(s);
      coreRef.current.rotation.y = t * 0.12;
      const m = coreRef.current.material as THREE.MeshStandardMaterial;
      m.emissive.copy(STAR).lerp(ACCENT, heat * 0.55);
      m.emissiveIntensity = 2.2 + Math.sin(t * 1.8) * 0.4 + heat * 1.4;
    }
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.SpriteMaterial;
      m.color.copy(STAR).lerp(ACCENT, heat * 0.6);
      m.opacity = 0.5 + heat * 0.18 + Math.sin(t * 2.2) * 0.05;
      glowRef.current.scale.setScalar(6.4 + Math.sin(t * 1.4) * 0.5 + heat * 1.6);
    }
    if (innerGlowRef.current) {
      (innerGlowRef.current.material as THREE.SpriteMaterial).opacity = 0.9;
      innerGlowRef.current.scale.setScalar(2.6 + Math.sin(t * 2.6) * 0.2);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.1;
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.28 + heat * 0.2;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.07;
      ring2Ref.current.rotation.x = Math.PI / 2.6 + Math.sin(t * 0.3) * 0.08;
    }

    // Orbiting rule nodes.
    nodeMeshes.current.forEach((mesh, ni) => {
      if (!mesh) return;
      const o = nodeOrbits[ni];
      const a = t * o.speed + o.phase;
      mesh.position.set(
        Math.cos(a) * o.r,
        Math.sin(a) * o.r * Math.sin(o.tilt),
        Math.sin(a) * o.r * Math.cos(o.tilt)
      );
      const pulse = 1 + Math.sin(t * 3 + ni * 1.7) * 0.18;
      mesh.scale.setScalar(pulse);
    });

    // Scan sweep — a ring expanding outward during scan phases.
    if (scanRef.current) {
      const scanOn = vis > 0.8 && vis < 5.2;
      scanRef.current.visible = scanOn;
      if (scanOn) {
        const phase = (t * 0.35) % 1;
        scanRef.current.scale.setScalar(1.2 + phase * 5.5);
        (scanRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.22;
      }
    }

    // Finding stream.
    const speedMul = 1 + heat * 0.5;
    const attr = stream.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    stream.data.forEach((p, pi) => {
      p.t += p.speed * dt * speedMul;
      if (p.t > 1) p.t -= 1;
      const laneR = stream.lanes[p.lane];
      const tilt = nodeOrbits[p.lane].tilt;
      const a = p.t * Math.PI * 2;
      attr.setXYZ(
        pi,
        Math.cos(a) * laneR,
        Math.sin(a) * laneR * Math.sin(tilt) * 1.15,
        Math.sin(a) * laneR * Math.cos(tilt)
      );
    });
    attr.needsUpdate = true;

    field.rotation.y = t * 0.008;

    if (riskLightRef.current) {
      riskLightRef.current.intensity = heat * 6;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1.05, 2]} />
        <meshStandardMaterial color="#0d0f1a" emissive={STAR} emissiveIntensity={2.2} roughness={0.25} metalness={0.6} flatShading />
      </mesh>
      <sprite ref={glowRef} scale={6.4}>
        <spriteMaterial map={glowTex} color={STAR} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={innerGlowRef} scale={2.6}>
        <spriteMaterial map={glowTex} color="#ffffff" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[2.2, 0.012, 8, 96]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.28} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 2.6, 0.2, 0]}>
        <torusGeometry args={[3.4, 0.01, 8, 96]} />
        <meshBasicMaterial color={STAR} transparent opacity={0.18} />
      </mesh>

      {nodeOrbits.map((o, ni) => (
        <mesh key={ni} ref={(el) => { if (el) nodeMeshes.current[ni] = el; }}>
          <sphereGeometry args={[o.size, 12, 12]} />
          <meshStandardMaterial color="#0a0a0f" emissive={o.color} emissiveIntensity={2.4} roughness={0.35} />
        </mesh>
      ))}

      <mesh ref={scanRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.97, 1, 64]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      <primitive object={stream.points} />
      <primitive object={field} />

      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={14} distance={16} color={STAR} />
      <pointLight position={[-6, 4, -4]} intensity={5} color={ACCENT} />
      <pointLight ref={riskLightRef} position={[3, -2, 3]} intensity={0} distance={12} color={RED} />
    </group>
  );
}

export default function SiriusStarScene({ className }: { className?: string }) {
  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      <Canvas
        camera={{ position: [0, 0.4, 10.5], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "default" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <StarSystem />
      </Canvas>
    </div>
  );
}
