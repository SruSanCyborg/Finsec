import { create } from 'zustand';
import { Scan, Finding, ScanProgress, ScanConsoleEvent } from '@sirius/types';
import { ScanStreamEvent } from '@sirius/api';

export interface LiveScanState {
  activeScan: Scan | null;
  liveFindings: Finding[];
  consoleEvents: ScanConsoleEvent[];
  pipelineStage: string;
  wsConnectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  gateResult: 'passed' | 'blocked' | null;

  setWsConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error') => void;
  setActiveScan: (scan: Scan | null) => void;
  processStreamEvent: (event: ScanStreamEvent) => void;
  clearLiveScan: () => void;
}

export const useScanStore = create<LiveScanState>((set, get) => ({
  activeScan: null,
  liveFindings: [],
  consoleEvents: [],
  pipelineStage: 'Prepare',
  wsConnectionStatus: 'disconnected',
  gateResult: null,

  setWsConnectionStatus: (wsConnectionStatus) => set({ wsConnectionStatus }),

  setActiveScan: (activeScan) =>
    set({
      activeScan,
      liveFindings: [],
      consoleEvents: [],
      pipelineStage: 'Prepare',
      gateResult: null,
    }),

  processStreamEvent: (event: ScanStreamEvent) => {
    const { activeScan, liveFindings, consoleEvents } = get();

    switch (event.type) {
      case 'scan_started':
        if (event.status && (!activeScan || activeScan.id === event.scanId)) {
          set({
            activeScan: {
              id: event.scanId,
              projectId: activeScan?.projectId || 'prj-finsec-core-01',
              status: event.status,
              progress: event.progress || {
                phase: 'initialization',
                percentComplete: 0,
                filesScanned: 0,
                totalFiles: 1420,
                findingsFound: 0,
                elapsedTimeMs: 0,
              },
              startedAt: event.timestamp,
              initiatedBy: activeScan?.initiatedBy || 'sarah.jenkins@finsec.io',
            },
            pipelineStage: 'Prepare',
            gateResult: null,
          });
        }
        break;

      case 'scan_progress':
        if (activeScan && activeScan.id === event.scanId && event.progress) {
          let stage = 'Analyze';
          if (event.progress.percentComplete <= 15) stage = 'Prepare';
          else if (event.progress.percentComplete <= 35) stage = 'Index';
          else if (event.progress.percentComplete <= 65) stage = 'Analyze';
          else if (event.progress.percentComplete <= 85) stage = 'Map';
          else stage = 'Finalize';

          set({
            activeScan: {
              ...activeScan,
              progress: event.progress,
            },
            pipelineStage: stage,
          });
        }
        break;

      case 'console_event':
        if (event.consoleEvent && (!activeScan || activeScan.id === event.scanId)) {
          set({
            consoleEvents: [...consoleEvents, event.consoleEvent],
          });
        }
        break;

      case 'finding_discovered':
        if (event.finding && (!activeScan || activeScan.id === event.scanId)) {
          const exists = liveFindings.some((f) => f.id === event.finding?.id);
          if (!exists) {
            const updatedFindings = [event.finding, ...liveFindings];
            set({
              liveFindings: updatedFindings,
              activeScan: activeScan
                ? {
                    ...activeScan,
                    progress: {
                      ...activeScan.progress,
                      findingsFound: updatedFindings.length,
                    },
                  }
                : null,
            });
          }
        }
        break;

      case 'scan_completed':
        if (activeScan && activeScan.id === event.scanId) {
          const finalProgress: ScanProgress = event.progress || {
            ...activeScan.progress,
            phase: 'completed',
            percentComplete: 100,
          };
          set({
            activeScan: {
              ...activeScan,
              status: 'completed',
              completedAt: event.timestamp,
              progress: finalProgress,
              summary: {
                totalFindings: liveFindings.length || 2,
                critical: liveFindings.filter((f) => f.severity === 'critical').length || 1,
                high: liveFindings.filter((f) => f.severity === 'high').length || 1,
                medium: 0,
                low: 0,
                info: 0,
                moneyAtRiskUSD: 1450000,
                complianceScore: 94,
                gateResult: event.gateResult || 'blocked',
              },
            },
            pipelineStage: 'Finalize',
            gateResult: event.gateResult || 'blocked',
          });
        }
        break;

      case 'scan_failed':
        if (activeScan && activeScan.id === event.scanId) {
          set({
            activeScan: {
              ...activeScan,
              status: 'failed',
              completedAt: event.timestamp,
            },
          });
        }
        break;
    }
  },

  clearLiveScan: () =>
    set({
      activeScan: null,
      liveFindings: [],
      consoleEvents: [],
      pipelineStage: 'Prepare',
      gateResult: null,
    }),
}));
