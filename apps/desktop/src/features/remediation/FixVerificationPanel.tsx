import React from 'react';
import { FixVerificationCheck } from '@sirius/types';
import { GlassCard } from '@sirius/ui';
import { ShieldCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';

export interface FixVerificationPanelProps {
  checks: FixVerificationCheck[];
  verifierStatus: 'passed' | 'pending' | 'failed' | 'escalated' | 'unavailable';
}

export const FixVerificationPanel: React.FC<FixVerificationPanelProps> = ({ checks, verifierStatus }) => {
  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-cyan)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} /> CORE VERIFIER SECURITY CHECKS
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: verifierStatus === 'passed' ? 'var(--color-emerald)' : '#F87171',
            fontFamily: 'var(--font-code)',
          }}
        >
          STATUS: {verifierStatus.toUpperCase()}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {checks.map((check, idx) => (
          <div
            key={idx}
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {check.status === 'pass' && <CheckCircle2 size={16} color="var(--color-emerald)" />}
              {check.status === 'fail' && <XCircle size={16} color="#F87171" />}
              {check.status === 'pending' && <Clock size={16} color="var(--color-cyan)" />}
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {check.name}
                </div>
                {check.message && (
                  <div className="sirius-caption" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {check.message}
                  </div>
                )}
              </div>
            </div>

            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'var(--font-code)',
                color: check.status === 'pass' ? 'var(--color-emerald)' : '#F87171',
              }}
            >
              {check.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
