import React, { useState } from 'react';
import { Integration } from '@sirius/types';
import { GlassModal, Button, Input } from '@sirius/ui';
import { Unlink } from 'lucide-react';


export interface IntegrationConfigDialogProps {
  integration: Integration | null;
  isOpen: boolean;
  onClose: () => void;
  onConnect: (id: string, config?: Record<string, string>) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
}

export const IntegrationConfigDialog: React.FC<IntegrationConfigDialogProps> = ({
  integration,
  isOpen,
  onClose,
  onConnect,
  onDisconnect,
}) => {
  const [repoInput, setRepoInput] = useState(integration?.config?.repository || '');
  const [channelInput, setChannelInput] = useState(integration?.config?.channel || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!integration) return null;

  const isConnected = integration.status === 'connected';

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConnect(integration.id, {
        repository: repoInput,
        channel: channelInput,
      });
      onClose();
    } catch {
      // Handled
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnectClick = async () => {
    setIsSubmitting(true);
    try {
      await onDisconnect(integration.id);
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
      title={`${isConnected ? 'Configure' : 'Connect'} ${integration.name}`}
      maxWidth="500px"
    >
      <form onSubmit={handleConnectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {integration.description}
        </div>

        {integration.category === 'source_control' && (
          <div>
            <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>TARGET REPOSITORY (ORG/REPO)</label>
            <Input value={repoInput} onChange={(e) => setRepoInput(e.target.value)} placeholder="finsec/core-gateway" />
          </div>
        )}

        {(integration.category === 'messaging' || integration.category === 'ticketing') && (
          <div>
            <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>CHANNEL / PROJECT KEY</label>
            <Input value={channelInput} onChange={(e) => setChannelInput(e.target.value)} placeholder="#security-alerts" />
          </div>
        )}

        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', fontSize: '12px' }}>
          <div className="sirius-caption">SECRET PROTECTION MASKING</div>
          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
            Tokens and secrets are stored in secure backend vault storage and strictly masked (`••••••••••••3A9F`).
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          {isConnected ? (
            <Button variant="secondary" type="button" onClick={handleDisconnectClick} isLoading={isSubmitting} leftIcon={<Unlink size={14} color="var(--color-red)" />}>
              Disconnect
            </Button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="gradient" type="submit" isLoading={isSubmitting}>
              {isConnected ? 'Save Connection' : 'Authorize & Connect'}
            </Button>
          </div>
        </div>
      </form>
    </GlassModal>
  );
};
