import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Finding } from '@sirius/types';
import { Card, SeverityChip, Badge, MoneyTicker } from '@sirius/ui';
import { ShieldAlert, FileCode, ArrowRight } from 'lucide-react';

export interface RecentFindingsPanelProps {
  findings: Finding[];
}

export const RecentFindingsPanel: React.FC<RecentFindingsPanelProps> = ({ findings }) => {
  const navigate = useNavigate();

  return (
    <Card variant="surface" padding="lg">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} color="var(--color-red)" />
          <span className="sirius-heading-3" style={{ margin: 0 }}>Critical & High Findings</span>
        </div>
        <button
          onClick={() => navigate('/findings')}
          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          Explorer <ArrowRight size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {findings.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            No open critical or high findings.
          </div>
        ) : (
          findings.map((fnd) => (
            <div
              key={fnd.id}
              onClick={() => navigate(`/findings?id=${fnd.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: 'var(--color-bg-surface-elevated)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <SeverityChip severity={fnd.severity} variant="compact" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                    {fnd.title}
                  </div>
                  <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <Badge variant="neutral" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                      {fnd.ruleId}
                    </Badge>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--font-code)' }}>
                      <FileCode size={10} color="var(--color-primary)" /> {fnd.filePath}:{fnd.startLine}
                    </span>
                  </div>
                </div>
              </div>

              {fnd.moneyAtRiskUSD ? (
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-code)' }}>
                  <MoneyTicker amountUSD={fnd.moneyAtRiskUSD} durationMs={0} variant="compact" />
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
