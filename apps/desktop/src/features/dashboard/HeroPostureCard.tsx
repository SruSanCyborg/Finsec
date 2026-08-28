import React from 'react';
import { HeroCard, PostureScoreRing, StatusChip } from '@sirius/ui';
import { ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';

export interface HeroPostureCardProps {
  score: number;
  maxScore?: number;
  projectName?: string;
  lastScanTime?: string;
  criticalCount?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const HeroPostureCard: React.FC<HeroPostureCardProps> = ({
  score = 94,
  maxScore = 100,
  projectName = 'finsec-core-gateway',
  lastScanTime = 'Just now',
  criticalCount = 1,
  style,
  className = '',
}) => {
  const getPostureSummary = () => {
    if (score >= 90) {
      return criticalCount > 0
        ? `Strong posture — ${criticalCount} critical finding requires immediate remediation.`
        : 'Optimal security posture — all primary controls passing.';
    } else if (score >= 70) {
      return `Moderate posture — ${criticalCount} critical & high severity issues require attention.`;
    }
    return `Elevated risk posture — multiple security policy violations detected.`;
  };

  return (
    <HeroCard
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '24px',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      className={`sirius-hero-posture-card ${className}`}
    >
      {/* Left Column: Posture Statement & Large Metric */}
      <div style={{ flex: '1 1 340px', minWidth: '280px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={18} />
          </div>
          <span
            className="sirius-label"
            style={{ color: 'var(--color-primary)', fontSize: '11px', letterSpacing: '0.08em' }}
          >
            SECURITY POSTURE SCORE
          </span>
          <StatusChip status="VERIFIED" size="sm" />
        </div>

        {/* Large Metric Display */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
          <span
            className="sirius-display-xl sirius-numeral-tabular"
            style={{
              fontSize: '52px',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {score}
          </span>
          <span
            className="sirius-heading-2 sirius-numeral-tabular"
            style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}
          >
            / {maxScore}
          </span>
        </div>

        {/* Supporting Posture Summary Statement */}
        <div className="sirius-body" style={{ color: 'var(--color-text-secondary)', marginBottom: '16px', maxWidth: '480px' }}>
          {getPostureSummary()}
        </div>

        {/* Metadata Footer */}
        <div
          className="sirius-caption"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: 'var(--color-text-muted)',
            fontSize: '12px',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={13} color="var(--color-primary)" /> Target: {projectName}
          </span>
          <span>•</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={13} /> Last Scan: {lastScanTime}
          </span>
        </div>
      </div>

      {/* Right Column: Radial Posture Score Ring Visualization */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-small)',
        }}
      >
        <PostureScoreRing score={score} max={maxScore} size={136} strokeWidth={11} delta={+2.4} />
      </div>
    </HeroCard>
  );
};
