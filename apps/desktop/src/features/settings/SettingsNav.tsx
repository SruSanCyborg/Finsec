import React from 'react';
import { Sliders, User, Radio, FolderGit2, Shield, Puzzle, Bell, Terminal } from 'lucide-react';

export type SettingsSection =
  | 'general'
  | 'account'
  | 'connection'
  | 'projects'
  | 'policies'
  | 'integrations'
  | 'notifications'
  | 'advanced';

export interface SettingsNavProps {
  activeSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
}

export const SettingsNav: React.FC<SettingsNavProps> = ({ activeSection, onSelectSection }) => {
  const navItems: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'General', icon: <Sliders size={16} /> },
    { id: 'account', label: 'Account & Session', icon: <User size={16} /> },
    { id: 'connection', label: 'API Connection', icon: <Radio size={16} /> },
    { id: 'projects', label: 'Project Defaults', icon: <FolderGit2 size={16} /> },
    { id: 'policies', label: 'Security Policy', icon: <Shield size={16} /> },
    { id: 'integrations', label: 'Integrations Grid', icon: <Puzzle size={16} /> },
    { id: 'notifications', label: 'Alert Preferences', icon: <Bell size={16} /> },
    { id: 'advanced', label: 'Advanced & Danger Zone', icon: <Terminal size={16} /> },
  ];

  return (
    <div
      style={{
        width: '240px',
        flexShrink: 0,
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-hairline)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div className="sirius-caption" style={{ padding: '8px 12px', fontWeight: 700, letterSpacing: '0.05em' }}>
        SETTINGS CONTROL
      </div>

      {navItems.map((item) => {
        const isActive = activeSection === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--color-cyan)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
              border: isActive ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all var(--transition-fast)',
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
