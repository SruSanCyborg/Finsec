import { Finding, ScanProgress, ScanStatus, ScanConsoleEvent, FindingSeverity, FindingCategory, FindingStatus } from '@sirius/types';
import { WebSocketDisconnectError } from '@sirius/utils';

export type WebSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ScanStreamEvent {
  type: 'scan_started' | 'scan_progress' | 'console_event' | 'finding_discovered' | 'scan_completed' | 'scan_failed';
  scanId: string;
  timestamp: string;
  status?: ScanStatus;
  progress?: ScanProgress;
  finding?: Finding;
  consoleEvent?: ScanConsoleEvent;
  gateResult?: 'passed' | 'blocked';
  summary?: {
    counts: { critical?: number; high?: number; medium?: number; low?: number; info?: number };
    moneyAtRiskInr: number;
    complianceScore: number | null;
  };
  error?: string;
}

export type ScanStreamHandler = (event: ScanStreamEvent) => void;
export type StatusChangeHandler = (status: WebSocketConnectionStatus) => void;

export interface WebSocketClientConfig {
  url: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectIntervalMs?: number;
  heartbeatIntervalMs?: number;
}

function adaptWireFinding(f: Record<string, unknown>): Finding {
  const message = String(f.message || 'Security violation detected');
  const line = Number(f.line || f.lineNumber || 1);
  return {
    id: String(f.id || `fnd-${Date.now()}`),
    projectId: String(f.project_id || f.projectId || 'prj-finsec-core-01'),
    scanId: String(f.scan_id || f.scanId || 'scan-01'),
    ruleId: String(f.rule_id || f.ruleId || 'SIR-SEC-001'),
    title: String(f.rule_name || f.ruleName || message),
    description: message,
    severity: (f.severity as FindingSeverity) || 'high',
    status: (f.status as FindingStatus) || 'open',
    category: (f.category as FindingCategory) || 'security',
    filePath: String(f.file || f.filePath || 'src/index.ts'),
    startLine: line,
    endLine: Number(f.end_line || f.endLine || line),
    codeSnippet: String(f.snippet || f.codeSnippet || ''),
    baselineState: f.baseline_state as Finding['baselineState'],
    fingerprint: String(f.fingerprint || ''),
    createdAt: String(f.created_at || f.createdAt || new Date().toISOString()),
    updatedAt: String(f.updated_at || f.updatedAt || new Date().toISOString()),
  };
}

function normalizeWireEvent(raw: Record<string, unknown>): ScanStreamEvent | null {
  const type = String(raw.type || '');
  const scanId = String(raw.scan_id || raw.scanId || 'scan-live');
  const timestamp = String(raw.ts || raw.timestamp || new Date().toISOString());

  if (type === 'scan.started' || type === 'scan_started') {
    return {
      type: 'scan_started',
      scanId,
      timestamp,
      status: 'running',
      progress: {
        phase: 'indexing',
        percentComplete: 0,
        filesScanned: 0,
        totalFiles: Number(raw.total_files || raw.totalFiles || 100),
        findingsFound: 0,
        elapsedTimeMs: 0,
      },
    };
  }

  if (type === 'file.scanning') {
    const idx = Number(raw.index || 0);
    const tot = Number(raw.total || 100);
    return {
      type: 'scan_progress',
      scanId,
      timestamp,
      progress: {
        phase: 'analyzing',
        percentComplete: Math.round((idx / tot) * 100),
        filesScanned: idx,
        totalFiles: tot,
        findingsFound: 0,
        elapsedTimeMs: 0,
      },
      consoleEvent: raw.path
        ? {
            id: `evt-${Date.now()}-${Math.random()}`,
            timestamp,
            category: 'INDEX',
            level: 'info',
            message: `Scanning file: ${raw.path}`,
            file: String(raw.path),
          }
        : undefined,
    };
  }

  if (type === 'finding' || type === 'finding_discovered') {
    const rawFinding = (raw.finding as Record<string, unknown>) || raw;
    return {
      type: 'finding_discovered',
      scanId: String(rawFinding.scan_id || scanId),
      timestamp,
      finding: adaptWireFinding(rawFinding),
    };
  }

  if (type === 'scan.completed' || type === 'scan_completed') {
    const counts = (raw.counts as Record<string, number>) || {};
    return {
      type: 'scan_completed',
      scanId,
      timestamp,
      status: 'completed',
      gateResult: raw.exit_code === 0 ? 'passed' : 'blocked',
      // No `progress` here — this frame carries no file counts (see the
      // frozen WsScanCompleted schema). The store falls back to whatever
      // `scan.started` / `file.scanning` already established and just
      // overlays completion, rather than this guessing at file totals from
      // finding counts, which are a different axis entirely.
      summary: {
        counts,
        moneyAtRiskInr: Number(raw.money_at_risk_inr ?? 0),
        complianceScore: raw.compliance_score !== undefined ? Number(raw.compliance_score) : null,
      },
    };
  }

  if (type === 'scan.failed' || type === 'scan_failed') {
    return {
      type: 'scan_failed',
      scanId,
      timestamp,
      error: String(raw.error_message || raw.error || 'Scan failed'),
    };
  }

  // Pass-through if already in ScanStreamEvent shape
  if (['scan_started', 'scan_progress', 'console_event', 'finding_discovered', 'scan_completed', 'scan_failed'].includes(type)) {
    return raw as unknown as ScanStreamEvent;
  }

  return null;
}

export class SiriusWebSocketClient {
  private ws: WebSocket | null = null;
  private status: WebSocketConnectionStatus = 'disconnected';
  private handlers: Set<ScanStreamHandler> = new Set();
  private statusHandlers: Set<StatusChangeHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectIntervalMs: number;
  private heartbeatIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: WebSocketClientConfig) {
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.reconnectIntervalMs = config.reconnectIntervalMs ?? 2000;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;
  }

  public getStatus(): WebSocketConnectionStatus {
    return this.status;
  }

  public setUrl(url: string): void {
    this.config.url = url;
  }

  private updateStatus(newStatus: WebSocketConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusHandlers.forEach((handler) => handler(newStatus));
    }
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = JSON.parse(event.data) as Record<string, unknown>;
          const normalized = normalizeWireEvent(raw);
          if (normalized) {
            this.handlers.forEach((handler) => handler(normalized));
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message JSON:', err);
        }
      };

      this.ws.onerror = () => {
        this.updateStatus('error');
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.stopHeartbeat();
        this.updateStatus('disconnected');

        if (this.config.autoReconnect !== false && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
          setTimeout(() => this.connect(), delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error(new WebSocketDisconnectError('Max WebSocket reconnect attempts reached', event.code));
        }
      };
    } catch (err) {
      this.updateStatus('error');
      console.error(new WebSocketDisconnectError('Failed to initialize WebSocket client', undefined, err));
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client requested disconnect');
      this.ws = null;
    }
    this.updateStatus('disconnected');
  }

  public subscribe(handler: ScanStreamHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  public send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('Cannot send WebSocket message: Socket is not open.');
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', timestamp: new Date().toISOString() });
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

