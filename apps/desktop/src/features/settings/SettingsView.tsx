import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import {
  useSettingsQuery,
  useUpdateSettingsMutation,
  useTestConnectionMutation,
  useProjectsQuery,
  useIntegrationsQuery,
  useConnectIntegrationMutation,
  useDisconnectIntegrationMutation,
} from '../../api/queries';
import { SettingsNav, SettingsSection } from './SettingsNav';
import { GeneralSettings } from './GeneralSettings';
import { AccountSettings } from './AccountSettings';
import { ConnectionSettings } from './ConnectionSettings';
import { ProjectSettings } from './ProjectSettings';
import { PolicySettings } from './PolicySettings';
import { IntegrationsView } from './IntegrationsView';
import { NotificationSettings } from './NotificationSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { LoadingState, ErrorState } from '@sirius/ui';
import { Sliders } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { section: routeSection } = useParams<{ section?: string }>();

  const paramSection = (routeSection || searchParams.get('section') || 'general') as SettingsSection;
  const [activeSection, setActiveSection] = useState<SettingsSection>(paramSection);

  useEffect(() => {
    if (paramSection && paramSection !== activeSection) {
      setActiveSection(paramSection);
    }
  }, [paramSection, activeSection]);

  const { data: settings, isLoading: isSettingsLoading, isError, refetch } = useSettingsQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { data: integrations = [] } = useIntegrationsQuery();

  const updateSettingsMutation = useUpdateSettingsMutation();
  const testConnectionMutation = useTestConnectionMutation();
  const connectIntegrationMutation = useConnectIntegrationMutation();
  const disconnectIntegrationMutation = useDisconnectIntegrationMutation();

  if (isSettingsLoading || !settings) {
    return <LoadingState label="Loading workspace configuration from Core API..." />;
  }

  if (isError) {
    return <ErrorState title="Failed to Load Settings" description="Could not retrieve workspace configuration." onRetry={() => refetch()} />;
  }

  const handleSelectSection = (sec: SettingsSection) => {
    setActiveSection(sec);
    navigate(`/settings/${sec}`, { replace: true });
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sliders size={22} color="var(--color-cyan)" />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-cyan)', textTransform: 'uppercase', marginBottom: '2px' }}>
            SETTINGS & SYSTEM
          </div>
          <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
            Settings & Integrations Workspace
          </h1>
          <div className="sirius-caption">
            Configure desktop command center settings, security policy gating, API endpoints, and tool integrations.
          </div>
        </div>
      </div>

      {/* Main Workspace Split Layout */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left Navigation Bar */}
        <SettingsNav activeSection={activeSection} onSelectSection={handleSelectSection} />

        {/* Right Active Section Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeSection === 'general' && (
            <GeneralSettings settings={settings} onSave={async (patch) => { await updateSettingsMutation.mutateAsync(patch); }} />
          )}

          {activeSection === 'account' && <AccountSettings />}

          {activeSection === 'connection' && (
            <ConnectionSettings
              settings={settings}
              onTestConnection={() => testConnectionMutation.mutateAsync()}
              onRotateKey={async (newKey) => { await updateSettingsMutation.mutateAsync({ apiKeyMasked: `••••••••••••${newKey.slice(-4)}` }); }}
            />
          )}

          {activeSection === 'projects' && <ProjectSettings settings={settings} projects={projects} />}

          {activeSection === 'policies' && (
            <PolicySettings settings={settings} onSave={async (patch) => { await updateSettingsMutation.mutateAsync(patch); }} />
          )}

          {activeSection === 'integrations' && (
            <IntegrationsView
              integrations={integrations}
              onConnect={async (id, config) => { await connectIntegrationMutation.mutateAsync({ id, config }); }}
              onDisconnect={async (id) => { await disconnectIntegrationMutation.mutateAsync(id); }}
            />
          )}

          {activeSection === 'notifications' && (
            <NotificationSettings settings={settings} onSave={async (patch) => { await updateSettingsMutation.mutateAsync(patch); }} />
          )}

          {activeSection === 'advanced' && <AdvancedSettings />}
        </div>

      </div>
    </div>
  );
};
