/**
 * REST client for the Core API.
 *
 * Thin on purpose: the CLI is a client (the golden rule), so this module knows
 * how to authenticate, how to turn RFC-7807 bodies into `CliError`s, and nothing
 * about scanning. Request and response shapes come from the generated contract
 * types, so a contract change surfaces as a type error rather than a runtime
 * surprise.
 */

import { networkError, problemToError } from './errors.js';
import type {
  Baseline,
  Finding,
  FindingPage,
  FixSuggestion,
  Rule,
  Scan,
  ScanCreate,
  Suppression,
  Validity,
} from '../domain.js';

export interface ClientOptions {
  baseUrl: string;
  apiKey: string | undefined;
  /** Per-request timeout. A whole scan is not bounded by this; each call is. */
  timeoutMs?: number;
  userAgent?: string;
}

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Accept header override, for SARIF and other non-JSON payloads. */
  accept?: string;
  signal?: AbortSignal;
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: ClientOptions) {
    // Trailing slashes turn `/scans` into `//scans` on some servers.
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.userAgent = options.userAgent ?? 'sirius-cli';
  }

  private url(path: string, query?: RequestOptions['query']): string {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.url(path, options.query);
    const headers: Record<string, string> = {
      Accept: options.accept ?? 'application/json',
      'User-Agent': this.userAgent,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    // Compose the caller's signal with our timeout so either can abort.
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
      });
    } catch (cause) {
      throw networkError(this.baseUrl, cause);
    }

    if (response.status === 204) return undefined as T;

    const isJson = (response.headers.get('content-type') ?? '').includes('json');
    const payload = isJson ? await response.json().catch(() => undefined) : await response.text();

    if (!response.ok) throw problemToError(response.status, payload, url);

    return payload as T;
  }

  // ---- scans

  createScan(body: ScanCreate): Promise<Scan> {
    return this.request<Scan>('/scans', { method: 'POST', body });
  }

  getScan(scanId: string): Promise<Scan> {
    return this.request<Scan>(`/scans/${encodeURIComponent(scanId)}`);
  }

  cancelScan(scanId: string): Promise<void> {
    return this.request<void>(`/scans/${encodeURIComponent(scanId)}`, { method: 'DELETE' });
  }

  getResultsPage(scanId: string, query: RequestOptions['query'] = {}): Promise<FindingPage> {
    return this.request<FindingPage>(`/scans/${encodeURIComponent(scanId)}/results`, { query });
  }

  /**
   * Walks every page of results. Used by commands that need the full set
   * (`--sarif`, `triage`) rather than the stream.
   */
  async getAllResults(scanId: string, query: RequestOptions['query'] = {}): Promise<Finding[]> {
    const findings: Finding[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.getResultsPage(scanId, { ...query, cursor });
      findings.push(...(page.items ?? []));
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return findings;
  }

  getReport(scanId: string, format: 'pdf' | 'json' | 'sarif'): Promise<unknown> {
    return this.request(`/scans/${encodeURIComponent(scanId)}/report`, {
      query: { format },
      accept: format === 'sarif' ? 'application/sarif+json, application/json' : 'application/json',
    });
  }

  // ---- findings

  requestFix(scanId: string, findingId: string): Promise<FixSuggestion> {
    return this.request<FixSuggestion>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/fix`,
      { method: 'POST' },
    );
  }

  validateSecret(scanId: string, findingId: string): Promise<{ validity: Validity; checked_at?: string }> {
    return this.request(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/validate-secret`,
      { method: 'POST' },
    );
  }

  // ---- rules and governance

  listRules(query: RequestOptions['query'] = {}): Promise<Rule[]> {
    return this.request<Rule[]>('/rules', { query });
  }

  getRule(ruleId: string): Promise<Rule> {
    return this.request<Rule>(`/rules/${encodeURIComponent(ruleId)}`);
  }

  validateRule(yamlBody: string): Promise<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }> {
    return this.request('/rules/validate', { method: 'POST', body: { yaml_body: yamlBody } });
  }

  listSuppressions(projectId: string): Promise<Suppression[]> {
    return this.request<Suppression[]>('/suppressions', { query: { project_id: projectId } });
  }

  createSuppression(body: Record<string, unknown>): Promise<Suppression> {
    return this.request<Suppression>('/suppressions', { method: 'POST', body });
  }

  listBaselines(projectId: string): Promise<Baseline[]> {
    return this.request<Baseline[]>('/baselines', { query: { project_id: projectId } });
  }

  createBaseline(body: Record<string, unknown>): Promise<Baseline> {
    return this.request<Baseline>('/baselines', { method: 'POST', body });
  }

  // ---- meta

  health(): Promise<{ status?: string; version?: string }> {
    return this.request('/healthz');
  }
}
