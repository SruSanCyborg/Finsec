import React, { ReactNode } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Activity,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export type StatusChipType =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFO'
  | 'VERIFIED'
  | 'ACTIVE'
  | 'FAILED'
  | 'CONNECTED'
  | 'HEALTHY'
  | 'AT_RISK'
  | 'AT RISK'
  | 'SCANNING'
  | 'RUNNING'
  | 'QUEUED'
  | 'COMPLETED';

export interface StatusChipProps {
  status: StatusChipType | string;
  label?: string;
  size?: 'sm' | 'md';
  customIcon?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

interface StatusConfig {
  label: string;
  bg: string;
  color: string;
  border: string;
  icon: ReactNode;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  size = 'md',
  customIcon,
  style,
  className = '',
}) => {
  const normalizedStatus = (status || '').toUpperCase() as StatusChipType;

  const getConfig = (): StatusConfig => {
    switch (normalizedStatus) {
      case 'CRITICAL':
        return {
          label: label || 'CRITICAL',
          bg: 'rgba(var(--color-red-rgb), 0.1)',
          color: 'var(--color-red)',
          border: 'rgba(var(--color-red-rgb), 0.3)',
          icon: <ShieldAlert size={size === 'sm' ? 12 : 14} />,
        };
      case 'HIGH':
        return {
          label: label || 'HIGH',
          bg: 'rgba(var(--color-amber-rgb), 0.1)',
          color: 'var(--color-amber)',
          border: 'rgba(var(--color-amber-rgb), 0.3)',
          icon: <AlertTriangle size={size === 'sm' ? 12 : 14} />,
        };
      case 'MEDIUM':
        return {
          label: label || 'MEDIUM',
          bg: 'rgba(var(--color-mint-rgb), 0.1)',
          color: 'var(--color-mint)',
          border: 'rgba(var(--color-mint-rgb), 0.25)',
          icon: <AlertCircle size={size === 'sm' ? 12 : 14} />,
        };
      case 'LOW':
        return {
          label: label || 'LOW',
          bg: 'var(--color-bg-surface-elevated)',
          color: 'var(--color-text-secondary)',
          border: 'var(--color-border)',
          icon: <Info size={size === 'sm' ? 12 : 14} />,
        };
      case 'INFO':
        return {
          label: label || 'INFO',
          bg: 'var(--color-bg-surface-elevated)',
          color: 'var(--color-text-muted)',
          border: 'var(--color-border-subtle)',
          icon: <HelpCircle size={size === 'sm' ? 12 : 14} />,
        };
      case 'VERIFIED':
      case 'ACTIVE':
      case 'HEALTHY':
      case 'COMPLETED':
        return {
          label: label || (normalizedStatus === 'VERIFIED' ? 'VERIFIED' : normalizedStatus === 'ACTIVE' ? 'ACTIVE' : normalizedStatus === 'HEALTHY' ? 'HEALTHY' : 'COMPLETED'),
          bg: 'rgba(var(--color-emerald-rgb), 0.12)',
          color: 'var(--color-emerald)',
          border: 'rgba(var(--color-emerald-rgb), 0.3)',
          icon: <CheckCircle2 size={size === 'sm' ? 12 : 14} />,
        };
      case 'FAILED':
        return {
          label: label || 'FAILED',
          bg: 'rgba(var(--color-red-rgb), 0.1)',
          color: 'var(--color-red)',
          border: 'rgba(var(--color-red-rgb), 0.3)',
          icon: <XCircle size={size === 'sm' ? 12 : 14} />,
        };
      case 'CONNECTED':
      case 'SCANNING':
      case 'RUNNING':
        return {
          label: label || (normalizedStatus === 'CONNECTED' ? 'CONNECTED' : normalizedStatus === 'SCANNING' ? 'SCANNING' : 'RUNNING'),
          bg: 'rgba(var(--color-emerald-rgb), 0.12)',
          color: 'var(--color-emerald)',
          border: 'rgba(var(--color-emerald-rgb), 0.3)',
          icon: <Activity size={size === 'sm' ? 12 : 14} />,
        };
      case 'AT_RISK':
      case 'AT RISK':
        return {
          label: label || 'AT RISK',
          bg: 'rgba(var(--color-amber-rgb), 0.1)',
          color: 'var(--color-amber)',
          border: 'rgba(var(--color-amber-rgb), 0.3)',
          icon: <ShieldAlert size={size === 'sm' ? 12 : 14} />,
        };
      case 'QUEUED':
      default:
        return {
          label: label || status,
          bg: 'var(--color-bg-surface-elevated)',
          color: 'var(--color-text-secondary)',
          border: 'var(--color-border)',
          icon: <Info size={size === 'sm' ? 12 : 14} />,
        };
    }
  };

  const config = getConfig();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        userSelect: 'none',
        ...style,
      }}
      className={`sirius-status-chip sirius-status-${normalizedStatus.toLowerCase()} ${className}`}
    >
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {customIcon || config.icon}
      </span>
      <span>{config.label}</span>
    </span>
  );
};
