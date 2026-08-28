import React from 'react';
import { redactSensitiveText } from '@sirius/utils';
import { FileCode } from 'lucide-react';

export interface DiffPreviewCardProps {
  filePath: string;
  oldCode: string;
  newCode: string;
}

export const DiffPreviewCard: React.FC<DiffPreviewCardProps> = ({ filePath, oldCode, newCode }) => {
  const redactedOld = redactSensitiveText(oldCode);
  const redactedNew = redactSensitiveText(newCode);

  const oldLines = redactedOld.split('\n');
  const newLines = redactedNew.split('\n');

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-technical)',
        backgroundColor: 'var(--color-bg-technical)',
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
        marginTop: '8px',
      }}
    >
      {/* Diff Header */}
      <div
        style={{
          padding: '6px 12px',
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          fontFamily: 'var(--font-code)',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <FileCode size={12} color="var(--color-cyan)" /> Proposed Diff Preview: {filePath}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>READ-ONLY EVIDENCE PREVIEW</span>
      </div>

      {/* Diff Content */}
      <div
        style={{
          padding: '10px 0',
          fontFamily: 'var(--font-code)',
          fontSize: '12px',
          lineHeight: 1.6,
          overflowX: 'auto',
        }}
      >
        {/* Deletions */}
        {oldLines.map((line, idx) => (
          <div
            key={`old-${idx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(248, 113, 113, 0.12)',
              borderLeft: '3px solid #F87171',
              padding: '0 12px',
              color: '#F87171',
            }}
          >
            <span style={{ width: '20px', userSelect: 'none', flexShrink: 0, opacity: 0.7 }}>-</span>
            <span style={{ whiteSpace: 'pre' }}>{line}</span>
          </div>
        ))}

        {/* Additions */}
        {newLines.map((line, idx) => (
          <div
            key={`new-${idx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(74, 222, 128, 0.12)',
              borderLeft: '3px solid var(--color-emerald)',
              padding: '0 12px',
              color: 'var(--color-emerald)',
            }}
          >
            <span style={{ width: '20px', userSelect: 'none', flexShrink: 0, opacity: 0.7 }}>+</span>
            <span style={{ whiteSpace: 'pre' }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
