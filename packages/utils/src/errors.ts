/**
 * Structured Error Handling Hierarchy for SIRIUS GUI
 */

export type SiriusErrorCode =
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'WEBSOCKET_DISCONNECT'
  | 'TIMEOUT_ERROR'
  | 'UNEXPECTED_ERROR'
  | 'EMPTY_DATA';

export abstract class SiriusBaseError extends Error {
  abstract readonly code: SiriusErrorCode;
  readonly timestamp: string;

  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
  }
}

export class ApiError extends SiriusBaseError {
  readonly code = 'API_ERROR';
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
    originalError?: unknown
  ) {
    super(message, originalError);
  }
}

export class NetworkError extends SiriusBaseError {
  readonly code = 'NETWORK_ERROR';
  constructor(message = 'Network connection lost or target server unreachable.', originalError?: unknown) {
    super(message, originalError);
  }
}

export class AuthError extends SiriusBaseError {
  readonly code = 'AUTH_ERROR';
  constructor(message = 'Authentication token expired or invalid credentials.', originalError?: unknown) {
    super(message, originalError);
  }
}

export class WebSocketDisconnectError extends SiriusBaseError {
  readonly code = 'WEBSOCKET_DISCONNECT';
  constructor(message = 'Live scan stream WebSocket connection terminated.', public readonly closeCode?: number, originalError?: unknown) {
    super(message, originalError);
  }
}

export class TimeoutError extends SiriusBaseError {
  readonly code = 'TIMEOUT_ERROR';
  constructor(message = 'Request timed out after maximum wait duration.', originalError?: unknown) {
    super(message, originalError);
  }
}

export class UnexpectedError extends SiriusBaseError {
  readonly code = 'UNEXPECTED_ERROR';
  constructor(message = 'An unexpected client error occurred.', originalError?: unknown) {
    super(message, originalError);
  }
}
