import { FindingSeverity } from '@sirius/types';

export interface SeverityThemeConfig {
  severity: FindingSeverity;
  label: string;
  color: string;
  rgbColor: string;
  bgTint: string;
  borderTint: string;
  glow: string;
  iconName: 'ShieldAlert' | 'AlertTriangle' | 'AlertCircle' | 'Info' | 'HelpCircle';
}

export const SEVERITY_CONFIG: Record<FindingSeverity, SeverityThemeConfig> = {
  critical: {
    severity: 'critical',
    label: 'Critical',
    color: 'var(--color-red)',
    rgbColor: 'var(--color-red-rgb)',
    bgTint: 'rgba(var(--color-red-rgb), 0.1)',
    borderTint: 'rgba(var(--color-red-rgb), 0.3)',
    glow: '0 0 16px rgba(var(--color-red-rgb), 0.2)',
    iconName: 'ShieldAlert',
  },
  high: {
    severity: 'high',
    label: 'High',
    color: 'var(--color-amber)',
    rgbColor: 'var(--color-amber-rgb)',
    bgTint: 'rgba(var(--color-amber-rgb), 0.1)',
    borderTint: 'rgba(var(--color-amber-rgb), 0.3)',
    glow: 'none',
    iconName: 'AlertTriangle',
  },
  medium: {
    severity: 'medium',
    label: 'Medium',
    color: 'var(--color-mint)',
    rgbColor: 'var(--color-mint-rgb)',
    bgTint: 'rgba(var(--color-mint-rgb), 0.1)',
    borderTint: 'rgba(var(--color-mint-rgb), 0.25)',
    glow: 'none',
    iconName: 'AlertCircle',
  },
  low: {
    severity: 'low',
    label: 'Low',
    color: 'var(--color-text-secondary)',
    rgbColor: '107, 114, 128',
    bgTint: 'var(--color-bg-surface-elevated)',
    borderTint: 'var(--color-border)',
    glow: 'none',
    iconName: 'Info',
  },
  info: {
    severity: 'info',
    label: 'Info',
    color: 'var(--color-text-muted)',
    rgbColor: '107, 114, 128',
    bgTint: 'var(--color-bg-surface-elevated)',
    borderTint: 'var(--color-border-subtle)',
    glow: 'none',
    iconName: 'HelpCircle',
  },
};
