import React, { useState } from 'react';
import { GlassModal, Input, Button } from '@sirius/ui';
import { ShieldAlert, FileText } from 'lucide-react';
import { Suppression } from '@sirius/types';

export interface CreateSuppressionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: {
    ruleId: string;
    scope: 'project' | 'rule' | 'path';
    reason: Suppression['reason'];
    reasonText?: string;
    expiresInDays?: number;
    affectedFindingIds?: string[];
  }) => Promise<void>;
  initialRuleId?: string;
  initialFindingId?: string;
}

export const CreateSuppressionDialog: React.FC<CreateSuppressionDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialRuleId = 'FIN-SEC-001',
  initialFindingId,
}) => {
  const [ruleId, setRuleId] = useState(initialRuleId);
  const [scope, setScope] = useState<'project' | 'rule' | 'path'>('project');
  const [reason, setReason] = useState<Suppression['reason']>('accepted_risk');
  const [reasonText, setReasonText] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        ruleId,
        scope,
        reason,
        reasonText,
        expiresInDays,
        affectedFindingIds: initialFindingId ? [initialFindingId] : [],
      });
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
      title="Create Finding Suppression Policy"
      maxWidth="540px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <ShieldAlert size={18} color="var(--color-cyan)" />
          <span>Suppress matching findings according to policy without deleting underlying evidence.</span>
        </div>

        {/* Rule ID */}
        <Input
          label="Rule ID to Suppress"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
          placeholder="e.g. FIN-SEC-001"
          required
          leftIcon={<FileText size={14} />}
        />

        {/* Scope Selector */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>SUPPRESSION SCOPE</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="button"
              variant={scope === 'project' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('project')}
              style={{ flex: 1 }}
            >
              Project Wide
            </Button>
            <Button
              type="button"
              variant={scope === 'rule' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('rule')}
              style={{ flex: 1 }}
            >
              Rule Specific
            </Button>
            <Button
              type="button"
              variant={scope === 'path' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('path')}
              style={{ flex: 1 }}
            >
              File Path
            </Button>
          </div>
        </div>

        {/* Reason Selector */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>GOVERNANCE REASON</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as Suppression['reason'])}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          >
            <option value="accepted_risk">Accepted Security Risk</option>
            <option value="false_positive">False Positive Result</option>
            <option value="compensating_control">Compensating Control in Place</option>
            <option value="not_applicable">Not Applicable to Environment</option>
            <option value="temporary_exception">Temporary Policy Exception</option>
          </select>
        </div>

        {/* Reason Description */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>JUSTIFICATION & AUDIT NOTES</label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Explain why this suppression is required for audit history..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontFamily: 'var(--font-body)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Expiration Days */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>EXPIRATION DURATION (DAYS)</label>
          <input
            type="number"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
            min={1}
            max={365}
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

        {/* Dialog Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gradient" type="submit" isLoading={isSubmitting}>
            Create Suppression Policy
          </Button>
        </div>
      </form>
    </GlassModal>
  );
};
