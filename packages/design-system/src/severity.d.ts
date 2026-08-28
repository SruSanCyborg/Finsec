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
export declare const SEVERITY_CONFIG: Record<FindingSeverity, SeverityThemeConfig>;
