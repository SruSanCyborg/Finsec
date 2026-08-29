"use client";

// Sirius 3D glassmorphic stage — R3F port of models.html's per-section
// sculptures, themed to the app's blue palette. Each landing section gets its
// own sculpture; the stage sits in the panel's right column (Untitled-1.html
// layout) and fades in when the section is visible.

import { useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const ACCENT = 0x38bdf8;
const INDIGO = 0x818cf8;
const VIOLET = 0xa78bfa;
const EMERALD = 0x4ade80;
const BAD = 0xf87171;

function glass(color: number, opacity = 0.68, roughness = 0.08) {
  const m = new THREE.MeshPhysicalMaterial({
    color, transparent: true, opacity, roughness,
    metalness: 0.05, transmission: 0.92, ior: 1.52, reflectivity: 0.95,
    clearcoat: 1.0, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
  });
  m.userData = { baseOpacity: opacity };
  return m;
}
function glow(color: number, intensity = 0.6) {
  const m = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity,
    roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.95,
  });
  m.userData = { baseOpacity: 0.95, baseEmissive: intensity };
  return m;
}
function wire(color: number, opacity = 0.35) {
  const m = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
  m.userData = { baseOpacity: opacity };
  return m;
}

function bracket(type: string): THREE.BufferGeometry {
  const curve = new THREE.CurvePath<THREE.Vector3>();
  if (type === "<") {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.45, 0.65, 0), new THREE.Vector3(-0.45, 0, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(0.45, -0.65, 0)));
  } else if (type === ">") {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-0.45, 0.65, 0), new THREE.Vector3(0.45, 0, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.45, 0, 0), new THREE.Vector3(-0.45, -0.65, 0)));
  } else if (type === "/") {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.3, 0.75, 0), new THREE.Vector3(-0.3, -0.75, 0)));
  } else if (type === "{") {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.28, 0.75, 0), new THREE.Vector3(-0.1, 0.38, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-0.1, 0.38, 0), new THREE.Vector3(-0.28, 0, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-0.28, 0, 0), new THREE.Vector3(-0.1, -0.38, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-0.1, -0.38, 0), new THREE.Vector3(0.28, -0.75, 0)));
  } else if (type === "}") {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-0.28, 0.75, 0), new THREE.Vector3(0.1, 0.38, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.1, 0.38, 0), new THREE.Vector3(0.28, 0, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.28, 0, 0), new THREE.Vector3(0.1, -0.38, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0.1, -0.38, 0), new THREE.Vector3(-0.28, -0.75, 0)));
  }
  return new THREE.TubeGeometry(curve, 32, 0.055, 12, false);
}

const G = {
  "<": bracket("<"), ">": bracket(">"), "/": bracket("/"),
  "{": bracket("{"), "}": bracket("}"),
};

interface Build {
  build: (group: THREE.Group) => void;
  animate?: (group: THREE.Group, t: number, fracture: number) => void;
}

function hero(g: THREE.Group) {
  const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 0), glass(0xffffff, 0.65, 0.06));
  g.add(outer);
  const w = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 0), wire(ACCENT, 0.35));
  w.scale.set(1.002, 1.002, 1.002);
  g.add(w);
  const gm = glow(ACCENT, 1.4);
  const lb = new THREE.Mesh(G["<"], gm); lb.position.set(-0.8, 0, 0); g.add(lb);
  const sl = new THREE.Mesh(G["/"], gm); g.add(sl);
  const rb = new THREE.Mesh(G[">"], gm); rb.position.set(0.8, 0, 0); g.add(rb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.02, 16, 64), glow(0xf5efe4, 0.4));
  ring.rotation.x = Math.PI * 0.35; g.add(ring);
  return (grp: THREE.Group, t: number) => {
    outer.rotation.y += 0.0035; outer.rotation.x += 0.002;
    w.rotation.y = outer.rotation.y; w.rotation.x = outer.rotation.x;
    lb.position.y = Math.sin(t * 1.5) * 0.06;
    sl.position.y = Math.sin(t * 1.5 + 0.4) * 0.06;
    rb.position.y = Math.sin(t * 1.5 + 0.8) * 0.06;
    ring.rotation.z += 0.005;
  };
}

function problem(g: THREE.Group) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.28, 24, 64), glass(0xffffff, 0.68, 0.08));
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 32), glow(ACCENT, 0.45));
  disc.rotation.x = Math.PI / 2; g.add(disc);
  const km = glow(0xffffff, 1.2);
  const kl = new THREE.Mesh(G["{"], km); kl.scale.set(0.6, 0.6, 0.6); kl.position.set(-0.22, 0, 0.15); g.add(kl);
  const kr = new THREE.Mesh(G["}"], km); kr.scale.set(0.6, 0.6, 0.6); kr.position.set(0.22, 0, 0.15); g.add(kr);
  return (grp: THREE.Group, t: number) => {
    ring.rotation.z += 0.003; disc.rotation.z -= 0.006;
    grp.rotation.y = Math.sin(t * 0.6) * 0.25;
  };
}

function stages(g: THREE.Group) {
  const center = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 6), glass(0xffffff, 0.72, 0.05));
  center.rotation.x = Math.PI / 4; g.add(center);
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 6), wire(ACCENT, 0.4));
  cw.rotation.x = Math.PI / 4; cw.scale.set(1.02, 1.02, 1.02); g.add(cw);
  const nodes: THREE.Group[] = [];
  const radius = 2.0;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const ng = new THREE.Group();
    ng.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    const nm = new THREE.Mesh(geo, glass(ACCENT, 0.8, 0.08));
    ng.add(nm);
    const nw = new THREE.Mesh(geo, wire(0xffffff, 0.5));
    nw.scale.set(1.04, 1.04, 1.04); ng.add(nw);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, radius, 8), glow(ACCENT, 0.35));
    beam.position.set(-Math.cos(angle) * (radius / 2), -Math.sin(angle) * (radius / 2), 0);
    beam.rotation.z = angle + Math.PI / 2; ng.add(beam);
    g.add(ng); nodes.push(ng);
  }
  return (grp: THREE.Group, t: number) => {
    grp.rotation.z = t * 0.08;
    center.rotation.y += 0.005;
    nodes.forEach((n) => n.children.forEach((c) => { c.rotation.x += 0.01; c.rotation.y += 0.012; }));
  };
}

function feed(g: THREE.Group) {
  const gate = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.14, 16, 4), glass(ACCENT, 0.78, 0.08));
  gate.geometry.rotateZ(Math.PI / 4); g.add(gate);
  const cubeGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
  const cubes: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const isBlock = i % 4 === 0;
    const color = isBlock ? BAD : i % 2 === 0 ? EMERALD : ACCENT;
    const cube = new THREE.Mesh(cubeGeo, glass(color, 0.82, 0.05));
    const cw = new THREE.Mesh(cubeGeo, wire(0xffffff, 0.35));
    cube.add(cw);
    cube.position.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, -3.5 + i * 0.9);
    cube.userData = { speed: 0.02 + Math.random() * 0.02, rotSpeed: 0.01 + Math.random() * 0.015 };
    g.add(cube); cubes.push(cube);
  }
  return (grp: THREE.Group, t: number) => {
    gate.rotation.z += 0.004;
    cubes.forEach((c) => {
      c.rotation.x += c.userData.rotSpeed as number;
      c.rotation.y += c.userData.rotSpeed as number;
      c.position.z += c.userData.speed as number;
      if (c.position.z > 2.6) {
        c.position.z = -3.8;
        c.position.x = (Math.random() - 0.5) * 1.6;
        c.position.y = (Math.random() - 0.5) * 1.6;
      }
    });
  };
}

function cap(g: THREE.Group) {
  const gauge = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 48, 1, 0, Math.PI * 1.5), glass(ACCENT, 0.72, 0.08));
  g.add(gauge);
  const capLine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), glow(BAD, 1.6));
  capLine.position.set(0, 1.68, 0); g.add(capLine);
  const needleGeo = new THREE.CylinderGeometry(0.025, 0.06, 1.6, 16);
  needleGeo.translate(0, 0.8, 0);
  const needle = new THREE.Mesh(needleGeo, glow(ACCENT, 1.4));
  needle.rotation.z = -Math.PI * 0.48; g.add(needle);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 24), glass(0xffffff, 0.85, 0.05));
  g.add(core);
  return (grp: THREE.Group, t: number) => {
    const jitter = Math.sin(t * 6) * 0.02 + Math.sin(t * 14) * 0.01;
    needle.rotation.z = -Math.PI * 0.48 + jitter;
    gauge.rotation.z = Math.sin(t * 0.4) * 0.08;
    core.scale.setScalar(1.0 + Math.sin(t * 3) * 0.05);
  };
}

function trail(g: THREE.Group) {
  const linkGeo = new THREE.TorusGeometry(0.8, 0.2, 20, 48);
  const links: { mesh: THREE.Mesh; isMiddle: boolean }[] = [];
  for (let i = -2; i <= 2; i++) {
    const isMiddle = i === 0;
    const mat = glass(isMiddle ? ACCENT : 0xffffff, 0.76, 0.06);
    const link = new THREE.Mesh(linkGeo, mat);
    const w = new THREE.Mesh(linkGeo, wire(0xffffff, 0.28));
    link.add(w);
    link.position.set(0, i * 1.05, 0);
    if (Math.abs(i) % 2 === 1) link.rotation.y = Math.PI / 2;
    g.add(link);
    links.push({ mesh: link, isMiddle });
  }
  return (grp: THREE.Group, t: number, fracture: number) => {
    grp.rotation.y = t * 0.25;
    grp.rotation.x = Math.sin(t * 0.4) * 0.15;
    links.forEach((tl) => {
      const m = tl.mesh.material as THREE.MeshStandardMaterial;
      if (tl.isMiddle && fracture > 0.01) {
        tl.mesh.position.x = Math.sin(t * 24) * 0.28 * fracture;
        tl.mesh.rotation.z = Math.sin(t * 20) * 0.6 * fracture;
        m.color.setHex(BAD); m.emissive.setHex(BAD); m.emissiveIntensity = 1.6 * fracture;
      } else {
        tl.mesh.position.x = 0; tl.mesh.rotation.z = 0;
        if (tl.isMiddle) { m.color.setHex(ACCENT); m.emissive.setHex(ACCENT); m.emissiveIntensity = 0.25; }
      }
    });
  };
}

function scan(g: THREE.Group) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 0.5), glass(0xffffff, 0.55, 0.08));
  g.add(box);
  const bw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 0.5), wire(ACCENT, 0.35));
  g.add(bw);
  const cg = new THREE.Mesh(G["{"], glow(ACCENT, 1.2));
  cg.scale.set(0.55, 0.55, 0.55); cg.position.set(-0.4, 0.65, 0); g.add(cg);
  const vuln = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), glow(BAD, 1.8));
  g.add(vuln);
  const lm = glow(BAD, 2.2); lm.side = THREE.DoubleSide;
  const laser = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.06), lm);
  g.add(laser);
  return (grp: THREE.Group, t: number) => {
    grp.rotation.y = Math.sin(t * 0.5) * 0.3;
    grp.rotation.x = Math.cos(t * 0.4) * 0.12;
    const y = Math.sin(t * 1.8) * 1.25;
    laser.position.y = y;
    vuln.scale.setScalar(Math.abs(y) < 0.25 ? 1.35 : 1.0);
  };
}

function stats(g: THREE.Group) {
  const rings: THREE.Mesh[] = [];
  const specs: [number, number, number][] = [[2.0, 0.09, 0.75], [1.5, 0.08, 0.7], [1.05, 0.06, 0.78]];
  const colors = [ACCENT, 0xffffff, EMERALD];
  specs.forEach(([r, tube, op], i) => {
    rings.push(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 16, 64), glass(colors[i], op, 0.06)));
  });
  rings.forEach((r) => g.add(r));
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), glow(ACCENT, 1.4));
  g.add(core);
  return (grp: THREE.Group, t: number) => {
    rings[0].rotation.x += 0.008; rings[0].rotation.y += 0.005;
    rings[1].rotation.y += 0.01; rings[1].rotation.z += 0.006;
    rings[2].rotation.x -= 0.012; rings[2].rotation.z -= 0.008;
    core.rotation.y += 0.015;
  };
}

function cta(g: THREE.Group) {
  const mono = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.5, 0.7), glass(ACCENT, 0.72, 0.05));
  g.add(mono);
  const mw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.5, 0.7), wire(0xffffff, 0.38));
  mw.scale.set(1.01, 1.01, 1.01); g.add(mw);
  const prompt = new THREE.Mesh(G[">"], glow(EMERALD, 1.6));
  prompt.scale.set(0.7, 0.7, 0.7); prompt.position.set(-0.18, 0.25, 0.4); g.add(prompt);
  return (grp: THREE.Group, t: number) => {
    mono.rotation.y = t * 0.2; mw.rotation.y = mono.rotation.y;
    prompt.position.y = 0.25 + Math.sin(t * 3.0) * 0.05;
  };
}

// animate functions keyed by index (trail takes fracture). Each builder adds
// meshes to the group ONCE and returns its per-frame animate closure.
// Index 0 (hero) is intentionally empty — the webcam pixel cloud owns the
// center of the hero; the models start at the problem section.
const ANIMS: Record<number, (g: THREE.Group) => (t: number, fracture: number) => void> = {
  0: () => () => {},
  1: (g) => { const a = problem(g); return (t) => a(g, t); },
  2: (g) => { const a = stages(g); return (t) => a(g, t); },
  3: (g) => { const a = feed(g); return (t) => a(g, t); },
  4: (g) => { const a = cap(g); return (t) => a(g, t); },
  5: (g) => { const a = trail(g); return (t, f) => a(g, t, f); },
  6: (g) => { const a = scan(g); return (t) => a(g, t); },
  7: (g) => { const a = stats(g); return (t) => a(g, t); },
  8: (g) => { const a = cta(g); return (t) => a(g, t); },
};

function updateOpacity(obj: THREE.Object3D, visibility: number) {
  const m = (obj as THREE.Mesh).material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial | undefined;
  if (m) {
    const base = m.userData?.baseOpacity ?? 1;
    m.opacity = base * visibility;
    if (m.emissiveIntensity !== undefined && m.userData?.baseEmissive !== undefined) {
      m.emissiveIntensity = m.userData.baseEmissive * visibility;
    }
  }
  obj.children.forEach((c) => updateOpacity(c, visibility));
}

const MOTION_VIOLET = new THREE.Color(0xa78bfa);

/** Blend emissive/color toward violet as camera motion rises — the models
 *  "wake up" when you move. */
function applyMotionTint(obj: THREE.Object3D, m: number) {
  const mesh = obj as THREE.Mesh;
  const mat = mesh.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial | undefined;
  if (mat) {
    const tint = Math.min(1, m * 1.4);
    if (mat.emissive) {
      mat.emissive.lerp(MOTION_VIOLET, tint * 0.5);
    }
  }
  obj.children.forEach((c) => applyMotionTint(c, m));
}

const SECTION_IDS = ["hero", "problem", "stages", "feed", "cap", "trail", "scan", "stats", "cta"];

function StageInner({
  fracture,
  webcamMotion = 0,
  videoRef,
  webcamOn,
}: {
  fracture: number;
  webcamMotion?: number;
  videoRef?: RefObject<HTMLVideoElement>;
  webcamOn?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const fractureRef = useRef(0);
  fractureRef.current = fracture;
  const motionRef = useRef(0);
  motionRef.current = webcamMotion;

  // build each sculpture once; keep its animate closure + group
  const stages = useMemo(() => {
    return SECTION_IDS.map((_, i) => {
      const g = new THREE.Group();
      g.visible = false;
      const animate = ANIMS[i](g); // builds meshes + returns closure
      return { g, animate, vis: 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const center = vh * 0.5;

    stages.forEach((stage, i) => {
      const { g, animate } = stage;
      const el = document.getElementById(SECTION_IDS[i]);
      if (!el) { g.visible = false; stage.vis = 0; return; }
      const rect = el.getBoundingClientRect();
      const secCenter = rect.top + rect.height * 0.5;
      const dist = Math.abs(secCenter - center);
      const norm = dist / (vh * 0.55);
      const raw = Math.max(0, Math.min(1, 1 - norm));
      const vis = raw * raw * (3 - 2 * raw);
      stage.vis = vis;

      if (vis <= 0.002) { g.visible = false; return; }
      g.visible = true;
      const driftY = (center - secCenter) * 0.0025;
      const hover = Math.sin(t * 1.2 + i) * 0.05;
      g.position.y = driftY + hover;
      g.position.x = 3.6;
      g.position.z = 0;
      // camera-driven reaction: more motion = faster spin + pulse + violet tint
      const m = motionRef.current;
      const spin = 1 + m * 2.2;
      const pulse = 1 + m * 0.22 * Math.sin(t * 6);
      const scale = (0.88 + 0.12 * vis) * pulse;
      g.scale.set(scale, scale, scale);
      g.rotation.y += 0.002 * spin * vis;
      g.rotation.z += 0.001 * spin * vis;
      updateOpacity(g, vis);
      // violet shift with motion (blend emissive toward #a78bfa)
      if (m > 0.02) {
        applyMotionTint(g, m);
      }
      animate(t, fractureRef.current);
    });
  });

  return (
    <group ref={groupRef}>
      {stages.map(({ g }, i) => (
        <primitive key={i} object={g} />
      ))}
    </group>
  );
}

export default function ModelStage({
  fracture = 0,
  webcamMotion = 0,
  videoRef,
  webcamOn,
}: {
  fracture?: number;
  webcamMotion?: number;
  videoRef?: RefObject<HTMLVideoElement>;
  webcamOn?: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 9.5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 7, 8]} intensity={1.9} color="#fff7ed" />
      <directionalLight position={[-7, -4, -3]} intensity={1.4} color="#a78bfa" />
      <pointLight position={[3.5, 0, 4]} intensity={2} distance={18} color="#38bdf8" />
      <StageInner fracture={fracture} webcamMotion={webcamMotion} videoRef={videoRef} webcamOn={webcamOn} />
    </Canvas>
  );
}
