import React, { useState } from 'react';
import { Integration } from '@sirius/types';
import { GlassCard, Button } from '@sirius/ui';
import { IntegrationCard } from './IntegrationCard';
import { IntegrationConfigDialog } from './IntegrationConfigDialog';
import { Puzzle, Terminal, Copy, CheckCircle2 } from 'lucide-react';

export interface IntegrationsViewProps {
  integrations: Integration[];
  onConnect: (id: string, config?: Record<string, string>) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onConnect,
  onDisconnect,
}) => {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const ciSnippet = `name: SIRIUS Security Audit Gate
on: [push, pull_request]
jobs:
  finsec-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run SIRIUS Security Gate
        run: finsec scan . --severity-threshold high --fail-on verified-secrets`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(ciSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <GlassCard padding="lg">
        <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Puzzle size={20} color="var(--color-primary)" />
            <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
              Integrations Control Center
            </h2>
          </div>
          <div className="sirius-caption" style={{ marginTop: '4px' }}>
            Connect SIRIUS to your existing source control, CI/CD pipelines, messaging channels, and ticketing workflows.
          </div>
        </div>

        {/* Grid of Integration Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConfigure={(item) => setSelectedIntegration(item)}
            />
          ))}
        </div>
      </GlassCard>

      {/* CI/CD Integration Snippet Card */}
      <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={18} color="var(--color-primary)" />
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
              CI/CD AUTOMATION STEP SNIPPET
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCopySnippet} leftIcon={copiedSnippet ? <CheckCircle2 size={13} color="var(--color-emerald)" /> : <Copy size={13} />}>
            {copiedSnippet ? 'Copied to Clipboard' : 'Copy Action Snippet'}
          </Button>
        </div>

        <pre
          style={{
            margin: 0,
            padding: '14px',
            backgroundColor: 'var(--color-bg-technical)',
            border: '1px solid var(--border-technical)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-code)',
            fontSize: '12px',
            color: 'var(--color-primary)',
            overflowX: 'auto',
            lineHeight: 1.5,
          }}
        >
          {ciSnippet}
        </pre>
      </GlassCard>

      {/* Integration Modal */}
      <IntegrationConfigDialog
        integration={selectedIntegration}
        isOpen={Boolean(selectedIntegration)}
        onClose={() => setSelectedIntegration(null)}
        onConnect={async (id, config) => {
          await onConnect(id, config);
          setSelectedIntegration(null);
        }}
        onDisconnect={async (id) => {
          await onDisconnect(id);
          setSelectedIntegration(null);
        }}
      />
    </div>
  );
};
