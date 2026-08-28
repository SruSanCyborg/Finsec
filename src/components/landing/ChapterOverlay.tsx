"use client";

// Chapter overlay — the narrative text block that sits above the 3D system.
// The page orchestrates which chapter is active; each chapter fades in/out and
// slides slightly, so text and 3D change together.

import { motion, AnimatePresence } from "framer-motion";
import type { Chapter } from "@/lib/landing/story";
import { cn } from "@/lib/utils";

export function ChapterOverlay({
  chapter,
  index,
  total,
}: {
  chapter: Chapter;
  index: number;
  total: number;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex items-center px-6 lg:px-[10vw]">
      <div className="max-w-2xl">
        <div className="mb-8 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
          <span>{chapter.marker}</span>
          <span className="h-px w-16 bg-accent/40" />
          <span className="text-zinc-500">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={chapter.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-4 text-sm text-zinc-500">{chapter.eyebrow}</p>
            <h2 className="max-w-lg text-4xl font-medium leading-[1.04] tracking-[-0.03em] text-zinc-100 sm:text-6xl">
              {chapter.title}
            </h2>
            <p className="mt-7 max-w-md text-base leading-7 text-zinc-400">{chapter.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Small progress rail pinned to the left edge showing chapter position. */
export function ChapterRail({ index, total }: { index: number; total: number }) {
  return (
    <div className="pointer-events-none fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-3 lg:flex">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-all duration-300",
            i === index ? "scale-125 bg-accent" : i < index ? "bg-zinc-500" : "bg-zinc-800",
          )}
        />
      ))}
    </div>
  );
}
