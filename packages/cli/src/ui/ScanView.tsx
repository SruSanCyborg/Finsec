/**
 * The live scan view: consumes the frame stream and renders it.
 *
 * Frames are buffered in a ref and committed to React state on a fixed tick
 * rather than one setState per frame. A 128-file scan produces ~160 frames in a
 * few seconds, and reconciling the whole tree that often is the well-known Ink
 * performance cliff. Findings are appended inside <Static>, so Ink writes each
 * card exactly once and only the progress row is redrawn.
 */

import { Box, Static, Text, useApp } from 'ink';
import React, { useEffect, useRef, useState } from 'react';

import { FindingCard } from './FindingCard.js';
import { ScanProgress } from './ScanProgress.js';
import { Summary } from './Summary.js';
import { Banner } from './Banner.js';
import { COLOR } from './theme.js';
import type { Capabilities, Glyphs } from './theme.js';
import type { Finding, Severity, WsFrame } from '../domain.js';
import type { GateResult } from '../gate.js';

const FLUSH_INTERVAL_MS = 80;

export interface ScanOutcome {
  findings: Finding[];
  counts: Partial<Record<Severity, number>>;
  complianceScore: number | null;
  moneyAtRisk: number | null;
  /** The server's own verdict, kept for the cross-check in decisions.md D-002. */
  serverExitCode: number | null;
  errors: Array<{ code: string; path?: string; detail?: string }>;
}

export interface ScanViewProps {
  frames: AsyncIterable<WsFrame>;
  version: string;
  project: string | undefined;
  ruleset: string | undefined;
  glyphs: Glyphs;
  capabilities: Capabilities;
  /** Cards rendered before the rest are folded into a count. */
  maxFindings?: number | undefined;
  computeGate: (outcome: ScanOutcome) => GateResult;
  onDone: (outcome: ScanOutcome, error?: Error) => void;
}

export function ScanView({
  frames,
  version,
  project,
  ruleset,
  glyphs,
  capabilities,
  maxFindings,
  computeGate,
  onDone,
}: ScanViewProps) {
  const { exit } = useApp();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [progress, setProgress] = useState({ scanned: 0, total: 0 });
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  // Everything the stream produces lands here first; the interval below drains it.
  const buffer = useRef<Finding[]>([]);
  const latest = useRef({ scanned: 0, total: 0 });
  const collected = useRef<Finding[]>([]);
  const errors = useRef<ScanOutcome['errors']>([]);

  useEffect(() => {
    let cancelled = false;

    const flush = setInterval(() => {
      if (buffer.current.length > 0) {
        const batch = buffer.current;
        buffer.current = [];
        setFindings((prev) => [...prev, ...batch]);
      }
      setProgress((prev) =>
        prev.scanned === latest.current.scanned && prev.total === latest.current.total
          ? prev
          : { ...latest.current },
      );
    }, FLUSH_INTERVAL_MS);

    (async () => {
      try {
        for await (const frame of frames) {
          if (cancelled) return;

          switch (frame.type) {
            case 'scan.started':
              latest.current = { scanned: 0, total: frame.total_files ?? 0 };
              break;

            case 'file.scanning':
              latest.current = { scanned: frame.index ?? 0, total: frame.total ?? latest.current.total };
              break;

            case 'progress':
              latest.current = { scanned: frame.scanned ?? 0, total: frame.total ?? latest.current.total };
              break;

            case 'finding':
              collected.current.push(frame.finding);
              buffer.current.push(frame.finding);
              break;

            case 'error':
              // Per-file parse failures are non-fatal; collect and report at the end.
              errors.current.push({ code: frame.code, path: frame.path, detail: frame.detail });
              break;

            case 'scan.completed': {
              const result: ScanOutcome = {
                findings: [...collected.current],
                counts: (frame.counts ?? {}) as Partial<Record<Severity, number>>,
                complianceScore: frame.compliance_score ?? null,
                moneyAtRisk: frame.money_at_risk_inr ?? null,
                serverExitCode: frame.exit_code ?? null,
                errors: [...errors.current],
              };
              latest.current = { scanned: latest.current.total, total: latest.current.total };
              // Drain anything still buffered so the last cards are not lost.
              if (buffer.current.length > 0) {
                const batch = buffer.current;
                buffer.current = [];
                setFindings((prev) => [...prev, ...batch]);
              }
              setProgress({ ...latest.current });
              setOutcome(result);
              break;
            }
          }
        }

        if (cancelled) return;

        // A stream that ends without scan.completed still has to produce a
        // verdict rather than hanging.
        setOutcome((prev) => {
          if (prev) return prev;
          return {
            findings: [...collected.current],
            counts: countBySeverity(collected.current),
            complianceScore: null,
            moneyAtRisk: null,
            serverExitCode: null,
            errors: [...errors.current],
          };
        });
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(flush);
    };
  }, [frames]);

  // Report the result one tick after render, so the final frame is painted first.
  useEffect(() => {
    if (!outcome && !failure) return;
    const timer = setTimeout(() => {
      onDone(
        outcome ?? {
          findings: [],
          counts: {},
          complianceScore: null,
          moneyAtRisk: null,
          serverExitCode: null,
          errors: [],
        },
        failure ?? undefined,
      );
      exit();
    }, 0);
    return () => clearTimeout(timer);
  }, [outcome, failure, onDone, exit]);

  const visible = maxFindings ? findings.slice(0, maxFindings) : findings;
  const hidden = findings.length - visible.length;
  const muted = capabilities.color ? COLOR.muted : undefined;

  // The banner belongs inside <Static> alongside the findings. Ink writes the
  // static region above the live one, so a banner rendered outside it would be
  // redrawn *below* every finding it is supposed to introduce.
  type Row = { key: string; kind: 'banner' } | { key: string; kind: 'finding'; finding: Finding };
  const rows: Row[] = [
    { key: '__banner__', kind: 'banner' },
    ...visible.map((finding, index) => ({ key: finding.id ?? `f${index}`, kind: 'finding' as const, finding })),
  ];

  return (
    <Box flexDirection="column">
      <Static items={rows}>
        {(row, index) =>
          row.kind === 'banner' ? (
            <Banner
              key={row.key}
              version={version}
              project={project}
              ruleset={ruleset}
              ruleCount={undefined}
              glyphs={glyphs}
              capabilities={capabilities}
            />
          ) : (
            <FindingCard
              key={row.key}
              finding={row.finding}
              glyphs={glyphs}
              capabilities={capabilities}
              // Show the runnable command once, on the first card, so the user
              // learns it without every finding repeating itself.
              showRunHint={index === 1}
            />
          )
        }
      </Static>

      {hidden > 0 ? (
        <Text color={muted}>{`  … ${hidden} more finding${hidden === 1 ? '' : 's'} (see --json for all)`}</Text>
      ) : null}

      {!outcome && !failure ? (
        <ScanProgress
          scanned={progress.scanned}
          total={progress.total}
          glyphs={glyphs}
          capabilities={capabilities}
        />
      ) : null}

      {failure ? (
        <Box marginTop={1}>
          <Text color={capabilities.color ? '#ff5c5c' : undefined}>{`  scan stream failed: ${failure.message}`}</Text>
        </Box>
      ) : null}

      {outcome ? (
        <>
          {outcome.errors.length > 0 ? (
            <Text color={muted}>
              {`  ${outcome.errors.length} file${outcome.errors.length === 1 ? '' : 's'} skipped (unsupported or unparseable)`}
            </Text>
          ) : null}
          <Summary
            findings={outcome.findings}
            counts={Object.keys(outcome.counts).length > 0 ? outcome.counts : countBySeverity(outcome.findings)}
            complianceScore={outcome.complianceScore}
            moneyAtRisk={outcome.moneyAtRisk}
            gate={computeGate(outcome)}
            glyphs={glyphs}
            capabilities={capabilities}
          />
        </>
      ) : null}
    </Box>
  );
}

export function countBySeverity(findings: readonly Finding[]): Partial<Record<Severity, number>> {
  const counts: Partial<Record<Severity, number>> = {};
  for (const finding of findings) {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  }
  return counts;
}
