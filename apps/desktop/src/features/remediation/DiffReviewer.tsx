import React, { useState } from 'react';
import { redactSensitiveText } from '@sirius/utils';
import { FileCode, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { Badge } from '@sirius/ui';

export interface DiffReviewerProps {
  filePath: string;
  oldCode: string;
  newCode: string;
  additionsCount: number;
  deletionsCount: number;
}

export const DiffReviewer: React.FC<DiffReviewerProps> = ({
  filePath,
  oldCode,
  newCode,
  additionsCount,
  deletionsCount,
}) => {
  const [currentHunk, setCurrentHunk] = useState(1);
  const [copied, setCopied] = useState(false);

  const redactedOld = redactSensitiveText(oldCode);
  const redactedNew = redactSensitiveText(newCode);

  const oldLines = redactedOld.split('\n');
  const newLines = redactedNew.split('\n');

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-technical)',
        backgroundColor: 'var(--color-bg-technical)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Diff Header Bar */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileCode size={16} color="var(--color-cyan)" />
          <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-code)', color: 'var(--text-primary)' }}>
            {filePath}
          </span>
          <button
            onClick={handleCopyPath}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
          >
            <Copy size={12} /> {copied ? 'Copied!' : 'Copy Path'}
          </button>
        </div>

        {/* Diff Stats & Hunk Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Badge variant="emerald" size="sm">
              +{additionsCount} additions
            </Badge>
            <Badge variant="violet" size="sm">
              -{deletionsCount} deletions
            </Badge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
            <button
              onClick={() => setCurrentHunk((prev) => Math.max(1, prev - 1))}
              disabled={currentHunk <= 1}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
            >
              <ChevronLeft size={14} />
            </button>
            <span>Hunk {currentHunk} of 1</span>
            <button
              disabled={true}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'not-allowed', padding: 0 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Code Container */}
      <div
        style={{
          padding: '12px 0',
          fontFamily: 'var(--font-code)',
          fontSize: '12.5px',
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
              borderLeft: '4px solid #F87171',
              padding: '0 16px',
              color: '#F87171',
            }}
          >
            <span style={{ width: '32px', userSelect: 'none', flexShrink: 0, opacity: 0.6, fontSize: '11px' }}>
              {idx + 41}
            </span>
            <span style={{ width: '20px', userSelect: 'none', flexShrink: 0, fontWeight: 700 }}>-</span>
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
              borderLeft: '4px solid var(--color-emerald)',
              padding: '0 16px',
              color: 'var(--color-emerald)',
            }}
          >
            <span style={{ width: '32px', userSelect: 'none', flexShrink: 0, opacity: 0.6, fontSize: '11px' }}>
              {idx + 41}
            </span>
            <span style={{ width: '20px', userSelect: 'none', flexShrink: 0, fontWeight: 700 }}>+</span>
            <span style={{ whiteSpace: 'pre' }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
