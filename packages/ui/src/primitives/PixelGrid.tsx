import React, { ReactNode } from 'react';

export interface PixelGridBackgroundProps {
  children?: ReactNode;
  enabled?: boolean;
  opacity?: number;
  style?: React.CSSProperties;
}

export const PixelGridBackground: React.FC<PixelGridBackgroundProps> = ({
  children,
  enabled = true,
  opacity = 0.03,
  style,
}) => {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: 'var(--bg-void)',
        backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, ${opacity}) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, ${opacity}) 1px, transparent 1px)`,
        backgroundSize: '8px 8px',
        width: '100%',
        minHeight: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
