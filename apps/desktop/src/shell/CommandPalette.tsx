import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, useAppStore, useSessionStore } from '@sirius/state';
import { GlassModal, Input, Badge } from '@sirius/ui';
import {
  Search,
  LayoutDashboard,
  FolderGit2,
  PlaySquare,
  ShieldAlert,
  GitFork,
  FileText,
  Sliders,
  Sparkles,

  PanelLeft,
  HelpCircle,
  LogOut,
  Play,
  GitBranch,
} from 'lucide-react';


export interface CommandItem {
  id: string;
  category: 'Navigation' | 'Action' | 'System';
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  perform: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

export const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const { isCommandPaletteOpen, setCommandPaletteOpen, toggleShortcutsSheet, markAllNotificationsAsRead } = useUIStore();
  const { toggleSidebar, resetOnboarding } = useAppStore();
  const { clearSession } = useSessionStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const closePalette = () => {
    setCommandPaletteOpen(false);
    setQuery('');
    setSelectedIndex(0);
  };

  const COMMANDS: CommandItem[] = [
    // Navigation
    // Navigation
    {
      id: 'cmd-nav-dash',
      category: 'Navigation',
      label: 'Go to Dashboard',
      shortcut: 'G D',
      icon: <LayoutDashboard size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/dashboard'); closePalette(); },
    },
    {
      id: 'cmd-nav-prj',
      category: 'Navigation',
      label: 'Go to Projects',
      shortcut: 'G P',
      icon: <FolderGit2 size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/projects'); closePalette(); },
    },
    {
      id: 'cmd-nav-scan',
      category: 'Navigation',
      label: 'Go to Scans',
      shortcut: 'G S',
      icon: <PlaySquare size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/scans'); closePalette(); },
    },
    {
      id: 'cmd-nav-fnd',
      category: 'Navigation',
      label: 'Go to Findings',
      shortcut: 'G F',
      icon: <ShieldAlert size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/findings'); closePalette(); },
    },
    {
      id: 'cmd-nav-atk',
      category: 'Navigation',
      label: 'Go to Attack Paths',
      shortcut: 'G A',
      icon: <GitFork size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/attack-paths'); closePalette(); },
    },
    {
      id: 'cmd-act-exp-path',
      category: 'Action',
      label: 'Explain Attack Path with Cerebus',
      icon: <Sparkles size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/cerebus?finding=fnd-88219'); closePalette(); },
    },
    {
      id: 'cmd-nav-cmp',
      category: 'Navigation',
      label: 'Go to Compliance Workspace',
      shortcut: 'G C',
      icon: <ShieldAlert size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/compliance'); closePalette(); },
    },
    {
      id: 'cmd-nav-sup',
      category: 'Navigation',
      label: 'Go to Suppressions Workspace',
      shortcut: 'G S',
      icon: <ShieldAlert size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/suppressions'); closePalette(); },
    },

    {
      id: 'cmd-nav-base',
      category: 'Navigation',
      label: 'Go to Baselines Workspace',
      shortcut: 'G B',
      icon: <GitBranch size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/baselines'); closePalette(); },
    },



    {
      id: 'cmd-nav-rep',
      category: 'Navigation',
      label: 'Go to Reports Workspace',
      shortcut: 'G R',
      icon: <FileText size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/reports'); closePalette(); },
    },
    {
      id: 'cmd-act-gen-rep',
      category: 'Action',
      label: 'Generate Security Report',
      icon: <Sparkles size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/reports?action=generate'); closePalette(); },
    },
    {
      id: 'cmd-nav-set',
      category: 'Navigation',
      label: 'Open Settings Workspace',
      shortcut: 'G S',
      icon: <Sliders size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/settings'); closePalette(); },
    },
    {
      id: 'cmd-nav-int',
      category: 'Navigation',
      label: 'Open Integrations Control Center',
      shortcut: 'G I',
      icon: <Sliders size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/settings/integrations'); closePalette(); },
    },
    {
      id: 'cmd-act-test-conn',
      category: 'Action',
      label: 'Test FinSec Core API Connection',
      icon: <Sparkles size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/settings/connection'); closePalette(); },
    },

    {
      id: 'cmd-nav-ds',
      category: 'Navigation',
      label: 'Open Design System Laboratory',
      icon: <Sparkles size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/design-system'); closePalette(); },
    },
    // Action Commands
    {
      id: 'cmd-act-scan',
      category: 'Action',
      label: 'Start New Security Scan',
      icon: <Play size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/scans/new'); closePalette(); },
    },
    {
      id: 'cmd-act-search-fnd',
      category: 'Action',
      label: 'Search Security Findings',
      icon: <Search size={16} color="var(--color-primary)" />,
      perform: () => { navigate('/findings'); closePalette(); },
    },
    {
      id: 'cmd-act-read-notif',
      category: 'Action',
      label: 'Mark All Notifications as Read',
      icon: <FileText size={16} color="var(--color-primary)" />,
      perform: () => { markAllNotificationsAsRead(); closePalette(); },
    },
    // System
    {
      id: 'cmd-sys-sidebar',
      category: 'System',
      label: 'Toggle Sidebar',
      shortcut: '⌘B',
      icon: <PanelLeft size={16} color="var(--color-text-secondary)" />,
      perform: () => { toggleSidebar(); closePalette(); },
    },
    {
      id: 'cmd-sys-shortcuts',
      category: 'System',
      label: 'Show Keyboard Shortcuts',
      shortcut: '?',
      icon: <HelpCircle size={16} color="var(--color-text-secondary)" />,
      perform: () => { closePalette(); toggleShortcutsSheet(); },
    },
    {
      id: 'cmd-sys-onboarding',
      category: 'System',
      label: 'Re-run Onboarding Flow',
      icon: <Sparkles size={16} color="var(--color-primary)" />,
      perform: () => { resetOnboarding(); closePalette(); },
    },
    {
      id: 'cmd-sys-logout',
      category: 'System',
      label: 'Logout Session',
      icon: <LogOut size={16} color="var(--color-red)" />,
      perform: () => { clearSession(); resetOnboarding(); closePalette(); },
    },
  ];

  const filteredCommands = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(filteredCommands.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(filteredCommands.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].perform();
      }
    }
  };

  return (
    <GlassModal isOpen={isCommandPaletteOpen} onClose={closePalette} maxWidth="600px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          placeholder="Type a command or search (e.g. Go to Dashboard, Start Scan)..."
          leftIcon={<Search size={18} color="var(--color-primary)" />}
          style={{ fontSize: '14px' }}
        />

        {/* Grouped Commands List */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filteredCommands.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              No commands matching &quot;{query}&quot;
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={cmd.perform}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: isSelected ? 'var(--color-primary-soft)' : 'transparent',
                    border: `1px solid ${isSelected ? 'rgba(14, 107, 74, 0.2)' : 'transparent'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {cmd.icon}
                    <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: 'var(--text-primary)' }}>
                      {cmd.label}
                    </span>
                  </div>
                  {cmd.shortcut && (
                    <Badge variant="neutral" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                      {cmd.shortcut}
                    </Badge>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </GlassModal>
  );
};
