/**
 * React Query hooks over the local daemon.
 *
 * `sirius serve` — no mock, no fallback. Every hook here reads or writes the
 * real engine, through the same `.sirius/` state a terminal on this machine
 * reads and writes too. A hook that fails throws through React Query's own
 * `isError`/`error`; nothing here substitutes invented data for a failed
 * request, because a demo that shows numbers nobody can reproduce is worse
 * than a query that visibly failed.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { siriusApiClient, connectToScan } from './client';
import { FindingSeverity, FindingStatus } from '@sirius/types';

// --- Projects ---

export function useProjectsQuery() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => siriusApiClient.getProjects(),
  });
}

export function useProjectQuery(projectId: string | null) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => siriusApiClient.getProjectById(projectId!),
    enabled: Boolean(projectId),
  });
}

/** Opens a local directory in the daemon, so it appears in the project switcher. */
export function useAddProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => siriusApiClient.createProject(path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// --- Scans ---

export function useScansQuery(projectId?: string) {
  return useQuery({
    queryKey: ['scans', projectId],
    queryFn: () => siriusApiClient.getScans({ projectId }),
  });
}

export function useScanQuery(scanId: string | null, projectId?: string) {
  return useQuery({
    queryKey: ['scan', scanId, projectId],
    queryFn: () => siriusApiClient.getScanById(scanId!, projectId),
    enabled: Boolean(scanId),
    // The engine finishes a small repo in well under a second, so a scan that
    // is still `running` when this fires is worth checking again shortly — the
    // WebSocket carries the findings as they arrive, but the scan's own
    // status here is what tells a page it can stop showing a spinner.
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 500 : false),
  });
}

export function useCreateScanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      target?: string;
      severityThreshold?: FindingSeverity;
      failOn?: 'all' | 'new' | 'verified-secrets';
    }) => {
      const scan = await siriusApiClient.startScan({
        projectId: params.projectId,
        target: params.target,
        severityThreshold: params.severityThreshold,
        failOn: params.failOn,
      });
      // Open the stream immediately — the scan is already running by the time
      // this resolves, and the daemon has buffered whatever it emitted before
      // this connection existed.
      connectToScan(scan.id);
      return scan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCancelScanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { scanId: string; projectId?: string }) =>
      siriusApiClient.cancelScan(params.scanId, params.projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scans'] }),
  });
}

// --- Findings ---

export function useFindingsQuery(projectId?: string, scanId?: string) {
  return useQuery({
    queryKey: ['findings', projectId, scanId],
    queryFn: () => siriusApiClient.getFindings({ projectId, scanId }),
  });
}

export function useFindingQuery(findingId?: string, projectId?: string) {
  return useQuery({
    queryKey: ['finding', findingId, projectId],
    queryFn: () => siriusApiClient.getFindingById(findingId!, projectId),
    enabled: Boolean(findingId),
  });
}

export function useTriageFindingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { scanId: string; findingId: string; status: FindingStatus; reasonText?: string; projectId?: string }) =>
      siriusApiClient.updateFindingStatus(params.scanId, params.findingId, params.status, params.reasonText, params.projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['finding'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] });
    },
  });
}

export function useValidateSecretMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { scanId: string; findingId: string; projectId?: string }) =>
      siriusApiClient.validateSecret(params.scanId, params.findingId, params.projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['findings'] }),
  });
}

// --- Cerebus fix ---
//
// "Cerebus" is `engine/fix.ts`'s template engine and verifier first, always —
// deterministic and free beats a model call for the shapes a template covers.
// Only when nothing matches does the daemon ask Groq, quarantined to one line
// of the file and one structured answer (see `engine/fix.ts`). `getFixProposal`
// builds and verifies a fix without writing it (the CLI's `fix --dry-run`);
// `useApplyFixMutation` writes it (`fix --apply`), and only when the result —
// template or model — was judged machine-applicable.

export function useFixProposalQuery(params: { scanId?: string; findingId?: string; projectId?: string; finding?: import('@sirius/types').Finding }) {
  return useQuery({
    queryKey: ['fix-proposal', params.scanId, params.findingId],
    queryFn: () => siriusApiClient.getFixProposal(params.scanId!, params.findingId!, params.finding!, params.projectId),
    enabled: Boolean(params.scanId && params.findingId && params.finding),
  });
}

export function useApplyFixMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { scanId: string; findingId: string; projectId?: string; finding: import('@sirius/types').Finding }) =>
      siriusApiClient.applyFix(params.scanId, params.findingId, params.finding, params.projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['fix-proposal'] });
    },
  });
}

/**
 * Cerebus's chat: a real Groq call. Grounded in the selected finding's
 * recorded facts when one is selected, or the project's most recent scan
 * summary when none is — never fabricated, and never blocked on having a
 * finding open. `history` carries the conversation so far, which is what
 * gives it memory across turns — see `engine/ask.ts`. Throws (503) if the
 * daemon has no `GROQ_API_KEY` configured; the composer shows that plainly
 * rather than inventing an answer client-side.
 */
export function useAskCerebusMutation() {
  return useMutation({
    mutationFn: (params: {
      question: string;
      history: import('@sirius/api').AskHistoryTurn[];
      projectId?: string;
      finding?: { scanId: string; id: string };
    }) =>
      params.finding
        ? siriusApiClient.askCerebus(
            params.finding.scanId,
            params.finding.id,
            params.question,
            params.history,
            params.projectId,
          )
        : siriusApiClient.askCerebusGeneral(params.question, params.history, params.projectId),
  });
}

// --- Money & compliance ---

export function useMoneyAtRiskQuery(projectId?: string) {
  return useQuery({
    queryKey: ['money-at-risk', projectId],
    queryFn: () => siriusApiClient.getMoneyAtRisk(projectId),
  });
}

export function useAttackPathsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['attack-paths', projectId],
    queryFn: () => siriusApiClient.getAttackPaths(projectId),
  });
}

export function useAttackPathQuery(pathId?: string, projectId?: string) {
  return useQuery({
    queryKey: ['attack-path', pathId, projectId],
    queryFn: () => siriusApiClient.getAttackPathById(pathId!, projectId),
    enabled: Boolean(pathId),
  });
}

/** A real Gemini-written walkthrough of the selected attack chain — see `engine/explain-attack-path.ts`. */
export function useExplainAttackPathMutation() {
  return useMutation({
    mutationFn: (path: import('@sirius/types').AttackPath) => siriusApiClient.explainAttackPath(path),
  });
}

export function useComplianceFrameworksQuery(projectId?: string) {
  return useQuery({
    queryKey: ['compliance-frameworks', projectId],
    queryFn: () => siriusApiClient.getComplianceFrameworks(projectId),
  });
}

export function useComplianceSummaryQuery(projectId?: string) {
  return useQuery({
    queryKey: ['compliance-summary', projectId],
    queryFn: () => siriusApiClient.getComplianceSummary(projectId),
  });
}

export function useComplianceControlsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['compliance-controls', projectId],
    queryFn: () => siriusApiClient.getComplianceControls(projectId),
  });
}

export function useComplianceControlQuery(controlId?: string, projectId?: string) {
  return useQuery({
    queryKey: ['compliance-control', controlId, projectId],
    queryFn: () => siriusApiClient.getComplianceControlById(controlId!, projectId),
    enabled: Boolean(controlId),
  });
}

// --- Governance ---

export function useSuppressionsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['suppressions', projectId],
    queryFn: () => siriusApiClient.getSuppressions(projectId),
  });
}

export function useCreateSuppressionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      projectId?: string;
      rule_id?: string;
      path_glob?: string;
      fingerprint?: string;
      reason: string;
      expires_at?: string | null;
    }) => siriusApiClient.createSuppression(params, params.projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppressions'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] });
    },
  });
}

export function useBaselinesQuery(projectId?: string) {
  return useQuery({
    queryKey: ['baselines', projectId],
    queryFn: () => siriusApiClient.getBaselines(projectId),
  });
}

export function useCreateBaselineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { scanId: string; projectId?: string }) =>
      siriusApiClient.createBaseline(params.scanId, params.projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useRevokeSuppressionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    // `id` here is the suppression's `ruleId` — see the note on
    // `SiriusApiClient.revokeSuppression` for why a rule id, not the
    // synthetic list id, is what the daemon can act on.
    mutationFn: (params: { ruleId: string; projectId?: string }) =>
      siriusApiClient.revokeSuppression(params.ruleId, params.projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppressions'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

// --- Reports ---

export function useReportsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['reports', projectId],
    queryFn: () => siriusApiClient.getReports(projectId),
  });
}

export function useReportQuery(scanId?: string, projectId?: string) {
  return useQuery({
    queryKey: ['report', scanId, projectId],
    queryFn: () => siriusApiClient.getReport(scanId!, 'json', projectId),
    enabled: Boolean(scanId),
  });
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useDownloadReportPdfMutation() {
  return useMutation({
    mutationFn: async (params: { scanId: string; projectId?: string }) => {
      const { httpClient } = await import('./client');
      const blob = await httpClient.getBlob(`/scans/${encodeURIComponent(params.scanId)}/report`, {
        params: { format: 'pdf', projectId: params.projectId },
      });
      await downloadBlob(blob, `sirius-report-${params.scanId}.pdf`);
    },
  });
}

export function useDownloadReportSarifMutation() {
  return useMutation({
    mutationFn: async (params: { scanId: string; projectId?: string }) => {
      const sarif = await siriusApiClient.getReport(params.scanId, 'sarif', params.projectId);
      const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: 'application/json' });
      await downloadBlob(blob, `sirius-evidence-${params.scanId}.sarif.json`);
    },
  });
}

// --- Rules ---

export function useRulesQuery(category?: string) {
  return useQuery({
    queryKey: ['rules', category],
    queryFn: () => siriusApiClient.getRules(category),
  });
}

// --- Settings ---
//
// The daemon has no concept of workspace settings — one directory, one engine,
// nothing to configure remotely. This reflects the real connection (the URL
// and token this window is actually using, and a live health probe) rather
// than inventing an editable settings object a backend would have to honour.
// `useUpdateSettingsMutation` and the integrations hooks below were removed
// with the mock: there is nothing on this daemon for them to call, and a
// button that reports success without doing anything is worse than no button.

export function useSettingsQuery(projectId?: string) {
  return useQuery({
    queryKey: ['settings', projectId],
    queryFn: async () => {
      const { getSiriusEnv } = await import('@sirius/utils');
      const env = getSiriusEnv();
      const started = performance.now();
      let connectionStatus: 'connected' | 'disconnected' | 'error' = 'error';
      try {
        await siriusApiClient.getHealth();
        connectionStatus = 'connected';
      } catch {
        connectionStatus = 'disconnected';
      }
      // `sirius.yaml`'s own values — real config, not a settings object the
      // daemon invents. Falls back to the tool's own defaults rather than
      // fabricated ones when no config file is present.
      const config = await siriusApiClient.getConfig(projectId).catch(() => null);

      return {
        workspaceName: 'sirius',
        defaultProjectId: config?.project_id ?? '',
        defaultBranch: 'local',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateFormat: 'YYYY-MM-DD',
        apiEndpoint: env.VITE_API_URL,
        environment: env.VITE_APP_ENV,
        // No login on a local daemon — there is no key to mask.
        apiKeyMasked: env.VITE_API_TOKEN ? `token •••${env.VITE_API_TOKEN.slice(-4)}` : 'none',
        connectionStatus,
        latencyMs: Math.round(performance.now() - started),
        policy: {
          severityThreshold: (config?.severity_threshold as FindingSeverity) ?? 'high',
          failOn: (config?.fail_on as 'all' | 'new' | 'verified-secrets') ?? 'all',
        },
        // Nothing runs in the background to notify about — a scan the window
        // did not ask for is not going to happen. Every toggle here defaults
        // off rather than claiming a delivery channel that does not exist.
        notificationPreferences: {
          criticalAlerts: false,
          scanCompletion: false,
          complianceDegradation: false,
          securityBreach: false,
        },
      };
    },
  });
}

export function useTestConnectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const started = performance.now();
      await siriusApiClient.getHealth();
      return { success: true, latencyMs: Math.round(performance.now() - started), message: 'Connected to sirius serve.' };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

/**
 * `sirius.yaml` is edited with a text editor or `sirius init`, not a form —
 * the daemon has no write endpoint for it, and giving this button a real
 * effect means deciding how a partial YAML edit merges with the file on disk,
 * which is `sirius init`'s job, not this one's. Resolves without writing
 * anything, and the settings shown are refetched from the real file
 * afterwards — so a save that changed nothing is followed by a screen that
 * still shows nothing changed, rather than a screen that lies about it.
 */
export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    // Accepts whatever patch a settings panel offers and does nothing with
    // it — there is no write endpoint on the daemon for any of this. The
    // parameter exists only so every existing `onSave={(patch) => ...}` call
    // site keeps compiling against a real, typed shape rather than `void`.
    mutationFn: async (_patch: Partial<import('@sirius/types').WorkspaceSettings>) => undefined,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

/**
 * No integration runs anywhere in this build — there is no CI webhook, no
 * ticketing sync, no chat notifier. An empty list is the true answer; the
 * connect/disconnect handlers below exist only so the settings panel does not
 * crash when someone opens the tab, and they refuse rather than pretend.
 */
export function useIntegrationsQuery() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async (): Promise<import('@sirius/types').Integration[]> => [],
  });
}

export function useConnectIntegrationMutation() {
  return useMutation({
    mutationFn: async (_params: { id: string; config?: Record<string, string> }): Promise<never> => {
      throw new Error('No integrations are available from a local sirius serve daemon.');
    },
  });
}

export function useDisconnectIntegrationMutation() {
  return useMutation({
    mutationFn: async (_id: string): Promise<never> => {
      throw new Error('No integrations are available from a local sirius serve daemon.');
    },
  });
}

// --- Dashboard ---

export function useDashboardDataQuery(projectId: string | null) {
  const projectsQuery = useProjectsQuery();
  const projectQuery = useProjectQuery(projectId);
  const scansQuery = useScansQuery(projectId || undefined);
  const findingsQuery = useFindingsQuery(projectId || undefined);
  const moneyAtRiskQuery = useMoneyAtRiskQuery(projectId || undefined);
  const complianceQuery = useComplianceFrameworksQuery(projectId || undefined);

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
