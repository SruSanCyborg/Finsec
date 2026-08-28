import React from 'react';
import { ComplianceFramework } from '@sirius/types';
import { GlassCard, Badge } from '@sirius/ui';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

export interface ComplianceFrameworkCardsProps {
  frameworks: ComplianceFramework[];
  selectedFrameworkId?: string | null;
  onSelectFramework: (framework: ComplianceFramework) => void;
}

export const ComplianceFrameworkCards: React.FC<ComplianceFrameworkCardsProps> = ({
  frameworks,
  selectedFrameworkId,
  onSelectFramework,
}) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
      {frameworks.map((fw) => {
        const isSelected = selectedFrameworkId === fw.id;

        return (
          <GlassCard
            key={fw.id}
            padding="md"
            onClick={() => onSelectFramework(fw)}
            style={{
              cursor: 'pointer',
              border: isSelected ? '1px solid var(--color-cyan)' : '1px solid var(--border-hairline)',
              backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-surface)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color={isSelected ? 'var(--color-cyan)' : 'var(--text-dim)'} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fw.name}
                </span>
              </div>
              <Badge variant={fw.failedCount === 0 ? 'emerald' : 'violet'} size="sm">
                v{fw.version}
              </Badge>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '12px' }}>
              <div>
                <div className="sirius-caption">FRAMEWORK SCORE</div>
                <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '22px', fontWeight: 800 }}>
                  {fw.overallScore}%
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                {fw.failedCount > 0 ? (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-red)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldAlert size={13} /> {fw.failedCount} Gaps
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-emerald)' }}>
                    ✓ 0 Gaps
                  </div>
                )}
                <div className="sirius-caption" style={{ marginTop: '2px' }}>
                  {fw.passedCount}/{fw.totalCount} Passed
                </div>
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
};
