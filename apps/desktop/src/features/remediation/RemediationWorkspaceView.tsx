import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFindingsQuery, useFixProposalQuery, useApplyFixMutation } from '../../api/queries';
import { StatusPulse, SeverityChip, Badge, GradientButton, Button, LoadingState, ErrorState } from '@sirius/ui';
import { FixSafetyBanner } from './FixSafetyBanner';
import { DiffReviewer } from './DiffReviewer';
import { FixVerificationPanel } from './FixVerificationPanel';
import { FixApprovalModal } from './FixApprovalModal';
import { FixApplyProgressCard } from './FixApplyProgressCard';
import { ShieldCheck, ArrowLeft, XCircle, RotateCcw, Cpu } from 'lucide-react';

export const RemediationWorkspaceView: React.FC = () => {
  const { findingId: paramFindingId } = useParams<{ findingId: string }>();
  const navigate = useNavigate();

  const { data: findings = [] } = useFindingsQuery();
  const targetFinding = findings.find((f) => f.id === paramFindingId) || findings[0];

  const { data: fixProposal, isLoading: isLoadingProposal, isError, refetch } = useFixProposalQuery({
    scanId: targetFinding?.scanId,
    findingId: targetFinding?.id,
    projectId: targetFinding?.projectId,
    finding: targetFinding,
  });
  const applyFixMutation = useApplyFixMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [applyStage, setApplyStage] = useState<'none' | 'preparing' | 'backup' | 'applying' | 'reverifying' | 'applied' | 'failed'>('none');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  if (isLoadingProposal) {
    return <LoadingState label="Retrieving fix proposal and running core verifier security checks..." />;
  }

  if (isError || !fixProposal) {
    return <ErrorState title="Failed to Load Resource" description="Failed to load remediation proposal from core verifier." onRetry={() => refetch()} />;
  }


  const isBlocked = fixProposal.verifierStatus !== 'passed' || fixProposal.isStaleFile;

  const handleApplyClick = () => {
    if (isBlocked) return;
    setIsModalOpen(true);
  };

  const handleConfirmApply = () => {
    setIsModalOpen(false);
    setApplyStage('preparing');

    setTimeout(() => setApplyStage('backup'), 300);
    setTimeout(() => setApplyStage('applying'), 600);
    setTimeout(() => setApplyStage('reverifying'), 900);

    setTimeout(() => {
      applyFixMutation.mutate(
        { scanId: targetFinding.scanId, findingId: targetFinding.id, projectId: targetFinding.projectId, finding: targetFinding },
        {
          onSuccess: () => setApplyStage('applied'),
          onError: () => setApplyStage('failed'),
        },
      );
    }, 1200);
  };

  // There is no server-side "reject a fix proposal" — the fix was never
  // written, so there is nothing to undo. Declining it is local UI state, not
  // an action the daemon needs to record; a finding someone actually wants
  // dismissed goes through triage instead.
  const handleReject = () => {
    setRejectionReason('Proposal declined. It was never written to disk — there is nothing to revert.');
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate(`/findings?selected=${targetFinding.id}`)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}
          >
            <ArrowLeft size={16} /> Back to Finding
          </button>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-emerald)', textTransform: 'uppercase', marginBottom: '2px' }}>
              REMEDIATION
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
                Remediation Workspace
              </h1>
              <StatusPulse
                status={fixProposal.verifierStatus === 'passed' ? 'Success' : 'Error'}
                label={fixProposal.verifierStatus.toUpperCase()}
              />
            </div>
            <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <SeverityChip severity={targetFinding.severity} variant="compact" />
              <Badge variant="cyan" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                {targetFinding.ruleId}
              </Badge>
              <strong style={{ color: 'var(--text-primary)' }}>{targetFinding.title}</strong>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button variant="ghost" size="sm" leftIcon={<Cpu size={14} />} onClick={() => navigate(`/cerebus?finding=${targetFinding.id}`)}>
            Ask Cerebus
          </Button>
          {rejectionReason ? (
            <Badge variant="violet" size="md">
              REJECTED
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" leftIcon={<XCircle size={14} />} onClick={handleReject}>
              Reject Proposal
            </Button>
          )}
          <GradientButton
            onClick={handleApplyClick}
            disabled={isBlocked || applyStage !== 'none'}
            leftIcon={<ShieldCheck size={16} />}
          >
            {applyStage === 'applied' ? 'Fix Applied' : 'Approve & Apply Fix'}
          </GradientButton>
        </div>
      </div>

      {/* Safety Banner */}
      <FixSafetyBanner verifierStatus={fixProposal.verifierStatus} isStaleFile={fixProposal.isStaleFile} />

      {/* Progress Tracker when applying */}
      {applyStage !== 'none' && (
        <FixApplyProgressCard
          stage={applyStage}
          onRunRescan={() => navigate(`/scans/new`)}
        />
      )}

      {/* Workspace Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left Diff Reviewer */}
        <DiffReviewer
          filePath={fixProposal.diff.filePath}
          oldCode={fixProposal.diff.oldCode}
          newCode={fixProposal.diff.newCode}
          additionsCount={fixProposal.diff.additionsCount}
          deletionsCount={fixProposal.diff.deletionsCount}
        />

        {/* Right Verification & Instructions Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <FixVerificationPanel checks={fixProposal.verificationChecks} verifierStatus={fixProposal.verifierStatus} />

          {/* Steps List */}
          <div style={{ padding: '16px', backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RotateCcw size={14} /> REMEDIATION STEPS
            </div>
            <ol style={{ margin: '0 0 0 16px', padding: 0, fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {fixProposal.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <FixApprovalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmApply}
        filePath={fixProposal.diff.filePath}
        ruleId={targetFinding.ruleId}
        isApplying={applyFixMutation.isPending}
      />
    </div>
  );
};
