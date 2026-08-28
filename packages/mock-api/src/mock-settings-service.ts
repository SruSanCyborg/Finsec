import { WorkspaceSettings, Integration } from '@sirius/types';
import { MOCK_WORKSPACE_SETTINGS, MOCK_INTEGRATIONS } from './mock-data';

export class MockSettingsService {
  private settings: WorkspaceSettings = { ...MOCK_WORKSPACE_SETTINGS };
  private integrations: Integration[] = [...MOCK_INTEGRATIONS];

  public async getSettings(): Promise<WorkspaceSettings> {
    return { ...this.settings };
  }

  public async updateSettings(patch: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.settings = {
      ...this.settings,
      ...patch,
      policy: patch.policy ? { ...this.settings.policy, ...patch.policy } : this.settings.policy,
      notificationPreferences: patch.notificationPreferences
        ? { ...this.settings.notificationPreferences, ...patch.notificationPreferences }
        : this.settings.notificationPreferences,
    };
    return { ...this.settings };
  }

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.settings.connectionStatus = 'connected';
    this.settings.latencyMs = 12;
    return {
      success: true,
      latencyMs: 12,
      message: 'FinSec Core API Gateway connection verified (12ms latency).',
    };
  }

  public async getIntegrations(): Promise<Integration[]> {
    return [...this.integrations];
  }

  public async getIntegrationById(id: string): Promise<Integration | null> {
    return this.integrations.find((i) => i.id === id) || null;
  }

  public async connectIntegration(id: string, config?: Record<string, string>): Promise<Integration> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const idx = this.integrations.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Integration ${id} not found`);

    const updated: Integration = {
      ...this.integrations[idx],
      status: 'connected',
      configuredAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      config: {
        ...this.integrations[idx].config,
        repository: config?.repository || this.integrations[idx].config?.repository,
        channel: config?.channel || this.integrations[idx].config?.channel,
        webhookUrlMasked: config?.webhookUrl ? 'https://hooks.slack.com/services/••••/••••' : this.integrations[idx].config?.webhookUrlMasked,
      },
    };
    this.integrations[idx] = updated;
    return updated;
  }

  public async disconnectIntegration(id: string): Promise<Integration> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const idx = this.integrations.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Integration ${id} not found`);

    const updated: Integration = {
      ...this.integrations[idx],
      status: 'disconnected',
    };
    this.integrations[idx] = updated;
    return updated;
  }
}
