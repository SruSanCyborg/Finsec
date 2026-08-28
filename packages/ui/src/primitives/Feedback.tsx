import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  variant?: 'cyan' | 'gradient' | 'emerald' | 'violet';
  height?: string;
  showLabel?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  variant = 'cyan',
  height = '6px',
  showLabel = false,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const getFillBackground = () => {
    switch (variant) {
      case 'gradient':
        return 'var(--gradient-brand)';
      case 'emerald':
        return 'var(--color-emerald)';
      case 'violet':
        return 'var(--color-violet)';
      default:
        return 'var(--color-cyan)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span>Progress</span>
          <span className="sirius-numeral-tabular">{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        style={{
          width: '100%',
          height,
          backgroundColor: 'var(--bg-raised)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: getFillBackground(),
            borderRadius: '9999px',
            transition: 'width var(--transition-normal)',
          }}
        />
      </div>
    </div>
  );
};

export interface SpinnerProps {
  size?: number;
  color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 24, color = 'var(--color-primary)' }) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={size} color={color} style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--radius-sm)',
  style,
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: 'var(--bg-raised)',
        opacity: 0.6,
        animation: 'pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
};
