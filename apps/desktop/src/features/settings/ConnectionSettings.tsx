import React, { useState } from 'react';
import { WorkspaceSettings } from '@sirius/types';
import { GlassCard, Badge, Button, Input, GlassModal } from '@sirius/ui';
import { Radio, RefreshCw, Key, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface ConnectionSettingsProps {
  settings: WorkspaceSettings;
  onTestConnection: () => Promise<{ success: boolean; latencyMs: number; message: string }>;
  onRotateKey: (newKey: string) => Promise<void>;
}

export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({
  settings,
  onTestConnection,
  onRotateKey,
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isRotateOpen, setIsRotateOpen] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [isRotating, setIsRotating] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection();
      setTestResult(res.message);
    } catch {
      setTestResult('Connection failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleRotateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim()) return;
    setIsRotating(true);
    try {
      await onRotateKey(newKeyInput);
      setIsRotateOpen(false);
      setNewKeyInput('');
      setTestResult('API key rotated successfully.');
    } catch {
      setTestResult('Key rotation failed.');
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Radio size={20} color="var(--color-cyan)" />
          <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            API Connection & Authentication Gateway
          </h2>
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          Manage FinSec Core API Gateway connection endpoints, latency diagnostic tests, and secret API key credentials.
        </div>
      </div>

      {testResult && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '13px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={15} /> {testResult}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '580px' }}>
        {/* Connection Card */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="sirius-caption">FINSEC CORE API GATEWAY</div>
            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-code)', color: 'var(--text-primary)', marginTop: '2px' }}>
              {settings.apiEndpoint}
            </div>
            <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
              <Badge variant="emerald" size="sm" icon={<ShieldCheck size={12} />}>
                STATUS: {settings.connectionStatus.toUpperCase()}
              </Badge>
              <Badge variant="cyan" size="sm">
                LATENCY: {settings.latencyMs}ms
              </Badge>
              <Badge variant="violet" size="sm">
                ENV: {settings.environment.toUpperCase()}
              </Badge>
            </div>
          </div>

          <Button variant="secondary" size="sm" onClick={handleTest} isLoading={testing} leftIcon={<RefreshCw size={13} />}>
            Test Connection
          </Button>
        </div>

        {/* API Secret Key Card */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="sirius-caption" style={{ color: 'var(--color-primary)' }}>OPERATOR API KEY CREDENTIAL</div>
            <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-code)', color: 'var(--text-primary)', marginTop: '4px', letterSpacing: '0.1em' }}>
              {settings.apiKeyMasked}
            </div>
            <div className="sirius-caption" style={{ marginTop: '4px' }}>
              Secrets are strictly masked after storage. Never rendered raw in logs.
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setIsRotateOpen(true)} leftIcon={<Key size={13} color="var(--color-primary)" />}>
            Rotate Secret Key
          </Button>
        </div>
      </div>

      {/* Rotate Key Dialog */}
      <GlassModal isOpen={isRotateOpen} onClose={() => setIsRotateOpen(false)} title="Rotate Operator API Key" maxWidth="480px">
        <form onSubmit={handleRotateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Enter a new FinSec Core API Key credential. The key will be securely transmitted and masked immediately after registration.
          </div>
          <div>
            <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>NEW API KEY SECRET</label>
            <Input type="password" value={newKeyInput} onChange={(e) => setNewKeyInput(e.target.value)} placeholder="sk_live_finsec_••••••••••••" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button variant="ghost" type="button" onClick={() => setIsRotateOpen(false)}>Cancel</Button>
            <Button variant="gradient" type="submit" isLoading={isRotating}>Confirm Key Rotation</Button>
          </div>
        </form>
      </GlassModal>
    </GlassCard>
  );
};
