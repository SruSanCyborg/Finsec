import { describe, it, expect, beforeEach } from 'vitest';
import { useScanStore } from '../scan-store';
import { Finding } from '@sirius/types';

describe('useScanStore stream normalization', () => {
  beforeEach(() => {
    useScanStore.getState().clearLiveScan();
  });

  it('normalizes scan_started event correctly', () => {
    const store = useScanStore.getState();
    store.processStreamEvent({
      type: 'scan_started',
      scanId: 'scan-9900',
      timestamp: '2026-08-17T12:00:00Z',
      status: 'running',
    });

    const activeScan = useScanStore.getState().activeScan;
    expect(activeScan).not.toBeNull();
    expect(activeScan?.id).toBe('scan-9900');
    expect(activeScan?.status).toBe('running');
  });

  it('deduplicates live findings from stream', () => {
    const mockFinding: Finding = {
      id: 'fnd-100',
      scanId: 'scan-9900',
      projectId: 'prj-01',
      ruleId: 'SEC-01',
      title: 'Mock Leak',
      description: 'Mock',
      severity: 'high',
      status: 'open',
      category: 'secret_leak',
      filePath: 'src/config.ts',
      startLine: 1,
      endLine: 2,
      createdAt: '2026-08-17T12:00:00Z',
      updatedAt: '2026-08-17T12:00:00Z',
    };

    const store = useScanStore.getState();
    store.processStreamEvent({
      type: 'finding_discovered',
      scanId: 'scan-9900',
      timestamp: '2026-08-17T12:01:00Z',
      finding: mockFinding,
    });

    // Send duplicate
    store.processStreamEvent({
      type: 'finding_discovered',
      scanId: 'scan-9900',
      timestamp: '2026-08-17T12:01:05Z',
      finding: mockFinding,
    });

    expect(useScanStore.getState().liveFindings.length).toBe(1);
  });
});
