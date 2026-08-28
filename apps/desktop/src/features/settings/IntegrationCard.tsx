import React from 'react';
import { Integration } from '@sirius/types';
import { GlassCard, Badge, Button } from '@sirius/ui';
import { Settings, Link2 } from 'lucide-react';


export interface IntegrationCardProps {
  integration: Integration;
  onConfigure: (integration: Integration) => void;
}

export const IntegrationCard: React.FC<IntegrationCardProps> = ({ integration, onConfigure }) => {
  const isConnected = integration.status === 'connected';

  return (
    <GlassCard padding="md" style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <Badge variant={isConnected ? 'emerald' : 'cyan'} size="sm">
            {integration.category.replace('_', ' ').toUpperCase()}
          </Badge>
          <Badge variant={isConnected ? 'emerald' : integration.status === 'error' ? 'violet' : 'cyan'} size="sm">
            {integration.status.toUpperCase()}
          </Badge>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {integration.name}
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
          {integration.description}
        </div>

        {isConnected && integration.config && (
          <div style={{ marginTop: '10px', fontSize: '11.5px', fontFamily: 'var(--font-code)', color: 'var(--color-cyan)', backgroundColor: 'var(--bg-surface)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
            {integration.config.repository && `Repo: ${integration.config.repository}`}
            {integration.config.channel && `Channel: ${integration.config.channel}`}
            {integration.config.webhookUrlMasked && `Webhook: ${integration.config.webhookUrlMasked}`}
            {integration.config.severityThreshold && `Threshold: ${integration.config.severityThreshold.toUpperCase()}`}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Button
          variant={isConnected ? 'secondary' : 'gradient'}
          size="sm"
          onClick={() => onConfigure(integration)}
          leftIcon={isConnected ? <Settings size={13} /> : <Link2 size={13} />}
        >
          {isConnected ? 'Configure Connection' : 'Connect Integration'}
        </Button>
      </div>
    </GlassCard>
  );
};
