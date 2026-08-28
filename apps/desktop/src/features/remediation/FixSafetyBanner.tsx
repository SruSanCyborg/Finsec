import React from 'react';
import { ShieldCheck, AlertOctagon, XCircle } from 'lucide-react';

export interface FixSafetyBannerProps {
  verifierStatus: 'passed' | 'pending' | 'failed' | 'escalated' | 'unavailable';
  isStaleFile?: boolean;
}

export const FixSafetyBanner: React.FC<FixSafetyBannerProps> = ({ verifierStatus, isStaleFile }) => {
  if (isStaleFile) {
    return (
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#F87171',
          fontSize: '12.5px',
          fontWeight: 600,
        }}
      >
        <XCircle size={18} />
        <div>
          <strong>APPLICATION BLOCKED: FILE CHANGED SINCE SCAN.</strong>
          <span style={{ fontWeight: 400, marginLeft: '6px', color: 'var(--text-secondary)' }}>
            The target source file was modified after the scan completed. Re-run scan to refresh patch hunk coordinates.
          </span>
        </div>
      </div>
    );
  }

  if (verifierStatus === 'failed') {
    return (
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(var(--color-red-rgb), 0.12)',
          border: '1px solid rgba(var(--color-red-rgb), 0.4)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'var(--color-red)',
          fontSize: '12.5px',
          fontWeight: 600,
        }}
      >
        <AlertOctagon size={18} />
        <div>
          <strong>APPLICATION BLOCKED: VERIFICATION FAILED.</strong>
          <span style={{ fontWeight: 400, marginLeft: '6px', color: 'var(--color-text-secondary)' }}>
            Automated core verifier detected security policy violations in the proposed patch. Patch application is disabled.
          </span>
        </div>
      </div>
    );
  }

  if (verifierStatus === 'escalated') {
    return (
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#F59E0B',
          fontSize: '12.5px',
          fontWeight: 600,
        }}
      >
        <AlertOctagon size={18} />
        <div>
          <strong>MANUAL REVIEW REQUIRED (ESCALATED).</strong>
          <span style={{ fontWeight: 400, marginLeft: '6px', color: 'var(--text-secondary)' }}>
            Patch touches critical security boundaries. Senior security engineer approval required before application.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: 'rgba(74, 222, 128, 0.12)',
        border: '1px solid rgba(74, 222, 128, 0.3)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: 'var(--color-emerald)',
        fontSize: '12.5px',
        fontWeight: 600,
      }}
    >
      <ShieldCheck size={18} />
      <div>
        <strong>HUMAN APPROVAL REQUIRED.</strong>
        <span style={{ fontWeight: 400, marginLeft: '6px', color: 'var(--text-primary)' }}>
          Nothing changes until you explicitly approve the core-verified patch. Atomic backup copy will be generated prior to mutation.
        </span>
      </div>
    </div>
  );
};
