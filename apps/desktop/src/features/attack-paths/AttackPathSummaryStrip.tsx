import React from 'react';
import { GlassCard } from '@sirius/ui';
import { GitCommit, ShieldAlert, Shield, Database, KeyRound } from 'lucide-react';

export interface AttackPathSummaryStripProps {
  totalPaths: number;
  criticalCount: number;
  highCount: number;
  affectedAssetsCount: number;
  entryPointsCount: number;
  selectedSeverityFilter?: string | null;
  onSelectFilter?: (severity: string | null) => void;
}

export const AttackPathSummaryStrip: React.FC<AttackPathSummaryStripProps> = ({
  totalPaths,
  criticalCount,
  highCount,
  affectedAssetsCount,
  entryPointsCount,
  selectedSeverityFilter,
  onSelectFilter,
}) => {
  return (
    <GlassCard padding="md" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {/* Total Paths */}
        <div
          onClick={() => onSelectFilter && onSelectFilter(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            opacity: selectedSeverityFilter === null ? 1 : 0.7,
          }}
        >
          <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-soft)', border: '1px solid rgba(14, 107, 74, 0.2)' }}>
            <GitCommit size={18} color="var(--color-primary)" />
          </div>
          <div>
            <div className="sirius-caption">TOTAL PATHS</div>
            <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '18px', fontWeight: 700 }}>
              {totalPaths}
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-hairline)' }} />

        {/* Critical Paths */}
        <div
          onClick={() => onSelectFilter && onSelectFilter('critical')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            opacity: selectedSeverityFilter === 'critical' ? 1 : 0.7,
          }}
        >
          <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(var(--color-red-rgb), 0.12)', border: '1px solid rgba(var(--color-red-rgb), 0.3)' }}>
            <ShieldAlert size={18} color="var(--color-red)" />
          </div>
          <div>
            <div className="sirius-caption">CRITICAL PATHS</div>
            <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-red)' }}>
              {criticalCount}
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-hairline)' }} />

        {/* High Risk Paths */}
        <div
          onClick={() => onSelectFilter && onSelectFilter('high')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            opacity: selectedSeverityFilter === 'high' ? 1 : 0.7,
          }}
        >
          <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(var(--color-amber-rgb), 0.12)', border: '1px solid rgba(var(--color-amber-rgb), 0.3)' }}>
            <Shield size={18} color="var(--color-amber)" />
          </div>
          <div>
            <div className="sirius-caption">HIGH RISK</div>
            <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-amber)' }}>
              {highCount}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {/* Entry Points */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <KeyRound size={16} color="var(--color-primary)" />
          <div>
            <div className="sirius-caption">ENTRY POINTS</div>
            <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '15px', fontWeight: 600 }}>
              {entryPointsCount} Entry Points
            </div>
          </div>
        </div>

        {/* Affected Target Assets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={16} color="var(--color-emerald)" />
          <div>
            <div className="sirius-caption">TARGET ASSETS</div>
            <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '15px', fontWeight: 600 }}>
              {affectedAssetsCount} High-Value Assets
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
