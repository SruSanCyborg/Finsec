"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { sceneState } from "@/lib/scene-store";
import { cn } from "@/lib/utils";

const GOLD = new THREE.Color("#C8A96A");
const BLUE = new THREE.Color("#5CA7FF");
const AMBER = new THREE.Color("#E3B341");
const RED = new THREE.Color("#E5484D");
const GREEN = new THREE.Color("#46A758");

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const NODES = [
  { label: "WALLET", pos: V(-3.6, 1.2, -1.2), color: GOLD },
  { label: "ACCOUNT", pos: V(3.8, 1.5, -0.8), color: GOLD },
  { label: "PROTOCOL", pos: V(-3.0, -1.9, 1.7), color: BLUE },
  { label: "COUNTERPARTY", pos: V(1.7, 2.8, -2.5), color: GOLD },
  { label: "COUNTERPARTY", pos: V(-1.1, 3.0, 1.3), color: GOLD },
  { label: "NEW COUNTERPARTY", pos: V(3.4, -1.7, 1.9), color: AMBER },
];

const CURVES = NODES.map((n) => {
  const mid = V(0, 0.15, 0).add(n.pos).multiplyScalar(0.5);
  mid.y += 1.1;
  return new THREE.QuadraticBezierCurve3(V(0, 0.1, 0), mid, n.pos.clone());
});

const GATE_POS = CURVES[5].getPoint(0.54);
const GATE_TAN = CURVES[5].getTangent(0.54);

const CAM_KF = [
  { pos: V(0, 0.6, 11.5), look: V(0, 0.2, 0) },
  { pos: V(2.4, 0.8, 9.0), look: V(1.4, -0.4, 0.6) },
  { pos: V(0.4, 0.3, 6.6), look: V(0.5, -0.15, 0.9) },
  { pos: V(-3.4, 1.3, 7.4), look: V(-0.2, -0.2, 0.4) },
  { pos: V(3.8, 2.1, 7.0), look: V(0.7, -0.3, 0.8) },
  { pos: V(0.3, 4.8, 6.2), look: V(0.5, -0.4, 0.9) },
  { pos: V(1.9, 0.1, 5.4), look: V(1.0, -0.45, 1.25) },
  { pos: V(-2.7, 2.7, 9.8), look: V(0.3, -0.2, 0.7) },
  { pos: V(0, 0.9, 12.8), look: V(0, 0.2, 0) },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c1 = new THREE.Color();

function System() {
  const { camera } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const coreGlowRef = useRef<THREE.Sprite>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const gateGroupRef = useRef<THREE.Group>(null);
  const gateRef = useRef<THREE.Mesh>(null);
  const gateInnerRef = useRef<THREE.Mesh>(null);
  const suspRef = useRef<THREE.Group>(null);
  const suspMeshRef = useRef<THREE.Mesh>(null);
  const suspGlowRef = useRef<THREE.Sprite>(null);
  const bhvRef = useRef<THREE.Group>(null);
  const ctxRefs = useRef<(THREE.Mesh | null)[]>([]);
  const escRefs = useRef<(THREE.Mesh | null)[]>([]);
  const resolveRef = useRef<THREE.Mesh>(null);
  const riskLightRef = useRef<THREE.PointLight>(null);

  const suspP = useRef(0);
  const suspPos = useRef(new THREE.Vector3());
  const bhvScale = useRef(0.001);
  const flash = useRef(0);
  const wasBlocked = useRef(false);
  const look = useRef(new THREE.Vector3(0, 0.2, 0));

  const glowTex = useMemo(makeGlowTexture, []);

  const pathLines = useMemo(
    () =>
      CURVES.map((c) => {
        const geo = new THREE.BufferGeometry().setFromPoints(c.getPoints(48));
        const mat = new THREE.LineBasicMaterial({ color: GOLD.clone(), transparent: true, opacity: 0.16 });
        return new THREE.Line(geo, mat);
      }),
    []
  );

  const packets = useMemo(() => {
    const count = sceneState.isMobile ? 10 : 18;
    const data = Array.from({ length: count }, () => ({
      curve: Math.floor(Math.random() * (CURVES.length - 1)),
      t: Math.random(),
      speed: 0.1 + Math.random() * 0.14,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({
      map: glowTex,
      color: GOLD,
      size: 0.16,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { points: new THREE.Points(geo, mat), data };
  }, [glowTex]);

  const ambient = useMemo(() => {
    const count = sceneState.isMobile ? 90 : 240;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 9;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTex,
      color: "#8f8370",
      size: 0.07,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }, [glowTex]);

  useEffect(() => {
    if (gateGroupRef.current) {
      gateGroupRef.current.lookAt(GATE_POS.clone().add(GATE_TAN));
    }
    if (sceneState.isMobile) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = 52;
      cam.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = sceneState;
    st.vis += (st.stateIndex - st.vis) * Math.min(1, dt * 2.2);
    const vis = st.vis;
    const t = state.clock.elapsedTime;
    const risk = clamp01((vis - 1.6) / 4.0);
    const closed = clamp01((vis - 5.6) / 0.4);
    const blocked = closed > 0.5;

    if (blocked && !wasBlocked.current) flash.current = 1;
    wasBlocked.current = blocked;
    flash.current *= Math.pow(0.02, dt);

    let i = Math.floor(vis);
    let f = vis - i;
    if (i >= CAM_KF.length - 1) {
      i = CAM_KF.length - 2;
      f = 1;
    }
    if (i < 0) {
      i = 0;
      f = 0;
    }
    const targetPos = _v1.copy(CAM_KF[i].pos).lerp(CAM_KF[i + 1].pos, smooth(f));
    const targetLook = _v2.copy(CAM_KF[i].look).lerp(CAM_KF[i + 1].look, smooth(f));
    if (!st.reducedMotion) {
      targetPos.x += st.mouse.x * 0.5;
      targetPos.y += st.mouse.y * 0.35;
    }
    camera.position.lerp(targetPos, Math.min(1, dt * 2.5));
    look.current.lerp(targetLook, Math.min(1, dt * 2.5));
    camera.lookAt(look.current);

    if (groupRef.current && !st.reducedMotion) {
      groupRef.current.rotation.y += (st.mouse.x * 0.05 - groupRef.current.rotation.y) * Math.min(1, dt * 2);
      groupRef.current.rotation.x += (st.mouse.y * 0.035 - groupRef.current.rotation.x) * Math.min(1, dt * 2);
    }

    if (coreRef.current) {
      const s = 1 + Math.sin(t * 2) * 0.035;
      coreRef.current.scale.setScalar(s);
      const m = coreRef.current.material as THREE.MeshStandardMaterial;
      m.emissive.copy(GOLD).lerp(AMBER, risk * 0.5);
      m.emissiveIntensity = 1.4 + Math.sin(t * 2) * 0.25 - risk * 0.5;
    }
    if (wireRef.current) wireRef.current.rotation.y = t * 0.1;
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.35;
      ring1Ref.current.rotation.y = t * 0.12;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = t * 0.28;
      ring2Ref.current.rotation.z = t * 0.1;
    }
    if (coreGlowRef.current) {
      const gm = coreGlowRef.current.material as THREE.SpriteMaterial;
      gm.opacity = 0.32 - risk * 0.16 + flash.current * 0.3;
      coreGlowRef.current.scale.setScalar(5 + Math.sin(t * 1.5) * 0.3);
    }

    if (shellRef.current) {
      const sm = shellRef.current.material as THREE.MeshBasicMaterial;
      const target = vis > 1.6 ? 0.13 + risk * 0.05 : 0;
      sm.opacity += (target - sm.opacity) * Math.min(1, dt * 3);
      shellRef.current.rotation.y = t * 0.05;
    }

    const appear = clamp01((vis - 0.6) / 0.6);
    const pTarget = Math.min(0.52, Math.max(0, (vis - 0.8) * 0.16));
    suspP.current += (pTarget - suspP.current) * Math.min(1, dt * 1.2);
    const pos = CURVES[5].getPoint(suspP.current);
    suspPos.current.copy(pos);
    if (suspRef.current) {
      const sc = appear * (1 + Math.sin(t * 6) * 0.08 * (0.3 + risk));
      suspRef.current.scale.setScalar(Math.max(0.001, sc));
      const jitter = risk * 0.05;
      suspRef.current.position.set(pos.x + Math.sin(t * 13) * jitter, pos.y + Math.cos(t * 11) * jitter, pos.z);
      const col = _c1
        .copy(GOLD)
        .lerp(AMBER, clamp01((risk - 0.15) * 1.6))
        .lerp(RED, clamp01((vis - 5.1) * 1.2));
      if (suspMeshRef.current) {
        const m = suspMeshRef.current.material as THREE.MeshStandardMaterial;
        m.color.copy(col);
        m.emissive.copy(col);
        m.emissiveIntensity = 2 + risk * 1.5 + flash.current * 4;
      }
      if (suspGlowRef.current) {
        const gm = suspGlowRef.current.material as THREE.SpriteMaterial;
        gm.color.copy(col);
        gm.opacity = 0.75 * appear + flash.current * 0.5;
        suspGlowRef.current.scale.setScalar(1.1 + flash.current * 2.4 + Math.sin(t * 6) * 0.12);
      }
    }

    if (gateRef.current && gateInnerRef.current) {
      const gm = gateRef.current.material as THREE.MeshBasicMaterial;
      const im = gateInnerRef.current.material as THREE.MeshBasicMaterial;
      gm.opacity = clamp01((vis - 4.6) / 0.5) * 0.9;
      im.opacity = closed;
      gateRef.current.scale.setScalar(THREE.MathUtils.lerp(1.25, 0.55, closed));
      gateInnerRef.current.scale.setScalar(THREE.MathUtils.lerp(1.4, 0.6, closed));
    }

    const pm5 = pathLines[5].material as THREE.LineBasicMaterial;
    pm5.color.copy(GOLD).lerp(RED, clamp01((vis - 5.0) * 1.5));
    pm5.opacity = 0.16 + risk * 0.22 - closed * 0.1;

    const bhvOn = vis > 2.6 && vis < 5.4 ? 1 : 0.001;
    bhvScale.current += (bhvOn - bhvScale.current) * Math.min(1, dt * 2.5);
    if (bhvRef.current) {
      bhvRef.current.scale.setScalar(Math.max(0.001, bhvScale.current));
      bhvRef.current.rotation.y = t * 0.15;
    }

    const ctxOn = clamp01((vis - 3.6) / 0.4) * (1 - clamp01((vis - 6.0) / 0.4));
    ctxRefs.current.forEach((m, ci) => {
      if (!m) return;
      m.scale.setScalar(Math.max(0.001, ctxOn));
      const a = t * 0.8 + (ci * Math.PI) / 2;
      m.position.set(
        pos.x + Math.cos(a) * 0.6,
        pos.y + Math.sin(t * 1.3 + ci) * 0.25,
        pos.z + Math.sin(a) * 0.6
      );
      m.rotation.y = t * 1.5 + ci;
      m.rotation.x = t * 1.1;
    });

    const escOn = vis > 6.5 && vis < 8.3;
    escRefs.current.forEach((m, ei) => {
      if (!m) return;
      m.visible = escOn;
      if (!escOn) return;
      const phase = (t * 0.5 + ei / 3) % 1;
      m.position.copy(suspPos.current);
      m.scale.setScalar(0.4 + phase * 4.2);
      m.quaternion.copy(camera.quaternion);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.45;
    });

    if (resolveRef.current) {
      const resOn = vis > 7.6;
      resolveRef.current.visible = resOn;
      if (resOn) {
        const phase = (t * 0.45) % 1;
        resolveRef.current.scale.setScalar(0.5 + phase * 7);
        (resolveRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.16;
      }
    }

    if (riskLightRef.current) {
      riskLightRef.current.intensity = risk * 9 + flash.current * 60;
      riskLightRef.current.position.copy(suspPos.current);
    }

    const speedMul = 1 - risk * 0.3;
    const attr = packets.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    packets.data.forEach((p, pi) => {
      p.t += p.speed * dt * speedMul;
      if (p.t > 1) {
        p.t = 0;
        p.curve = Math.floor(Math.random() * (CURVES.length - 1));
      }
      const v = CURVES[p.curve].getPoint(p.t);
      attr.setXYZ(pi, v.x, v.y, v.z);
    });
    attr.needsUpdate = true;
    ambient.rotation.y = t * 0.012;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial color="#1a1610" emissive={GOLD} emissiveIntensity={1.4} roughness={0.35} metalness={0.7} flatShading />
      </mesh>
      <mesh ref={wireRef} scale={1.28}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshBasicMaterial color={GOLD} wireframe transparent opacity={0.12} />
      </mesh>
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.7, 0.015, 8, 96]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.5} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, Math.PI / 6]}>
        <torusGeometry args={[2.05, 0.012, 8, 96]} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.35} />
      </mesh>
      <sprite ref={coreGlowRef} scale={5}>
        <spriteMaterial map={glowTex} color={GOLD} transparent opacity={0.32} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      <mesh ref={shellRef}>
        <sphereGeometry args={[2.35, 24, 18]} />
        <meshBasicMaterial color={BLUE} wireframe transparent opacity={0} />
      </mesh>

      <group ref={gateGroupRef} position={GATE_POS}>
        <mesh ref={gateRef}>
          <torusGeometry args={[0.8, 0.03, 12, 64]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0} />
        </mesh>
        <mesh ref={gateInnerRef}>
          <torusGeometry args={[0.45, 0.05, 12, 48]} />
          <meshBasicMaterial color={RED} transparent opacity={0} />
        </mesh>
      </group>

      <group ref={suspRef} scale={0.001}>
        <mesh ref={suspMeshRef}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={2} roughness={0.3} />
        </mesh>
        <sprite ref={suspGlowRef} scale={1.1}>
          <spriteMaterial map={glowTex} color={GOLD} transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>

      <group ref={bhvRef} scale={0.001} position={[-0.4, 0.15, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.9, 0.015, 8, 96, Math.PI * 0.75]} />
          <meshBasicMaterial color="#3f3f46" transparent opacity={0.35} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.9, 0.03, 8, 64, Math.PI * 0.3]} />
          <meshBasicMaterial color={GREEN} transparent opacity={0.8} />
        </mesh>
        <mesh position={[-2.05, 0.02, -2.05]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={RED} />
        </mesh>
      </group>

      {[0, 1, 2, 3].map((ci) => (
        <mesh key={ci} ref={(el) => { ctxRefs.current[ci] = el; }} scale={0.001}>
          <octahedronGeometry args={[0.07, 0]} />
          <meshBasicMaterial color={ci < 2 ? AMBER : RED} transparent opacity={0.9} />
        </mesh>
      ))}

      {[0, 1, 2].map((ei) => (
        <mesh key={ei} ref={(el) => { escRefs.current[ei] = el; }} visible={false}>
          <ringGeometry args={[0.96, 1, 64]} />
          <meshBasicMaterial color={RED} transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      ))}

      <mesh ref={resolveRef} visible={false}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color={GREEN} transparent opacity={0.15} side={THREE.BackSide} />
      </mesh>

      {NODES.map((n, ni) => (
        <group key={ni} position={n.pos}>
          <mesh>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color="#111" emissive={n.color} emissiveIntensity={1.6} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh rotation={[Math.PI / 2.4, ni * 0.7, 0]}>
            <torusGeometry args={[0.3, 0.008, 6, 48]} />
            <meshBasicMaterial color={n.color} transparent opacity={0.5} />
          </mesh>
          <Html position={[0, 0.42, 0]} center distanceFactor={11} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div
              className={cn(
                "whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em]",
                ni === 5 ? "border-severity-high/40 bg-black/70 text-severity-high" : "border-line bg-black/70 text-zinc-500"
              )}
            >
              {n.label}
            </div>
          </Html>
        </group>
      ))}

      {pathLines.map((l, li) => (
        <primitive key={li} object={l} />
      ))}
      <primitive object={packets.points} />
      <primitive object={ambient} />

      <ambientLight intensity={0.35} />
      <pointLight position={[0, 0, 0]} intensity={12} distance={14} color={GOLD} />
      <pointLight position={[-6, 3, -6]} intensity={6} color={BLUE} />
      <pointLight ref={riskLightRef} intensity={0} distance={10} color={RED} />
    </group>
  );
}

export default function AgentSystemScene({ className }: { className?: string }) {
  useEffect(() => {
    sceneState.isMobile = window.innerWidth < 768;
    sceneState.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      <Canvas
        camera={{ position: [0, 0.6, 11.5], fov: 42 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: "default" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <System />
      </Canvas>
    </div>
  );
}
