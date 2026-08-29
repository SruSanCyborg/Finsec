"use client";

// Webcam → 3D pixel point cloud. The camera feed is sampled to a grid; each
// pixel becomes a 3D particle. Background calibration (hold still ~1s) builds a
// reference frame, and the per-frame difference filters out everything static —
// so the PERSON shows as 3D pixels and the background disappears. Centered on
// screen, in the app's cyan/white palette.

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const GRID_W = 320;
const GRID_H = 200;
const N = GRID_W * GRID_H;
const FOV_X = 2.4; // world width of the cloud — extremely tight
const FOV_Y = 1.6; // world height of the cloud

function WebcamCloud({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const bgRef = useRef<Uint8ClampedArray | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.01,
        vertexColors: true,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    [],
  );

  useFrame((state) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const video = videoRef.current;
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;

    if (!video || video.readyState < 2) {
      pts.visible = false;
      return;
    }
    if (!sampleRef.current) {
      const c = document.createElement("canvas");
      c.width = GRID_W;
      c.height = GRID_H;
      sampleRef.current = c;
    }
    const sctx = sampleRef.current.getContext("2d", { willReadFrequently: true });
    if (!sctx) {
      pts.visible = false;
      return;
    }

    try {
      sctx.drawImage(video, 0, 0, GRID_W, GRID_H);
      const data = sctx.getImageData(0, 0, GRID_W, GRID_H).data;

      // calibrate the background once (first usable frame)
      if (!bgRef.current) {
        bgRef.current = data.slice();
      }
      const bg = bgRef.current;

      const t = state.clock.getElapsedTime();
      let visibleCount = 0;
      let anyVisible = false;

      for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
          const idx = (gy * GRID_W + gx) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const diff = Math.abs(r - bg[idx]) + Math.abs(g - bg[idx + 1]) + Math.abs(b - bg[idx + 2]);
          const lum = (r + g + b) / 765;

          const isSubject = diff > 46; // person (moved/changed from bg), background filtered out
          const pi = gy * GRID_W + gx;

          if (!isSubject) {
            // hide background pixels: push them far away + dim
            pos[pi * 3] = (0.5 - gx / GRID_W) * FOV_X;
            pos[pi * 3 + 1] = (0.5 - gy / GRID_H) * FOV_Y;
            pos[pi * 3 + 2] = -8;
            col[pi * 3] = 0;
            col[pi * 3 + 1] = 0;
            col[pi * 3 + 2] = 0;
            continue;
          }

          anyVisible = true;
          visibleCount++;
          // depth from diff strength — the subject sits right in front of the
          // viewer in a tight z-range
          const depthFactor = Math.min(1, (diff - 40) / 160);
          const z = 0.5 + depthFactor * 1.2 + Math.sin(t * 1.6 + pi) * 0.03;
          pos[pi * 3] = (0.5 - gx / GRID_W) * FOV_X;
          pos[pi * 3 + 1] = (0.5 - gy / GRID_H) * FOV_Y;
          pos[pi * 3 + 2] = z;

          // greenish-blue (teal) → white by depth/brightness — easier on the
          // eyes, doesn't clash with the UI text
          const bright = 0.35 + lum * 0.65;
          const edge = Math.min(1, depthFactor * 0.7 + lum * 0.3);
          col[pi * 3] = (0.18 + edge * 0.72) * bright;
          col[pi * 3 + 1] = (0.83 + edge * 0.12) * bright;
          col[pi * 3 + 2] = (0.78 + edge * 0.18) * bright;
        }
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      pts.visible = anyVisible;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void visibleCount;
    } catch {
      pts.visible = false;
    }
  });

  return <points ref={pointsRef} geometry={geometry} material={mat} />;
}

export default function WebcamPixels({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 55 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <WebcamCloud videoRef={videoRef} />
    </Canvas>
  );
}
