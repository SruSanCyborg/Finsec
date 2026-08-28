import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUIStore, useSessionStore } from '@sirius/state';
import { StatusPulse, Avatar, Badge, Button, IconButton } from '@sirius/ui';
import { ProjectSelector } from './ProjectSelector';
import { DemoModeModal } from './DemoModeModal';
import { Bell, Command, HelpCircle, Sparkles, Search, Sun, Moon } from 'lucide-react';

export const NAVIGATION_TITLES: Record<string, string> = {
  '/dashboard': 'Security Command Dashboard',
  '/projects': 'Projects & Workspaces',
  '/scans': 'Security AST Scans',
  '/findings': 'Findings Explorer',
  '/attack-paths': 'Attack Path Inspector',
  '/reports': 'Reports & Compliance Audit',
  '/settings': 'System Settings & Rules',
  '/design-system': 'Design System Laboratory',
};

export interface GlobalSearchProps {
  onClick: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onClick }) => (
  <button
    onClick={onClick}
    aria-label="Open Command Palette (⌘K)"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      backgroundColor: 'var(--color-bg-surface-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-pill)',
      color: 'var(--color-text-muted)',
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'all var(--transition-fast)',
    }}
    className="sirius-global-search"
  >
    <Search size={13} color="var(--color-primary)" />
    <span style={{ fontWeight: 500 }}>Search or jump to...</span>
    <CommandShortcut />
  </button>
);

export const CommandShortcut: React.FC = () => (
  <span
    style={{
      fontSize: '10px',
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      color: 'var(--color-text-secondary)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px',
    }}
  >
    <Command size={10} />K
  </span>
);

export interface IconActionProps {
  icon: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  badgeCount?: number;
}

export const IconAction: React.FC<IconActionProps> = ({ icon, ariaLabel, onClick, badgeCount }) => (
  <div style={{ position: 'relative', display: 'inline-flex' }}>
    <IconButton
      icon={icon}
      ariaLabel={ariaLabel}
      variant="ghost"
      size="sm"
      onClick={onClick}
    />
    {badgeCount !== undefined && badgeCount > 0 && (
      <Badge
        variant="primary"
        size="sm"
        style={{
          position: 'absolute',
          top: '-2px',
          right: '-2px',
          padding: '1px 5px',
          fontSize: '9px',
          borderRadius: 'var(--radius-pill)',
          minWidth: '14px',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {badgeCount}
      </Badge>
    )}
  </div>
);

export const ProfileMenu: React.FC = () => {
  const { currentUser } = useSessionStore();
  return <Avatar name={currentUser?.name || 'Sarah Jenkins'} size="sm" />;
};

export const TopBar: React.FC = () => {
  const location = useLocation();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const {
    toggleCommandPalette,
    toggleNotificationPanel,
    toggleShortcutsSheet,
    notifications,
    themeMode,
    toggleThemeMode,
  } = useUIStore();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const currentPathKey = Object.keys(NAVIGATION_TITLES).find((p) => location.pathname.startsWith(p)) || '/dashboard';
  const pageTitle = NAVIGATION_TITLES[currentPathKey] || 'Command Center';

  return (
    <>
      <header
        style={{
          height: '56px',
          backgroundColor: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 90,
          userSelect: 'none',
          flexShrink: 0,
        }}
        className="sirius-topbar"
      >
        {/* Left: Quiet Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>SIRIUS</span>
            <span style={{ color: 'var(--color-text-muted)' }}>/</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{pageTitle}</span>
          </div>
        </div>

        {/* Center: Project Context Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ProjectSelector />
        </div>

        {/* Right: Search, StatusPulse, Theme Toggle, Notifications, Actions, Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Global Search Button */}
          <GlobalSearch onClick={toggleCommandPalette} />

          {/* Demo Walkthrough Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDemoModalOpen(true)}
            leftIcon={<Sparkles size={13} color="var(--color-primary)" />}
            style={{ fontSize: '12px' }}
          >
            Demo
          </Button>

          {/* Global Theme Switch */}
          <IconAction
            icon={themeMode === 'night' ? <Sun size={17} color="var(--color-primary)" /> : <Moon size={17} color="var(--color-text-secondary)" />}
            ariaLabel={themeMode === 'night' ? 'Switch to Day Mode' : 'Switch to Night Mode'}
            onClick={toggleThemeMode}
          />

          {/* Status Pulse */}
          <StatusPulse status="Online" label="Core Gateway" />

          {/* Notifications Trigger */}
          <IconAction
            icon={<Bell size={17} />}
            ariaLabel="Toggle notifications panel"
            onClick={toggleNotificationPanel}
            badgeCount={unreadCount}
          />

          {/* Shortcuts Sheet Trigger */}
          <IconAction
            icon={<HelpCircle size={17} />}
            ariaLabel="Keyboard shortcuts"
            onClick={toggleShortcutsSheet}
          />

          {/* User Profile */}
          <ProfileMenu />
        </div>
      </header>

      {/* Hackathon Demo Walkthrough Modal */}
      <DemoModeModal isOpen={isDemoModalOpen} onClose={() => setIsDemoModalOpen(false)} />
    </>
  );
};
