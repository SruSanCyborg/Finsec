import React, { useState, useEffect } from 'react';
import { AttackPath, AttackPathNode } from '@sirius/types';
import { GlassCard, SeverityChip, MoneyTicker, Button } from '@sirius/ui';
import { GitCommit, Database, KeyRound, Cpu, ArrowRight, Layers, Sparkles } from 'lucide-react';
import { useExplainAttackPathMutation } from '../../api/queries';


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
  const [explanation, setExplanation] = useState<string | null>(null);
  const explainMutation = useExplainAttackPathMutation();

  useEffect(() => {
    setExplanation(null);
    explainMutation.reset();
    // Only the identity of the selected path should clear a stale answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackPath?.id]);

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

      {/* A real narrative, grounded in this exact chain's own steps — see
          `engine/explain-attack-path.ts`. Not the old link that just jumped
          to a single finding's Cerebus chat and lost the chain entirely. */}
      {explanation ? (
        <div
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontSize: '12px',
            color: 'var(--color-text-primary)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={12} /> HOW THIS ATTACK PLAYS OUT
          </div>
          {explanation.split('\n').map((line, i) => (
            <p key={i} style={{ margin: line.trim() ? '0 0 6px' : 0 }}>{line}</p>
          ))}
        </div>
      ) : explainMutation.isError ? (
        <div style={{ fontSize: '11.5px', color: 'var(--color-red)', backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          {explainMutation.error instanceof Error ? explainMutation.error.message : 'Could not generate an explanation.'}
        </div>
      ) : null}

      {/* Primary Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <Button
          variant="primary"
          leftIcon={<Sparkles size={14} />}
          isLoading={explainMutation.isPending}
          onClick={() =>
            explainMutation.mutate(attackPath, {
              onSuccess: (text) => setExplanation(text),
            })
          }
        >
          {explanation ? 'Regenerate Explanation' : 'Explain How This Attack Plays Out'}
        </Button>
        {onNavigateToCerebus && attackPath.findingIds[0] && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateToCerebus(attackPath.findingIds[0])}
            leftIcon={<Cpu size={13} />}
          >
            Ask Cerebus About the Primary Finding
          </Button>
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
