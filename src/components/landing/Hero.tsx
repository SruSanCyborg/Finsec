"use client";

// Hero — the opening statement over the 3D system. The system is observing;
// the visitor is told to scroll to send a transaction through it.

import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section
      id="system"
      className="relative z-10 flex min-h-screen flex-col justify-end px-6 pb-24 pt-40 lg:px-[10vw]"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="mb-7 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
          SIRIUS LINE / LIVE SECURITY SYSTEM
        </p>
        <h1 className="max-w-xl text-5xl font-medium leading-[0.96] tracking-[-0.04em] text-zinc-100 sm:text-7xl lg:text-[7.5rem]">
          Let agents move money.
          <br />
          <span className="text-accent">Not blindly.</span>
        </h1>
        <p className="mt-8 max-w-sm text-base leading-7 text-zinc-400">
          A security layer for autonomous financial decisions. Scroll to send one
          through the system.
        </p>
        <div className="mt-12 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#74c69d]" /> System observing
          <span className="ml-3 text-zinc-700">Scroll to inspect</span>
        </div>
      </motion.div>
    </section>
  );
}
