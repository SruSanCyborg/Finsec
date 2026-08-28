import React, { useEffect, ReactNode } from 'react';
import { useAppStore, useUIStore } from '@sirius/state';
import { ToastContainer } from '@sirius/ui';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { NotificationDrawer } from './NotificationDrawer';
import { ShortcutsSheet } from './ShortcutsSheet';

export interface AppShellProps {
  children: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { toggleSidebar } = useAppStore();
  const { themeMode, toggleCommandPalette, toggleShortcutsSheet, setCommandPaletteOpen, setNotificationPanelOpen, setShortcutsSheetOpen } = useUIStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  // Global Keyboard Shortcuts Registry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // ⌘K / Ctrl+K -> Command Palette
      if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      // ⌘B / Ctrl+B -> Toggle Sidebar
      else if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      // ? -> Shortcuts Sheet (if not typing in input)
      else if (e.key === '?' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        toggleShortcutsSheet();
      }
      // Escape -> Close Topmost Overlay
      else if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setNotificationPanelOpen(false);
        setShortcutsSheetOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, toggleSidebar, toggleShortcutsSheet, setCommandPaletteOpen, setNotificationPanelOpen, setShortcutsSheetOpen]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--color-bg-canvas)',
        padding: '12px',
        boxSizing: 'border-box',
        display: 'flex',
        overflow: 'hidden',
      }}
      className="sirius-app-canvas"
    >
      {/* Editorial Application Workspace Frame */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          height: '100%',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-large)',
          overflow: 'hidden',
          position: 'relative',
        }}
        className="sirius-desktop-shell"
      >
        {/* Sidebar */}
        <Sidebar />

        {/* Right Main Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>
          {/* TopBar */}
          <TopBar />

          {/* Page Content Viewport */}
          <main style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--color-bg-surface)' }}>
            {children}
          </main>
        </div>
      </div>

      {/* Global Overlays & Toast Manager */}
      <CommandPalette />
      <NotificationDrawer />
      <ShortcutsSheet />
      <ToastContainer />
    </div>
  );
};
