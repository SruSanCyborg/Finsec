import React from 'react';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  margin?: string;
  style?: React.CSSProperties;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  margin = '16px 0',
  style,
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        style={{
          width: '1px',
          height: '100%',
          backgroundColor: 'var(--border-hairline)',
          margin: margin === '16px 0' ? '0 16px' : margin,
          alignSelf: 'stretch',
          ...style,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '1px',
        backgroundColor: 'var(--border-hairline)',
        margin,
        ...style,
      }}
    />
  );
};
