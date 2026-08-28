"use client";

// Camera rig — the camera rides inside a group that the GSAP master timeline
// dollys/orbits. Pointer parallax and a gentle idle sway layer on top. During
// DECISION the rig snaps forward to frame the lock; during REVEAL it pulls back
// and up to become the dashboard backdrop.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story } from "@/lib/landing/story";
import type { SceneRefs } from "./refs";

export function CameraRig({ refs }: { refs: SceneRefs }) {
  const rig = useRef<THREE.Group>(null);
  const look = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useFrame((state) => {
    if (!rig.current) return;
    const t = state.clock.elapsedTime;

    // Pointer parallax — only when not reduced-motion (handled by gating).
    const px = state.pointer.x * 0.22;
    const py = state.pointer.y * 0.14;

    // Look target drifts toward the transaction during the story.
    const target = new THREE.Vector3(
      story.state === "context" || story.state === "behaviour" || story.state === "policy" ? 0.7 : 0,
      story.state === "escalation" ? 0.4 : 0,
      0,
    );
    look.current.lerp(target, 0.03);
    rig.current.lookAt(look.current);

    // Subtle idle sway so the scene never feels frozen.
    rig.current.position.x += (px - rig.current.position.x + Math.sin(t * 0.16) * 0.05) * 0.02;
    rig.current.position.y += (py - rig.current.position.y + Math.cos(t * 0.13) * 0.03) * 0.02;
  });

  return (
    <group
      ref={(node) => {
        if (node) refs.cameraRig = node;
      }}
    />
  );
}
