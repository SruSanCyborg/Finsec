"use client";

// Shared mutable refs handed to scene elements so the GSAP master timeline can
// tween them without causing React re-renders. The SceneDirector creates one
// and passes it down; elements read current values in useFrame.

import type * as THREE from "three";

export interface SceneRefs {
  // camera rig (group) — GSAP dolly/orbit/zoom targets
  cameraRig: THREE.Group | null;
  // whole story world — subtle idle motion + risk lean
  world: THREE.Group | null;
  // the agent core assembly (core mesh + energy shell)
  core: THREE.Group | null;
  coreMesh: THREE.Mesh | null;
  coreShell: THREE.Mesh | null;
  coreLight: THREE.PointLight | null;
  // infrastructure — vault ring + counterparty ring (rotate to reveal)
  vault: THREE.Group | null;
  counterparties: THREE.Group | null;
  // transaction path + packet (the story protagonist)
  path: THREE.Group | null;
  packet: THREE.Group | null;
  packetGlow: THREE.Mesh | null;
  pathBroken: boolean;
  // layers that appear per story beat
  riskLayer: THREE.Mesh | null;
  riskLayer2: THREE.Mesh | null;
  behaviourRing: THREE.Group | null;
  behaviourMarker: THREE.Mesh | null;
  policyShell: THREE.Group | null;
  policyShardA: THREE.Mesh | null;
  policyShardB: THREE.Mesh | null;
  policyShardC: THREE.Mesh | null;
  callRing: THREE.Group | null;
  callGlow: THREE.Mesh | null;
  // particle field
  particles: THREE.Points | null;
  particlesMat: THREE.PointsMaterial | null;
  // lock ring formed at decision
  lockRing: THREE.Group | null;
  // lights
  keyLight: THREE.PointLight | null;
  accentLight: THREE.PointLight | null;
  fillLight: THREE.PointLight | null;
}

export function createSceneRefs(): SceneRefs {
  return {
    cameraRig: null,
    world: null,
    core: null,
    coreMesh: null,
    coreShell: null,
    coreLight: null,
    vault: null,
    counterparties: null,
    path: null,
    packet: null,
    packetGlow: null,
    pathBroken: false,
    riskLayer: null,
    riskLayer2: null,
    behaviourRing: null,
    behaviourMarker: null,
    policyShell: null,
    policyShardA: null,
    policyShardB: null,
    policyShardC: null,
    callRing: null,
    callGlow: null,
    particles: null,
    particlesMat: null,
    lockRing: null,
    keyLight: null,
    accentLight: null,
    fillLight: null,
  };
}
