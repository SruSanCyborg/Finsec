import { HttpClient, HttpRequestOptions } from './http-client';
import {
  Project,
  Scan,
  Finding,
  FindingSeverity,
  FindingStatus,
  ComplianceFramework,
  ComplianceControl,
  ComplianceSummary,
  MoneyAtRisk,
  AttackPath,
  FixProposal,
  Report,
  Rule,
  Suppression,
  Baseline,
} from '@sirius/types';

export interface ScanFilterOptions {
  projectId?: string;
  status?: string;
  limit?: number;
}

export interface FindingFilterOptions {
  projectId?: string;
  scanId?: string;
  severity?: FindingSeverity;
  status?: FindingStatus;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface AskHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CreateScanParams {
  target?: string;
  ruleset?: string;
  baselineCommit?: string;
  severityThreshold?: FindingSeverity;
  failOn?: string;
  projectId?: string;
  branch?: string;
}

/**
 * A thin client over `sirius serve`'s `/api/v1`.
 *
 * Every method here talks to the daemon and adapts its response with the
 * functions in `apps/desktop/src/api/adapters.ts` — passed in rather than
 * imported, so this package stays free of a dependency on the app that
 * consumes it. There is no mock fallback anywhere in this file: a request that
 * fails throws, and the caller decides what an empty state looks like. A
 * client that quietly substitutes invented data for a failed request is how a
 * demo shows numbers nobody can reproduce.
 */
/**
 * Deliberately typed with `any` on the wire side: the JSON crossing an HTTP
 * boundary is unknown until an adapter validates its shape, and each adapter
 * in `apps/desktop/src/api/adapters.ts` is typed against its own specific wire
 * interface — a `w: unknown` parameter here would make every call site cast,
 * which just moves the same escape hatch one file over.
 */
export interface ApiAdapters {
  toProject: (w: any) => Project;
  toScan: (w: any) => Scan;
  toFinding: (w: any) => Finding;
  toMoneyAtRisk: (w: any) => MoneyAtRisk;
  toRule: (w: any) => Rule;
  toComplianceFramework: (w: any) => ComplianceFramework;
  toComplianceSummary: (frameworks: any[], projectId: string) => ComplianceSummary;
  toComplianceControls: (frameworks: any[]) => ComplianceControl[];
  toAttackPath: (w: any, projectId: string) => AttackPath;
  toFixProposal: (w: any, finding: Finding) => FixProposal;
  toReport: (w: any, projectId: string) => Report;
  toSuppression: (w: any, projectId: string, index: number) => Suppression;
}

export class SiriusApiClient {
  constructor(
    private http: HttpClient,
    private adapt: ApiAdapters,
  ) {}

  // --- Health ---
  public async getHealth(options?: HttpRequestOptions): Promise<{ status?: string; version?: string }> {
    const res = await this.http.get<{ status?: string; version?: string }>('/healthz', options);
    return res.data;
  }

  // --- Projects ---
  public async getProjects(options?: HttpRequestOptions): Promise<Project[]> {
    const res = await this.http.get<unknown[]>('/projects', options);
    return res.data.map(this.adapt.toProject);
  }

  public async getProjectById(id: string, options?: HttpRequestOptions): Promise<Project> {
    const res = await this.http.get<unknown>(`/projects/${encodeURIComponent(id)}`, options);
    return this.adapt.toProject(res.data);
  }

  /** Registers a local directory as a project the daemon will serve. */
  public async createProject(path: string, options?: HttpRequestOptions): Promise<Project> {
    const res = await this.http.post<unknown>('/projects', { path }, options);
    return this.adapt.toProject(res.data);
  }

  // --- Scans ---
  public async getScans(filters?: ScanFilterOptions, options?: HttpRequestOptions): Promise<Scan[]> {
    if (filters?.projectId) {
      const res = await this.http.get<unknown[]>(
        `/projects/${encodeURIComponent(filters.projectId)}/history`,
        { ...options, params: { limit: filters.limit } },
      );
      return res.data.map(this.adapt.toScan);
    }
    const res = await this.http.get<unknown[]>('/scans', {
      ...options,
      params: { status: filters?.status, limit: filters?.limit },
    });
    return res.data.map(this.adapt.toScan);
  }

  public async getScanById(id: string, projectId?: string, options?: HttpRequestOptions): Promise<Scan> {
    const res = await this.http.get<unknown>(`/scans/${encodeURIComponent(id)}`, {
      ...options,
      params: { projectId },
    });
    return this.adapt.toScan(res.data);
  }

  public async startScan(params: CreateScanParams, options?: HttpRequestOptions): Promise<Scan> {
    const res = await this.http.post<unknown>(
      '/scans',
      {
        project_id: params.projectId,
        target: params.target ?? '.',
        ruleset: params.ruleset,
        baseline_commit: params.baselineCommit,
        severity_threshold: params.severityThreshold ?? 'high',
        fail_on: params.failOn ?? 'all',
      },
      options,
    );
    return this.adapt.toScan(res.data);
  }

  public async cancelScan(id: string, projectId?: string, options?: HttpRequestOptions): Promise<{ success: boolean }> {
    await this.http.delete<void>(`/scans/${encodeURIComponent(id)}`, { ...options, params: { projectId } });
    return { success: true };
  }

  /** The per-scan stream URL. `client.ts` opens a `WebSocket` against this directly. */
  public streamUrl(wsBaseUrl: string, scanId: string, token: string): string {
    const base = wsBaseUrl.replace(/\/$/, '');
    return `${base}/scans/${encodeURIComponent(scanId)}/stream?token=${encodeURIComponent(token)}`;
  }

  // --- Findings ---
  public async getFindings(filters?: FindingFilterOptions, options?: HttpRequestOptions): Promise<Finding[]> {
    if (filters?.scanId) {
      const res = await this.http.get<{ items: unknown[] }>(
        `/scans/${encodeURIComponent(filters.scanId)}/results`,
        { ...options, params: { projectId: filters.projectId, cursor: filters.cursor, severity: filters.severity } },
      );
      return res.data.items.map(this.adapt.toFinding);
    }
    const res = await this.http.get<unknown[]>('/findings', {
      ...options,
      params: { projectId: filters?.projectId, scanId: filters?.scanId, severity: filters?.severity, search: filters?.search },
    });
    return res.data.map(this.adapt.toFinding);
  }

  public async getFindingById(id: string, projectId?: string, options?: HttpRequestOptions): Promise<Finding> {
    const res = await this.http.get<unknown>(`/findings/${encodeURIComponent(id)}`, { ...options, params: { projectId } });
    return this.adapt.toFinding(res.data);
  }

  public async updateFindingStatus(
    scanId: string,
    findingId: string,
    status: FindingStatus,
    reason?: string,
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<Finding> {
    const res = await this.http.patch<unknown>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}`,
      { status, reason },
      { ...options, params: { projectId } },
    );
    return this.adapt.toFinding(res.data);
  }

  public async validateSecret(
    scanId: string,
    findingId: string,
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<{ validity: string; checked_at?: string; provider?: string; detail?: string }> {
    const res = await this.http.post<{ validity: string; checked_at?: string; provider?: string; detail?: string }>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/validate-secret`,
      undefined,
      { ...options, params: { projectId } },
    );
    return res.data;
  }

  // --- Money & compliance ---
  public async getMoneyAtRisk(projectId?: string, options?: HttpRequestOptions): Promise<MoneyAtRisk> {
    const res = await this.http.get<unknown>('/analytics/money-at-risk', { ...options, params: { projectId } });
    return this.adapt.toMoneyAtRisk(res.data);
  }

  private async frameworks(projectId?: string, options?: HttpRequestOptions): Promise<unknown[]> {
    const res = await this.http.get<unknown[]>('/compliance/frameworks', { ...options, params: { projectId } });
    return res.data;
  }

  public async getComplianceFrameworks(projectId?: string, options?: HttpRequestOptions): Promise<ComplianceFramework[]> {
    return (await this.frameworks(projectId, options)).map(this.adapt.toComplianceFramework);
  }

  public async getComplianceSummary(projectId?: string, options?: HttpRequestOptions): Promise<ComplianceSummary> {
    return this.adapt.toComplianceSummary(await this.frameworks(projectId, options), projectId ?? '');
  }

  public async getComplianceControls(projectId?: string, options?: HttpRequestOptions): Promise<ComplianceControl[]> {
    return this.adapt.toComplianceControls(await this.frameworks(projectId, options));
  }

  public async getComplianceControlById(
    controlId: string,
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<ComplianceControl | undefined> {
    const controls = await this.getComplianceControls(projectId, options);
    return controls.find((c) => c.id === controlId);
  }

  // --- Attack paths ---
  public async getAttackPaths(projectId?: string, options?: HttpRequestOptions): Promise<AttackPath[]> {
    const res = await this.http.get<unknown[]>('/attack-paths', { ...options, params: { projectId } });
    return res.data.map((w) => this.adapt.toAttackPath(w, projectId ?? ''));
  }

  public async getAttackPathById(id: string, projectId?: string, options?: HttpRequestOptions): Promise<AttackPath | undefined> {
    const paths = await this.getAttackPaths(projectId, options);
    return paths.find((p) => p.id === id);
  }

  /**
   * A real Gemini-written walkthrough of one attack chain — see
   * `engine/explain-attack-path.ts`. A generative call routinely runs past
   * the client's normal 15s default (the model spends real time "thinking"
   * before it writes anything, even with that turned down) — 45s here isn't
   * padding, it's the actual shape of this specific request.
   */
  public async explainAttackPath(path: AttackPath, options?: HttpRequestOptions): Promise<string> {
    const res = await this.http.post<{ explanation: string }>(
      '/attack-paths/explain',
      {
        title: path.title,
        narrative: path.description,
        moneyAtRiskInr: path.financialExposureUSD,
        steps: path.nodes.map((n) => ({
          role: (n.metadata?.role as string | undefined) ?? n.type,
          ruleId: (n.metadata?.ruleId as string | undefined) ?? n.label,
          file: (n.metadata?.file as string | undefined) ?? 'unknown',
          severity: n.severity ?? 'medium',
        })),
      },
      { timeoutMs: 45000, ...options },
    );
    return res.data.explanation;
  }

  // --- Cerebus fix ---
  public async getFixProposal(
    scanId: string,
    findingId: string,
    finding: Finding,
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<FixProposal> {
    const res = await this.http.post<unknown>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/fix`,
      undefined,
      { ...options, params: { projectId } },
    );
    return this.adapt.toFixProposal(res.data, finding);
  }

  /**
   * A real model answer. `history` is the conversation so far — prior turns
   * in this open session, threaded through so a follow-up question resolves
   * against what was actually said. See `engine/ask.ts`.
   */
  public async askCerebus(
    scanId: string,
    findingId: string,
    question: string,
    history: AskHistoryTurn[],
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<string> {
    const res = await this.http.post<{ answer: string }>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/ask`,
      { question, history },
      { ...options, params: { projectId } },
    );
    return res.data.answer;
  }

  /** The same chat with no finding selected — grounded in the project's most recent scan instead. */
  public async askCerebusGeneral(
    question: string,
    history: AskHistoryTurn[],
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<string> {
    const res = await this.http.post<{ answer: string }>(
      '/cerebus/ask',
      { question, history },
      { ...options, params: { projectId } },
    );
    return res.data.answer;
  }

  /** Writes the fix to disk. Only succeeds for a machine-applicable template — see `server/routes.ts`. */
  public async applyFix(
    scanId: string,
    findingId: string,
    finding: Finding,
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<FixProposal> {
    const res = await this.http.post<unknown>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/fix/apply`,
      undefined,
      { ...options, params: { projectId } },
    );
    return this.adapt.toFixProposal(res.data, finding);
  }

  // --- Rules ---
  public async getRules(category?: string, options?: HttpRequestOptions): Promise<Rule[]> {
    const res = await this.http.get<unknown[]>('/rules', { ...options, params: { category } });
    return res.data.map(this.adapt.toRule);
  }

  public async validateRule(yamlBody: string, options?: HttpRequestOptions): Promise<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }> {
    const res = await this.http.post<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }>(
      '/rules/validate',
      { yaml_body: yamlBody },
      options,
    );
    return res.data;
  }

  // --- Governance ---
  public async getSuppressions(projectId?: string, options?: HttpRequestOptions): Promise<Suppression[]> {
    const res = await this.http.get<unknown[]>('/suppressions', { ...options, params: { projectId } });
    return res.data.map((w, i) => this.adapt.toSuppression(w, projectId ?? '', i));
  }

  public async createSuppression(
    body: { rule_id?: string; path_glob?: string; fingerprint?: string; reason: string; expires_at?: string | null },
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<void> {
    await this.http.post('/suppressions', body, { ...options, params: { projectId } });
  }

  public async revokeSuppression(ruleId: string, projectId?: string, options?: HttpRequestOptions): Promise<void> {
    await this.http.delete(`/suppressions/${encodeURIComponent(ruleId)}`, { ...options, params: { projectId } });
  }

    public async getBaselines(projectId?: string, options?: HttpRequestOptions): Promise<Baseline[]> {
    const res = await this.http.get<Array<{ commit_sha: string | null; created_at: string; fingerprints: string[] }>>(
      '/baselines',
      { ...options, params: { projectId } },
    );
    return res.data.map((b, i) => ({
      id: `baseline-${i}`,
      projectId: projectId ?? '',
      scanId: '',
      branch: 'local',
      createdAt: b.created_at,
      createdBy: 'sirius CLI',
      findingCount: b.fingerprints.length,
      newCount: 0,
      unchangedCount: b.fingerprints.length,
      absentCount: 0,
      status: 'active' as const,
    }));
  }

  public async createBaseline(scanId: string, projectId?: string, options?: HttpRequestOptions): Promise<void> {
    await this.http.post('/baselines', { scan_id: scanId }, { ...options, params: { projectId } });
  }

  // --- Reports ---
  public async getReports(projectId?: string, options?: HttpRequestOptions): Promise<Report[]> {
    const res = await this.http.get<unknown[]>('/reports', { ...options, params: { projectId } });
    return res.data.map((w) => this.adapt.toReport(w, projectId ?? ''));
  }

  /**
   * A signed report or a SARIF document, straight from the response — the
   * caller decides whether to render it or hand it to `downloadBlob`.
   */
  // --- Config (read-only reflection of sirius.yaml) ---
  public async getConfig(projectId?: string, options?: HttpRequestOptions): Promise<{
    rulesets: string[];
    severity_threshold: string;
    fail_on: string;
    diff_aware: boolean;
    validate_secrets: boolean;
    project_id: string | null;
  }> {
    const res = await this.http.get<{
      rulesets: string[];
      severity_threshold: string;
      fail_on: string;
      diff_aware: boolean;
      validate_secrets: boolean;
      project_id: string | null;
    }>('/config', { ...options, params: { projectId } });
    return res.data;
  }

  public async getReport(
    scanId: string,
    format: 'pdf' | 'json' | 'sarif',
    projectId?: string,
    options?: HttpRequestOptions,
  ): Promise<unknown> {
    const res = await this.http.get<unknown>(`/scans/${encodeURIComponent(scanId)}/report`, {
      ...options,
      params: { format, projectId },
    });
    return res.data;
  }
}
