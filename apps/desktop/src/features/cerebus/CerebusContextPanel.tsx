import React, { useState } from 'react';
import { Finding } from '@sirius/types';
import { GlassCard, SeverityChip, Badge, MoneyTicker } from '@sirius/ui';
import { ShieldAlert, FileCode, Layers, DollarSign, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';

export interface CerebusContextPanelProps {
  finding: Finding | null;
  projectName?: string;
}

export const CerebusContextPanel: React.FC<CerebusContextPanelProps> = ({ finding, projectName }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          width: '40px',
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          cursor: 'pointer',
          gap: '12px',
        }}
      >
        <ChevronLeft size={16} color="var(--color-primary)" />
        <div style={{ writingMode: 'vertical-rl', fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.05em' }}>
          SECURITY CONTEXT
        </div>
      </div>
    );
  }

  if (!finding) {
    return (
      <GlassCard padding="lg" style={{ width: '320px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em' }}>
            SECURITY CONTEXT
          </div>
          <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0 }}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="sirius-caption">
          Workspace: <strong style={{ color: 'var(--color-text-primary)' }}>{projectName || 'finsec-core-gateway'}</strong>
        </div>

        <div style={{ padding: '16px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          No active finding selected. General security context active.
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="lg" style={{ width: '340px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={14} /> SECURITY CONTEXT
        </div>
        <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Target Finding */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <SeverityChip severity={finding.severity} variant="compact" />
          <Badge variant="neutral" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
            {finding.ruleId}
          </Badge>
        </div>
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          {finding.title}
        </div>
        <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-code)', color: 'var(--color-primary)' }}>
          <FileCode size={12} /> {finding.filePath}:{finding.startLine}
        </div>
      </div>

      {/* Risk Exposure */}
      <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <DollarSign size={12} color="var(--color-text-secondary)" /> Estimated Exposure
        </div>
        <MoneyTicker amountUSD={finding.moneyAtRiskUSD || 1450000} durationMs={0} variant="compact" />
      </div>

      {/* Compliance Controls */}
      <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Layers size={12} color="var(--color-primary)" /> Mapped Controls
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {finding.complianceMappings?.length ? (
            finding.complianceMappings.map((c) => (
              <Badge key={c.controlId} variant="emerald" size="sm">
                {c.framework} {c.controlId}
              </Badge>
            ))
          ) : (
            <>
              <Badge variant="emerald" size="sm">PCI DSS 4.0 6.3.1</Badge>
              <Badge variant="neutral" size="sm">SOC 2 CC6.1</Badge>
            </>
          )}
        </div>
      </div>

      {/* Verification & Baseline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-text-muted)' }}>Baseline State:</span>
          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{finding.baselineState ? finding.baselineState.toUpperCase() : 'NEW'}</span>
        </div>
        {finding.secretValidity?.status === 'valid' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-emerald)', fontWeight: 600 }}>
            <span>Secret Validity:</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <CheckCircle2 size={11} /> VERIFIED LIVE
            </span>
          </div>
        )}
      </div>
    </GlassCard>
  );
};
