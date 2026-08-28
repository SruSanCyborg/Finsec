import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockApiService } from './client';
import { FindingSeverity, FindingStatus } from '@sirius/types';

export function useProjectsQuery() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => mockApiService.getProjects(),
  });
}

export function useProjectQuery(projectId: string | null) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => (projectId ? mockApiService.getProjectById(projectId) : null),
    enabled: Boolean(projectId),
  });
}

export function useScansQuery(projectId?: string) {
  return useQuery({
    queryKey: ['scans', projectId],
    queryFn: () => mockApiService.getScans(projectId),
  });
}

export function useScanQuery(scanId: string | null) {
  return useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => (scanId ? mockApiService.getScanById(scanId) : null),
    enabled: Boolean(scanId),
  });
}

export function useCreateScanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      projectId: string;
      branch?: string;
      severityThreshold?: FindingSeverity;
      failOn?: 'all' | 'new' | 'verified-secrets';
    }) => mockApiService.startScan(params.projectId, params.branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useFindingsQuery(projectId?: string, scanId?: string) {
  return useQuery({
    queryKey: ['findings', projectId, scanId],
    queryFn: () => mockApiService.getFindings(projectId, scanId),
  });
}

export function useCerebusAnalysisQuery(findingId?: string, query?: string, projectId?: string) {
  return useQuery({
    queryKey: ['cerebus-analysis', findingId, query, projectId],
    queryFn: () => mockApiService.getCerebusAnalysis(findingId, query, projectId),
    enabled: Boolean(findingId || query || projectId),
  });
}

export function useCerebusMutation() {
  return useMutation({
    mutationFn: (params: { findingId?: string; query: string; projectId?: string }) =>
      mockApiService.getCerebusAnalysis(params.findingId, params.query, params.projectId),
  });
}

export function useFixProposalQuery(findingId?: string) {
  return useQuery({
    queryKey: ['fix-proposal', findingId],
    queryFn: () => mockApiService.getFixProposal(findingId!),
    enabled: Boolean(findingId),
  });
}

export function useApplyFixMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => mockApiService.applyFixProposal(findingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['fix-proposal'] });
    },
  });
}

export function useRejectFixMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { findingId: string; reason?: string }) =>
      mockApiService.rejectFixProposal(params.findingId, params.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fix-proposal'] });
    },
  });
}



export function useMoneyAtRiskQuery() {
  return useQuery({
    queryKey: ['money-at-risk'],
    queryFn: () => mockApiService.getMoneyAtRisk(),
  });
}

export function useAttackPathsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['attack-paths', projectId],
    queryFn: () => mockApiService.getAttackPaths(projectId),
  });
}

export function useAttackPathQuery(pathId?: string) {
  return useQuery({
    queryKey: ['attack-path', pathId],
    queryFn: () => mockApiService.getAttackPathById(pathId!),
    enabled: Boolean(pathId),
  });
}



export function useComplianceFrameworksQuery() {
  return useQuery({
    queryKey: ['compliance-frameworks'],
    queryFn: () => mockApiService.getComplianceFrameworks(),
  });
}

export function useComplianceSummaryQuery(projectId?: string) {
  return useQuery({
    queryKey: ['compliance-summary', projectId],
    queryFn: () => mockApiService.getComplianceSummary(projectId),
  });
}

export function useComplianceControlsQuery(frameworkId?: string) {
  return useQuery({
    queryKey: ['compliance-controls', frameworkId],
    queryFn: () => mockApiService.getComplianceControls(frameworkId),
  });
}

export function useComplianceControlQuery(controlId?: string) {
  return useQuery({
    queryKey: ['compliance-control', controlId],
    queryFn: () => mockApiService.getComplianceControlById(controlId!),
    enabled: Boolean(controlId),
  });
}

// --- Governance Query & Mutation Hooks ---
export function useSuppressionsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['suppressions', projectId],
    queryFn: () => mockApiService.getSuppressions(projectId),
  });
}

export function useCreateSuppressionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof mockApiService.createSuppression>[0]) =>
      mockApiService.createSuppression(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppressions'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['finding'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] });
    },
  });
}

export function useRevokeSuppressionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suppressionId: string) => mockApiService.revokeSuppression(suppressionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppressions'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['finding'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] });
    },
  });
}

export function useBaselinesQuery(projectId?: string) {
  return useQuery({
    queryKey: ['baselines', projectId],
    queryFn: () => mockApiService.getBaselines(projectId),
  });
}

export function useCreateBaselineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { projectId: string; scanId: string; branch: string }) =>
      mockApiService.createBaseline(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useTriageFindingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { findingId: string; status: FindingStatus; reasonText?: string }) =>
      mockApiService.triageFinding(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['finding'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] });
    },
  });
}


// --- Report Query & Mutation Hooks ---

export function useReportsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['reports', projectId],
    queryFn: () => mockApiService.getReports(projectId),
  });
}

export function useReportQuery(reportId?: string) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: () => mockApiService.getReportById(reportId!),
    enabled: Boolean(reportId),
  });
}

export function useGenerateReportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof mockApiService.generateReport>[0]) =>
      mockApiService.generateReport(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useDownloadReportPdfMutation() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const blob = await mockApiService.downloadReportPdf(reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SIRIUS-Security-Report-${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

export function useDownloadReportSarifMutation() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const blob = await mockApiService.downloadReportSarif(reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SIRIUS-Evidence-${reportId}.sarif.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

// --- Settings & Integrations Hooks ---
export function useSettingsQuery() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => mockApiService.getSettings(),
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof mockApiService.updateSettings>[0]) =>
      mockApiService.updateSettings(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] });
    },
  });
}

export function useTestConnectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => mockApiService.testConnection(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useIntegrationsQuery() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => mockApiService.getIntegrations(),
  });
}

export function useIntegrationQuery(id?: string) {
  return useQuery({
    queryKey: ['integration', id],
    queryFn: () => mockApiService.getIntegrationById(id!),
    enabled: Boolean(id),
  });
}

export function useConnectIntegrationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; config?: Record<string, string> }) =>
      mockApiService.connectIntegration(params.id, params.config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

export function useDisconnectIntegrationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockApiService.disconnectIntegration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}






export function useDashboardDataQuery(projectId: string | null) {
  const projectsQuery = useProjectsQuery();
  const projectQuery = useProjectQuery(projectId);
  const scansQuery = useScansQuery(projectId || undefined);
  const findingsQuery = useFindingsQuery(projectId || undefined);
  const moneyAtRiskQuery = useMoneyAtRiskQuery();
  const complianceQuery = useComplianceFrameworksQuery();

  const isLoading =
    projectsQuery.isLoading ||
    projectQuery.isLoading ||
    scansQuery.isLoading ||
    findingsQuery.isLoading ||
    moneyAtRiskQuery.isLoading ||
    complianceQuery.isLoading;

  const isError =
    projectsQuery.isError ||
    projectQuery.isError ||
    scansQuery.isError ||
    findingsQuery.isError ||
    moneyAtRiskQuery.isError ||
    complianceQuery.isError;

  return {
    isLoading,
    isError,
    projects: projectsQuery.data || [],
    activeProject: projectQuery.data || projectsQuery.data?.[0] || null,
    scans: scansQuery.data || [],
    findings: findingsQuery.data || [],
    moneyAtRisk: moneyAtRiskQuery.data || null,
    complianceFrameworks: complianceQuery.data || [],
    refetch: () => {
      projectsQuery.refetch();
      projectQuery.refetch();
      scansQuery.refetch();
      findingsQuery.refetch();
      moneyAtRiskQuery.refetch();
      complianceQuery.refetch();
    },
  };
}
