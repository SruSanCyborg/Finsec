import React from 'react';
import { AttackPathNode } from '@sirius/types';

export interface AttackPathNodeViewProps {
  node: AttackPathNode;
  isSelected?: boolean;
  isFocusedPath?: boolean;
  onClick?: () => void;
}

export const AttackPathNodeView: React.FC<AttackPathNodeViewProps> = ({
  node,
  isSelected = false,
  isFocusedPath = true,
  onClick,
}) => {
  const x = node.x || 100;
  const y = node.y || 100;

  const getNodeColor = () => {
    switch (node.severity) {
      case 'critical':
        return 'var(--color-red)';
      case 'high':
        return 'var(--color-amber)';
      case 'medium':
        return 'var(--color-mint)';
      default:
        switch (node.type) {
          case 'database':
          case 'asset':
            return 'var(--color-emerald)';
          case 'credential':
          case 'entry':
            return 'var(--color-primary)';
          default:
            return 'var(--color-text-secondary)';
        }
    }
  };

  const color = getNodeColor();
  const opacity = isFocusedPath ? 1 : 0.35;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      style={{ cursor: 'pointer', opacity, transition: 'opacity 0.2s ease, transform 0.2s ease' }}
    >
      {/* Node Halo Effect when Selected */}
      {isSelected && (
        <circle
          cx="0"
          cy="0"
          r="38"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="4 2"
          style={{ opacity: 0.8 }}
        />
      )}

      {/* Main Node Shape */}
      {node.type === 'finding' ? (
        <polygon
          points="0,-24 24,0 0,24 -24,0"
          fill="var(--color-bg-technical-elevated)"
          stroke={color}
          strokeWidth={isSelected ? '3' : '2'}
        />
      ) : node.type === 'database' || node.type === 'asset' ? (
        <rect
          x="-28"
          y="-20"
          width="56"
          height="40"
          rx="6"
          fill="var(--color-bg-technical)"
          stroke={color}
          strokeWidth={isSelected ? '3' : '2'}
        />
      ) : (
        <circle
          cx="0"
          cy="0"
          r="22"
          fill="var(--color-bg-technical-elevated)"
          stroke={color}
          strokeWidth={isSelected ? '3' : '2'}
        />
      )}

      {/* Node Type Badge Label */}
      <text
        x="0"
        y="-32"
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize="9"
        fontWeight="700"
        fontFamily="var(--font-code)"
        letterSpacing="0.05em"
      >
        {node.type.toUpperCase()}
      </text>

      {/* Node Label Text */}
      <text
        x="0"
        y="36"
        textAnchor="middle"
        fill="var(--text-primary)"
        fontSize="11"
        fontWeight="600"
        fontFamily="var(--font-body)"
      >
        {node.label.length > 24 ? `${node.label.slice(0, 22)}...` : node.label}
      </text>
    </g>
  );
};
