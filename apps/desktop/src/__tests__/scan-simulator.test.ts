import { describe, it, expect } from 'vitest';

import { MockScanSimulator } from '@sirius/mock-api';

describe('MockScanSimulator Engine', () => {
  it('emits deterministic scan stream events', async () => {
    const simulator = new MockScanSimulator();
    const emittedEvents: string[] = [];

    simulator.subscribe((event) => {
      emittedEvents.push(event.type);
    });

    simulator.runDemoScan('test-scan-101', 100.0); // Ultra fast speed

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(emittedEvents).toContain('scan_started');
    expect(emittedEvents).toContain('scan_progress');
    expect(emittedEvents).toContain('finding_discovered');
    expect(emittedEvents).toContain('scan_completed');
    simulator.stop();
  });
});
