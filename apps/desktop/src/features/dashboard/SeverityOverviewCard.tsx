import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, SeverityChip } from '@sirius/ui';
import { SEVERITY_CONFIG } from '@sirius/design-system';
import { FindingSeverity } from '@sirius/types';
import { ShieldAlert } from 'lucide-react';

export interface SeverityOverviewCardProps {
  counts?: Record<FindingSeverity, number>;
}

export const SeverityOverviewCard: React.FC<SeverityOverviewCardProps> = ({
  counts = { critical: 1, high: 2, medium: 4, low: 8, info: 12 },
}) => {
  const navigate = useNavigate();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

  return (
    <Card variant="metric" padding="lg" style={{ height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} color="var(--color-primary)" />
          <span className="sirius-heading-3" style={{ margin: 0 }}>Open Vulnerabilities</span>
        </div>
        <span className="sirius-numeral-tabular" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {total} Total
        </span>
      </div>

      {/* Horizontal Stacked Distribution Bar */}
      <div
        style={{
          height: '8px',
          width: '100%',
          backgroundColor: 'var(--color-bg-surface-subtle)',
          borderRadius: 'var(--radius-pill)',
          overflow: 'hidden',
          display: 'flex',
          margin: '16px 0 20px 0',
        }}
      >
        {severities.map((sev) => {
          const count = counts[sev] || 0;
          if (count === 0 || total === 0) return null;
          const pct = (count / total) * 100;
          const cfg = SEVERITY_CONFIG[sev];
          return (
            <div
              key={sev}
              title={`${cfg.label}: ${count}`}
              style={{
                width: `${pct}%`,
                backgroundColor: cfg.color,
                transition: 'width var(--transition-normal)',
              }}
            />
          );
        })}
      </div>

      {/* Severity Breakdown List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {severities.map((sev) => {
          const count = counts[sev] || 0;
          return (
            <div
              key={sev}
              onClick={() => navigate(`/findings?severity=${sev}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-surface-elevated)',
                border: '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <SeverityChip severity={sev} variant="compact" />
              <span className="sirius-numeral-tabular" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
