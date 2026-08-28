"use client";

// Detects WebGL availability once and falls back to a static CSS composition so
// the narrative text always remains readable even without GPU support.

import { useEffect, useState, type ReactNode } from "react";
import { getQuality } from "@/lib/landing/quality";

export default function PerformanceGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(getQuality().tier !== "reduced" || getQuality().particles > 0);
  }, []);

  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}
