import React from 'react';

export type StatusPulseState = 'Online' | 'Scanning' | 'Degraded' | 'Offline' | 'Success' | 'Error';

export interface StatusPulseProps {
  status: StatusPulseState;
  label?: string;
  showPulse?: boolean;
  style?: React.CSSProperties;
}

export const StatusPulse: React.FC<StatusPulseProps> = ({
  status,
  label,
  showPulse = true,
  style,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'Online':
      case 'Success':
        return { color: 'var(--color-emerald)', rgb: 'var(--color-emerald-rgb)' };
      case 'Scanning':
        return { color: 'var(--color-primary)', rgb: 'var(--color-primary-rgb)' };
      case 'Degraded':
        return { color: 'var(--color-amber)', rgb: 'var(--color-amber-rgb)' };
      case 'Error':
        return { color: 'var(--color-red)', rgb: 'var(--color-red-rgb)' };
      default:
        return { color: 'var(--color-text-muted)', rgb: '124, 133, 128' };
    }
  };

  const { color, rgb } = getStatusColor();
  const displayLabel = label || status;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'var(--font-body)',
        color: 'var(--text-primary)',
        ...style,
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '10px', height: '10px' }}>
        {showPulse && status !== 'Offline' && (
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: `rgba(${rgb}, 0.5)`,
              animation: 'pulseRing 2s cubic-bezier(0.45, 0, 0.55, 1) infinite',
            }}
          />
        )}
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: color,
            zIndex: 1,
          }}
        />
      </div>

      <span>{displayLabel}</span>

      <style>{`
        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(0.95); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
