import React from 'react';
import { GlassCard, ScoreRing, Badge } from '@sirius/ui';
import { ShieldCheck, TrendingUp, AlertTriangle } from 'lucide-react';

export interface ComplianceHeroScoreProps {
  score: number;
  trend?: 'improving' | 'stable' | 'declining';
  evaluatedCount: number;
  passingCount: number;
  failingCount: number;
  partialCount: number;
  executiveNarrative?: string;
}

export const ComplianceHeroScore: React.FC<ComplianceHeroScoreProps> = ({
  score,
  trend = 'stable',
  evaluatedCount,
  passingCount,
  failingCount,
  partialCount,
  executiveNarrative,
}) => {
  return (
    <GlassCard padding="lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px', flexWrap: 'wrap' }}>
      {/* Left: Score Ring */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <ScoreRing score={score} size={110} strokeWidth={10} />
        <div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Badge variant="cyan" size="sm">
              BACKEND AUTHORITATIVE SCORE
            </Badge>
            {trend === 'improving' ? (
              <span style={{ fontSize: '11px', color: 'var(--color-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingUp size={13} /> IMPROVING
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--color-cyan)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={13} /> STABLE POSTURE
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span className="sirius-display sirius-numeral-tabular" style={{ fontSize: '42px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {score.toFixed(1)}
            </span>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-dim)' }}>
              / 100
            </span>
          </div>

          <div className="sirius-caption" style={{ marginTop: '2px' }}>
            SECURITY & COMPLIANCE HEALTH POSTURE
          </div>
        </div>
      </div>

      {/* Center: Controls Breakdown */}
      <div style={{ display: 'flex', gap: '24px', backgroundColor: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
        <div>
          <div className="sirius-caption">EVALUATED</div>
          <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>
            {evaluatedCount}
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-hairline)' }} />

        <div>
          <div className="sirius-caption" style={{ color: 'var(--color-emerald)' }}>PASSING</div>
          <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-emerald)', marginTop: '2px' }}>
            {passingCount}
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-hairline)' }} />

        <div>
          <div className="sirius-caption" style={{ color: 'var(--color-red)' }}>FAILING</div>
          <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-red)', marginTop: '2px' }}>
            {failingCount}
          </div>
        </div>

        {partialCount > 0 && (
          <>
            <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-hairline)' }} />

            <div>
              <div className="sirius-caption" style={{ color: 'var(--color-cyan)' }}>PARTIAL</div>
              <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-cyan)', marginTop: '2px' }}>
                {partialCount}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right: Executive Narrative Statement */}
      {executiveNarrative && (
        <div style={{ flex: 1, minWidth: '280px', backgroundColor: 'rgba(56, 189, 248, 0.06)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <AlertTriangle size={13} /> EXECUTIVE POSTURE SUMMARY
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            "{executiveNarrative}"
          </div>
        </div>
      )}
    </GlassCard>
  );
};
