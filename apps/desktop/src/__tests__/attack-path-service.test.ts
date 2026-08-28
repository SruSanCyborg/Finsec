import { describe, it, expect } from 'vitest';
import { MockAttackPathService } from '@sirius/mock-api';

describe('MockAttackPathService Engine', () => {
  it('retrieves deterministic attack paths with node graph data', async () => {
    const service = new MockAttackPathService();

    const paths = await service.getAttackPaths();
    expect(paths.length).toBeGreaterThan(0);

    const firstPath = paths[0];
    expect(firstPath.id).toBe('ap-001');
    expect(firstPath.severity).toBe('critical');
    expect(firstPath.nodes.length).toBe(5);
    expect(firstPath.edges.length).toBe(4);
    expect(firstPath.financialExposureUSD).toBe(1450000);
  });
});
