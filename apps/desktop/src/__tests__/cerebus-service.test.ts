import { describe, it, expect } from 'vitest';
import { MockCerebusService } from '@sirius/mock-api';

describe('MockCerebusService Engine', () => {
  it('generates structured security analysis and read-only remediation proposals', async () => {
    const service = new MockCerebusService();
    const result = await service.analyzeFinding('fnd-88219');

    expect(result.message).toContain('SEC-JWT-004');
    expect(result.sections?.analysis).toBeTruthy();
    expect(result.sections?.impact).toBeTruthy();
    expect(result.sections?.recommendation).toBeTruthy();
    expect(result.proposedRemediation?.diff).toBeTruthy();
    expect(result.verifierStatus).toBe('passed');
  });
});

