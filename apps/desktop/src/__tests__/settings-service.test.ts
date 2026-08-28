import { describe, it, expect } from 'vitest';
import { MockSettingsService } from '@sirius/mock-api';

describe('MockSettingsService Engine', () => {
  it('retrieves workspace settings, updates policy, tests connection, and manages integrations', async () => {
    const service = new MockSettingsService();

    // 1. Fetch settings
    const settings = await service.getSettings();
    expect(settings.workspaceName).toBeDefined();
    expect(settings.policy.severityThreshold).toBe('high');

    // 2. Update policy
    const updated = await service.updateSettings({
      policy: {
        severityThreshold: 'critical',
        failOn: 'all',
      },
    });
    expect(updated.policy.severityThreshold).toBe('critical');

    // 3. Test API connection
    const testResult = await service.testConnection();
    expect(testResult.success).toBe(true);
    expect(testResult.latencyMs).toBeGreaterThan(0);

    // 4. Fetch integrations
    const integrations = await service.getIntegrations();
    expect(integrations.length).toBeGreaterThan(0);

    // 5. Connect and disconnect integration
    const connected = await service.connectIntegration('int-02', { repository: 'gitlab/project' });
    expect(connected.status).toBe('connected');

    const disconnected = await service.disconnectIntegration('int-02');
    expect(disconnected.status).toBe('disconnected');
  });
});
