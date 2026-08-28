/**
 * The summary footer.
 *
 *   ────────────────────────────────────────────────────────────────
 *    Findings   ● 2 critical   ▲ 5 high   ■ 9 medium   ○ 3 low
 *    Secrets    1 verified-live · 1 inactive
 *    Money@risk ₹51,20,000        Compliance score  72/100  ▐███████▏
 *    Exit 1 · gate: severity≥high, fail-on=verified-secrets → BLOCKED
 *   ────────────────────────────────────────────────────────────────
 *
 * The gate line differs from the PRD's mockup on purpose: the mockup prints
 * `gate: fail-on=high`, conflating the threshold with the predicate. See
 * decisions.md D-003.
 */

import { Box, Text } from 'ink';
import React from 'react';

import { formatScore } from '../gate.js';
import { formatInr } from '../money.js';
import { SEVERITY_ORDER } from '../domain.js';
import { COLOR, SEVERITY_COLOR, meter } from './theme.js';
import type { Capabilities, Glyphs } from './theme.js';
import type { Finding, Severity } from '../domain.js';
import type { GateResult } from '../gate.js';

export interface SummaryProps {
  findings: readonly Finding[];
  counts: Partial<Record<Severity, number>>;
  complianceScore: number | null | undefined;
  moneyAtRisk: number | null | undefined;
  gate: GateResult;
  glyphs: Glyphs;
  capabilities: Capabilities;
}

const LABEL_WIDTH = 11;
const SCORE_METER_WIDTH = 7;

export function Summary({
  findings,
  counts,
  complianceScore,
  moneyAtRisk,
  gate,
  glyphs,
  capabilities,
}: SummaryProps) {
  const muted = capabilities.color ? COLOR.muted : undefined;
  const ruleWidth = Math.min(64, Math.max(24, capabilities.width - 2));
  const rule = glyphs.horizontal.repeat(ruleWidth);

  // Most severe first, and `info` only when it actually occurs (D-011).
  const ordered = [...SEVERITY_ORDER].reverse().filter((s) => (counts[s] ?? 0) > 0 || s !== 'info');

  const verifiedLive = findings.filter((f) => f.validity === 'verified_live').length;
  const inactive = findings.filter((f) => f.validity === 'inactive').length;

  const money = formatInr(moneyAtRisk);
  const hasScore = typeof complianceScore === 'number';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={muted}>{`  ${rule}`}</Text>

      <Box>
        <Text color={muted}>{`   ${'Findings'.padEnd(LABEL_WIDTH)}`}</Text>
        {ordered.map((severity) => (
          <Text key={severity} color={capabilities.color ? SEVERITY_COLOR[severity] : undefined}>
            {`${glyphs.counter[severity]} ${counts[severity] ?? 0} ${severity}   `}
          </Text>
        ))}
      </Box>

      {verifiedLive + inactive > 0 ? (
        <Box>
          <Text color={muted}>{`   ${'Secrets'.padEnd(LABEL_WIDTH)}`}</Text>
          <Text color={verifiedLive > 0 && capabilities.color ? SEVERITY_COLOR.critical : undefined}>
            {`${verifiedLive} verified-live`}
          </Text>
          <Text color={muted}>{`${glyphs.separator}${inactive} inactive`}</Text>
        </Box>
      ) : null}

      <Box>
        <Text color={muted}>{`   ${'Money@risk'.padEnd(LABEL_WIDTH)}`}</Text>
        <Text bold>{money || '—'}</Text>
        {hasScore ? (
          <>
            <Text color={muted}>{'        Compliance score  '}</Text>
            <Text bold>{`${formatScore(complianceScore)}/100  `}</Text>
            <Text color={capabilities.color ? COLOR.success : undefined}>
              {meter(complianceScore / 100, SCORE_METER_WIDTH, glyphs)}
            </Text>
          </>
        ) : null}
      </Box>

      <Box>
        <Text color={gate.blocked && capabilities.color ? SEVERITY_COLOR.critical : muted}>
          {`   Exit ${gate.exitCode}${glyphs.separator}gate: ${gate.predicate} ${glyphs.rightArrow} `}
        </Text>
        <Text bold color={capabilities.color ? (gate.blocked ? SEVERITY_COLOR.critical : COLOR.success) : undefined}>
          {gate.blocked ? 'BLOCKED' : 'PASSED'}
        </Text>
      </Box>

      {gate.reasons.length > 1 || (gate.reasons.length === 1 && gate.reasons[0]?.startsWith('policy')) ? (
        <Box flexDirection="column">
          {gate.reasons.map((reason) => (
            <Text key={reason} color={muted}>{`     ${glyphs.dot} ${reason}`}</Text>
          ))}
        </Box>
      ) : null}

      <Text color={muted}>{`  ${rule}`}</Text>
    </Box>
  );
}
