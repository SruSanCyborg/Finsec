"use client";

// HUD — the always-on data readouts that make the scene feel like financial
// infrastructure. Values tick live with the story (risk, deviation, call pulse,
// packet progress) using GSAP-driven counters.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { story } from "@/lib/landing/story";
import { riskColor } from "@/lib/landing/story";
import { cn } from "@/lib/utils";

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function HUD() {
  const riskRef = useRef<HTMLSpanElement>(null);
  const devRef = useRef<HTMLSpanElement>(null);
  const packetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const riskObj = { v: 0 };
    const devObj = { v: 0 };
    const packetObj = { v: 0 };
    const tweenRisk = gsap.to(riskObj, {
      v: 0,
      duration: 0.5,
      paused: true,
      onUpdate: () => {
        if (riskRef.current) riskRef.current.textContent = (riskObj.v * 100).toFixed(0) + "%";
      },
    });
    const tweenDev = gsap.to(devObj, {
      v: 0,
      duration: 0.8,
      paused: true,
      onUpdate: () => {
        if (devRef.current) devRef.current.textContent = devObj.v.toFixed(0) + "%";
      },
    });
    const tweenPacket = gsap.to(packetObj, {
      v: 0,
      duration: 0.4,
      paused: true,
      onUpdate: () => {
        if (packetRef.current) packetRef.current.style.width = packetObj.v * 100 + "%";
      },
    });

    const tick = () => {
      tweenRisk.vars.v = story.risk;
      tweenRisk.invalidate().play(0);
      const dev = story.state === "behaviour" || story.state === "policy" ? 94 : 0;
      tweenDev.vars.v = dev;
      tweenDev.invalidate().play(0);
      tweenPacket.vars.v = story.packetProgress;
      tweenPacket.invalidate().play(0);
    };
    const iv = setInterval(tick, 200);
    return () => {
      clearInterval(iv);
      tweenRisk.kill();
      tweenDev.kill();
      tweenPacket.kill();
    };
  }, []);

  const color = riskColor(story.risk);

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-30 hidden w-64 flex-col gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 md:flex">
      <div className="border border-line bg-base/60 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Risk index</span>
          <span ref={riskRef} className="text-accent">
            0%
          </span>
        </div>
        <div className="mt-2 h-1 bg-zinc-800">
          <div ref={packetRef} className="h-full bg-accent" style={{ width: "0%" }} />
        </div>
      </div>
      <div className="border border-line bg-base/60 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Behaviour deviation</span>
          <span ref={devRef} style={{ color }} className="font-semibold">
            0%
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 border border-line bg-base/60 p-3 backdrop-blur">
        <span className={cn("h-1.5 w-1.5 rounded-full", story.locked ? "bg-severity-critical" : "bg-severity-pass")} />
        <span>{story.locked ? "INTERCEPT ACTIVE" : "SYSTEM OBSERVING"}</span>
      </div>
    </div>
  );
}
