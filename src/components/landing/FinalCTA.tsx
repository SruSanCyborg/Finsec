"use client";

// Final CTA — the closing statement with the autonomy spectrum (low → medium →
// high) and two actions: enter the line (Clerk signup) or view the live demo
// (seeds the mock workspace and opens the dashboard).

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { api } from "@/lib/mock/api";
import { toast } from "sonner";

export default function FinalCTA() {
  const router = useRouter();

  async function enterDemo() {
    try {
      const demo = await api.auth.login("demo@siriusline.io", "Demo123!");
      localStorage.setItem("sirius.token", demo.token);
      toast.success("Seeding demo workspace…");
      router.push("/dashboard");
    } catch {
      toast.error("Demo workspace unavailable");
    }
  }

  return (
    <section id="command" className="relative z-30 border-t border-white/10 bg-base/80 px-6 py-32 backdrop-blur-xl lg:px-[10vw] lg:py-48">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-20%" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-7 font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
            THE NEXT SAFE ACTION
          </p>
          <h2 className="max-w-4xl text-5xl font-medium leading-[0.98] tracking-[-0.04em] text-zinc-100 sm:text-7xl">
            Let your agents move money.
            <br />
            <span className="text-accent">Without letting them move blindly.</span>
          </h2>
        </motion.div>

        {/* the line — low → medium → high */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-16"
        >
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            <div className="bg-panel p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#74c69d]">Low risk</span>
              <p className="mt-3 text-lg font-medium text-zinc-100">Autonomous</p>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Safe actions flow without intervention.</p>
            </div>
            <div className="bg-panel p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#E3B341]">Medium risk</span>
              <p className="mt-3 text-lg font-medium text-zinc-100">Constrain / verify</p>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Limits apply. Identity and intent get verified.</p>
            </div>
            <div className="bg-panel p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#E5484D]">High risk</span>
              <p className="mt-3 text-lg font-medium text-zinc-100">Block / escalate</p>
              <p className="mt-1 text-sm leading-6 text-zinc-500">The action stops. A human gets the call.</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-14 flex flex-wrap items-center gap-4"
        >
          <Link
            href="/signup"
            className="group inline-flex items-center gap-3 border border-zinc-500 px-6 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-100 transition hover:border-accent hover:text-accent"
          >
            Build your security line <ArrowUpRight size={14} />
          </Link>
          <button
            onClick={enterDemo}
            className="group inline-flex items-center gap-3 border border-accent/40 bg-accent/10 px-6 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20"
          >
            <Play size={12} /> View live demo <ArrowRight size={14} />
          </button>
        </motion.div>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          Sirius / Security for autonomous financial agents / 2026
        </p>
      </div>
    </section>
  );
}
