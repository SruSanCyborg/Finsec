import React from 'react';
import { Finding } from '@sirius/types';
import { StatusChip, Badge } from '@sirius/ui';
import { FileCode, CheckCircle2 } from 'lucide-react';

export interface FindingRowProps {
  finding: Finding;
  isSelected: boolean;
  onSelect: (finding: Finding) => void;
}

export const FindingRow: React.FC<FindingRowProps> = ({ finding, isSelected, onSelect }) => {
  return (
    <div
      tabIndex={0}
      onClick={() => onSelect(finding)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(finding);
        }
      }}
      style={{
        padding: '12px 14px',
        backgroundColor: isSelected ? 'var(--color-primary-soft)' : 'var(--color-bg-surface)',
        border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderLeft: isSelected ? '4px solid var(--color-primary)' : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        outline: 'none',
        transition: 'all 140ms ease-out',
        boxShadow: isSelected ? 'var(--shadow-small)' : 'none',
      }}
    >
      {/* Top Row: Severity Chip & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <StatusChip status={finding.severity} size="sm" />
          <span
            style={{
              fontWeight: 700,
              fontSize: '13.5px',
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {finding.title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {finding.suppressionStatus === 'active' ? (
            <Badge variant="cyan" size="sm">SUPPRESSED</Badge>
          ) : finding.status === 'ignored' ? (
            <Badge variant="amber" size="sm">ACCEPTED</Badge>
          ) : (
            <Badge variant={finding.baselineState === 'new' ? 'red' : 'neutral'} size="sm">
              {finding.baselineState ? finding.baselineState.toUpperCase() : 'NEW'}
            </Badge>
          )}
        </div>
      </div>

      {/* Bottom Row: Rule ID, File Location & Verified Chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--color-text-muted)' }}>
        <Badge variant="neutral" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
          {finding.ruleId}
        </Badge>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-code)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          <FileCode size={12} color="var(--color-primary)" /> {finding.filePath}:{finding.startLine}
        </span>

        {finding.secretValidity?.status === 'valid' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--color-primary)', fontWeight: 700 }}>
            <CheckCircle2 size={12} /> VERIFIED LIVE
          </span>
        )}
      </div>
    </div>
  );
};
