"use client";

// Small connection indicator — shows whether the frontend can reach the
// Sirius backend. Polls /health periodically. Not a feature, just integration
// verification.

import { useEffect, useState } from "react";
import { USING_MOCK } from "@/lib/mock/api";
import { checkHealth } from "@/lib/real/api";

export function ConnectionStatus() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (USING_MOCK) {
      setOk(true); // mock mode is always "connected"
      return;
    }
    let active = true;
    const ping = () => {
      checkHealth().then((healthy) => active && setOk(healthy));
    };
    ping();
    const iv = setInterval(ping, 15000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  if (USING_MOCK) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
        ok === null
          ? "border-zinc-700 text-zinc-500"
          : ok
            ? "border-severity-pass/30 text-severity-pass"
            : "border-severity-critical/40 text-severity-critical"
      }`}
      title={ok === null ? "Checking backend…" : ok ? "Backend connected" : "Backend unreachable"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok === null ? "bg-zinc-500" : ok ? "bg-severity-pass" : "bg-severity-critical"}`} />
      {ok === null ? "…" : ok ? "API" : "offline"}
    </span>
  );
}
