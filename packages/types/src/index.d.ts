/**
 * SIRIUS GUI Domain Types
 * Source of truth for domain data contracts exchanged with FinSec Core API.
 */
export interface Project {
    id: string;
    name: string;
    repositoryUrl: string;
    branch: string;
    lastScanId?: string;
    lastScanTimestamp?: string;
    complianceScore?: number;
    moneyAtRiskUSD?: number;
    openFindingsCount?: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
    createdAt: string;
    updatedAt: string;
    customSettings?: Record<string, unknown>;
}
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface ScanProgress {
    phase: 'initialization' | 'ast_parsing' | 'rule_evaluation' | 'cerebus_check' | 'compliance_calculation' | 'reporting' | 'completed';
    percentComplete: number;
    filesScanned: number;
    totalFiles: number;
    currentFile?: string;
    findingsFound: number;
    elapsedTimeMs: number;
}
export interface Scan {
    id: string;
    projectId: string;
    status: ScanStatus;
    progress: ScanProgress;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    commitHash?: string;
    initiatedBy: string;
    summary?: {
        totalFindings: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
        moneyAtRiskUSD: number;
        complianceScore: number;
    };
    engineVersion?: string;
}
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'triaged' | 'fixed' | 'false_positive' | 'ignored';
export type FindingCategory = 'secret_leak' | 'crypto_flaw' | 'auth_bypass' | 'access_control' | 'injection' | 'data_exposure' | 'compliance_violation';
export interface SecretValidity {
    status: 'valid' | 'revoked' | 'unknown' | 'expired';
    lastCheckedAt: string;
    provider?: string;
    tokenMetadata?: Record<string, string>;
}
export interface Finding {
    id: string;
    scanId: string;
    projectId: string;
    ruleId: string;
    title: string;
    description: string;
    severity: FindingSeverity;
    status: FindingStatus;
    category: FindingCategory;
    filePath: string;
    startLine: number;
    endLine: number;
    codeSnippet?: string;
    moneyAtRiskUSD?: number;
    secretValidity?: SecretValidity;
    remediationGuidance?: string;
    createdAt: string;
    updatedAt: string;
    cveId?: string;
    cweId?: string;
}
export interface MoneyAtRisk {
    totalUSD: number;
    criticalUSD: number;
    highUSD: number;
    mediumUSD: number;
    breakdownByFindingId: Record<string, number>;
    trendHistory: Array<{
        timestamp: string;
        amountUSD: number;
    }>;
    valuationModelVersion?: string;
}
export interface BaselineState {
    id: string;
    projectId: string;
    baselineCommitHash: string;
    createdScanId: string;
    createdAt: string;
    approvedBy?: string;
}
export interface ComplianceReference {
    frameworkId: string;
    section: string;
    requirementTitle: string;
    status: 'compliant' | 'non_compliant' | 'not_applicable';
    associatedFindingIds: string[];
}
export interface ComplianceFramework {
    id: string;
    name: string;
    version: string;
    overallScore: number;
    passedCount: number;
    failedCount: number;
    totalCount: number;
    references: ComplianceReference[];
    lastAuditedAt?: string;
}
export interface AttackPathNode {
    id: string;
    label: string;
    type: 'entrypoint' | 'vulnerability' | 'privilege_escalation' | 'asset' | 'data_exfiltration';
    severity?: FindingSeverity;
    findingId?: string;
    metadata?: Record<string, unknown>;
}
export interface AttackPathEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    label?: string;
    riskWeight?: number;
}
export interface AttackPath {
    id: string;
    projectId: string;
    title: string;
    entryNodeId: string;
    targetNodeId: string;
    nodes: AttackPathNode[];
    edges: AttackPathEdge[];
    estimatedExploitabilityScore: number;
    vectorType?: string;
}
export type CerebusStage = 'analysis' | 'sandbox_gen' | 'validation' | 'pr_creation' | 'completed' | 'failed';
export interface CerebusPipeline {
    id: string;
    findingId: string;
    status: CerebusStage;
    currentStage: string;
    logs: Array<{
        timestamp: string;
        level: 'info' | 'warn' | 'error';
        message: string;
    }>;
    progressPercent: number;
    startedAt: string;
    completedAt?: string;
    agentModelVersion?: string;
}
export interface FixResult {
    id: string;
    findingId: string;
    pipelineId: string;
    status: 'applied' | 'pending_review' | 'rejected' | 'failed';
    originalCode: string;
    proposedCode: string;
    diff: string;
    pullRequestUrl?: string;
    createdBranch?: string;
    verificationPassed: boolean;
    verificationDetails?: string;
}
export interface ReportVerification {
    isVerified: boolean;
    signature: string;
    verifiedAt: string;
    verifierCertificate: string;
}
export interface Report {
    id: string;
    projectId: string;
    title: string;
    format: 'pdf' | 'json' | 'csv' | 'sarif';
    generatedAt: string;
    downloadUrl: string;
    verification?: ReportVerification;
    fileSizeBytes?: number;
}
export interface Rule {
    id: string;
    code: string;
    name: string;
    category: FindingCategory;
    severity: FindingSeverity;
    description: string;
    isEnabled: boolean;
    customThresholds?: Record<string, unknown>;
}
export interface Integration {
    id: string;
    name: 'github' | 'gitlab' | 'jira' | 'slack' | 'pagerduty';
    status: 'connected' | 'disconnected' | 'error';
    configuredAt?: string;
    configSummary?: string;
}
export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'security_engineer' | 'auditor' | 'developer';
    avatarUrl?: string;
}
export interface Notification {
    id: string;
    type: 'scan_complete' | 'critical_finding' | 'cerebus_fix_ready' | 'compliance_drop' | 'system_alert';
    title: string;
    message: string;
    timestamp: string;
    isRead: boolean;
    actionUrl?: string;
}
