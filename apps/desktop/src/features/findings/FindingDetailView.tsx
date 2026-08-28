import React, { useState } from 'react';
import { Finding } from '@sirius/types';
import { Card, Badge, Button, MoneyTicker, StatusChip, InspectorCard } from '@sirius/ui';
import { SourceCodeViewer } from './SourceCodeViewer';
import { ShieldCheck, ShieldAlert, Cpu, AlertTriangle, History, DollarSign, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useTriageFindingMutation, useCreateSuppressionMutation } from '../../api/queries';
import { CreateSuppressionDialog } from '../governance/CreateSuppressionDialog';

export interface FindingDetailViewProps {
  finding: Finding | null;
  currentIndex?: number;
  totalCount?: number;
  onPrevious?: () => void;
  onNext?: () => void;
}

export const FindingDetailView: React.FC<FindingDetailViewProps> = ({
  finding,
  currentIndex = 0,
  totalCount = 0,
  onPrevious,
  onNext,
}) => {
  const triageMutation = useTriageFindingMutation();
  const createSuppressionMutation = useCreateSuppressionMutation();

  const [isSuppressionDialogOpen, setIsSuppressionDialogOpen] = useState(false);
  const [triageActionState, setTriageActionState] = useState<string | null>(null);

  if (!finding) {
    return (
      <Card padding="xl" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <ShieldAlert size={48} color="var(--color-primary)" style={{ marginBottom: '16px', opacity: 0.8 }} />
          <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            No Security Finding Selected
          </h3>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text-secondary)', maxWidth: '360px', lineHeight: 1.5 }}>
            Select a finding from the left inventory list to inspect code evidence, financial exposure, and triage actions.
          </p>
        </div>
      </Card>
    );
  }

  const handleResolve = async () => {
    setTriageActionState('Resolving finding...');
    try {
      await triageMutation.mutateAsync({ scanId: finding.scanId, findingId: finding.id, status: 'fixed', reasonText: 'Resolved by engineer.' });
    } catch {
      // Handled
    } finally {
      setTriageActionState(null);
    }
  };

  const handleAcceptRisk = async () => {
    if (confirm('ACCEPT SECURITY RISK?\n\nThis finding will remain visible but will no longer be treated as an unreviewed risk according to policy.')) {
      setTriageActionState('Updating risk status...');
      try {
        await triageMutation.mutateAsync({ scanId: finding.scanId, findingId: finding.id, status: 'ignored', reasonText: 'Accepted risk by security team.' });
      } catch {
        // Handled
      } finally {
        setTriageActionState(null);
      }
    }
  };

  const handleReopen = async () => {
    setTriageActionState('Reopening finding...');
    try {
      await triageMutation.mutateAsync({ scanId: finding.scanId, findingId: finding.id, status: 'open', reasonText: 'Reopened by engineer.' });
    } catch {
      // Handled
    } finally {
      setTriageActionState(null);
    }
  };

  return (
    <Card padding="xl" style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Pagination & Header */}
      <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '13px' }}>
              {finding.id}
            </span>
            <StatusChip status={finding.severity} size="sm" />
            <Badge variant={finding.status === 'open' ? 'violet' : finding.status === 'fixed' ? 'emerald' : 'neutral'} size="sm">
              {finding.status.toUpperCase()}
            </Badge>
            {finding.baselineState && (
              <Badge variant={finding.baselineState === 'new' ? 'violet' : 'neutral'} size="sm">
                {finding.baselineState.toUpperCase()}
              </Badge>
            )}
          </div>

          {/* Navigation & Triage Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {totalCount > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-bg-surface-subtle)', padding: '3px 8px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--color-border)' }}>
                <button
                  onClick={onPrevious}
                  disabled={currentIndex === 0}
                  style={{ background: 'none', border: 'none', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', color: 'var(--color-text-secondary)', padding: '2px', opacity: currentIndex === 0 ? 0.4 : 1, display: 'flex' }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="sirius-numeral-tabular" style={{ fontSize: '12px', padding: '0 4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  {currentIndex + 1} / {totalCount}
                </span>
                <button
                  onClick={onNext}
                  disabled={currentIndex === totalCount - 1}
                  style={{ background: 'none', border: 'none', cursor: currentIndex === totalCount - 1 ? 'not-allowed' : 'pointer', color: 'var(--color-text-secondary)', padding: '2px', opacity: currentIndex === totalCount - 1 ? 0.4 : 1, display: 'flex' }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Triage Menu Buttons */}
            {finding.status === 'open' ? (
              <>
                <Button variant="secondary" size="sm" onClick={handleResolve} disabled={Boolean(triageActionState)}>
                  Resolve Finding
                </Button>
                <Button variant="ghost" size="sm" onClick={handleAcceptRisk} disabled={Boolean(triageActionState)}>
                  Accept Risk
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setIsSuppressionDialogOpen(true)}>
                  Suppress
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleReopen} disabled={Boolean(triageActionState)}>
                Reopen
              </Button>
            )}
          </div>
        </div>

        {triageActionState && (
          <div style={{ fontSize: '12px', color: 'var(--color-primary)', marginTop: '4px' }}>
            {triageActionState}
          </div>
        )}

        <h2 style={{ margin: '8px 0 6px 0', fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.35, letterSpacing: '-0.01em' }}>
          {finding.title}
        </h2>

        <div style={{ fontFamily: 'var(--font-code)', fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
          {`${finding.filePath}:${finding.startLine}-${finding.endLine}`}
        </div>
      </div>

      {/* Active Governance Suppression Banner */}
      {finding.suppressionStatus === 'active' && (
        <div style={{ backgroundColor: 'var(--color-primary-soft)', padding: '14px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary-deep)', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.04em' }}>
              <ShieldAlert size={15} /> ACTIVE GOVERNANCE SUPPRESSION
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--color-text-primary)' }}>
              Matches active suppression policy. Hidden from gate blocks but retained for compliance audit trails.
            </p>
          </div>
          {finding.suppressionId && (
            <a
              href={`/suppressions?id=${finding.suppressionId}`}
              style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary-deep)', textDecoration: 'underline' }}
            >
              View Policy
            </a>
          )}
        </div>
      )}

      {/* Accepted Risk Banner */}
      {finding.status === 'ignored' && (
        <div style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: '14px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={15} /> ACCEPTED SECURITY RISK
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--color-text-primary)' }}>
            {finding.acceptedRiskReason || 'Risk accepted by security engineering team.'}
          </p>
        </div>
      )}

      {/* Technical Rationale */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} color="var(--color-amber)" /> Technical Risk & Rationale
        </div>
        <div style={{ fontSize: '13.5px', color: 'var(--color-text-primary)', lineHeight: 1.6, backgroundColor: 'var(--color-bg-surface-subtle)', padding: '14px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)' }}>
          {finding.description}
        </div>
      </div>

      {/* Metadata Split Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <InspectorCard style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={13} color="var(--color-primary)" /> Governance Status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <div>
              <span style={{ color: 'var(--color-text-muted)' }}>Baseline State: </span>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{finding.baselineState ? finding.baselineState.toUpperCase() : 'NEW'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)' }}>Suppression: </span>
              <span style={{ fontWeight: 700, color: finding.suppressionStatus === 'active' ? 'var(--color-primary-deep)' : 'var(--color-text-primary)' }}>
                {finding.suppressionStatus ? finding.suppressionStatus.toUpperCase() : 'NONE'}
              </span>
            </div>
          </div>
        </InspectorCard>

        <InspectorCard style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DollarSign size={13} color="var(--color-primary)" /> Financial Exposure
          </div>
          <MoneyTicker amountUSD={finding.moneyAtRiskUSD ?? 0} durationMs={0} variant="compact" />
        </InspectorCard>
      </div>

      {/* Code Snippet Evidence Panel */}
      {finding.codeSnippet && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
            Source Code Evidence Location
          </div>
          <SourceCodeViewer filePath={finding.filePath} startLine={finding.startLine} codeSnippet={finding.codeSnippet} />
        </div>
      )}

      {/* Audit History Timeline */}
      {finding.triageHistory && finding.triageHistory.length > 0 && (
        <InspectorCard style={{ padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={15} color="var(--color-primary)" /> Triage Audit History
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {finding.triageHistory.map((entry) => (
              <div key={entry.id} style={{ fontSize: '12.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '8px' }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary-deep)' }}>{entry.action.toUpperCase()}</span> by {entry.actor}
                  {entry.notes && <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{entry.notes}</div>}
                </div>
                <div style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)', fontSize: '11px' }}>
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </InspectorCard>
      )}

      {/* Action Footer */}
      <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
        <a
          href={`/cerebus?finding=${finding.id}`}
          style={{ textDecoration: 'none', flex: 1, display: 'flex' }}
        >
          <Button
            variant="primary"
            leftIcon={<Cpu size={15} />}
            style={{ width: '100%' }}
          >
            Analyze with Cerebus AI
          </Button>
        </a>
        <a
          href={`/findings/${finding.id}/remediation`}
          style={{ textDecoration: 'none', flex: 1, display: 'flex' }}
        >
          <Button
            variant="secondary"
            leftIcon={<CheckCircle2 size={15} />}
            style={{ width: '100%' }}
          >
            Review Fix Proposal
          </Button>
        </a>
      </div>

      {/* Suppression Dialog */}
      <CreateSuppressionDialog
        isOpen={isSuppressionDialogOpen}
        onClose={() => setIsSuppressionDialogOpen(false)}
        initialRuleId={finding.ruleId}
        initialFindingId={finding.id}
        onSubmit={async (params) => {
          await createSuppressionMutation.mutateAsync({
            ...params,
            projectId: finding.projectId,
          });
        }}
      />
    </Card>
  );
};
