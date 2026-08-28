import React from 'react';
import { ComplianceControl } from '@sirius/types';
import { GlassCard, Badge, Button } from '@sirius/ui';
import { ShieldCheck, FileText, Cpu, ArrowRight, Layers } from 'lucide-react';


export interface ComplianceControlInspectorProps {
  control: ComplianceControl | null;
  onNavigateToFinding?: (findingId: string) => void;
  onNavigateToCerebus?: (controlId: string, findingId?: string) => void;
  onNavigateToRemediation?: (findingId: string) => void;
}

export const ComplianceControlInspector: React.FC<ComplianceControlInspectorProps> = ({
  control,
  onNavigateToFinding,
  onNavigateToCerebus,
  onNavigateToRemediation,
}) => {
  if (!control) {
    return (
      <GlassCard padding="lg" style={{ width: '360px', flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <ShieldCheck size={36} color="var(--color-cyan)" style={{ marginBottom: '10px', opacity: 0.7 }} />
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
            No Control Selected
          </div>
          <div className="sirius-caption">
            Select a compliance control row to view requirement details, evidence provenance, and affected findings.
          </div>
        </div>
      </GlassCard>
    );
  }

  const primaryFindingId = control.affectedFindingIds[0];

  return (
    <GlassCard padding="lg" style={{ width: '360px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-cyan)', letterSpacing: '0.05em', fontFamily: 'var(--font-code)' }}>
            CONTROL {control.id}
          </span>
          <Badge variant={control.status === 'fail' ? 'violet' : control.status === 'pass' ? 'emerald' : 'cyan'} size="sm">
            {control.status.toUpperCase()}
          </Badge>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
          {control.title}
        </div>
        <div className="sirius-caption" style={{ marginTop: '2px' }}>
          {control.section}
        </div>
      </div>

      {/* Description */}
      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
        <div className="sirius-caption" style={{ marginBottom: '4px' }}>REQUIREMENT SPECIFICATION</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {control.description}
        </div>
      </div>

      {/* Evidence Provenance */}
      {control.evidenceDescription && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-cyan)', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={13} /> EVIDENCE PROVENANCE
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {control.evidenceDescription}
          </div>
          {control.evidenceSourceLocation && (
            <div className="sirius-caption" style={{ marginTop: '6px', fontFamily: 'var(--font-code)', color: 'var(--color-cyan)' }}>
              Source: {control.evidenceSourceLocation}
            </div>
          )}
          {control.evidenceScanReference && (
            <div className="sirius-caption" style={{ marginTop: '2px', fontFamily: 'var(--font-code)' }}>
              Scan: {control.evidenceScanReference}
            </div>
          )}
        </div>
      )}

      {/* Affected Findings */}
      {control.affectedFindingIds.length > 0 && (
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
          <div className="sirius-caption" style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={13} color="var(--color-amber)" /> AFFECTED FINDINGS ({control.affectedFindingIds.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {control.affectedFindingIds.map((fId) => (
              <div
                key={fId}
                onClick={() => onNavigateToFinding && onNavigateToFinding(fId)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'rgba(var(--color-amber-rgb), 0.08)',
                  border: '1px solid rgba(var(--color-amber-rgb), 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-amber)',
                  fontFamily: 'var(--font-code)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{fId}</span>
                <ArrowRight size={12} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        {onNavigateToCerebus && (
          <a
            href={`/cerebus?finding=${primaryFindingId || ''}`}
            className="sirius-btn sirius-btn-gradient"
            style={{ textDecoration: 'none', fontSize: '12px', padding: '8px 14px', borderRadius: 'var(--radius-md)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Cpu size={14} /> Explain Control Failure with Cerebus
          </a>
        )}

        {primaryFindingId && onNavigateToRemediation && (
          <Button variant="secondary" size="sm" onClick={() => onNavigateToRemediation(primaryFindingId)} leftIcon={<ShieldCheck size={14} />}>
            Review Remediation for {primaryFindingId}
          </Button>
        )}
      </div>
    </GlassCard>
  );
};
