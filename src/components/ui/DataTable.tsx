"use client";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  thClassName?: string;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  empty,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  dense?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-raise">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500",
                  c.thClassName
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-b border-line/50 transition-colors last:border-0 hover:bg-white/[0.02]",
                onRowClick && "cursor-pointer"
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 align-middle text-sm text-zinc-300", dense ? "py-2.5" : "py-3.5", c.className)}>
                  {c.render ? c.render(row) : (row as Record<string, unknown>)[c.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
