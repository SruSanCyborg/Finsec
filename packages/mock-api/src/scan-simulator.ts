import { ScanStreamEvent } from '@sirius/api';
import { MOCK_FINDINGS } from './mock-data';

export type SimulatorEventHandler = (event: ScanStreamEvent) => void;

export class MockScanSimulator {
  private activeTimers: Array<ReturnType<typeof setTimeout>> = [];
  private handlers: Set<SimulatorEventHandler> = new Set();

  public subscribe(handler: SimulatorEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: ScanStreamEvent): void {
    this.handlers.forEach((h) => h(event));
  }

  public stop(): void {
    this.activeTimers.forEach((t) => clearTimeout(t));
    this.activeTimers = [];
  }

  public runDemoScan(scanId: string, speedMultiplier = 1.0): void {
    this.stop();

    const schedule = (ms: number, fn: () => void) => {
      const timer = setTimeout(fn, ms / speedMultiplier);
      this.activeTimers.push(timer);
    };

    const startTime = new Date().toISOString();

    // 0ms: scan_started
    schedule(0, () => {
      this.emit({
        type: 'scan_started',
        scanId,
        timestamp: startTime,
        status: 'running',
        progress: {
          phase: 'initialization',
          percentComplete: 0,
          filesScanned: 0,
          totalFiles: 1420,
          findingsFound: 0,
          elapsedTimeMs: 0,
        },
      });
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-1`,
          timestamp: new Date().toISOString(),
          category: 'SYSTEM',
          message: 'Initializing FinSec Core AST Scanner Worker v2.4.0...',
        },
      });
    });

    // 1000ms: Indexing
    schedule(1000, () => {
      this.emit({
        type: 'scan_progress',
        scanId,
        timestamp: new Date().toISOString(),
        progress: {
          phase: 'ast_parsing',
          percentComplete: 20,
          filesScanned: 284,
          totalFiles: 1420,
          currentFile: 'src/middleware/auth.ts',
          findingsFound: 0,
          elapsedTimeMs: 1000,
        },
      });
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-2`,
          timestamp: new Date().toISOString(),
          category: 'INDEX',
          message: 'Indexed 1,420 files across 48 modules in repository workspace.',
        },
      });
    });

    // 2500ms: Critical Finding Discovered
    schedule(2500, () => {
      const fnd1 = { ...MOCK_FINDINGS[0], scanId };
      this.emit({
        type: 'finding_discovered',
        scanId,
        timestamp: new Date().toISOString(),
        finding: fnd1,
      });
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-3`,
          timestamp: new Date().toISOString(),
          category: 'RULE',
          message: 'Rule SEC-JWT-004 triggered: Hardcoded JWT signing private key detected in src/middleware/auth.ts:42',
        },
      });
      this.emit({
        type: 'scan_progress',
        scanId,
        timestamp: new Date().toISOString(),
        progress: {
          phase: 'rule_evaluation',
          percentComplete: 45,
          filesScanned: 639,
          totalFiles: 1420,
          currentFile: 'src/middleware/auth.ts',
          findingsFound: 1,
          elapsedTimeMs: 2500,
        },
      });
    });

    // 4500ms: High Finding Discovered
    schedule(4500, () => {
      const fnd2 = { ...MOCK_FINDINGS[1], scanId };
      this.emit({
        type: 'finding_discovered',
        scanId,
        timestamp: new Date().toISOString(),
        finding: fnd2,
      });
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-4`,
          timestamp: new Date().toISOString(),
          category: 'RULE',
          message: 'Rule FIN-PCI-603 triggered: Unencrypted Account PAN Payload Transmission in src/services/payment.ts:104',
        },
      });
      this.emit({
        type: 'scan_progress',
        scanId,
        timestamp: new Date().toISOString(),
        progress: {
          phase: 'compliance_calculation',
          percentComplete: 70,
          filesScanned: 994,
          totalFiles: 1420,
          currentFile: 'src/services/payment.ts',
          findingsFound: 2,
          elapsedTimeMs: 4500,
        },
      });
    });

    // 7000ms: Compliance & Risk Mapping
    schedule(7000, () => {
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-5`,
          timestamp: new Date().toISOString(),
          category: 'COMPLIANCE',
          message: 'Evaluating PCI-DSS 4.0 requirement 6.3.2 software architecture controls...',
        },
      });
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-6`,
          timestamp: new Date().toISOString(),
          category: 'RISK',
          message: 'Calculated estimated breach financial risk exposure: $1,450,000 USD.',
        },
      });
      this.emit({
        type: 'scan_progress',
        scanId,
        timestamp: new Date().toISOString(),
        progress: {
          phase: 'reporting',
          percentComplete: 90,
          filesScanned: 1278,
          totalFiles: 1420,
          findingsFound: 2,
          elapsedTimeMs: 7000,
        },
      });
    });

    // 9000ms: scan_completed
    schedule(9000, () => {
      this.emit({
        type: 'console_event',
        scanId,
        timestamp: new Date().toISOString(),
        consoleEvent: {
          id: `log-${Date.now()}-7`,
          timestamp: new Date().toISOString(),
          category: 'SYSTEM',
          message: 'Scan analysis completed cleanly in 9.0s. Outputting SARIF summary log.',
        },
      });
      this.emit({
        type: 'scan_completed',
        scanId,
        timestamp: new Date().toISOString(),
        gateResult: 'blocked',
        progress: {
          phase: 'completed',
          percentComplete: 100,
          filesScanned: 1420,
          totalFiles: 1420,
          findingsFound: 2,
          elapsedTimeMs: 9000,
        },
      });
    });
  }
}
