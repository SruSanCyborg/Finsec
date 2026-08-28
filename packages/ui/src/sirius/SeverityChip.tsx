import React from 'react';
import { FindingSeverity } from '@sirius/types';
import { SEVERITY_CONFIG } from '@sirius/design-system';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, HelpCircle } from 'lucide-react';

export type SeverityChipVariant = 'small' | 'medium' | 'large' | 'compact';

export interface SeverityChipProps {
  severity: FindingSeverity;
  variant?: SeverityChipVariant;
  showIcon?: boolean;
  style?: React.CSSProperties;
}

export const SeverityChip: React.FC<SeverityChipProps> = ({
  severity,
  variant = 'medium',
  showIcon = true,
  style,
}) => {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;

  const renderIcon = (iconSize: number) => {
    switch (config.iconName) {
      case 'ShieldAlert':
        return <ShieldAlert size={iconSize} color={config.color} />;
      case 'AlertTriangle':
        return <AlertTriangle size={iconSize} color={config.color} />;
      case 'AlertCircle':
        return <AlertCircle size={iconSize} color={config.color} />;
      case 'Info':
        return <Info size={iconSize} color={config.color} />;
      default:
        return <HelpCircle size={iconSize} color={config.color} />;
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'compact':
        return { padding: '2px 6px', fontSize: '10px', iconSize: 12 };
      case 'small':
        return { padding: '3px 8px', fontSize: '11px', iconSize: 13 };
      case 'large':
        return { padding: '6px 14px', fontSize: '13px', iconSize: 16 };
      default:
        return { padding: '4px 10px', fontSize: '12px', iconSize: 14 };
    }
  };

  const { padding, fontSize, iconSize } = getVariantStyles();
  const isCritical = severity === 'critical';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding,
        fontSize,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        color: config.color,
        backgroundColor: config.bgTint,
        border: `1px solid ${config.borderTint}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow: isCritical ? config.glow : 'none',
        lineHeight: 1.2,
        userSelect: 'none',
        ...style,
      }}
    >
      {showIcon && renderIcon(iconSize)}
      <span>{config.label}</span>
    </span>
  );
};
