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
}

export class SiriusApiClient {
  constructor(private http: HttpClient) {}

  // --- Projects ---
  public async getProjects(options?: HttpRequestOptions): Promise<Project[]> {
    const res = await this.http.get<Project[]>('/projects', options);
    return res.data;
  }

  public async getProjectById(id: string, options?: HttpRequestOptions): Promise<Project> {
    const res = await this.http.get<Project>(`/projects/${id}`, options);
    return res.data;
  }

  public async createProject(data: Partial<Project>, options?: HttpRequestOptions): Promise<Project> {
    const res = await this.http.post<Project>('/projects', data, options);
    return res.data;
  }

  // --- Scans ---
  public async getScans(filters?: ScanFilterOptions, options?: HttpRequestOptions): Promise<Scan[]> {
    const res = await this.http.get<Scan[]>('/scans', { ...options, params: filters as Record<string, string | number> });
    return res.data;
  }

  public async getScanById(id: string, options?: HttpRequestOptions): Promise<Scan> {
    const res = await this.http.get<Scan>(`/scans/${id}`, options);
    return res.data;
  }

  public async startScan(projectId: string, branch?: string, options?: HttpRequestOptions): Promise<Scan> {
    const res = await this.http.post<Scan>('/scans', { projectId, branch }, options);
    return res.data;
  }

  public async cancelScan(id: string, options?: HttpRequestOptions): Promise<{ success: boolean }> {
    const res = await this.http.post<{ success: boolean }>(`/scans/${id}/cancel`, undefined, options);
    return res.data;
  }

  // --- Findings ---
  public async getFindings(filters?: FindingFilterOptions, options?: HttpRequestOptions): Promise<Finding[]> {
    const res = await this.http.get<Finding[]>('/findings', { ...options, params: filters as Record<string, string | number> });
    return res.data;
  }

  public async getFindingById(id: string, options?: HttpRequestOptions): Promise<Finding> {
    const res = await this.http.get<Finding>(`/findings/${id}`, options);
    return res.data;
  }

  public async updateFindingStatus(id: string, status: FindingStatus, comment?: string, options?: HttpRequestOptions): Promise<Finding> {
    const res = await this.http.patch<Finding>(`/findings/${id}`, { status, comment }, options);
    return res.data;
  }

  // --- Money At Risk ---
  public async getMoneyAtRisk(projectId?: string, options?: HttpRequestOptions): Promise<MoneyAtRisk> {
    const res = await this.http.get<MoneyAtRisk>('/analytics/money-at-risk', {
      ...options,
      params: { projectId },
    });
    return res.data;
  }

  // --- Compliance ---
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

  // --- Cerebus Fix ---
  public async triggerCerebusFix(findingId: string, options?: HttpRequestOptions): Promise<{ pipelineId: string }> {
    const res = await this.http.post<{ pipelineId: string }>('/cerebus/fix', { findingId }, options);
    return res.data;
  }

  public async getFixResult(findingId: string, options?: HttpRequestOptions): Promise<FixResult> {
    const res = await this.http.get<FixResult>(`/cerebus/fix-result/${findingId}`, options);
    return res.data;
  }

  // --- Reports ---
  public async getReports(projectId?: string, options?: HttpRequestOptions): Promise<Report[]> {
    const res = await this.http.get<Report[]>('/reports', { ...options, params: { projectId } });
    return res.data;
  }

  // --- Settings & Integrations ---
  public async getRules(options?: HttpRequestOptions): Promise<Rule[]> {
    const res = await this.http.get<Rule[]>('/settings/rules', options);
    return res.data;
  }

  public async getIntegrations(options?: HttpRequestOptions): Promise<Integration[]> {
    const res = await this.http.get<Integration[]>('/settings/integrations', options);
    return res.data;
  }

  public async getNotifications(options?: HttpRequestOptions): Promise<Notification[]> {
    const res = await this.http.get<Notification[]>('/notifications', options);
    return res.data;
  }
}
