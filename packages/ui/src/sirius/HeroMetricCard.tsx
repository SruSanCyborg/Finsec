import React, { ReactNode } from 'react';
import { Card } from '../primitives/Card';

export interface HeroMetricCardProps {
  title: string;
  metric: string | number;
  subtitle?: string;
  statusBadge?: ReactNode;
  action?: ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  icon?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const HeroMetricCard: React.FC<HeroMetricCardProps> = ({
  title,
  metric,
  subtitle,
  statusBadge,
  action,
  trend,
  icon,
  style,
  className = '',
}) => {
  return (
    <Card
      variant="hero"
      padding="lg"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      className={`sirius-hero-metric-card ${className}`}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {icon && (
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-pill)',
                backgroundColor: 'var(--color-primary)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </div>
          )}
          <div>
            <span
              className="sirius-label"
              style={{ color: 'var(--color-primary)', fontSize: '11px', letterSpacing: '0.06em' }}
            >
              {title}
            </span>
          </div>
        </div>

        {statusBadge && <div>{statusBadge}</div>}
      </div>

      {/* Main Metric Row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '8px 0 12px 0' }}>
        <span
          className="sirius-display-xl sirius-numeral-tabular"
          style={{
            fontSize: '44px',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            lineHeight: 1,
          }}
        >
          {metric}
        </span>

        {trend && (
          <span
            className="sirius-body-sm sirius-numeral-tabular"
            style={{
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: trend.isPositive ? 'rgba(14, 107, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: trend.isPositive ? 'var(--color-primary)' : 'var(--color-red)',
            }}
          >
            {trend.value}
          </span>
        )}
      </div>

      {/* Subtitle & Action Footer */}
      {(subtitle || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(14, 107, 74, 0.15)' }}>
          {subtitle && (
            <span className="sirius-caption" style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              {subtitle}
            </span>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
    </Card>
  );
};
