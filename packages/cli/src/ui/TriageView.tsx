/**
 * The triage TUI: a keyboard-driven review of one scan's findings.
 *
 * Keymap follows the GUI surface described in the PRD, which in turn follows
 * the Superhuman/Linear lineage — j/k to move, a/d/s to decide, f to fix, `/`
 * to filter. Muscle memory should carry between the two surfaces.
 *
 * Decisions are optimistic: the row updates immediately and reconciles when the
 * PATCH returns. Reviewing a hundred findings behind a spinner is not review,
 * it is waiting.
 */

import { Box, Text, useApp, useInput } from 'ink';
import React, { useCallback, useMemo, useState } from 'react';

import { formatInr } from '../money.js';
import { SEVERITY_ORDER } from '../domain.js';
import { COLOR, SEVERITY_COLOR, severityLabel } from './theme.js';
import { formatComplianceRefs } from './FindingCard.js';
import type { Capabilities, Glyphs } from './theme.js';
import type { Finding, TriageState } from '../domain.js';

export interface TriageViewProps {
  findings: Finding[];
  glyphs: Glyphs;
  capabilities: Capabilities;
  /** Resolves when the server has recorded the decision. */
  onDecide: (finding: Finding, state: TriageState, reason?: string) => Promise<void>;
  onQuit: (summary: TriageSummary) => void;
}

export interface TriageSummary {
  accepted: number;
  dismissed: number;
  suppressed: number;
  remaining: number;
  failed: number;
}

type Mode = 'list' | 'filter' | 'reason';

const STATE_GLYPH: Record<TriageState, string> = {
  open: ' ',
  accepted: 'A',
  dismissed: 'D',
  suppressed: 'S',
};

export function TriageView({ findings: initial, glyphs, capabilities, onDecide, onQuit }: TriageViewProps) {
  const { exit } = useApp();

  const [findings, setFindings] = useState<Finding[]>(initial);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingState, setPendingState] = useState<TriageState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(0);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const sorted = [...findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity),
    );
    if (!needle) return sorted;
    return sorted.filter((f) =>
      [f.rule_id, f.file, f.message, f.category, f.severity].join(' ').toLowerCase().includes(needle),
    );
  }, [findings, filter]);

  const current = visible[Math.min(cursor, visible.length - 1)];

  const summarize = useCallback((): TriageSummary => {
    const count = (state: TriageState) => findings.filter((f) => f.triage_state === state).length;
    return {
      accepted: count('accepted'),
      dismissed: count('dismissed'),
      suppressed: count('suppressed'),
      remaining: findings.filter((f) => !f.triage_state || f.triage_state === 'open').length,
      failed,
    };
  }, [findings, failed]);

  const quit = useCallback(() => {
    onQuit(summarize());
    exit();
  }, [onQuit, summarize, exit]);

  const decide = useCallback(
    (finding: Finding, state: TriageState, reason?: string) => {
      const previous = finding.triage_state;
      // Optimistic: paint the decision now, roll back only if the server rejects.
      setFindings((all) => all.map((f) => (f.id === finding.id ? { ...f, triage_state: state } : f)));
      setStatus(`${state} ${finding.rule_id}`);
      if (cursor < visible.length - 1) setCursor((c) => c + 1);

      void onDecide(finding, state, reason).catch((error: unknown) => {
        setFindings((all) =>
          all.map((f) => (f.id === finding.id ? { ...f, triage_state: previous } : f)),
        );
        setFailed((n) => n + 1);
        setStatus(`could not save: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
    [onDecide, cursor, visible.length],
  );

  useInput((input, key) => {
    if (mode === 'filter') {
      if (key.return || key.escape) {
        if (key.escape) setFilter('');
        setMode('list');
        setCursor(0);
      } else if (key.backspace || key.delete) {
        setFilter((f) => f.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setFilter((f) => f + input);
      }
      return;
    }

    if (mode === 'reason') {
      if (key.escape) {
        setMode('list');
        setPendingState(null);
        setDraft('');
      } else if (key.return) {
        // Dismissing or suppressing without a reason is how an audit trail
        // becomes worthless, so an empty reason simply does not submit.
        if (draft.trim() && current && pendingState) {
          decide(current, pendingState, draft.trim());
          setMode('list');
          setPendingState(null);
          setDraft('');
        }
      } else if (key.backspace || key.delete) {
        setDraft((d) => d.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setDraft((d) => d + input);
      }
      return;
    }

    if (input === 'q' || key.escape) return quit();
    if (input === 'j' || key.downArrow) return setCursor((c) => Math.min(c + 1, visible.length - 1));
    if (input === 'k' || key.upArrow) return setCursor((c) => Math.max(c - 1, 0));
    if (input === 'g') return setCursor(0);
    if (input === 'G') return setCursor(Math.max(0, visible.length - 1));
    if (input === '/') {
      setMode('filter');
      return;
    }
    if (!current) return;

    if (input === 'a') return decide(current, 'accepted');
    if (input === 'd' || input === 's') {
      setPendingState(input === 'd' ? 'dismissed' : 'suppressed');
      setMode('reason');
      return;
    }
    if (input === 'f') {
      setStatus(`run:  sirius fix ${current.rule_id}`);
      return;
    }
  });

  const muted = capabilities.color ? COLOR.muted : undefined;
  const summary = summarize();

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>{'  sirius triage  '}</Text>
        <Text color={muted}>
          {`${visible.length}/${findings.length} shown${filter ? ` · filter "${filter}"` : ''} · ${summary.remaining} open`}
        </Text>
      </Box>

      {visible.length === 0 ? (
        <Text color={muted}>{'  nothing matches that filter'}</Text>
      ) : (
        visible.slice(windowStart(cursor, visible.length), windowStart(cursor, visible.length) + 12).map((finding, i) => {
          const index = windowStart(cursor, visible.length) + i;
          const selected = index === Math.min(cursor, visible.length - 1);
          const state = (finding.triage_state ?? 'open') as TriageState;
          const decided = state !== 'open';

          return (
            <Box key={finding.id}>
              <Text color={capabilities.color ? COLOR.accent : undefined}>{selected ? '  > ' : '    '}</Text>
              <Text color={decided ? (capabilities.color ? COLOR.success : undefined) : muted}>
                {`${STATE_GLYPH[state]} `}
              </Text>
              <Text color={capabilities.color ? SEVERITY_COLOR[finding.severity] : undefined} bold={selected}>
                {`${glyphs.severity[finding.severity]} ${severityLabel(finding.severity)}`}
              </Text>
              <Text bold={selected} dimColor={decided}>{` ${finding.rule_id}  `}</Text>
              <Text color={muted} dimColor={decided}>
                {`${finding.file}:${finding.line}`}
              </Text>
            </Box>
          );
        })
      )}

      {current ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={muted}>{`  ${glyphs.horizontal.repeat(Math.min(64, capabilities.width - 4))}`}</Text>
          <Text>{`  ${current.message}`}</Text>
          {current.compliance_ref?.length ? (
            <Text color={muted}>{`  ${formatComplianceRefs(current.compliance_ref, glyphs.separator)}`}</Text>
          ) : null}
          {current.snippet ? <Text color={muted}>{`  ${current.line} ${glyphs.vertical}  ${current.snippet}`}</Text> : null}
          {current.money_at_risk_inr ? (
            <Text color={capabilities.color ? SEVERITY_COLOR.critical : undefined}>
              {`  ${formatInr(current.money_at_risk_inr)} at risk`}
              {current.validity === 'verified_live' ? `${glyphs.separator}${glyphs.warning} VERIFIED LIVE` : ''}
            </Text>
          ) : null}
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        {mode === 'filter' ? (
          <Text>{`  filter: ${filter}▌`}</Text>
        ) : mode === 'reason' ? (
          <Text>{`  reason for ${pendingState}: ${draft}▌   (enter to save, esc to cancel)`}</Text>
        ) : (
          <Text color={muted}>
            {'  j/k move   a accept   d dismiss   s suppress   f fix   / filter   q quit'}
          </Text>
        )}
        {status ? <Text color={muted}>{`  ${status}`}</Text> : null}
      </Box>
    </Box>
  );
}

/** Keep the cursor inside a 12-row window without jumping around. */
function windowStart(cursor: number, total: number): number {
  const size = 12;
  if (total <= size) return 0;
  return Math.max(0, Math.min(cursor - Math.floor(size / 2), total - size));
}
