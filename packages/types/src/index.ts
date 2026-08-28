/**
 * SIRIUS GUI Domain Types
 * Source of truth for domain data contracts exchanged with FinSec Core API.
 */

// --- Project ---
export interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  lastScanId?: string;
  lastScanTimestamp?: string;
  complianceScore?: number; // 0-100
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
  /* PROVISIONAL */
  customSettings?: Record<string, unknown>;
}

// --- Scan & Scan Progress ---
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScanProgress {
  phase: 'initialization' | 'ast_parsing' | 'rule_evaluation' | 'cerebus_check' | 'compliance_calculation' | 'reporting' | 'completed' | 'indexing' | 'analyzing';
  percentComplete: number;
  filesScanned: number;
  totalFiles: number;
  currentFile?: string;
  findingsFound: number;
  elapsedTimeMs: number;
}

export interface ScanConsoleEvent {
  id: string;
  timestamp: string;
  category: 'SYSTEM' | 'INDEX' | 'RULE' | 'FINDING' | 'COMPLIANCE' | 'RISK';
  message: string;
  level?: string;
  file?: string;
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
    gateResult?: 'passed' | 'blocked';
    severityThreshold?: FindingSeverity;
    failOn?: 'all' | 'new' | 'verified-secrets';
  };
  /* PROVISIONAL */
  engineVersion?: string;
}


// --- Finding & Categories ---
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'triaged' | 'fixed' | 'false_positive' | 'ignored';
export type FindingCategory = 'secret_leak' | 'crypto_flaw' | 'auth_bypass' | 'access_control' | 'injection' | 'data_exposure' | 'compliance_violation' | 'secrets' | 'auth' | 'pii' | 'crypto' | 'logging' | 'ratelimit' | 'supplychain' | 'security';


export interface SecretValidity {
  status: 'valid' | 'revoked' | 'unknown' | 'expired';
  lastCheckedAt: string;
  provider?: string;
  /* PROVISIONAL */
  tokenMetadata?: Record<string, string>;
}

export interface TriageHistoryEntry {
  id: string;
  timestamp: string;
  action: 'opened' | 'triaged' | 'fixed' | 'accepted' | 'suppressed' | 'reopened';
  actor: string;
  notes?: string;
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
  baselineState?: 'new' | 'unchanged' | 'absent';
  suppressionStatus?: 'active' | 'expired' | 'none';
  suppressionId?: string;
  acceptedRiskReason?: string;
  acceptedBy?: string;
  triageHistory?: TriageHistoryEntry[];
  complianceMappings?: Array<{ framework: string; controlId: string; description?: string }>;
  remediationGuidance?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint?: string;
  /* PROVISIONAL */
  cveId?: string;
  cweId?: string;
}

export interface Suppression {
  id: string;
  projectId: string;
  ruleId: string;
  scope: 'project' | 'rule' | 'path';
  reason: 'false_positive' | 'accepted_risk' | 'compensating_control' | 'not_applicable' | 'temporary_exception';
  reasonText?: string;
  status: 'active' | 'expired' | 'revoked';
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  affectedFindingIds: string[];
}

export interface Baseline {
  id: string;
  projectId: string;
  scanId: string;
  branch: string;
  createdAt: string;
  createdBy: string;
  findingCount: number;
  newCount: number;
  unchangedCount: number;
  absentCount: number;
  status: 'active' | 'archived';
}



// --- Money At Risk ---
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
  /* PROVISIONAL */
  valuationModelVersion?: string;
}

// --- Baseline State ---
export interface BaselineState {
  id: string;
  projectId: string;
  baselineCommitHash: string;
  createdScanId: string;
  createdAt: string;
  /* PROVISIONAL */
  approvedBy?: string;
}

// --- Compliance Framework & References ---
export interface ComplianceReference {
  frameworkId: string;
  section: string;
  requirementTitle: string;
  status: 'compliant' | 'non_compliant' | 'not_applicable';
  associatedFindingIds: string[];
}

export type ComplianceControlStatus = 'pass' | 'fail' | 'partial' | 'not_evaluated';

export interface ComplianceControl {
  id: string;
  frameworkId: string;
  section: string;
  title: string;
  description: string;
  status: ComplianceControlStatus;
  affectedFindingIds: string[];
  evidenceDescription?: string;
  evidenceSourceLocation?: string;
  evidenceScanReference?: string;
  remediationGuidance?: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface ComplianceSummary {
  projectId: string;
  overallScore: number;
  trend?: 'improving' | 'stable' | 'declining';
  evaluatedCount: number;
  passingCount: number;
  failingCount: number;
  partialCount: number;
  executiveNarrative?: string;
  lastAuditedAt?: string;
}

export interface ComplianceFramework {
  id: string; // e.g. 'pci-dss-4.0', 'soc2-type2', 'iso27001'
  name: string;
  version: string;
  overallScore: number; // 0-100
  passedCount: number;
  failedCount: number;
  totalCount: number;
  references: ComplianceReference[];
  /* PROVISIONAL */
  lastAuditedAt?: string;
}


// --- Attack Path & Graph Nodes ---
export interface AttackPathNode {
  id: string;
  label: string;
  type: 'entry' | 'finding' | 'service' | 'credential' | 'identity' | 'asset' | 'database' | 'external' | 'endpoint' | 'entrypoint' | 'vulnerability' | 'privilege_escalation' | 'data_exfiltration';
  severity?: FindingSeverity;
  findingId?: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export interface AttackPathEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  relationship?: string;
  riskWeight?: number;
}

export interface AttackPath {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  severity: FindingSeverity;
  entryNodeId: string;
  targetNodeId: string;
  entryLabel: string;
  targetLabel: string;
  nodes: AttackPathNode[];
  edges: AttackPathEdge[];
  nodeCount: number;
  findingCount: number;
  financialExposureUSD: number;
  estimatedExploitabilityScore: number; // 0-10
  findingIds: string[];
  /* PROVISIONAL */
  vectorType?: string;
}


// --- Cerebus Pipeline & Fix Result ---
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
  /* PROVISIONAL */
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
  /* PROVISIONAL */
  verificationDetails?: string;
}

// --- Report & Verification ---
export type ReportType = 'executive' | 'technical' | 'compliance';
export type ReportStatus = 'queued' | 'generating' | 'ready' | 'failed';

export interface ReportSummary {
  overallScore: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  moneyAtRiskUSD: number;
  passedControlsCount: number;
  failedControlsCount: number;
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
  scanId: string;
  type: ReportType;
  title: string;
  status: ReportStatus;
  format?: 'pdf' | 'json' | 'csv' | 'sarif';
  generatedAt: string;
  createdBy: string;
  downloadUrl?: string;
  summary?: ReportSummary;
  verification?: ReportVerification;
  verificationStatus?: 'verified' | 'unverified';
  /* PROVISIONAL */
  fileSizeBytes?: number;
  frameworkId?: string;
}


// --- Rule ---
export interface Rule {
  id: string;
  code: string;
  name: string;
  category: FindingCategory;
  severity: FindingSeverity;
  description: string;
  isEnabled: boolean;
  /* PROVISIONAL */
  customThresholds?: Record<string, unknown>;
}

// --- Integration & Workspace Settings ---
export type IntegrationCategory = 'source_control' | 'cicd' | 'alerting' | 'ticketing' | 'messaging';

export interface IntegrationConfig {
  repository?: string;
  webhookUrlMasked?: string;
  channel?: string;
  severityThreshold?: FindingSeverity;
  apiTokenMasked?: string;
}

export interface Integration {
  id: string;
  name: string;
  type: 'github' | 'gitlab' | 'jira' | 'slack' | 'pagerduty' | 'webhook' | 'github_actions';
  category: IntegrationCategory;
  description: string;
  status: 'connected' | 'disconnected' | 'configuration_required' | 'error';
  configuredAt?: string;
  lastSyncAt?: string;
  config?: IntegrationConfig;
  /* PROVISIONAL */
  configSummary?: string;
}

export interface WorkspaceSettings {
  workspaceName: string;
  defaultProjectId: string;
  defaultBranch: string;
  timezone: string;
  dateFormat: string;
  apiEndpoint: string;
  environment: 'development' | 'staging' | 'production';
  apiKeyMasked: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  latencyMs: number;
  policy: {
    severityThreshold: FindingSeverity;
    failOn: 'all' | 'new' | 'verified-secrets';
  };
  notificationPreferences: {
    criticalAlerts: boolean;
    scanCompletion: boolean;
    complianceDegradation: boolean;
    securityBreach: boolean;
  };
}


// --- Team Member ---
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'security_engineer' | 'auditor' | 'developer';
  avatarUrl?: string;
}

// --- Notification ---
export interface Notification {
  id: string;
  type: 'scan_complete' | 'critical_finding' | 'cerebus_fix_ready' | 'compliance_drop' | 'system_alert';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
}

// --- Cerebus AI Security Analyst ---
export interface CerebusRemediationProposal {
  title: string;
  summary: string;
  steps: string[];
  diff?: {
    filePath: string;
    oldCode: string;
    newCode: string;
  };
}

export interface CerebusResponse {
  id: string;
  findingId?: string;
  message: string;
  sections?: {
    analysis?: string;
    impact?: string;
    recommendation?: string;
    references?: string[];
  };
  proposedRemediation?: CerebusRemediationProposal;
  proposalStatus?: 'proposed' | 'generating' | 'ready';
  verifierStatus?: 'passed' | 'pending' | 'failed' | 'escalated' | 'unavailable';
  createdAt: string;
}

export interface CerebusRequest {
  findingId?: string;
  projectId?: string;
  scanId?: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface CerebusMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  response?: CerebusResponse;
  state: 'thinking' | 'streaming' | 'complete' | 'error';
  timestamp: string;
}

// --- Fix & Remediation Lifecycle ---
export interface FixVerificationCheck {
  name: string;
  status: 'pass' | 'fail' | 'pending';
  message?: string;
}

export interface FixProposal {
  id: string;
  findingId: string;
  projectId: string;
  title: string;
  summary: string;
  proposalStatus: 'proposed' | 'generating' | 'ready';
  verifierStatus: 'passed' | 'pending' | 'failed' | 'escalated' | 'unavailable';
  verifierMessage?: string;
  diff: {
    filePath: string;
    oldCode: string;
    newCode: string;
    additionsCount: number;
    deletionsCount: number;
  };
  steps: string[];
  verificationChecks: FixVerificationCheck[];
  isStaleFile?: boolean;
  createdAt: string;
}

export interface FixApplicationResult {
  success: boolean;
  status: 'applied' | 'failed' | 'rolled_back';
  backupCreated: boolean;
  reverified: boolean;
  message: string;
  appliedAt?: string;
}


