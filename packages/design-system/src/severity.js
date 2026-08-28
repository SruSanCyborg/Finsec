export const SEVERITY_CONFIG = {
    critical: {
        severity: 'critical',
        label: 'Critical',
        color: '#A78BFA', // Violet
        rgbColor: '167, 139, 250',
        bgTint: 'rgba(167, 139, 250, 0.12)',
        borderTint: 'rgba(167, 139, 250, 0.4)',
        glow: '0 0 24px rgba(167, 139, 250, 0.35)',
        iconName: 'ShieldAlert',
    },
    high: {
        severity: 'high',
        label: 'High',
        color: '#818CF8', // Indigo
        rgbColor: '129, 140, 248',
        bgTint: 'rgba(129, 140, 248, 0.12)',
        borderTint: 'rgba(129, 140, 248, 0.35)',
        glow: '0 0 20px rgba(129, 140, 248, 0.25)',
        iconName: 'AlertTriangle',
    },
    medium: {
        severity: 'medium',
        label: 'Medium',
        color: '#38BDF8', // Cyan
        rgbColor: '56, 189, 248',
        bgTint: 'rgba(56, 189, 248, 0.12)',
        borderTint: 'rgba(56, 189, 248, 0.3)',
        glow: '0 0 20px rgba(56, 189, 248, 0.25)',
        iconName: 'AlertCircle',
    },
    low: {
        severity: 'low',
        label: 'Low',
        color: '#2DD4BF', // Teal
        rgbColor: '45, 212, 191',
        bgTint: 'rgba(45, 212, 191, 0.1)',
        borderTint: 'rgba(45, 212, 191, 0.25)',
        glow: '0 0 16px rgba(45, 212, 191, 0.2)',
        iconName: 'Info',
    },
    info: {
        severity: 'info',
        label: 'Info',
        color: '#9CA3B0', // Secondary / Muted
        rgbColor: '156, 163, 176',
        bgTint: 'rgba(156, 163, 176, 0.08)',
        borderTint: 'rgba(156, 163, 176, 0.2)',
        glow: 'none',
        iconName: 'HelpCircle',
    },
};
