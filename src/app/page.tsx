"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  GitBranch,
  Lock,
  ScanLine,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { sceneState } from "@/lib/scene-store";
import { cn } from "@/lib/utils";

const SiriusStarScene = dynamic(() => import("@/components/three/SiriusStarScene"), {
  ssr: false,
  loading: () => null,
});

gsap.registerPlugin(ScrollTrigger);

/* ── Real engine constants (from the CLI catalog) ─────────────────── */

const LOOP = [
  { n: "01", label: "SCAN", desc: "AST-aware scan across Python, JS, TS and Go. Diff-aware against your baseline.", icon: ScanLine },
  { n: "02", label: "FIND", desc: "13 rules across secrets, injection, auth, PII, crypto, rate limits and supply chain.", icon: Zap },
  { n: "03", label: "MAP", desc: "Every finding maps to PCI-DSS v4.0, RBI DPSC and DPDP clauses — with CWE refs.", icon: GitBranch },
  { n: "04", label: "PRICE", desc: "Money-at-risk in ₹, derived from finding class, asset criticality and exposure.", icon: Lock },
  { n: "05", label: "GATE", desc: "Policy-as-code: fail on severity, new findings, or verified-live secrets.", icon: ShieldCheck },
  { n: "06", label: "FIX", desc: "Cerebus dual-LLM autofix — quarantined suggester, deterministic diff, verifier.", icon: BadgeCheck },
  { n: "07", label: "SIGN", desc: "Detached JWS report, tamper-evident and CI-verifiable. SARIF included.", icon: FileCheck2 },
];

const RULES = [
  { id: "SIR-SEC-001", cat: "secrets", sev: "critical", catch: "Hardcoded sk_live / rk_live / AWS keys", pci: "8.6.2", fix: "env_lookup" },
  { id: "SIR-SEC-010", cat: "injection", sev: "critical", catch: "SQL via string concat or f-string", pci: "6.2.4", fix: "parameterize_query" },
  { id: "SIR-SEC-021", cat: "auth", sev: "critical", catch: "JWT verify=False / alg=none", pci: "8.4.2", fix: "enforce_jwt_verify" },
  { id: "SIR-SEC-031", cat: "pii", sev: "critical", catch: "Full PAN stored unmasked", pci: "3.5.1", fix: "tokenize_pan" },
  { id: "SIR-SEC-030", cat: "pii/log", sev: "high", catch: "PAN / Aadhaar written to logs", pci: "3.4.1", fix: "redact_pii_log" },
  { id: "SIR-SEC-060", cat: "supplychain", sev: "high", catch: "Dependency with install script / obfuscation", pci: "6.3.2", fix: "pin_or_remove_dep" },
];

const SEV_CLS: Record<string, string> = {
  critical: "text-severity-critical border-severity-critical/30 bg-severity-critical/10",
  high: "text-severity-high border-severity-high/30 bg-severity-high/10",
  medium: "text-severity-medium border-severity-medium/30 bg-severity-medium/10",
};

const NARRATIVE = [
  {
    id: "problem",
    chip: "THE PROBLEM",
    title: "Your SAST doesn't speak fintech.",
    body: "Generic linters flag line 14 and stop. They don't know PCI-DSS v4.0 renumbered injection to 6.2.4. They don't know RBI's tokenization mandate. They have never heard of DPDP §8 — or the ₹250 crore penalty attached to it.",
    rows: [
      ["PCI-DSS v4.0", "clause-mapped"],
      ["RBI DPSC", "mapped"],
      ["DPDP §8", "₹250Cr exposure"],
      ["Money-at-risk", "₹ per finding"],
    ] as [string, string][],
    align: "right" as const,
  },
  {
    id: "find",
    chip: "01 · FIND",
    title: "A finding that means something.",
    body: "Not 'possible secret detected'. A verified-live Stripe key, at line 14 of src/config.py, worth ₹42,00,000 at risk, violating PCI-DSS 8.6.2 — with the fix one command away.",
    terminal: [
      "$ sirius scan .",
      "  src/config.py:14  SIR-SEC-001  critical",
      "  hardcoded Stripe secret key — VERIFIED LIVE",
      "  compliance: PCI-DSS 8.6.2 · RBI DPSC · DPDP §8",
      "  money at risk: ₹42,00,000",
      "  ↳ fix: sirius fix SIR-SEC-001",
    ],
    align: "left" as const,
  },
  {
    id: "price",
    chip: "04 · PRICE",
    title: "Risk your CFO can read.",
    body: "Every finding carries a rupee figure derived from the finding class, asset criticality and data exposure. 'Critical' is a word. ₹42 lakh is a decision.",
    stats: [
      { k: "Provider key (live)", v: "₹42,00,000" },
      { k: "Unmasked PAN store", v: "₹18,50,000" },
      { k: "SQL injection, payments API", v: "₹65,00,000" },
    ],
    align: "right" as const,
  },
  {
    id: "cerebus",
    chip: "06 · FIX",
    title: "The fix never skips the verifier.",
    body: "Cerebus uses a quarantined model that sees one snippet and one rule — no repo, no tools, no prompt-injection surface. A deterministic builder renders the diff. Then the original rule re-runs against the patch. Pass, or escalate to a human.",
    flow: ["QUARANTINE", "DETERMINISTIC DIFF", "VERIFIER", "PASS ✓"],
    align: "left" as const,
  },
  {
    id: "sign",
    chip: "07 · SIGN",
    title: "Reports that prove themselves.",
    body: "Every report is signed with detached JWS over canonical JSON. CI verifies the signature before trusting the score. If a byte changes, verification fails.",
    terminal: [
      "$ sirius scan . --report pdf",
      "  compliance score: 72.5",
      "  report: sirius-report.pdf (signed)",
      "$ sirius verify sirius-report.pdf",
      "  ✓ signature valid · issuer: sirius 0.4.0",
    ],
    align: "right" as const,
  },
];

const GATES = [
  { label: "fail_on_severity", value: "high", desc: "Exit 1 on any high or critical" },
  { label: "max_new_findings", value: "0", desc: "Zero tolerance for regressions" },
  { label: "require_no_verified_secrets", value: "true", desc: "Live keys always fail the build" },
  { label: "min_compliance_score", value: "80", desc: "Floor for the merge gate" },
];

/* ── Page ──────────────────────────────────────────────────────────── */

function Navbar() {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const st = ScrollTrigger.create({
      start: 80,
      onEnter: () => el.classList.add("nav-scrolled"),
      onLeaveBack: () => el.classList.remove("nav-scrolled"),
    });
    return () => st.kill();
  }, []);
  return (
    <nav ref={navRef} className="fixed inset-x-0 top-0 z-50 transition-all duration-500">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raise font-mono text-sm text-accent">
            ✦
          </span>
          <span className="font-mono text-[15px] font-semibold tracking-tight text-zinc-100">sirius</span>
        </Link>
        <div className="hidden items-center gap-7 font-mono text-[13px] text-zinc-500 md:flex">
          <a href="#loop" className="transition hover:text-zinc-100">engine</a>
          <a href="#rules" className="transition hover:text-zinc-100">rules</a>
          <a href="#cerebus" className="transition hover:text-zinc-100">cerebus</a>
          <a href="#gate" className="transition hover:text-zinc-100">ci</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="font-mono text-[13px] text-zinc-400 transition hover:text-zinc-100">
            sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-4 py-2 font-mono text-[13px] font-medium text-white transition hover:bg-accent-soft"
          >
            get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

function TerminalBlock({ lines }: { lines: string[] }) {
  return (
    <div className="narr-anim mt-5 overflow-hidden rounded-xl border border-line bg-[#0a0b0d]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-severity-critical/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-severity-medium/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-severity-pass/60" />
        <span className="ml-2 font-mono text-[10px] text-zinc-600">sirius 0.4.0</span>
      </div>
      <div className="space-y-1.5 p-4 font-mono text-[12px] leading-relaxed">
        {lines.map((l, i) => (
          <p key={i} className={cn(l.startsWith("$") ? "text-accent" : l.includes("critical") || l.includes("VERIFIED") ? "text-severity-critical" : l.includes("✓") || l.includes("fix:") ? "text-severity-pass" : "text-zinc-400")}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeState, setActiveState] = useState(0);

  useEffect(() => {
    sceneState.isMobile = window.innerWidth < 768;
    sceneState.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onMove = (e: PointerEvent) => {
      sceneState.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      sceneState.mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-state]").forEach((sec) => {
        const i = Number(sec.dataset.state);
        ScrollTrigger.create({
          trigger: sec,
          start: "top 55%",
          end: "bottom 45%",
          onToggle: (self) => {
            if (self.isActive) {
              sceneState.stateIndex = i;
              setActiveState(i);
            }
          },
        });
      });

      if (!sceneState.reducedMotion) {
        gsap.utils.toArray<HTMLElement>(".narr-card").forEach((card) => {
          gsap.fromTo(
            card.querySelectorAll(".narr-anim"),
            { opacity: 0, y: 24 },
            {
              opacity: 1,
              y: 0,
              duration: 0.7,
              stagger: 0.08,
              ease: "power3.out",
              scrollTrigger: { trigger: card, start: "top 75%", toggleActions: "play none none reverse" },
            }
          );
        });

        gsap.to(".hero-content", {
          y: -60,
          opacity: 0.15,
          ease: "none",
          scrollTrigger: { trigger: "#top", start: "top top", end: "bottom top", scrub: true },
        });
      }

      gsap.to("#canvas-wrap", {
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: "#post-narrative", start: "top 90%", end: "top 30%", scrub: true },
      });
    }, rootRef);

    return () => {
      window.removeEventListener("pointermove", onMove);
      ctx.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <div id="canvas-wrap" className="fixed inset-0 z-0">
        <ErrorBoundary>
          <SiriusStarScene className="h-full w-full" />
        </ErrorBoundary>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(125% 90% at 50% 40%, transparent 45%, rgba(7,8,10,0.7) 100%)" }}
        />
      </div>

      <Navbar />

      <main className="relative z-10">
        {/* HERO */}
        <section id="top" data-state={0} className="relative flex min-h-[105vh] items-center justify-center px-5 pt-16">
          <div className="hero-content mx-auto max-w-4xl text-center">
            <p className="narr-anim mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-raise/70 px-4 py-2 font-mono text-[11px] tracking-widest text-zinc-400 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-40" />
                <span className="h-2 w-2 rounded-full bg-accent" />
              </span>
              SIRIUS 0.4.0
            </p>
            <h1 className="narr-anim text-[clamp(2.8rem,7.5vw,6rem)] font-semibold leading-[1.03] tracking-tight text-zinc-100">
              Compliance linting for
              <br />
              <span className="font-display italic text-accent-soft">money-handling</span> code.
            </h1>
            <p className="narr-anim mx-auto mt-7 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              sirius scans your code, maps every finding to PCI-DSS, RBI and DPDP,
              prices the risk in rupees — and signs the report CI can trust.
            </p>
            <div className="narr-anim mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-accent px-7 py-3.5 font-mono text-sm font-medium text-white transition hover:bg-accent-soft"
              >
                scan your first repo
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#loop"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-raise/60 px-7 py-3.5 font-mono text-sm text-zinc-300 backdrop-blur-sm transition hover:border-line-strong hover:bg-raise"
              >
                <ScanLine size={15} /> see the engine
              </a>
            </div>
          </div>
          <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
            <span className="font-mono text-[9px] tracking-[0.35em] text-zinc-600">SCROLL</span>
            <span className="h-10 w-px bg-gradient-to-b from-accent/60 to-transparent" />
          </div>
        </section>

        {/* NARRATIVE */}
        {NARRATIVE.map((n, i) => (
          <section key={n.id} id={n.id} data-state={i + 1} className="relative flex min-h-screen items-center px-6 py-24">
            <div className={cn("mx-auto flex w-full max-w-6xl", n.align === "left" ? "justify-start" : "justify-end")}>
              <div className="narr-card w-full max-w-md rounded-2xl border border-line bg-[#0a0b0d]/80 p-7 shadow-2xl backdrop-blur-md">
                <p className="narr-anim font-mono text-[10px] tracking-[0.25em] text-accent">{n.chip}</p>
                <h2 className="narr-anim mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">{n.title}</h2>
                <p className="narr-anim mt-4 text-sm leading-relaxed text-zinc-400">{n.body}</p>

                {n.rows && (
                  <div className="narr-anim mt-5 divide-y divide-line/60 rounded-xl border border-line bg-black/40">
                    {n.rows.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-4 py-2.5">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{k}</span>
                        <span className="font-mono text-[13px] text-zinc-100">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {n.terminal && <TerminalBlock lines={n.terminal} />}

                {n.stats && (
                  <div className="narr-anim mt-5 space-y-2">
                    {n.stats.map((s) => (
                      <div key={s.k} className="flex items-center justify-between rounded-xl border border-line bg-black/40 px-4 py-3">
                        <span className="text-[13px] text-zinc-400">{s.k}</span>
                        <span className="font-mono text-sm font-semibold text-severity-critical">{s.v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {n.flow && (
                  <div className="narr-anim mt-5 flex flex-wrap items-center gap-2">
                    {n.flow.map((f, fi) => (
                      <span key={f} className="flex items-center gap-2">
                        <span className={cn(
                          "rounded-lg border px-3 py-1.5 font-mono text-[11px]",
                          f.includes("PASS") ? "border-severity-pass/30 bg-severity-pass/10 text-severity-pass" : "border-line bg-raise text-zinc-300"
                        )}>
                          {f}
                        </span>
                        {fi < n.flow!.length - 1 && <span className="text-zinc-600">→</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}

        {/* POST-NARRATIVE */}
        <div id="post-narrative" className="relative bg-base/95 backdrop-blur-sm">
          {/* THE LOOP */}
          <section id="loop" className="mx-auto max-w-6xl px-5 py-28">
            <div className="narr-card mb-14 text-center">
              <p className="narr-anim font-mono text-[11px] tracking-[0.25em] text-accent">THE ENGINE</p>
              <h2 className="narr-anim mt-4 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                One loop, <span className="text-accent-soft">source of truth.</span>
              </h2>
              <p className="narr-anim mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-500">
                CLI, web, GUI and CI are all clients of one Core API. The engine is the only writer.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LOOP.map((s) => (
                <div key={s.n} className="narr-card rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-600">{s.n}</span>
                    <s.icon size={16} className="text-accent" />
                  </div>
                  <h3 className="mt-3 font-mono text-sm font-semibold tracking-wider text-zinc-100">{s.label}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{s.desc}</p>
                </div>
              ))}
              <div className="narr-card flex flex-col justify-center rounded-xl border border-accent/25 bg-accent/[0.04] p-5">
                <p className="font-mono text-sm text-accent">✦ sirius scan .</p>
                <p className="mt-1.5 text-[13px] text-zinc-500">First finding in under 10 seconds.</p>
              </div>
            </div>
          </section>

          {/* RULES */}
          <section id="rules" className="border-y border-line bg-panel py-28">
            <div className="mx-auto max-w-6xl px-5">
              <div className="narr-card mb-14 text-center">
                <p className="narr-anim font-mono text-[11px] tracking-[0.25em] text-accent">RULE CATALOG</p>
                <h2 className="narr-anim mt-4 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                  Rules that read fintech.
                </h2>
              </div>
              <div className="narr-card overflow-hidden rounded-xl border border-line">
                <div className="hidden grid-cols-[130px_110px_90px_1fr_80px_150px] gap-4 border-b border-line bg-raise px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500 md:grid">
                  <span>rule</span><span>category</span><span>severity</span><span>catches</span><span>pci-dss</span><span>fix action</span>
                </div>
                {RULES.map((r) => (
                  <div key={r.id} className="grid grid-cols-1 gap-2 border-b border-line/50 px-5 py-3.5 last:border-0 transition-colors hover:bg-white/[0.02] md:grid-cols-[130px_110px_90px_1fr_80px_150px] md:gap-4">
                    <span className="font-mono text-[13px] text-accent">{r.id}</span>
                    <span className="font-mono text-[12px] text-zinc-500">{r.cat}</span>
                    <span className={cn("w-fit rounded border px-2 py-0.5 font-mono text-[10px] uppercase", SEV_CLS[r.sev])}>{r.sev}</span>
                    <span className="text-[13px] text-zinc-300">{r.catch}</span>
                    <span className="font-mono text-[12px] text-zinc-500">{r.pci}</span>
                    <span className="font-mono text-[12px] text-severity-pass">{r.fix}</span>
                  </div>
                ))}
              </div>
              <p className="narr-anim mt-4 text-center font-mono text-[11px] text-zinc-600">
                13 rules · 7 categories · p/fintech-core, p/secrets rulesets
              </p>
            </div>
          </section>

          {/* CI GATE */}
          <section id="gate" className="mx-auto max-w-6xl px-5 py-28">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="narr-card">
                <p className="narr-anim font-mono text-[11px] tracking-[0.25em] text-accent">POLICY-AS-CODE</p>
                <h2 className="narr-anim mt-4 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                  The gate is a <span className="text-accent-soft">config file.</span>
                </h2>
                <p className="narr-anim mt-4 text-sm leading-relaxed text-zinc-400">
                  sirius computes its own exit code from your policy. Wire it into the GitHub Action,
                  get SARIF in the Security tab, block the merge — not the deploy.
                </p>
              </div>
              <div className="narr-card overflow-hidden rounded-xl border border-line bg-[#0a0b0d]">
                <div className="border-b border-line px-5 py-3 font-mono text-[10px] text-zinc-600">sirius.yaml</div>
                <div className="space-y-2.5 p-5 font-mono text-[12px] leading-relaxed">
                  {GATES.map((g) => (
                    <div key={g.label} className="flex items-baseline justify-between gap-4">
                      <span className="text-zinc-400">{g.label}:</span>
                      <span className="text-accent-soft">{g.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-line/50 pt-3 text-[11px] text-zinc-600">
                    exit 1 on violation · sarif → security tab · badge on readme
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FINAL CTA */}
          <section className="relative py-32 text-center">
            <div className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(60% 50% at_50%_50%,black,transparent)]" />
            <div className="relative mx-auto max-w-3xl px-5">
              <h2 className="narr-anim text-4xl font-semibold leading-tight tracking-tight text-zinc-100 sm:text-5xl">
                Money-handling code
                <br />
                <span className="font-display italic text-accent-soft">deserves a brighter star.</span>
              </h2>
              <div className="narr-anim mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/signup"
                  className="group inline-flex items-center gap-2.5 rounded-xl bg-accent px-8 py-4 font-mono text-sm font-medium text-white transition hover:bg-accent-soft"
                >
                  scan your first repo
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-raise/60 px-8 py-4 font-mono text-sm text-zinc-300 transition hover:border-line-strong hover:bg-raise"
                >
                  open the console
                </Link>
              </div>
            </div>
          </section>

          <footer className="border-t border-line py-10">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5">
              <div className="flex items-center gap-2.5 font-mono text-[13px] text-zinc-400">
                <span className="text-accent">✦</span> sirius
              </div>
              <div className="flex gap-6 font-mono text-[11px] text-zinc-500">
                <a href="#loop" className="hover:text-zinc-200">engine</a>
                <a href="#rules" className="hover:text-zinc-200">rules</a>
                <a href="#cerebus" className="hover:text-zinc-200">cerebus</a>
                <a href="#gate" className="hover:text-zinc-200">ci</a>
              </div>
              <p className="font-mono text-[11px] text-zinc-600">© 2026 sirius · by Srusan</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
