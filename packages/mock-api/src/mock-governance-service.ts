import { Suppression, Baseline, Finding, FindingStatus } from '@sirius/types';
import { MOCK_FINDINGS } from './mock-data';

export const MOCK_SUPPRESSIONS: Suppression[] = [
  {
    id: 'sup-901',
    projectId: 'prj-finsec-core-01',
    ruleId: 'FIN-PCI-603',
    scope: 'project',
    reason: 'accepted_risk',
    reasonText: 'Payment payload logging is masked by downstream API proxy logger filter.',
    status: 'active',
    createdBy: 'Shivam Pandey (Lead DevSecOps)',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    affectedFindingIds: ['fnd-88220'],
  },
];

export const MOCK_BASELINES: Baseline[] = [
  {
    id: 'base-101',
    projectId: 'prj-finsec-core-01',
    scanId: 'scan-109283',
    branch: 'main',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    createdBy: 'FinSec Automated CI/CD Engine',
    findingCount: 125,
    newCount: 7,
    unchangedCount: 118,
    absentCount: 5,
    status: 'active',
  },
];

export class MockGovernanceService {
  private suppressions: Suppression[] = [...MOCK_SUPPRESSIONS];
  private baselines: Baseline[] = [...MOCK_BASELINES];

  public async getSuppressions(projectId?: string): Promise<Suppression[]> {
    if (projectId) {
      return this.suppressions.filter((s) => s.projectId === projectId);
    }
    return this.suppressions;
  }

  public async getBaselines(projectId?: string): Promise<Baseline[]> {
    if (projectId) {
      return this.baselines.filter((b) => b.projectId === projectId);
    }
    return this.baselines;
  }

  public async createSuppression(params: {
    projectId: string;
    ruleId: string;
    scope: 'project' | 'rule' | 'path';
    reason: Suppression['reason'];
    reasonText?: string;
    expiresInDays?: number;
    affectedFindingIds?: string[];
  }): Promise<Suppression> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newSuppression: Suppression = {
      id: `sup-${Date.now().toString().slice(-4)}`,
      projectId: params.projectId,
      ruleId: params.ruleId,
      scope: params.scope,
      reason: params.reason,
      reasonText: params.reasonText,
      status: 'active',
      createdBy: 'Shivam Pandey (Lead DevSecOps)',
      createdAt: new Date().toISOString(),
      expiresAt: params.expiresInDays
        ? new Date(Date.now() + 86400000 * params.expiresInDays).toISOString()
        : undefined,
      affectedFindingIds: params.affectedFindingIds || [],
    };

    this.suppressions.unshift(newSuppression);

    // Update affected findings status
    params.affectedFindingIds?.forEach((fId) => {
      const finding = MOCK_FINDINGS.find((f) => f.id === fId);
      if (finding) {
        finding.suppressionStatus = 'active';
        finding.suppressionId = newSuppression.id;
        finding.triageHistory = finding.triageHistory || [];
        finding.triageHistory.unshift({
          id: `th-${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: 'suppressed',
          actor: newSuppression.createdBy,
          notes: params.reasonText || `Suppressed under rule ${params.ruleId}`,
        });
      }
    });

    return newSuppression;
  }

  public async revokeSuppression(suppressionId: string): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const item = this.suppressions.find((s) => s.id === suppressionId);
    if (item) {
      item.status = 'revoked';
      // Reopen affected findings
      item.affectedFindingIds.forEach((fId) => {
        const finding = MOCK_FINDINGS.find((f) => f.id === fId);
        if (finding) {
          finding.suppressionStatus = 'none';
          finding.suppressionId = undefined;
          finding.triageHistory = finding.triageHistory || [];
          finding.triageHistory.unshift({
            id: `th-${Date.now()}`,
            timestamp: new Date().toISOString(),
            action: 'reopened',
            actor: 'Shivam Pandey (Lead DevSecOps)',
            notes: `Suppression ${suppressionId} revoked by user.`,
          });
        }
      });
    }

    return { success: true };
  }

  public async createBaseline(params: {
    projectId: string;
    scanId: string;
    branch: string;
  }): Promise<Baseline> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Archive previous baselines
    this.baselines.forEach((b) => {
      if (b.projectId === params.projectId) b.status = 'archived';
    });

    const newBaseline: Baseline = {
      id: `base-${Date.now().toString().slice(-4)}`,
      projectId: params.projectId,
      scanId: params.scanId,
      branch: params.branch,
      createdAt: new Date().toISOString(),
      createdBy: 'Shivam Pandey (Lead DevSecOps)',
      findingCount: MOCK_FINDINGS.length,
      newCount: 0,
      unchangedCount: MOCK_FINDINGS.length,
      absentCount: 0,
      status: 'active',
    };

    this.baselines.unshift(newBaseline);
    return newBaseline;
  }

  public async triageFinding(params: {
    findingId: string;
    status: FindingStatus;
    reasonText?: string;
  }): Promise<Finding> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const finding = MOCK_FINDINGS.find((f) => f.id === params.findingId);
    if (!finding) {
      throw new Error(`Finding ${params.findingId} not found`);
    }

    finding.status = params.status;
    finding.updatedAt = new Date().toISOString();
    finding.triageHistory = finding.triageHistory || [];

    let actionName: 'triaged' | 'fixed' | 'accepted' | 'reopened' = 'triaged';
    if (params.status === 'fixed') actionName = 'fixed';
    if (params.status === 'ignored') actionName = 'accepted';
    if (params.status === 'open') actionName = 'reopened';

    if (params.status === 'ignored') {
      finding.acceptedRiskReason = params.reasonText || 'Risk accepted by security team.';
      finding.acceptedBy = 'Shivam Pandey (Lead DevSecOps)';
    }

    finding.triageHistory.unshift({
      id: `th-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: actionName,
      actor: 'Shivam Pandey (Lead DevSecOps)',
      notes: params.reasonText || `Triage status updated to ${params.status}`,
    });

    return finding;
  }
}
