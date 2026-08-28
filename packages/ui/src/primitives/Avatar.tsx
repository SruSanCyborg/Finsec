import React from 'react';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', style }) => {
  const dim = size === 'sm' ? '24px' : size === 'lg' ? '40px' : '32px';
  const fontSize = size === 'sm' ? '10px' : size === 'lg' ? '14px' : '12px';

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: dim,
          height: dim,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid var(--border-subtle)',
          ...style,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        backgroundColor: 'var(--color-primary-soft)',
        border: '1px solid rgba(24, 101, 68, 0.3)',
        color: 'var(--color-primary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize,
        fontFamily: 'var(--font-body)',
        userSelect: 'none',
        ...style,
      }}
    >
      {initials}
    </div>
  );
};
