import React from 'react';
import { GlassCard, ProgressBar } from '@sirius/ui';
import { ShieldCheck, CheckCircle2, Clock, RotateCcw } from 'lucide-react';

export interface FixApplyProgressCardProps {
  stage: 'preparing' | 'backup' | 'applying' | 'reverifying' | 'applied' | 'failed';
  message?: string;
  onRunRescan?: () => void;
}

export const FixApplyProgressCard: React.FC<FixApplyProgressCardProps> = ({ stage, message, onRunRescan }) => {
  const getProgress = () => {
    switch (stage) {
      case 'preparing':
        return 20;
      case 'backup':
        return 45;
      case 'applying':
        return 75;
      case 'reverifying':
        return 90;
      case 'applied':
        return 100;
      default:
        return 100;
    }
  };

  const steps = [
    { label: 'Prepare Patch', done: stage !== 'preparing' },
    { label: 'Create Atomic Backup', done: ['applying', 'reverifying', 'applied'].includes(stage) },
    { label: 'Apply Hunk Patch', done: ['reverifying', 'applied'].includes(stage) },
    // No rescan runs automatically here — "done" means the write completed,
    // not that a repository-wide reverification happened. The button below
    // is what actually triggers one.
    { label: 'Write Confirmed', done: stage === 'applied' },
  ];

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-emerald)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} /> SAFE FIX APPLICATION PROGRESS
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-emerald)', fontFamily: 'var(--font-code)' }}>
          {stage.toUpperCase()}
        </span>
      </div>

      <ProgressBar value={getProgress()} max={100} variant="emerald" />


      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        {steps.map((step, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: step.done ? 'var(--color-emerald)' : 'var(--text-secondary)' }}>
            {step.done ? <CheckCircle2 size={13} /> : <Clock size={13} />}
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      {stage === 'applied' && (
        <div style={{ padding: '12px 14px', backgroundColor: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
            {message || 'Patch written to disk. Nothing has re-scanned the project yet — run a verification scan to confirm the finding is actually resolved.'}
          </div>
          {onRunRescan && (
            <button
              onClick={onRunRescan}
              style={{
                backgroundColor: 'var(--color-emerald)',
                color: '#000',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RotateCcw size={12} /> Run Verification Scan
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
};
