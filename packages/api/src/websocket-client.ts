import { Finding, ScanProgress, ScanStatus, ScanConsoleEvent } from '@sirius/types';
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
          const streamEvent = JSON.parse(event.data) as ScanStreamEvent;
          this.handlers.forEach((handler) => handler(streamEvent));
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
