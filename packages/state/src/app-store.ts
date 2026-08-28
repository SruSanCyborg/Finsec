import { create } from 'zustand';

export type AppLifecycle =
  | 'boot'
  | 'onboarding_welcome'
  | 'onboarding_auth'
  | 'onboarding_project'
  | 'onboarding_primer'
  | 'ready';

export interface AppState {
  lifecyclePhase: AppLifecycle;
  activeProjectId: string | null;
  activeScanId: string | null;
  isOfflineMode: boolean;
  isSidebarCollapsed: boolean;
  hasCompletedOnboarding: boolean;

  setLifecyclePhase: (phase: AppLifecycle) => void;
  setActiveProject: (projectId: string | null) => void;
  setActiveScan: (scanId: string | null) => void;
  setOfflineMode: (offline: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  lifecyclePhase: 'boot',
  activeProjectId: 'prj-finsec-core-01', // Seed default active project
  activeScanId: null,
  isOfflineMode: false,
  isSidebarCollapsed: false,
  hasCompletedOnboarding: false,

  setLifecyclePhase: (lifecyclePhase) => set({ lifecyclePhase }),
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  setActiveScan: (activeScanId) => set({ activeScanId }),
  setOfflineMode: (isOfflineMode) => set({ isOfflineMode }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  completeOnboarding: () => set({ hasCompletedOnboarding: true, lifecyclePhase: 'ready' }),
  resetOnboarding: () => set({ hasCompletedOnboarding: false, lifecyclePhase: 'onboarding_welcome' }),
}));
