import { HttpClient, HttpRequestOptions } from './http-client';
import {
  Project,
  Scan,
  Finding,
  FindingSeverity,
  FindingStatus,
  ComplianceFramework,
  MoneyAtRisk,
  AttackPath,
  FixResult,
  Report,
  Rule,
  Integration,
  Notification,
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

export interface CreateScanParams {
  target?: string;
  ruleset?: string;
  baselineCommit?: string;
  severityThreshold?: FindingSeverity;
  failOn?: string;
  projectId?: string;
  branch?: string;
}

export class SiriusApiClient {
  constructor(private http: HttpClient) {}

  // --- Health Check ---
  public async getHealth(options?: HttpRequestOptions): Promise<{ status?: string; version?: string }> {
    const res = await this.http.get<{ status?: string; version?: string }>('/healthz', options);
    return res.data;
  }

  // --- Projects ---
  public async getProjects(options?: HttpRequestOptions): Promise<Project[]> {
    try {
      const res = await this.http.get<Project[]>('/projects', options);
      return res.data;
    } catch {
      return [];
    }
  }

  public async getProjectById(id: string, options?: HttpRequestOptions): Promise<Project> {
    const res = await this.http.get<Project>(`/projects/${id}`, options);
    return res.data;
  }

  public async createProject(data: Partial<Project>, options?: HttpRequestOptions): Promise<Project> {
    const res = await this.http.post<Project>('/projects', data, options);
    return res.data;
  }

  // --- Scans (Finsec OpenAPI Endpoint: POST /scans, GET /scans/{id}, DELETE /scans/{id}) ---
  public async getScans(filters?: ScanFilterOptions, options?: HttpRequestOptions): Promise<Scan[]> {
    try {
      if (filters?.projectId) {
        const res = await this.http.get<Scan[]>(`/projects/${encodeURIComponent(filters.projectId)}/history`, options);
        return res.data;
      }
      const res = await this.http.get<Scan[]>('/scans', { ...options, params: filters as Record<string, string | number> });
      return res.data;
    } catch {
      return [];
    }
  }

  public async getScanById(id: string, options?: HttpRequestOptions): Promise<Scan> {
    const res = await this.http.get<Scan>(`/scans/${encodeURIComponent(id)}`, options);
    return res.data;
  }

  public async startScan(params: CreateScanParams | string, _branch?: string, options?: HttpRequestOptions): Promise<Scan> {
    const body = typeof params === 'string'
      ? { target: '.', ruleset: 'p/fintech-core', severity_threshold: 'medium', fail_on: 'all' }
      : {
          target: params.target || '.',
          ruleset: params.ruleset || 'p/fintech-core',
          baseline_commit: params.baselineCommit,
          severity_threshold: params.severityThreshold || 'medium',
          fail_on: params.failOn || 'all',
        };

    const res = await this.http.post<Scan>('/scans', body, options);
    return res.data;
  }

  public async cancelScan(id: string, options?: HttpRequestOptions): Promise<{ success: boolean }> {
    await this.http.delete<void>(`/scans/${encodeURIComponent(id)}`, options);
    return { success: true };
  }

  // --- Findings (Finsec OpenAPI Endpoint: GET /scans/{id}/results, PATCH /scans/{id}/findings/{fid}) ---
  public async getFindings(filters?: FindingFilterOptions, options?: HttpRequestOptions): Promise<Finding[]> {
    if (filters?.scanId) {
      try {
        const res = await this.http.get<{ items: Finding[]; next_cursor?: string }>(
          `/scans/${encodeURIComponent(filters.scanId)}/results`,
          { ...options, params: { cursor: filters.cursor, severity: filters.severity } }
        );
        return res.data.items || [];
      } catch {
        return [];
      }
    }
    try {
      const res = await this.http.get<Finding[]>('/findings', { ...options, params: filters as Record<string, string | number> });
      return res.data;
    } catch {
      return [];
    }
  }

  public async getFindingById(id: string, scanId?: string, options?: HttpRequestOptions): Promise<Finding> {
    if (scanId) {
      const findings = await this.getFindings({ scanId }, options);
      const found = findings.find((f) => f.id === id);
      if (found) return found;
    }
    const res = await this.http.get<Finding>(`/findings/${encodeURIComponent(id)}`, options);
    return res.data;
  }

  public async updateFindingStatus(
    findingId: string,
    status: FindingStatus,
    comment?: string,
    scanId?: string,
    reason?: string,
    options?: HttpRequestOptions
  ): Promise<Finding> {
    const targetScanId = scanId || 'scan-01';
    const body = {
      status,
      comment: comment || undefined,
      reason: reason || 'Triage decision from GUI',
    };
    const res = await this.http.patch<Finding>(
      `/scans/${encodeURIComponent(targetScanId)}/findings/${encodeURIComponent(findingId)}`,
      body,
      options
    );
    return res.data;
  }

  public async validateSecret(scanId: string, findingId: string, options?: HttpRequestOptions): Promise<{ validity: string; checked_at?: string }> {
    const res = await this.http.post<{ validity: string; checked_at?: string }>(
      `/scans/${encodeURIComponent(scanId)}/findings/${encodeURIComponent(findingId)}/validate-secret`,
      undefined,
      options
    );
    return res.data;
  }

  // --- Money At Risk & Compliance ---
  public async getMoneyAtRisk(projectId?: string, options?: HttpRequestOptions): Promise<MoneyAtRisk> {
    const res = await this.http.get<MoneyAtRisk>('/analytics/money-at-risk', {
      ...options,
      params: { projectId },
    });
    return res.data;
  }

  public async getComplianceFrameworks(projectId?: string, options?: HttpRequestOptions): Promise<ComplianceFramework[]> {
    const res = await this.http.get<ComplianceFramework[]>('/compliance/frameworks', {
      ...options,
      params: { projectId },
    });
    return res.data;
  }

  // --- Attack Paths ---
  public async getAttackPaths(projectId?: string, options?: HttpRequestOptions): Promise<AttackPath[]> {
    const res = await this.http.get<AttackPath[]>('/attack-paths', { ...options, params: { projectId } });
    return res.data;
  }

  // --- Cerebus Fix (Finsec OpenAPI Endpoint: POST /scans/{id}/findings/{fid}/fix) ---
  public async triggerCerebusFix(findingId: string, scanId?: string, options?: HttpRequestOptions): Promise<{ pipelineId: string; suggestion?: FixResult }> {
    const targetScanId = scanId || 'scan-01';
    const res = await this.http.post<FixResult>(
      `/scans/${encodeURIComponent(targetScanId)}/findings/${encodeURIComponent(findingId)}/fix`,
      undefined,
      options
    );
    return {
      pipelineId: `pipe-${findingId}`,
      suggestion: res.data,
    };
  }

  public async getFixResult(findingId: string, options?: HttpRequestOptions): Promise<FixResult> {
    const res = await this.http.get<FixResult>(`/cerebus/fix-result/${encodeURIComponent(findingId)}`, options);
    return res.data;
  }

  // --- Reports (Finsec OpenAPI Endpoint: GET /scans/{id}/report) ---
  public async getReport(scanId: string, format: 'pdf' | 'json' | 'sarif', options?: HttpRequestOptions): Promise<unknown> {
    const res = await this.http.get<unknown>(`/scans/${encodeURIComponent(scanId)}/report`, {
      ...options,
      params: { format },
    });
    return res.data;
  }

  public async getReports(projectId?: string, options?: HttpRequestOptions): Promise<Report[]> {
    const res = await this.http.get<Report[]>('/reports', { ...options, params: { projectId } });
    return res.data;
  }

  // --- Governance & Rules (Finsec OpenAPI Endpoints: GET /rules, GET /suppressions, GET /baselines) ---
  public async getRules(options?: HttpRequestOptions): Promise<Rule[]> {
    const res = await this.http.get<Rule[]>('/rules', options);
    return res.data;
  }

  public async validateRule(yamlBody: string, options?: HttpRequestOptions): Promise<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }> {
    const res = await this.http.post<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }>(
      '/rules/validate',
      { yaml_body: yamlBody },
      options
    );
    return res.data;
  }

  public async getSuppressions(projectId?: string, options?: HttpRequestOptions): Promise<Suppression[]> {
    const res = await this.http.get<Suppression[]>('/suppressions', {
      ...options,
      params: { project_id: projectId },
    });
    return res.data;
  }

  public async createSuppression(body: Record<string, unknown>, options?: HttpRequestOptions): Promise<Suppression> {
    const res = await this.http.post<Suppression>('/suppressions', body, options);
    return res.data;
  }

  public async getBaselines(projectId?: string, options?: HttpRequestOptions): Promise<Baseline[]> {
    const res = await this.http.get<Baseline[]>('/baselines', {
      ...options,
      params: { project_id: projectId },
    });
    return res.data;
  }

  public async createBaseline(body: Record<string, unknown>, options?: HttpRequestOptions): Promise<Baseline> {
    const res = await this.http.post<Baseline>('/baselines', body, options);
    return res.data;
  }

  // --- Settings & Integrations ---
  public async getIntegrations(options?: HttpRequestOptions): Promise<Integration[]> {
    const res = await this.http.get<Integration[]>('/settings/integrations', options);
    return res.data;
  }

  public async getNotifications(options?: HttpRequestOptions): Promise<Notification[]> {
    const res = await this.http.get<Notification[]>('/notifications', options);
    return res.data;
  }
}

