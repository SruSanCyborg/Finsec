import { create } from 'zustand';
import { Notification } from '@sirius/types';

export type ThemeMode = 'day' | 'night';

export interface UIState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;

  isCommandPaletteOpen: boolean;
  isNotificationPanelOpen: boolean; // Notification Drawer
  isShortcutsSheetOpen: boolean;
  activeModal: string | null;
  notifications: Notification[];

  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleNotificationPanel: () => void;
  setNotificationPanelOpen: (open: boolean) => void;
  toggleShortcutsSheet: () => void;
  setShortcutsSheetOpen: (open: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;

  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

export const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-01',
    type: 'critical_finding',
    title: 'Critical Vulnerability Discovered',
    message: 'Hardcoded JWT Signing Private Key detected in finsec-core-gateway (auth.ts:42).',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    isRead: false,
    actionUrl: '/findings',
  },
  {
    id: 'notif-02',
    type: 'scan_complete',
    title: 'AST Scan Completed Successfully',
    message: 'Scanned 1,420 files in 42.3s. Discovered 27 total security findings.',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    isRead: false,
    actionUrl: '/scans/scan-109283',
  },
  {
    id: 'notif-03',
    type: 'cerebus_fix_ready',
    title: 'Cerebus Patch Ready for Review',
    message: 'Proposed automated PR #402 for JWT key rotation in core-gateway.',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    isRead: true,
    actionUrl: '/findings',
  },
];

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem('sirius_theme') as ThemeMode;
    if (saved === 'day' || saved === 'night') {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', saved);
      }
      return saved;
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', 'day');
  }
  return 'day';
};

export const useUIStore = create<UIState>((set) => ({
  themeMode: getInitialThemeMode(),

  setThemeMode: (themeMode: ThemeMode) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('sirius_theme', themeMode);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeMode);
    }
    set({ themeMode });
  },

  toggleThemeMode: () => {
    set((state) => {
      const nextMode: ThemeMode = state.themeMode === 'day' ? 'night' : 'day';
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('sirius_theme', nextMode);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', nextMode);
      }
      return { themeMode: nextMode };
    });
  },

  isCommandPaletteOpen: false,
  isNotificationPanelOpen: false,
  isShortcutsSheetOpen: false,
  activeModal: null,
  notifications: INITIAL_NOTIFICATIONS,

  toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),

  toggleNotificationPanel: () => set((state) => ({ isNotificationPanelOpen: !state.isNotificationPanelOpen })),
  setNotificationPanelOpen: (isNotificationPanelOpen) => set({ isNotificationPanelOpen }),

  toggleShortcutsSheet: () => set((state) => ({ isShortcutsSheetOpen: !state.isShortcutsSheetOpen })),
  setShortcutsSheetOpen: (isShortcutsSheetOpen) => set({ isShortcutsSheetOpen }),

  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),

  markNotificationAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    })),

  markAllNotificationsAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
