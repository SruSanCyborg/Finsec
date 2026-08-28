import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, useSessionStore } from '@sirius/state';
import { MOCK_PROJECTS } from '@sirius/mock-api';
import {
  Tooltip,
  Avatar,
  IconButton,
} from '@sirius/ui';
import {
  LayoutDashboard,
  FolderGit2,
  PlaySquare,
  ShieldAlert,
  GitFork,
  FileText,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  GitBranch,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

export const NAVIGATION_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { path: '/projects', label: 'Projects', icon: <FolderGit2 size={18} /> },
  { path: '/scans', label: 'Scans', icon: <PlaySquare size={18} /> },
  { path: '/findings', label: 'Findings', icon: <ShieldAlert size={18} /> },
  { path: '/attack-paths', label: 'Attack Paths', icon: <GitFork size={18} /> },
  { path: '/reports', label: 'Reports', icon: <FileText size={18} /> },
  { path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
];

export interface NavigationSectionProps {
  title?: string;
  children: React.ReactNode;
  isCollapsed?: boolean;
}

export const NavigationSection: React.FC<NavigationSectionProps> = ({ title, children, isCollapsed }) => (
  <div style={{ marginBottom: '16px' }}>
    {title && !isCollapsed && (
      <div
        className="sirius-label"
        style={{
          padding: '0 12px 6px 12px',
          fontSize: '10px',
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{children}</div>
  </div>
);

export interface NavigationItemProps {
  path: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}

export const NavigationItem: React.FC<NavigationItemProps> = ({
  label,
  icon,
  isActive,
  isCollapsed,
  onClick,
}) => {
  const content = (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: isCollapsed ? '10px 0' : '9px 12px',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        fontSize: '13px',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        backgroundColor: isActive ? 'var(--color-primary-soft)' : 'transparent',
        border: 'none',
        position: 'relative',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      {/* Active Green Vertical Indicator Bar */}
      {isActive && (
        <span
          style={{
            position: 'absolute',
            left: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '3.5px',
            height: '16px',
            borderRadius: 'var(--radius-pill)',
            backgroundColor: 'var(--color-primary)',
          }}
        />
      )}

      <span
        style={{
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
          display: 'flex',
          marginLeft: isActive && !isCollapsed ? '4px' : '0',
          transition: 'margin var(--transition-fast)',
        }}
      >
        {icon}
      </span>
      {!isCollapsed && <span>{label}</span>}
    </button>
  );

  if (isCollapsed) {
    return (
      <Tooltip content={label} position="right">
        {content}
      </Tooltip>
    );
  }

  return content;
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSidebarCollapsed, toggleSidebar, activeProjectId } = useAppStore();
  const { currentUser } = useSessionStore();

  const activeProject = MOCK_PROJECTS.find((p) => p.id === activeProjectId) || MOCK_PROJECTS[0];

  const sidebarWidth = isSidebarCollapsed ? '64px' : '220px';

  return (
    <aside
      style={{
        width: sidebarWidth,
        height: '100%',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width var(--transition-normal)',
        zIndex: 100,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Top Header: Logo & Collapse Button */}
      <div>
        <div
          style={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
            padding: isSidebarCollapsed ? '0' : '0 16px',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          {!isSidebarCollapsed && (
            <div
              onClick={() => navigate('/dashboard')}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary-soft)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={16} color="var(--color-primary)" />
              </div>
              <span className="sirius-heading-3" style={{ margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                SIRIUS
              </span>
            </div>
          )}

          <IconButton
            icon={isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            ariaLabel="Toggle Sidebar (⌘B)"
            onClick={toggleSidebar}
          />
        </div>

        {/* Primary Navigation List */}
        <nav style={{ padding: '12px 8px' }}>
          <NavigationSection title="SECURITY COMMAND" isCollapsed={isSidebarCollapsed}>
            {NAVIGATION_ITEMS.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <NavigationItem
                  key={item.path}
                  path={item.path}
                  label={item.label}
                  icon={item.icon}
                  isActive={isActive}
                  isCollapsed={isSidebarCollapsed}
                  onClick={() => navigate(item.path)}
                />
              );
            })}
          </NavigationSection>
        </nav>
      </div>

      {/* Bottom Contextual Footer */}
      <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px 8px' }}>
        {!isSidebarCollapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Active Project & User Profile Light Green Footer Card */}
            <div
              className="sirius-hover-lift"
              style={{
                backgroundColor: 'var(--color-primary-soft)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(24, 101, 68, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ACTIVE WORKSPACE
                </div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeProject.name}
                </div>

                <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', color: 'var(--color-primary)', fontWeight: 600 }}>
                  <GitBranch size={11} color="var(--color-primary)" /> {activeProject.branch}
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'rgba(24, 101, 68, 0.15)', margin: '2px 0' }} />

              {/* User Profile */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Avatar name={currentUser?.name || 'Sarah Jenkins'} size="sm" />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUser?.name || 'Sarah Jenkins'}
                  </div>
                  <div className="sirius-caption" style={{ fontSize: '10px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {currentUser?.role || 'Security Engineer'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Tooltip content={currentUser?.name || 'Sarah Jenkins'} position="right">
              <Avatar name={currentUser?.name || 'Sarah Jenkins'} size="sm" />
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  );
};
