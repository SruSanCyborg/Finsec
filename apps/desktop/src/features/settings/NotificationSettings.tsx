import React, { useState } from 'react';
import { WorkspaceSettings } from '@sirius/types';
import { GlassCard } from '@sirius/ui';
import { Bell, CheckCircle2 } from 'lucide-react';


export interface NotificationSettingsProps {
  settings: WorkspaceSettings;
  onSave: (patch: Partial<WorkspaceSettings>) => Promise<void>;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ settings, onSave }) => {
  const [prefs, setPrefs] = useState(settings.notificationPreferences);
  const [toast, setToast] = useState<string | null>(null);

  const handleToggle = async (key: keyof WorkspaceSettings['notificationPreferences']) => {
    const nextPrefs = {
      ...prefs,
      [key]: !prefs[key],
    };
    setPrefs(nextPrefs);
    try {
      await onSave({
        notificationPreferences: nextPrefs,
      });
      setToast('Alert preferences saved.');
    } catch {
      setToast('Failed to save alert preferences.');
    } finally {
      setTimeout(() => setToast(null), 2500);
    }
  };

  const options: Array<{ key: keyof WorkspaceSettings['notificationPreferences']; label: string; description: string }> = [
    {
      key: 'criticalAlerts',
      label: 'Critical Vulnerability Alerts',
      description: 'Immediate notification when critical secret leaks or remote exploits are discovered.',
    },
    {
      key: 'scanCompletion',
      label: 'Scan Completion Summaries',
      description: 'Receive summary notifications upon pipeline scan completion.',
    },
    {
      key: 'complianceDegradation',
      label: 'Compliance Score Degradation Alerts',
      description: 'Alert when PCI DSS 4.0 or SOC 2 posture drops below target threshold.',
    },
    {
      key: 'securityBreach',
      label: 'Money-at-Risk Threshold Breach Alerts',
      description: 'Alert when estimated financial exposure increases significantly.',
    },
  ];

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={20} color="var(--color-cyan)" />
          <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            Alert Preferences & Notifications
          </h2>
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          Configure automated event notifications, security breach triggers, and posture degradation alerts.
        </div>
      </div>

      {toast && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '13px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '580px' }}>
        {options.map((opt) => {
          const isChecked = prefs[opt.key];

          return (
            <div
              key={opt.key}
              onClick={() => handleToggle(opt.key)}
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isChecked ? 'rgba(56, 189, 248, 0.3)' : 'var(--border-hairline)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {opt.label}
                </div>
                <div className="sirius-caption" style={{ marginTop: '2px' }}>
                  {opt.description}
                </div>
              </div>

              {/* Accessible Switch */}
              <div
                style={{
                  width: '40px',
                  height: '22px',
                  borderRadius: '12px',
                  backgroundColor: isChecked ? 'var(--color-cyan)' : 'rgba(255, 255, 255, 0.15)',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isChecked ? 'flex-end' : 'flex-start',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};
