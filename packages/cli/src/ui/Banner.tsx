/**
 * The header box.
 *
 *   ╭──────────────────────────────────────────────────────────────╮
 *   │  finsec-lint v0.4.0   ·   FinSec Compliance Scanner           │
 *   │  project: paykit-api   ·   ruleset: p/fintech-core (52 rules) │
 *   ╰──────────────────────────────────────────────────────────────╯
 */

import { Box, Text } from 'ink';
import React from 'react';

import { COLOR } from './theme.js';
import type { Capabilities, Glyphs } from './theme.js';

export interface BannerProps {
  version: string;
  project: string | undefined;
  ruleset: string | undefined;
  ruleCount: number | undefined;
  glyphs: Glyphs;
  capabilities: Capabilities;
}

const INNER_WIDTH = 62;

export function Banner({ version, project, ruleset, ruleCount, glyphs, capabilities }: BannerProps) {
  const sep = glyphs.separator.trim();
  const line1 = `finsec-lint v${version}   ${sep}   FinSec Compliance Scanner`;
  const line2 = [
    project ? `project: ${project}` : undefined,
    ruleset ? `ruleset: ${ruleset}${ruleCount ? ` (${ruleCount} rules)` : ''}` : undefined,
  ]
    .filter(Boolean)
    .join(`   ${sep}   `);

  // Narrow terminals get the text without the box rather than a broken box.
  if (capabilities.width < INNER_WIDTH + 6) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{line1}</Text>
        {line2 ? <Text color={capabilities.color ? COLOR.muted : undefined}>{line2}</Text> : null}
      </Box>
    );
  }

  const border = capabilities.color ? COLOR.border : undefined;
  const rule = glyphs.horizontal.repeat(INNER_WIDTH);
  const pad = (text: string) => `  ${text}`.padEnd(INNER_WIDTH);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={border}>{`  ${glyphs.boxTopLeft}${rule}${glyphs.boxTopRight}`}</Text>
      <Text color={border}>
        {`  ${glyphs.vertical}`}
        <Text color={undefined} bold>
          {pad(line1)}
        </Text>
        {glyphs.vertical}
      </Text>
      {line2 ? (
        <Text color={border}>
          {`  ${glyphs.vertical}`}
          <Text color={capabilities.color ? COLOR.muted : undefined}>{pad(line2)}</Text>
          {glyphs.vertical}
        </Text>
      ) : null}
      <Text color={border}>{`  ${glyphs.boxBottomLeft}${rule}${glyphs.boxBottomRight}`}</Text>
    </Box>
  );
}
