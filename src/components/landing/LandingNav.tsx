"use client";

// Landing navbar — transparent over the hero, blurs on scroll, and swaps the
// CTA for a user button when the visitor is signed in (Clerk when configured,
// backend session otherwise).

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { USE_CLERK, useSession } from "@/lib/providers";

function SessionAwareCta() {
  const { isSignedIn } = useSession();
  if (USE_CLERK) {
    return (
      <>
        <SignedIn>
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8 rounded-lg border border-line",
              },
            }}
          />
        </SignedIn>
        <SignedOut>
          <Link
            href="/signup"
            className="group flex items-center gap-2 border border-zinc-500/60 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-100 transition hover:border-accent hover:text-accent"
          >
            Enter the line <ArrowUpRight size={13} />
          </Link>
        </SignedOut>
      </>
    );
  }
  return isSignedIn ? (
    <Link
      href="/dashboard"
      className="group flex items-center gap-2 border border-zinc-500/60 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-100 transition hover:border-accent hover:text-accent"
    >
      Console <ArrowUpRight size={13} />
    </Link>
  ) : (
    <Link
      href="/signup"
      className="group flex items-center gap-2 border border-zinc-500/60 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-100 transition hover:border-accent hover:text-accent"
    >
      Enter the line <ArrowUpRight size={13} />
    </Link>
  );
}

export default function LandingNav() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY > 40;
      navRef.current?.classList.toggle("nav-scrolled", scrolled);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      ref={navRef}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed inset-x-0 top-0 z-50 transition-all duration-500"
    >
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-tight text-zinc-100">
          <span className="flex h-8 w-8 items-center justify-center border border-accent/50 bg-accent/10">
            <ShieldCheck size={15} className="text-accent" />
          </span>
          <span>
            Sirius <span className="text-accent">Line</span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 md:flex">
          <a href="#system" className="transition hover:text-zinc-100">System</a>
          <a href="#loop" className="transition hover:text-zinc-100">Security loop</a>
          <a href="#command" className="transition hover:text-zinc-100">Command center</a>
        </div>

        <div className="flex items-center gap-3">
          <SessionAwareCta />
        </div>
      </div>
    </motion.nav>
  );
}
