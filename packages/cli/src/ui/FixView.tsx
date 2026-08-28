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

/** A provenance stage reported by the local fix engine. */
interface LocalStage {
  name: string;
  detail: string;
  real: boolean;
}

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

  // The local engine supplies its own stage list, because its first stage is a
  // template selector and not a model. Printing "quarantined model" there would
  // claim an LLM ran when none did — in a panel whose entire purpose is to show
  // the provenance of a change to someone's money-handling code.
  const stages = (suggestion as FixSuggestion & { stages?: LocalStage[] }).stages;
  const detail = (suggestion as FixSuggestion & { verifier_detail?: string }).verifier_detail;

  const rows: Array<[string, string]> = stages
    ? stages.map((stage) =>
        stage.name === 'verifier'
          ? ([stage.name, `${stage.detail} ${glyphs.rightArrow} ${verdict}`] as [string, string])
          : ([stage.name, stage.detail] as [string, string]),
      )
    : [
        ['quarantined model', `{ action: ${suggestion.action}, target: ${suggestion.target ?? '—'} }`],
        ['diff builder', `template: ${suggestion.action}`],
        [
          'verifier',
          `re-ran ${ruleId}${detail ? '' : ''} ${glyphs.rightArrow} ${verdict}`,
        ],
      ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));

  // The box used to be a hard 62 columns whatever the terminal was, and the
  // rows were elided to fit it. That cut the wrong half of the only sentence
  // this panel exists to deliver: `re-ran SIR-SEC-001, no match — nothing
  // would select it again` arrived as `re-ran SIR-SEC-001, no match — noth…`,
  // on a 120-column terminal with fifty columns spare. The clause that carries
  // the argument is always at the end, because that is where the conclusion
  // goes.
  //
  // So the panel takes the width it is given, up to a readable maximum, and a
  // value too long for one line wraps onto the next under the same column
  // instead of losing its tail.
  const inner = Math.min(Math.max(INNER_WIDTH, capabilities.width - 6), 96);
  const valueRoom = Math.max(12, inner - labelWidth - 5);

  /** Splits on spaces, keeping the continuation aligned under the value. */
  const wrapValue = (value: string): string[] => {
    if (value.length <= valueRoom) return [value];
    const lines: string[] = [];
    let line = '';
    for (const word of value.split(' ')) {
      if (line && `${line} ${word}`.length > valueRoom) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
      // A single word longer than the column — a path, or a long expression —
      // is hard-broken rather than allowed to push the border out.
      while (line.length > valueRoom) {
        lines.push(line.slice(0, valueRoom));
        line = line.slice(valueRoom);
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const title = ` Cerebus fix ${glyphs.separator.trim()} ${ruleId} `;
  const topRule = glyphs.horizontal.repeat(Math.max(0, inner - title.length - 1));

  // Too narrow for a box: drop the border, keep every word. This branch used to
  // print each row on one unwrapped line, so the narrowest terminals — the ones
  // that most needed the help — got a 91-character line at 56 columns and lost
  // the end of it to the terminal's own wrap.
  if (capabilities.width < INNER_WIDTH + 6) {
    const plainRoom = Math.max(12, capabilities.width - labelWidth - 6);
    const wrapPlain = (value: string): string[] => {
      if (value.length <= plainRoom) return [value];
      const lines: string[] = [];
      let line = '';
      for (const word of value.split(' ')) {
        if (line && `${line} ${word}`.length > plainRoom) {
          lines.push(line);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
        while (line.length > plainRoom) {
          lines.push(line.slice(0, plainRoom));
          line = line.slice(plainRoom);
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{`Cerebus fix ${ruleId}`}</Text>
        {rows.flatMap(([label, value]) =>
          wrapPlain(value).map((part, line) => (
            <Text key={`${label}-${line}`}>
              {line === 0
                ? `  ${label.padEnd(labelWidth)} ${glyphs.rightArrow} ${part}`
                : `  ${' '.repeat(labelWidth + 2)} ${part}`}
            </Text>
          )),
        )}
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

      {rows.flatMap(([label, value], index) => {
        const isVerifier = index === rows.length - 1;
        const highlight =
          isVerifier && capabilities.color ? (passed ? COLOR.success : SEVERITY_COLOR.high) : undefined;

        return wrapValue(value).map((part, line) => {
          // Continuation lines drop the label and the arrow, so the value
          // reads as one column rather than as a second row of its own.
          const gutter = line === 0 ? `${label.padEnd(labelWidth)} ${glyphs.rightArrow}` : ' '.repeat(labelWidth + 2);
          const content = ` ${gutter} ${part}`;
          return (
            <Text key={`${label}-${line}`} color={border}>
              {`  ${glyphs.vertical}`}
              <Text color={highlight}>{content.padEnd(inner)}</Text>
              {glyphs.vertical}
            </Text>
          );
        });
      })}

      <Text color={border}>
        {`  ${glyphs.boxBottomLeft}${glyphs.horizontal.repeat(inner)}${glyphs.boxBottomRight}`}
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
