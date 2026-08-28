"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Ban, Crosshair, GitBranch, MousePointerClick } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle, Spinner } from "@/components/ui/primitives";
import { SeverityBadge } from "@/components/ui/Badge";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { SEVERITY_ORDER } from "@/lib/constants";
import { cn, formatMoney } from "@/lib/utils";
import type { AttackLink, AttackNode, AttackPath } from "@/types";

const AttackPathScene = dynamic(() => import("@/components/three/AttackPathScene"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-600">Loading 3D graph…</div>,
});

const LAYER_LABELS = ["Internet", "Edge", "Application", "Data"];

export default function AttackPathsPage() {
  const [graph, setGraph] = useState<{ nodes: AttackNode[]; links: AttackLink[]; paths: AttackPath[] } | null>(null);
  const [selected, setSelected] = useState<AttackNode | null>(null);

  useEffect(() => {
    api.attackPaths.graph().then(setGraph);
  }, []);

  const linksOf = useMemo(() => {
    if (!graph) return new Map<string, AttackLink[]>();
    const m = new Map<string, AttackLink[]>();
    graph.links.forEach((l) => {
      m.set(l.from, [...(m.get(l.from) ?? []), l]);
    });
    return m;
  }, [graph]);

  if (!graph) return <Spinner className="min-h-[60vh]" />;

  return (
    <div>
      <PageHeader title="Attack paths" subtitle="Chained exploitation routes from the internet to your money — drag to rotate, click a node to inspect" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="relative h-[560px] overflow-hidden xl:col-span-2">
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1">
            {LAYER_LABELS.map((l, i) => (
              <span key={l} className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ["#e879f9", "#94a3b8", "#fbbf24", "#f43f5e"][i] }} /> {l}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-2 text-[11px] text-zinc-500">
            <MousePointerClick size={12} /> Click a node · orbit to rotate
          </div>
          <ErrorBoundary>
            <AttackPathScene nodes={graph.nodes} links={graph.links} selectedId={selected?.id} onSelect={setSelected} />
          </ErrorBoundary>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>
              {selected ? (
                <span className="flex items-center gap-2">
                  <Crosshair size={14} className="text-accent" /> {selected.label}
                </span>
              ) : (
                "Node inspector"
              )}
            </CardTitle>
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500">Severity</span>
                  <SeverityBadge severity={selected.severity ?? "info"} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">Inbound techniques</p>
                  <div className="space-y-1">
                    {graph.links
                      .filter((l) => l.to === selected.id)
                      .map((l, i) => (
                        <p key={i} className={cn("rounded-lg border px-2.5 py-1.5 font-mono text-[11px]", l.active ? "border-severity-critical/25 bg-severity-critical/10 text-severity-critical" : "border-line text-zinc-500")}>
                          {l.technique}
                        </p>
                      ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">Outbound routes</p>
                  <div className="space-y-1">
                    {(linksOf.get(selected.id) ?? []).map((l, i) => (
                      <p key={i} className={cn("rounded-lg border px-2.5 py-1.5 font-mono text-[11px]", l.active ? "border-severity-high/25 bg-severity-high/10 text-severity-high" : "border-line text-zinc-500")}>
                        → {graph.nodes.find((n) => n.id === l.to)?.label} · {l.technique}
                      </p>
                    ))}
                    {(linksOf.get(selected.id) ?? []).length === 0 && <p className="text-xs text-zinc-600">Terminal node.</p>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">Select a node in the graph to see inbound techniques, blast radius and reachable assets.</p>
            )}
          </Card>

          <Card>
            <CardTitle>
              <span className="flex items-center gap-2">
                <GitBranch size={14} className="text-accent" /> Ranked paths
              </span>
            </CardTitle>
            <div className="space-y-2.5">
              {graph.paths
                .slice()
                .sort((a, b) => b.probability * b.impactUsd - a.probability * a.impactUsd)
                .map((p) => (
                  <div key={p.id} className={`rounded-xl border p-3 ${p.blocked ? "border-line opacity-50" : "border-line bg-raise"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-200">{p.name}</p>
                      {p.blocked && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-severity-pass">
                          <Ban size={10} /> Blocked
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                      <span>
                        P(<span className="text-zinc-300">{Math.round(p.probability * 100)}%</span>)
                      </span>
                      <span>
                        impact <span className="font-mono text-severity-critical">{formatMoney(p.impactUsd)}</span>
                      </span>
                      <span className="ml-auto flex gap-1">
                        {p.techniques.map((t) => (
                          <span key={t} className="rounded bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                            {t}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400" style={{ width: `${p.probability * 100}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Legend</CardTitle>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SEVERITY_ORDER.slice(0, 4).map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-xs capitalize text-zinc-400">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: ({ critical: "#f43f5e", high: "#fb923c", medium: "#fbbf24", low: "#38bdf8" } as Record<string, string>)[s] }}
                  />
                  {s}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400" /> attacker
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
