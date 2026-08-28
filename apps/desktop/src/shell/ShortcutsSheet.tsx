import React from 'react';
import { useUIStore } from '@sirius/state';
import { GlassModal, Badge } from '@sirius/ui';

export interface ShortcutGroup {
  category: string;
  items: Array<{ key: string; description: string }>;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Global & Overlay Shortcuts',
    items: [
      { key: '⌘K / Ctrl+K', description: 'Open Command Palette' },
      { key: '⌘B / Ctrl+B', description: 'Toggle Sidebar Expand/Collapse' },
      { key: '?', description: 'Show Keyboard Shortcuts Reference' },
      { key: 'Esc', description: 'Close Topmost Overlay / Modal / Drawer' },
    ],
  },
  {
    category: 'Future Triage Navigation (Prepared)',
    items: [
      { key: 'J / K', description: 'Next / Previous Security Finding' },
      { key: 'F', description: 'Trigger Cerebus Fix Pipeline' },
      { key: 'A', description: 'Accept / Approve Patch' },
      { key: 'D', description: 'Dismiss / False Positive' },
    ],
  },
];

export const ShortcutsSheet: React.FC = () => {
  const { isShortcutsSheetOpen, setShortcutsSheetOpen } = useUIStore();

  return (
    <GlassModal
      isOpen={isShortcutsSheetOpen}
      onClose={() => setShortcutsSheetOpen(false)}
      title="Keyboard Shortcuts Reference"
      maxWidth="500px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.category}>
            <div className="sirius-label" style={{ marginBottom: '10px' }}>
              {group.category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{item.description}</span>
                  <Badge variant="cyan" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                    {item.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </GlassModal>
  );
};
