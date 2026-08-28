import React, { useState } from 'react';
import { GlassCard, Badge, Button, GlassModal } from '@sirius/ui';
import { Terminal, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';

export const AdvancedSettings: React.FC = () => {
  const [isDangerOpen, setIsDangerOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleResetWorkspace = async () => {
    setIsResetting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setIsDangerOpen(false);
      setToast('Workspace cache and local preferences reset cleanly.');
    } catch {
      setToast('Reset failed.');
    } finally {
      setIsResetting(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Terminal size={20} color="var(--color-cyan)" />
          <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            Advanced System Diagnostics & Danger Zone
          </h2>
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          Inspect internal desktop engine metrics, mock transport mode status, and perform destructive workspace resets.
        </div>
      </div>

      {toast && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '13px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '580px' }}>
        {/* System Diagnostics */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <div className="sirius-caption">SYSTEM DIAGNOSTICS</div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Application Version: </span>
            <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-cyan)' }}>v1.4.0-sirius-gui</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Transport Mode: </span>
            <Badge variant="cyan" size="sm">DEV MOCK SERVICE API</Badge>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Target Architecture: </span>
            <span>Tauri 2.0 Desktop Shell (macOS / Metal GPU Render)</span>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ backgroundColor: 'rgba(var(--color-red-rgb), 0.06)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--color-red-rgb), 0.25)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-red)', fontWeight: 700, fontSize: '13px' }}>
            <AlertTriangle size={16} /> DANGER ZONE
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Reset local workspace client state, clear stored query caches, and disconnect all provisional integrations.
          </div>
          <div style={{ paddingTop: '4px' }}>
            <Button variant="secondary" size="sm" onClick={() => setIsDangerOpen(true)} leftIcon={<Trash2 size={13} color="var(--color-red)" />}>
              Reset Local Workspace Configuration
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone Confirmation Dialog */}
      <GlassModal isOpen={isDangerOpen} onClose={() => setIsDangerOpen(false)} title="Confirm Workspace Reset" maxWidth="480px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Are you sure you want to reset local workspace state? This will clear stored client query caches and reset active preferences.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button variant="ghost" onClick={() => setIsDangerOpen(false)}>Cancel</Button>
            <Button variant="gradient" onClick={handleResetWorkspace} isLoading={isResetting}>Confirm Reset</Button>
          </div>
        </div>
      </GlassModal>
    </GlassCard>
  );
};
