import React, { useState } from 'react';
import { WorkspaceSettings } from '@sirius/types';
import { GlassCard, Input, Button } from '@sirius/ui';
import { useUIStore } from '@sirius/state';
import { Sliders, CheckCircle2, Sun, Moon } from 'lucide-react';

export interface GeneralSettingsProps {
  settings: WorkspaceSettings;
  onSave: (patch: Partial<WorkspaceSettings>) => Promise<void>;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ settings, onSave }) => {
  const { themeMode, setThemeMode } = useUIStore();
  const [workspaceName, setWorkspaceName] = useState(settings.workspaceName);
  const [defaultBranch, setDefaultBranch] = useState(settings.defaultBranch);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        workspaceName,
        defaultBranch,
        timezone,
        dateFormat,
      });
      setToast('Workspace settings saved.');
    } catch {
      setToast('Failed to save settings.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sliders size={20} color="var(--color-cyan)" />
          <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            General Workspace Settings
          </h2>
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          Configure workspace identification, default repository branches, and visual localization preferences.
        </div>
      </div>

      {toast && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '13px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      {/* Visual Theme Selection Section */}
      <div style={{ padding: '16px', backgroundColor: 'var(--color-bg-surface-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', maxWidth: '540px' }}>
        <div className="sirius-caption" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.05em' }}>
          APPEARANCE & VISUAL SYSTEM
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
          Toggle between Editorial Warm Day Mode and Luminous Night Command Center Mode.
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={() => setThemeMode('day')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${themeMode === 'day' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              backgroundColor: themeMode === 'day' ? 'var(--color-primary-soft)' : 'var(--color-bg-surface)',
              color: themeMode === 'day' ? 'var(--color-primary)' : 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Sun size={16} /> Day Mode
          </button>

          <button
            type="button"
            onClick={() => setThemeMode('night')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${themeMode === 'night' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              backgroundColor: themeMode === 'night' ? 'var(--color-primary-soft)' : 'var(--color-bg-surface)',
              color: themeMode === 'night' ? 'var(--color-primary)' : 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Moon size={16} /> Night Mode
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '540px' }}>
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>WORKSPACE NAME</label>
          <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
        </div>

        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>DEFAULT CODEBASE BRANCH</label>
          <Input value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} />
        </div>

        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>DISPLAY TIMEZONE</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>

        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>DATE FORMAT PREFERENCE</label>
          <Input value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} />
        </div>

        <div style={{ paddingTop: '10px' }}>
          <Button variant="gradient" type="submit" isLoading={isSaving}>
            Save Workspace Settings
          </Button>
        </div>
      </form>
    </GlassCard>
  );
};
