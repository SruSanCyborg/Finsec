import { describe, it, expect } from 'vitest';
import { MockRemediationService } from '@sirius/mock-api';

describe('MockRemediationService Engine', () => {
  it('retrieves fix proposal with verifier checks and applies safe patch', async () => {
    const service = new MockRemediationService();

    const proposal = await service.getFixProposal('fnd-88219');
    expect(proposal.proposalStatus).toBe('ready');
    expect(proposal.verifierStatus).toBe('passed');
    expect(proposal.verificationChecks.length).toBeGreaterThan(0);
    expect(proposal.diff.additionsCount).toBe(4);
    expect(proposal.diff.deletionsCount).toBe(2);

    const applyResult = await service.applyFixProposal('fnd-88219');
    expect(applyResult.success).toBe(true);
    expect(applyResult.status).toBe('applied');
    expect(applyResult.backupCreated).toBe(true);
    expect(applyResult.reverified).toBe(true);
  });
});
