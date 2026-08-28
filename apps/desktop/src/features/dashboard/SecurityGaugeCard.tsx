import React from 'react';
import { ShieldCheck, Activity } from 'lucide-react';

export interface SecurityGaugeCardProps {
  score?: number;
  maxScore?: number;
}

export const SecurityGaugeCard: React.FC<SecurityGaugeCardProps> = ({
  score = 94,
  maxScore = 100,
}) => {
  const percentage = Math.min(Math.max((score / maxScore) * 100, 0), 100);
  const strokeDasharray = 251.2; // 2 * pi * 40
  const strokeDashoffset = strokeDasharray - (strokeDasharray * percentage) / 100;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-primary-deep)',
        color: '#FFFFFF',
        padding: '20px 22px',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: 'var(--shadow-medium)',
        position: 'relative',
        overflow: 'hidden',
      }}
      className="sirius-security-gauge-card sirius-hover-lift"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="#10B981" />
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.9 }}>
            Compliance Posture
          </span>
        </div>
        <span style={{ fontSize: '11px', backgroundColor: 'rgba(255, 255, 255, 0.15)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
          VERIFIED
        </span>
      </div>

      {/* Center Gauge Arc */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '12px 0 6px 0' }}>
        <div style={{ position: 'relative', width: '130px', height: '80px', display: 'flex', justifyContent: 'center' }}>
          <svg width="130" height="80" viewBox="0 0 100 60">
            {/* Background Arc Track */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Active Gauge Fill */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="#10B981"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
            />
          </svg>
          <div style={{ position: 'absolute', bottom: '0', textAlign: 'center' }}>
            <span className="sirius-numeral-tabular" style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1 }}>
              {score}%
            </span>
          </div>
        </div>
        <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px', fontWeight: 500 }}>
          Optimal Control Alignment
        </div>
      </div>

      {/* Bottom Status Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', fontSize: '11px', fontWeight: 600, borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} /> Passed: 18
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#FBBF24' }} /> Partial: 2
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
          <Activity size={12} color="#10B981" /> Active
        </span>
      </div>
    </div>
  );
};
