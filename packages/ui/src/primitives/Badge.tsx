import React, { ReactNode, useState } from 'react';

export type BadgeVariant = 'emerald' | 'teal' | 'cyan' | 'indigo' | 'violet' | 'neutral' | 'primary' | 'amber' | 'red';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', size = 'md', icon, style, className = '' }) => {
  const getColors = () => {
    switch (variant) {
      case 'primary':
      case 'emerald':
        return { bg: 'rgba(var(--color-emerald-rgb), 0.12)', color: 'var(--color-emerald)', border: 'rgba(var(--color-emerald-rgb), 0.3)' };
      case 'teal':
        return { bg: 'rgba(var(--color-mint-rgb), 0.12)', color: 'var(--color-mint)', border: 'rgba(var(--color-mint-rgb), 0.3)' };
      case 'cyan':
        return { bg: 'rgba(var(--color-cyan-rgb), 0.12)', color: 'var(--color-cyan)', border: 'rgba(var(--color-cyan-rgb), 0.3)' };
      case 'indigo':
      case 'violet':
        return { bg: 'rgba(var(--color-violet-rgb), 0.12)', color: 'var(--color-violet)', border: 'rgba(var(--color-violet-rgb), 0.3)' };
      case 'amber':
        return { bg: 'rgba(var(--color-amber-rgb), 0.12)', color: 'var(--color-amber)', border: 'rgba(var(--color-amber-rgb), 0.3)' };
      case 'red':
        return { bg: 'rgba(var(--color-red-rgb), 0.12)', color: 'var(--color-red)', border: 'rgba(var(--color-red-rgb), 0.3)' };
      default:
        return { bg: 'var(--color-bg-surface-elevated)', color: 'var(--color-text-secondary)', border: 'var(--color-border)' };
    }
  };

  const { bg, color, border } = getColors();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-pill)',
        lineHeight: 1.2,
        ...style,
      }}
      className={`sirius-badge ${className}`}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
};

export const Pill: React.FC<BadgeProps> = (props) => (
  <Badge {...props} style={{ borderRadius: 'var(--radius-pill)', ...props.style }} />
);

export interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionStyle = (): React.CSSProperties => {
    switch (position) {
      case 'bottom':
        return { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(6px)' };
      case 'left':
        return { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-6px)' };
      case 'right':
        return { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(6px)' };
      default:
        return { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-6px)' };
    }
  };

  return (
    <div
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 1000,
            whiteSpace: 'nowrap',
            backgroundColor: 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)',
            fontSize: '11px',
            fontWeight: 500,
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-small)',
            pointerEvents: 'none',
            ...getPositionStyle(),
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};
