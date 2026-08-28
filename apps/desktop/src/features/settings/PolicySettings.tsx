import React, { useState } from 'react';
import { WorkspaceSettings, FindingSeverity } from '@sirius/types';
import { GlassCard, Button } from '@sirius/ui';
import { Shield, CheckCircle2 } from 'lucide-react';


export interface PolicySettingsProps {
  settings: WorkspaceSettings;
  onSave: (patch: Partial<WorkspaceSettings>) => Promise<void>;
}

export const PolicySettings: React.FC<PolicySettingsProps> = ({ settings, onSave }) => {
  const [severityThreshold, setSeverityThreshold] = useState<FindingSeverity>(settings.policy.severityThreshold);
  const [failOn, setFailOn] = useState<'all' | 'new' | 'verified-secrets'>(settings.policy.failOn);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        policy: {
          severityThreshold,
          failOn,
        },
      });
      setToast('Security policy updated and persisted in Core API.');
    } catch {
      setToast('Failed to update security policy.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const hasUnsavedChanges =
    severityThreshold !== settings.policy.severityThreshold || failOn !== settings.policy.failOn;

  const isPermissiveOrCriticalOnly = severityThreshold === 'critical' || failOn === 'verified-secrets';

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={20} color="var(--color-cyan)" />
            <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
              Security Policy & CI Scan Gating
            </h2>
          </div>
          <div className="sirius-caption" style={{ marginTop: '4px' }}>
            Configure authoritative scan gating predicates, severity thresholds, and build failure policies.
          </div>
        </div>
        {hasUnsavedChanges && (
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: 'var(--color-amber)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            UNSAVED POLICY CHANGES
          </span>
        )}
      </div>

      {toast && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '13px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      {isPermissiveOrCriticalOnly && (
        <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '12.5px', color: 'var(--color-amber)', lineHeight: 1.5 }}>
          ⚠️ <strong>Permissive Policy Warning:</strong> Setting severity threshold to CRITICAL or fail-on to VERIFIED SECRETS allows High and Medium severity vulnerabilities to bypass CI gates without blocking builds.
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '580px' }}>
        {/* Severity Threshold */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>
            SCAN FAIL SEVERITY THRESHOLD
          </label>
          <select
            value={severityThreshold}
            onChange={(e) => setSeverityThreshold(e.target.value as FindingSeverity)}
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
            <option value="critical">CRITICAL — Fail only on critical secret leaks or remote exploitability</option>
            <option value="high">HIGH (Recommended) — Fail on critical and high severity vulnerabilities</option>
            <option value="medium">MEDIUM — Fail on medium, high, or critical findings</option>
            <option value="low">LOW — Strict enforcement down to low severity items</option>
            <option value="info">INFO — Fail on any finding matching policy</option>
          </select>
        </div>

        {/* Fail-On Predicate */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>
            BUILD FAIL-ON PREDICATE
          </label>
          <select
            value={failOn}
            onChange={(e) => setFailOn(e.target.value as 'all' | 'new' | 'verified-secrets')}
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
            <option value="all">ALL — Fail on all findings exceeding severity threshold</option>
            <option value="new">NEW — Fail only on newly introduced findings relative to baseline</option>
            <option value="verified-secrets">VERIFIED SECRETS — Fail strictly on cryptographically verified secret leaks</option>
          </select>
        </div>

        {/* Policy Impact Summary */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)' }}>AUTHORITATIVE POLICY IMPACT</div>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px', lineHeight: 1.5 }}>
            Scans evaluated against this policy will reject builds if any <strong>{severityThreshold.toUpperCase()}</strong> finding is discovered matching <strong>{failOn.toUpperCase()}</strong> predicate.
          </div>
        </div>

        <div style={{ paddingTop: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="gradient" type="submit" isLoading={isSaving}>
            Save Security Policy
          </Button>
          {hasUnsavedChanges && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setSeverityThreshold(settings.policy.severityThreshold);
                setFailOn(settings.policy.failOn);
              }}
            >
              Discard Changes
            </Button>
          )}
        </div>
      </form>
    </GlassCard>
  );
};
