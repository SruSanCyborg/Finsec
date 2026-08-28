import React from 'react';
import { AttackPathNode } from '@sirius/types';

export interface AttackPathNodeViewProps {
  node: AttackPathNode;
  /** Centre position, computed by the layout in `AttackPathGraphView` — the
   * node's own `x`/`y` are never populated by the adapter, so this is the
   * only position that actually exists. */
  x: number;
  y: number;
  isSelected?: boolean;
  isFocusedPath?: boolean;
  onClick?: () => void;
}

export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 78;

const ROLE_LABEL: Record<string, string> = {
  entry: 'ENTRY POINT',
  target: 'TARGET ASSET',
  pivot: 'PIVOT',
};

function severityColor(severity: AttackPathNodeViewProps['node']['severity']): string {
  switch (severity) {
    case 'critical':
      return 'var(--color-red)';
    case 'high':
      return 'var(--color-amber)';
    case 'medium':
      return 'var(--color-mint)';
    case 'low':
      return 'var(--color-teal)';
    default:
      return 'var(--text-secondary)';
  }
}

/** Truncates on characters — SVG `<text>` doesn't wrap, so this is the whole budget. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const AttackPathNodeView: React.FC<AttackPathNodeViewProps> = ({
  node,
  x,
  y,
  isSelected = false,
  isFocusedPath = true,
  onClick,
}) => {
  const color = severityColor(node.severity);
  const opacity = isFocusedPath ? 1 : 0.35;
  const role = (node.metadata?.role as string | undefined) ?? '';
  const ruleId = (node.metadata?.ruleId as string | undefined) ?? node.label;
  const file = node.metadata?.file as string | undefined;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      style={{ cursor: 'pointer', opacity, transition: 'opacity 0.2s ease' }}
    >
      {isSelected && (
        <rect
          x={-CARD_WIDTH / 2 - 6}
          y={-CARD_HEIGHT / 2 - 6}
          width={CARD_WIDTH + 12}
          height={CARD_HEIGHT + 12}
          rx="12"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.7"
        />
      )}

      {/* Card body */}
      <rect
        x={-CARD_WIDTH / 2}
        y={-CARD_HEIGHT / 2}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx="10"
        fill="var(--color-bg-technical-elevated)"
        stroke="var(--border-hairline)"
        strokeWidth="1"
      />
      {/* Severity/role accent — a stripe carries the meaning, not a caption */}
      <rect x={-CARD_WIDTH / 2} y={-CARD_HEIGHT / 2} width="4" height={CARD_HEIGHT} rx="2" fill={color} />

      <text
        x={-CARD_WIDTH / 2 + 16}
        y={-CARD_HEIGHT / 2 + 18}
        fill={color}
        fontSize="9.5"
        fontWeight="700"
        fontFamily="var(--font-code)"
        letterSpacing="0.06em"
      >
        {ROLE_LABEL[role] ?? role.toUpperCase()}
      </text>

      <text
        x={-CARD_WIDTH / 2 + 16}
        y={-CARD_HEIGHT / 2 + 38}
        fill="var(--text-primary)"
        fontSize="12.5"
        fontWeight="700"
        fontFamily="var(--font-code)"
      >
        {truncate(ruleId, 22)}
      </text>

      {file && (
        <text
          x={-CARD_WIDTH / 2 + 16}
          y={-CARD_HEIGHT / 2 + 56}
          fill="var(--text-secondary)"
          fontSize="10.5"
          fontFamily="var(--font-code)"
        >
          {truncate(file, 24)}
        </text>
      )}
    </g>
  );
};
