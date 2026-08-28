import { describe, it, expect } from 'vitest';
import { MockGovernanceService } from '@sirius/mock-api';

describe('MockGovernanceService Engine', () => {
  it('handles suppression creation, revocation, baseline creation, and triage status transitions', async () => {
    const service = new MockGovernanceService();

    // 1. Fetch suppressions
    const initialSuppressions = await service.getSuppressions();
    expect(initialSuppressions.length).toBeGreaterThan(0);

    // 2. Create suppression
    const created = await service.createSuppression({
      projectId: 'prj-finsec-core-01',
      ruleId: 'FIN-SEC-001',
      scope: 'project',
      reason: 'accepted_risk',
      reasonText: 'Test suppression policy.',
      expiresInDays: 30,
      affectedFindingIds: ['fnd-88219'],
    });

    expect(created.id).toBeDefined();
    expect(created.ruleId).toBe('FIN-SEC-001');

    // 3. Revoke suppression
    const revokeResult = await service.revokeSuppression(created.id);
    expect(revokeResult.success).toBe(true);

    // 4. Create baseline
    const newBaseline = await service.createBaseline({
      projectId: 'prj-finsec-core-01',
      scanId: 'scan-109283',
      branch: 'main',
    });

    expect(newBaseline.branch).toBe('main');
    expect(newBaseline.status).toBe('active');

    // 5. Triage finding
    const triagedFinding = await service.triageFinding({
      findingId: 'fnd-88219',
      status: 'fixed',
      reasonText: 'Resolved by unit test.',
    });

    expect(triagedFinding.status).toBe('fixed');
  });
});
