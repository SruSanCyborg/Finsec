/**
 * The Cerebus fix view.
 *
 *   ╭─ Cerebus fix · SIR-SEC-001 ──────────────────────────────────╮
 *   │ quarantined model → { action: env_lookup, target: api_key }  │
 *   │ diff builder      → template: env_lookup                     │
 *   │ verifier          → re-ran SIR-SEC-001 → ✓ PASS             │
 *   ╰──────────────────────────────────────────────────────────────╯
 *
 * The provenance panel is the security argument made visible: a quarantined
 * model that only ever picks an action from a closed vocabulary, a deterministic
 * builder that renders the diff from a template, and a verifier that re-runs the
 * original rule. The rule is the ground truth, not the model — so the verifier
 * line is the one that matters, and it renders on failure too, which the PRD's
 * mockup never shows.
 */

import { Box, Text, useInput } from 'ink';
import React from 'react';

import { COLOR, SEVERITY_COLOR } from './theme.js';
import type { Capabilities, Glyphs } from './theme.js';
import type { FixSuggestion } from '../domain.js';

const INNER_WIDTH = 62;

export interface CerebusPanelProps {
  ruleId: string;
  suggestion: FixSuggestion;
  glyphs: Glyphs;
  capabilities: Capabilities;
}

export function CerebusPanel({ ruleId, suggestion, glyphs, capabilities }: CerebusPanelProps) {
  const border = capabilities.color ? COLOR.border : undefined;
  const passed = suggestion.verifier_status === 'pass';

  const verdict = passed
    ? `${glyphs.check} PASS`
    : suggestion.verifier_status === 'escalated'
      ? `${glyphs.warning} ESCALATED`
      : `${glyphs.cross} FAIL`;

  const rows: Array<[string, string]> = [
    ['quarantined model', `{ action: ${suggestion.action}, target: ${suggestion.target ?? '—'} }`],
    ['diff builder', `template: ${suggestion.action}`],
    ['verifier', `re-ran ${ruleId} ${glyphs.rightArrow} ${verdict}`],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));

  const title = ` Cerebus fix ${glyphs.separator.trim()} ${ruleId} `;
  const topRule = glyphs.horizontal.repeat(Math.max(0, INNER_WIDTH - title.length - 1));

  if (capabilities.width < INNER_WIDTH + 6) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{`Cerebus fix ${ruleId}`}</Text>
        {rows.map(([label, value]) => (
          <Text key={label}>{`  ${label.padEnd(labelWidth)} ${glyphs.rightArrow} ${value}`}</Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={border}>
        {`  ${glyphs.boxTopLeft}${glyphs.horizontal}`}
        <Text bold color={undefined}>
          {title}
        </Text>
        {`${topRule}${glyphs.boxTopRight}`}
      </Text>

      {rows.map(([label, value], index) => {
        const isVerifier = index === rows.length - 1;
        const content = ` ${label.padEnd(labelWidth)} ${glyphs.rightArrow} ${value}`;
        return (
          <Text key={label} color={border}>
            {`  ${glyphs.vertical}`}
            <Text
              color={
                isVerifier && capabilities.color
                  ? passed
                    ? COLOR.success
                    : SEVERITY_COLOR.high
                  : undefined
              }
            >
              {content.padEnd(INNER_WIDTH)}
            </Text>
            {glyphs.vertical}
          </Text>
        );
      })}

      <Text color={border}>
        {`  ${glyphs.boxBottomLeft}${glyphs.horizontal.repeat(INNER_WIDTH)}${glyphs.boxBottomRight}`}
      </Text>
    </Box>
  );
}

export interface DiffViewProps {
  file: string;
  line: number;
  diff: string;
  sideEffects?: FixSuggestion['side_effects'];
  glyphs: Glyphs;
  capabilities: Capabilities;
}

export function DiffView({ file, line, diff, sideEffects, glyphs, capabilities }: DiffViewProps) {
  const muted = capabilities.color ? COLOR.muted : undefined;
  const added = capabilities.color ? COLOR.success : undefined;
  const removed = capabilities.color ? SEVERITY_COLOR.critical : undefined;

  // Hunk headers carry no information the file/line header does not already give.
  const lines = diff.split('\n').filter((l) => !l.startsWith('@@') && !l.startsWith('---') && !l.startsWith('+++'));
  const gutter = String(line);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{`   ${file}`}</Text>
      <Text color={muted}>{`   ${glyphs.horizontal.repeat(45)}`}</Text>

      {lines.map((content, index) => {
        const sign = content.startsWith('+') ? '+' : content.startsWith('-') ? '-' : ' ';
        const color = sign === '+' ? added : sign === '-' ? removed : undefined;
        return (
          <Box key={`${index}-${content}`}>
            <Text color={muted}>{`   ${gutter} ${glyphs.vertical} `}</Text>
            <Text color={color}>{content}</Text>
          </Box>
        );
      })}

      {(sideEffects ?? []).map((effect) => (
        <Box key={effect.file}>
          <Text color={muted}>{`   ${' '.repeat(gutter.length)}   `}</Text>
          <Text color={added}>{`+ ${effect.file}  ${glyphs.rightArrow}  ${effect.content ?? ''}`}</Text>
        </Box>
      ))}
    </Box>
  );
}

export type ApplyChoice = 'accept' | 'skip' | 'edit' | 'all' | 'quit';

export interface ApplyPromptProps {
  glyphs: Glyphs;
  capabilities: Capabilities;
  /** Disabled when the verifier did not pass — a failed fix is not offered. */
  disabled?: boolean;
  onChoice: (choice: ApplyChoice) => void;
}

export function ApplyPrompt({ glyphs, capabilities, disabled = false, onChoice }: ApplyPromptProps) {
  useInput((input, key) => {
    if (disabled) {
      onChoice('skip');
      return;
    }
    const ch = input.toLowerCase();
    if (ch === 'y') onChoice('accept');
    else if (ch === 'n' || key.escape) onChoice('skip');
    else if (ch === 'e') onChoice('edit');
    else if (ch === 'a') onChoice('all');
    else if (ch === 'q') onChoice('quit');
  });

  const muted = capabilities.color ? COLOR.muted : undefined;

  if (disabled) {
    return (
      <Text color={muted}>
        {`   Verification did not pass ${glyphs.separator}not offering to apply this fix.`}
      </Text>
    );
  }

  return (
    <Box>
      <Text>{'   Apply this fix?   '}</Text>
      <Text bold>{'[y]'}</Text>
      <Text color={muted}>{' accept   '}</Text>
      <Text bold>{'[n]'}</Text>
      <Text color={muted}>{' skip   '}</Text>
      <Text bold>{'[e]'}</Text>
      <Text color={muted}>{' edit   '}</Text>
      <Text bold>{'[a]'}</Text>
      <Text color={muted}>{' all'}</Text>
    </Box>
  );
}
