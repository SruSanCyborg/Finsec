import React from 'react';
import { GlassModal, Button, GradientButton } from '@sirius/ui';
import { ShieldCheck, FileCode, CheckCircle2 } from 'lucide-react';

export interface FixApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  filePath: string;
  ruleId: string;
  isApplying?: boolean;
}

export const FixApprovalModal: React.FC<FixApprovalModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  filePath,
  ruleId,
  isApplying = false,
}) => {
  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Approve & Apply Verified Fix">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', backgroundColor: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 'var(--radius-md)' }}>
          <ShieldCheck size={20} color="var(--color-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            You are about to apply a core-verified security patch to target file:
            <div style={{ fontFamily: 'var(--font-code)', color: 'var(--color-cyan)', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileCode size={14} /> {filePath}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} color="var(--color-emerald)" />
            <span>Remediates rule <strong>{ruleId}</strong> with 0 static violations.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} color="var(--color-emerald)" />
            <span>Atomic backup created at <code>.sirius/backups/</code> before write.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} color="var(--color-emerald)" />
            <span>Repository will be automatically re-verified post-application.</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <Button variant="ghost" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <GradientButton onClick={onConfirm} isLoading={isApplying} disabled={isApplying} leftIcon={<ShieldCheck size={16} />}>
            Approve & Apply Fix
          </GradientButton>
        </div>
      </div>
    </GlassModal>
  );
};
