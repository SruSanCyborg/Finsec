import { ApiError, NetworkError, TimeoutError, AuthError, UnexpectedError } from '@sirius/utils';

export interface HttpClientConfig {
  baseUrl: string;
  getAuthToken?: () => string | null;
  timeoutMs?: number;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class HttpClient {
  private baseUrl: string;
  private getAuthToken?: () => string | null;
  private defaultTimeoutMs: number;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getAuthToken = config.getAuthToken;
    this.defaultTimeoutMs = config.timeoutMs ?? 15000;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined) {
          url.searchParams.append(key, String(val));
        }
      });
    }
    return url.toString();
  }

  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...customHeaders,
    };

    if (this.getAuthToken) {
      const token = this.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  public async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    options: HttpRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.params);
    const headers = this.buildHeaders(options.headers);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If an external signal is provided, forward abort
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: Record<string, unknown> = {};
        try {
          errorData = (await response.json()) as Record<string, unknown>;
        } catch {
          // Response body was not JSON
        }

        if (response.status === 401 || response.status === 403) {
          throw new AuthError(`Authentication failed: ${response.statusText}`, errorData);
        }

        throw new ApiError(
          (errorData.message as string) || `API Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      let data: T;
      if (response.status === 240 || response.headers.get('content-length') === '0') {
        data = {} as T;
      } else {
        data = (await response.json()) as T;
      }

      return {
        data,
        status: response.status,
        headers: response.headers,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError || err instanceof AuthError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError(`Request to ${path} timed out after ${timeoutMs}ms`, err);
      }

      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new NetworkError(`Unable to connect to FinSec Core API at ${this.baseUrl}`, err);
      }

      throw new UnexpectedError(`HTTP request failed unexpectedly`, err);
    }
  }

  public get<T>(path: string, options?: HttpRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  public post<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  public put<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  public patch<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  public delete<T>(path: string, options?: HttpRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}
