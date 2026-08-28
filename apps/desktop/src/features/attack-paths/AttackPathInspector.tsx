import React from 'react';
import { AttackPath, AttackPathNode } from '@sirius/types';
import { GlassCard, SeverityChip, MoneyTicker, Button } from '@sirius/ui';
import { GitCommit, Database, KeyRound, Cpu, ArrowRight, Layers } from 'lucide-react';


export interface AttackPathInspectorProps {
  attackPath: AttackPath | null;
  selectedNode: AttackPathNode | null;
  onNavigateToFinding?: (findingId: string) => void;
  onNavigateToCerebus?: (findingId?: string) => void;
}

export const AttackPathInspector: React.FC<AttackPathInspectorProps> = ({
  attackPath,
  selectedNode,
  onNavigateToFinding,
  onNavigateToCerebus,
}) => {
  if (!attackPath) {
    return (
      <GlassCard padding="lg" style={{ width: '340px', flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <GitCommit size={36} color="var(--color-primary)" style={{ marginBottom: '10px', opacity: 0.7 }} />
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
            No Path Selected
          </div>
          <div className="sirius-caption">
            Select an attack path or graph node to open path metrics and node inspector.
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="lg" style={{ width: '340px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GitCommit size={14} /> ATTACK PATH INSPECTOR
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <SeverityChip severity={attackPath.severity} variant="compact" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {attackPath.title}
          </span>
        </div>
      </div>

      {/* Description */}
      {attackPath.description && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5, backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          {attackPath.description}
        </div>
      )}

      {/* Path Metadata Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <KeyRound size={12} color="var(--color-primary)" /> ENTRY POINT
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '4px' }}>
            {attackPath.entryLabel}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Database size={12} color="var(--color-emerald)" /> TARGET ASSET
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '4px' }}>
            {attackPath.targetLabel}
          </div>
        </div>
      </div>

      {/* Financial Exposure */}
      <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <div className="sirius-caption" style={{ marginBottom: '4px' }}>ESTIMATED ASSET EXPOSURE</div>
        <MoneyTicker amountUSD={attackPath.financialExposureUSD} durationMs={0} variant="compact" />
      </div>

      {/* Node Specific Details if selected */}
      {selectedNode && (
        <div style={{ backgroundColor: 'var(--color-primary-soft)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(14, 107, 74, 0.2)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '4px' }}>
            SELECTED NODE DETAILS
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {selectedNode.label}
          </div>
          <div className="sirius-caption" style={{ marginTop: '2px' }}>
            Type: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedNode.type.toUpperCase()}</strong>
          </div>
          {selectedNode.findingId && onNavigateToFinding && (
            <div style={{ marginTop: '8px' }}>
              <Button variant="ghost" size="sm" onClick={() => onNavigateToFinding(selectedNode.findingId!)} leftIcon={<ArrowRight size={13} />}>
                View Finding ({selectedNode.findingId})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Primary Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        {onNavigateToCerebus && (
          <a
            href={`/cerebus?finding=${attackPath.findingIds[0] || ''}`}
            className="sirius-btn sirius-btn-gradient"
            style={{ textDecoration: 'none', fontSize: '12px', padding: '8px 14px', borderRadius: 'var(--radius-md)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Cpu size={14} /> Explain Attack Path with Cerebus
          </a>
        )}
        {attackPath.findingIds[0] && onNavigateToFinding && (
          <Button variant="secondary" size="sm" onClick={() => onNavigateToFinding(attackPath.findingIds[0])} leftIcon={<Layers size={14} />}>
            View Primary Finding ({attackPath.findingIds[0]})
          </Button>
        )}
      </div>
    </GlassCard>
  );
};
