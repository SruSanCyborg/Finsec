import React, { ReactNode, HTMLAttributes } from 'react';

export type CardVariant = 
  | 'surface' 
  | 'raised' 
  | 'glass' 
  | 'glass-panel' 
  | 'hero' 
  | 'metric' 
  | 'insight' 
  | 'list' 
  | 'inspector';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'surface',
  padding = 'md',
  hoverable = false,
  style,
  className = '',
  ...props
}) => {
  const getPadding = () => {
    switch (padding) {
      case 'none':
        return '0';
      case 'sm':
        return '16px';
      case 'lg':
        return '24px';
      case 'xl':
        return '32px';
      default:
        return '20px';
    }
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'hero':
        return {
          backgroundColor: 'var(--color-primary-soft)',
          border: '1px solid rgba(14, 107, 74, 0.2)',
          boxShadow: 'var(--shadow-medium)',
        };
      case 'metric':
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-small)',
        };
      case 'insight':
        return {
          backgroundColor: 'var(--color-bg-surface-elevated)',
          borderLeft: '4px solid var(--color-primary)',
          borderTop: '1px solid var(--color-border-subtle)',
          borderRight: '1px solid var(--color-border-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-small)',
        };
      case 'list':
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'none',
        };
      case 'inspector':
        return {
          backgroundColor: 'var(--color-bg-surface-elevated)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-medium)',
        };
      case 'glass':
      case 'glass-panel':
      case 'raised':
        return {
          backgroundColor: 'var(--color-bg-surface-elevated)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-medium)',
        };
      default:
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-small)',
        };
    }
  };

  return (
    <div
      style={{
        padding: getPadding(),
        borderRadius: variant === 'hero' ? 'var(--radius-2xl)' : 'var(--radius-xl)',
        transition: 'transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal)',
        cursor: hoverable ? 'pointer' : 'default',
        boxSizing: 'border-box',
        ...getVariantStyles(),
        ...style,
      }}
      className={`sirius-card sirius-card-${variant} ${hoverable ? 'sirius-hover-lift' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const GlassCard: React.FC<CardProps> = (props) => <Card variant="glass" {...props} />;
export const GlassPanel: React.FC<CardProps> = (props) => <Card variant="glass-panel" {...props} />;
export const HeroCard: React.FC<CardProps> = (props) => <Card variant="hero" padding="lg" {...props} />;
export const MetricCard: React.FC<CardProps> = (props) => <Card variant="metric" padding="md" {...props} />;
export const InsightCard: React.FC<CardProps> = (props) => <Card variant="insight" padding="md" {...props} />;
export const ListCard: React.FC<CardProps> = (props) => <Card variant="list" padding="none" {...props} />;
export const InspectorCard: React.FC<CardProps> = (props) => <Card variant="inspector" padding="lg" {...props} />;
