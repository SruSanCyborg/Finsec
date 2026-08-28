import React from 'react';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export interface VerificationStatusCardProps {
  status: 'passed' | 'pending' | 'failed' | 'escalated' | 'unavailable';
}

export const VerificationStatusCard: React.FC<VerificationStatusCardProps> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'passed':
        return {
          icon: <CheckCircle2 size={16} color="var(--color-emerald)" />,
          title: 'REMEDIATION VERIFIED BY CORE SCANNER',
          desc: 'Remediation steps validated against finsec-lint rules. Proposed fix resolves root cause without introducing regressions.',
          color: 'var(--color-emerald)',
          bg: 'rgba(74, 222, 128, 0.1)',
          border: 'rgba(74, 222, 128, 0.3)',
        };
      case 'escalated':
        return {
          icon: <AlertCircle size={16} color="var(--color-amber)" />,
          title: 'MANUAL REVIEW REQUIRED (ESCALATED)',
          desc: 'Automated verifier detected non-standard code dependencies. Human security review required before application.',
          color: 'var(--color-amber)',
          bg: 'rgba(var(--color-amber-rgb), 0.1)',
          border: 'rgba(var(--color-amber-rgb), 0.3)',
        };
      case 'failed':
        return {
          icon: <XCircle size={16} color="var(--color-red)" />,
          title: 'VERIFICATION FAILED',
          desc: 'Proposed fix does not resolve finding or violates secondary policy controls.',
          color: 'var(--color-red)',
          bg: 'rgba(var(--color-red-rgb), 0.1)',
          border: 'rgba(var(--color-red-rgb), 0.3)',
        };

      default:
        return {
          icon: <AlertCircle size={16} color="var(--color-primary)" />,
          title: 'VERIFICATION REQUIRED ON DEPLOYMENT',
          desc: 'Re-run scanner pipeline after applying proposal to confirm zero policy violations.',
          color: 'var(--color-primary)',
          bg: 'var(--color-primary-soft)',
          border: 'rgba(14, 107, 74, 0.3)',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      style={{
        padding: '10px 14px',
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 'var(--radius-md)',
        marginTop: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
      }}
    >
      <div style={{ marginTop: '2px' }}>{config.icon}</div>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: config.color, letterSpacing: '0.05em' }}>
          {config.title}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>
          {config.desc}
        </div>
      </div>
    </div>
  );
};
