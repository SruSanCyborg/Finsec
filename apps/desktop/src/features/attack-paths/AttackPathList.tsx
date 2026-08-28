import React from 'react';
import { AttackPath } from '@sirius/types';
import { SeverityChip, Badge } from '@sirius/ui';
import { GitCommit, DollarSign } from 'lucide-react';

export interface AttackPathListProps {
  paths: AttackPath[];
  selectedPathId?: string | null;
  onSelectPath: (path: AttackPath) => void;
}

export const AttackPathList: React.FC<AttackPathListProps> = ({
  paths,
  selectedPathId,
  onSelectPath,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: '260px',
        overflowY: 'auto',
      }}
    >
      {paths.map((path) => {
        const isSelected = selectedPathId === path.id;

        return (
          <div
            key={path.id}
            onClick={() => onSelectPath(path)}
            style={{
              padding: '10px 14px',
              backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-surface)',
              border: isSelected ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <GitCommit size={16} color={isSelected ? 'var(--color-cyan)' : 'var(--text-dim)'} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SeverityChip severity={path.severity} variant="compact" />
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {path.title}
                  </span>
                </div>
                <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontFamily: 'var(--font-code)' }}>
                  <span>{path.entryLabel}</span>
                  <span>&rarr;</span>
                  <span>{path.targetLabel}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Badge variant="neutral" size="sm">
                {path.nodeCount} nodes
              </Badge>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)', fontFamily: 'var(--font-code)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <DollarSign size={11} /> ${(path.financialExposureUSD / 1000000).toFixed(2)}M
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
