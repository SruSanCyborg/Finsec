import {
  MOCK_PROJECTS,
  MOCK_SCANS,
  MOCK_FINDINGS,
  MOCK_MONEY_AT_RISK,
  MOCK_COMPLIANCE_FRAMEWORKS,
  MOCK_FIX_RESULTS,
  MOCK_RULES,
  MOCK_NOTIFICATIONS,
} from './mock-data';





import {
  Project,
  Scan,
  Finding,
  ComplianceFramework,
  MoneyAtRisk,
  FixResult,
  Rule,
  Notification,
} from '@sirius/types';


import { ScanStreamEvent } from '@sirius/api';
import { MockScanSimulator, SimulatorEventHandler } from './scan-simulator';

import { MockCerebusService } from './cerebus-service';
import { MockRemediationService } from './mock-remediation-service';
import { MockAttackPathService } from './mock-attack-path-service';
import { MockComplianceService } from './mock-compliance-service';
import { MockGovernanceService } from './mock-governance-service';
import { MockReportService } from './mock-report-service';
import { MockSettingsService } from './mock-settings-service';

export class MockApiService {
  private projects: Project[] = [...MOCK_PROJECTS];
  private scans: Scan[] = [...MOCK_SCANS];
  private findings: Finding[] = [...MOCK_FINDINGS];
  private streamHandlers: Set<SimulatorEventHandler> = new Set();
  private cerebusService = new MockCerebusService();
  private remediationService = new MockRemediationService();
  private attackPathService = new MockAttackPathService();
  private complianceService = new MockComplianceService();
  private governanceService = new MockGovernanceService();
  private reportService = new MockReportService();
  private settingsService = new MockSettingsService();

  public onStreamEvent(handler: SimulatorEventHandler): () => void {
    this.streamHandlers.add(handler);
    return () => this.streamHandlers.delete(handler);
  }

  public async getSettings() {
    return this.settingsService.getSettings();
  }

  public async updateSettings(patch: Parameters<MockSettingsService['updateSettings']>[0]) {
    return this.settingsService.updateSettings(patch);
  }

  public async testConnection() {
    return this.settingsService.testConnection();
  }

  public async getIntegrations() {
    return this.settingsService.getIntegrations();
  }

  public async getIntegrationById(id: string) {
    return this.settingsService.getIntegrationById(id);
  }

  public async connectIntegration(id: string, config?: Record<string, string>) {
    return this.settingsService.connectIntegration(id, config);
  }

  public async disconnectIntegration(id: string) {
    return this.settingsService.disconnectIntegration(id);
  }


  public async getReports(projectId?: string) {
    return this.reportService.getReports(projectId);
  }

  public async getReportById(reportId: string) {
    return this.reportService.getReportById(reportId);
  }

  public async generateReport(params: Parameters<MockReportService['generateReport']>[0]) {
    return this.reportService.generateReport(params);
  }

  public async downloadReportPdf(reportId: string) {
    return this.reportService.downloadReportPdf(reportId);
  }

  public async downloadReportSarif(reportId: string) {
    return this.reportService.downloadReportSarif(reportId);
  }


  public async getSuppressions(projectId?: string) {
    return this.governanceService.getSuppressions(projectId);
  }

  public async createSuppression(params: Parameters<MockGovernanceService['createSuppression']>[0]) {
    return this.governanceService.createSuppression(params);
  }

  public async revokeSuppression(suppressionId: string) {
    return this.governanceService.revokeSuppression(suppressionId);
  }

  public async getBaselines(projectId?: string) {
    return this.governanceService.getBaselines(projectId);
  }

  public async createBaseline(params: Parameters<MockGovernanceService['createBaseline']>[0]) {
    return this.governanceService.createBaseline(params);
  }

  public async triageFinding(params: Parameters<MockGovernanceService['triageFinding']>[0]) {
    return this.governanceService.triageFinding(params);
  }



  public async getComplianceSummary(projectId?: string) {
    return this.complianceService.getComplianceSummary(projectId);
  }

  public async getComplianceControls(frameworkId?: string) {
    return this.complianceService.getComplianceControls(frameworkId);
  }

  public async getComplianceControlById(controlId: string) {
    return this.complianceService.getComplianceControlById(controlId);
  }

  public async getAttackPaths(projectId?: string) {
    return this.attackPathService.getAttackPaths(projectId);
  }

  public async getAttackPathById(pathId: string) {
    return this.attackPathService.getAttackPathById(pathId);
  }

  public async getFixProposal(findingId: string) {
    return this.remediationService.getFixProposal(findingId);
  }

  public async applyFixProposal(findingId: string) {
    return this.remediationService.applyFixProposal(findingId);
  }

  public async rejectFixProposal(findingId: string, reason?: string) {
    return this.remediationService.rejectFixProposal(findingId, reason);
  }


  public async getCerebusAnalysis(findingId?: string, query?: string, projectId?: string) {
    if (findingId) {
      return this.cerebusService.analyzeFinding(findingId, query);
    }
    return this.cerebusService.askGeneralQuestion(query || 'Security status summary', projectId);
  }


  public async getProjects(): Promise<Project[]> {
    return this.projects;
  }

  public async getProjectById(id: string): Promise<Project> {
    const prj = this.projects.find((p) => p.id === id);
    if (!prj) throw new Error(`Project ${id} not found`);
    return prj;
  }

  public async createProject(data: Partial<Project>): Promise<Project> {
    const newPrj: Project = {
      id: `prj-${Date.now()}`,
      name: data.name || 'unnamed-project',
      repositoryUrl: data.repositoryUrl || 'https://github.com/org/repo.git',
      branch: data.branch || 'main',
      complianceScore: 100,
      moneyAtRiskUSD: 0,
      openFindingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.projects.push(newPrj);
    return newPrj;
  }

  public async getScans(projectId?: string): Promise<Scan[]> {
    if (projectId) return this.scans.filter((s) => s.projectId === projectId);
    return this.scans;
  }

  public async getScanById(id: string): Promise<Scan> {
    const scan = this.scans.find((s) => s.id === id);
    if (!scan) throw new Error(`Scan ${id} not found`);
    return scan;
  }

  public async startScan(projectId: string, _branch = 'main'): Promise<Scan> {
    const newScan: Scan = {
      id: `scan-${Date.now()}`,
      projectId,
      status: 'running',
      progress: {
        phase: 'initialization',
        percentComplete: 5,
        filesScanned: 10,
        totalFiles: 450,
        currentFile: 'src/index.ts',
        findingsFound: 0,
        elapsedTimeMs: 120,
      },
      startedAt: new Date().toISOString(),
      commitHash: 'b94e10d8',
      initiatedBy: 'current.user@finsec.io',
    };
    this.scans.unshift(newScan);

    // Instantiate mock scan stream simulation internally
    const simulator = new MockScanSimulator();
    simulator.subscribe((evt: ScanStreamEvent) => {
      this.streamHandlers.forEach((handler) => handler(evt));
    });
    simulator.runDemoScan(newScan.id);

    return newScan;
  }

  public async getFindings(projectId?: string, scanId?: string): Promise<Finding[]> {
    let res = this.findings;
    if (projectId) res = res.filter((f) => f.projectId === projectId);
    if (scanId) res = res.filter((f) => f.scanId === scanId);
    return res;
  }

  public async getFindingById(id: string): Promise<Finding> {
    const fnd = this.findings.find((f) => f.id === id);
    if (!fnd) throw new Error(`Finding ${id} not found`);
    return fnd;
  }

  public async getMoneyAtRisk(): Promise<MoneyAtRisk> {
    return MOCK_MONEY_AT_RISK;
  }

  public async getComplianceFrameworks(): Promise<ComplianceFramework[]> {
    return MOCK_COMPLIANCE_FRAMEWORKS;
  }


  public async triggerCerebusFix(findingId: string): Promise<{ pipelineId: string }> {
    return { pipelineId: `pipe-${findingId}` };
  }

  public async getFixResult(findingId: string): Promise<FixResult> {
    return MOCK_FIX_RESULTS[findingId] || MOCK_FIX_RESULTS['fnd-88219'];
  }

  public async getRules(): Promise<Rule[]> {
    return MOCK_RULES;
  }

  public async getNotifications(): Promise<Notification[]> {

    return MOCK_NOTIFICATIONS;
  }
}
