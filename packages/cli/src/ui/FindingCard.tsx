/**
 * A single finding.
 *
 *   ✗ CRITICAL  SIR-SEC-001  Hardcoded Stripe secret key
 *      src/config.py:14                          PCI-DSS 8.6.2 · DPDP §8
 *      14 │  STRIPE_KEY = "sk_live_51H8xR2eZv…"
 *         │               ╰── secret · ⚠ VERIFIED LIVE · ₹42,00,000 at risk
 *      ↳ fix: env_lookup   run  sirius fix SIR-SEC-001
 *
 * The mockup shows three densities: a full card with a code frame and an
 * underline annotation, a medium card without the annotation, and a compact
 * header-only card. Which one renders follows from the data — a finding with no
 * snippet cannot have a code frame.
 */

import { Box, Text } from 'ink';
import React from 'react';
import { resolve } from 'node:path';

import { hyperlink } from './kit.js';

import { formatInr } from '../money.js';
import { COLOR, SEVERITY_COLOR, severityLabel, validityLabel } from './theme.js';
import type { Capabilities, Glyphs } from './theme.js';
import type { Finding } from '../domain.js';

export interface FindingCardProps {
  finding: Finding;
  glyphs: Glyphs;
  capabilities: Capabilities;
  /** Append `run sirius fix <RULE-ID>` to the fix hint. */
  showRunHint?: boolean;
}

/** `["PCI-DSS:8.6.2","DPDP:8"]` → `PCI-DSS 8.6.2 · DPDP §8` */
export function formatComplianceRefs(refs: readonly string[] | undefined, separator: string): string {
  if (!refs || refs.length === 0) return '';
  return refs
    .map((ref) => {
      const [scheme, clause] = ref.split(':');
      if (!clause) return scheme ?? ref;
      // DPDP clauses are sections of an Act, so they take a section sign.
      if (scheme === 'DPDP') return `DPDP §${clause}`;
      if (scheme === 'CWE') return `CWE-${clause}`;
      return `${scheme} ${clause}`;
    })
    .join(separator);
}

/**
 * The annotation line under a code frame. Alignment needs `col`; when the server
 * omits it (decisions.md D-005) we fall back to locating the value in the
 * snippet, and finally to an unaligned annotation rather than a wrong one.
 */
function annotationOffset(finding: Finding): number | undefined {
  if (typeof finding.col === 'number' && finding.col > 0) return finding.col - 1;
  const snippet = finding.snippet;
  if (!snippet) return undefined;
  const quote = snippet.search(/["'`]/);
  return quote >= 0 ? quote : undefined;
}

export function FindingCard({ finding, glyphs, capabilities, showRunHint = false }: FindingCardProps) {
  const color = capabilities.color ? SEVERITY_COLOR[finding.severity] : undefined;
  const muted = capabilities.color ? COLOR.muted : undefined;

  const location = `${finding.file}:${finding.line}`;

  // Clickable where the terminal supports it. The padding is computed from the
  // plain text and the link wrapped around it afterwards, because an OSC 8
  // payload is bytes the terminal never draws — padding the wrapped string
  // would pad the escape and pull the column left by however long the path is.
  const shown = capabilities.hyperlinks
    ? (text: string) => hyperlink(text, resolve(process.cwd(), finding.file), finding.line)
    : (text: string) => text;
  const refs = formatComplianceRefs(finding.compliance_ref, glyphs.separator);

  // Right-align the compliance refs when there is room; stack them when there is not.
  const locationWidth = 41;
  const canAlign = capabilities.width >= locationWidth + refs.length + 8;

  const gutter = String(finding.line);
  const offset = annotationOffset(finding);
  const validity = validityLabel(finding.validity);
  const money = formatInr(finding.money_at_risk_inr);

  // `HTTP request: a = request.args[…] (line 9)  →  q = "…" % a (line 10)`
  const taint = (finding as { taint?: string | null }).taint ?? '';
  const [taintSource, ...taintRest] = taint ? taint.split(': ') : [];
  const taintHops = taintRest.length > 0 ? taintRest.join(': ').split('  \u2192  ') : [];

  const annotationParts = [
    finding.category === 'secrets' ? 'secret' : undefined,
    validity ? (finding.validity === 'verified_live' ? `${glyphs.warning} ${validity}` : validity) : undefined,
    money ? `${money} at risk` : undefined,
  ].filter(Boolean) as string[];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {`  ${glyphs.severity[finding.severity]} ${severityLabel(finding.severity)}`}
        </Text>
        <Text bold>{`  ${finding.rule_id}  `}</Text>
        <Text>{finding.message}</Text>
      </Box>

      <Box>
        <Text color={muted}>
          {canAlign
            ? `     ${shown(location)}${' '.repeat(Math.max(0, locationWidth - location.length - 5))}`
            : `     ${shown(location)}`}
        </Text>
        {refs ? <Text color={muted}>{canAlign ? refs : ''}</Text> : null}
      </Box>
      {refs && !canAlign ? <Text color={muted}>{`     ${refs}`}</Text> : null}

      {finding.snippet ? (
        <Box>
          <Text color={muted}>{`     ${gutter} ${glyphs.vertical}  `}</Text>
          <Text>{finding.snippet}</Text>
        </Box>
      ) : null}

      {finding.snippet && annotationParts.length > 0 ? (
        <Box>
          <Text color={muted}>{`     ${' '.repeat(gutter.length)} ${glyphs.vertical}  `}</Text>
          <Text color={muted}>{offset === undefined ? '' : ' '.repeat(offset)}</Text>
          <Text color={color}>{`${glyphs.elbow} `}</Text>
          <Text color={finding.validity === 'verified_live' ? color : muted}>
            {annotationParts.join(glyphs.separator)}
          </Text>
        </Box>
      ) : null}

      {/* The trace, when the dataflow pass could prove one. This is the whole
          difference between "there is an interpolation here" and "an attacker
          controls this string", and it is worth the two lines it costs. */}
      {taintHops.length > 0 ? (
        <Box flexDirection="column">
          <Box>
            <Text color={muted}>{`     ${' '.repeat(gutter.length)} ${glyphs.vertical}  `}</Text>
            <Text color={capabilities.color ? COLOR.accent : undefined}>{`from ${taintSource}:`}</Text>
          </Box>
          {taintHops.map((hop, index) => (
            <Box key={hop}>
              <Text color={muted}>{`     ${' '.repeat(gutter.length)} ${glyphs.vertical}  `}</Text>
              <Text color={muted}>{`${index === 0 ? '  ' : '  '}${glyphs.elbow} `}</Text>
              <Text>{hop}</Text>
            </Box>
          ))}
        </Box>
      ) : null}

      {finding.fix_action ? (
        <Box>
          <Text color={muted}>{`     ${glyphs.arrow} fix: `}</Text>
          <Text color={capabilities.color ? COLOR.success : undefined}>{finding.fix_action}</Text>
          {showRunHint ? (
            <Text color={muted}>{`   run  sirius fix ${finding.rule_id}`}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
