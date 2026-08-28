import React, { useState } from 'react';
import { GlassModal, Button } from '@sirius/ui';
import { GitBranch, Layers } from 'lucide-react';

export interface CreateBaselineDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: { projectId: string; scanId: string; branch: string }) => Promise<void>;
  scanId?: string;
  projectId?: string;
  findingCount?: number;
}

export const CreateBaselineDialog: React.FC<CreateBaselineDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  scanId,
  projectId,
  findingCount,
}) => {
  const [branch, setBranch] = useState('main');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanId) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ projectId: projectId ?? '', scanId, branch });
      onClose();
    } catch {
      // Handled
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Reference Baseline"
      maxWidth="500px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <GitBranch size={18} color="var(--color-cyan)" />
          <span>Capture the current scan as an authoritative comparison baseline for future scan runs.</span>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
          <div className="sirius-caption">TARGET SCAN FOR BASELINE CAPTURE</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {scanId ? (
              <>
                <Layers size={14} color="var(--color-cyan)" /> Scan {scanId} ({findingCount ?? 0} Findings)
              </>
            ) : (
              'No completed scan yet — run one first.'
            )}
          </div>
        </div>

        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>TARGET REPOSITORY BRANCH</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="e.g. main"
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gradient" type="submit" isLoading={isSubmitting} disabled={!scanId}>
            Capture Baseline
          </Button>
        </div>
      </form>
    </GlassModal>
  );
};
