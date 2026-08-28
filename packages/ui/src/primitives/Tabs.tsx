import React, { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pills';
  style?: React.CSSProperties;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  variant = 'underline',
  style,
}) => {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: variant === 'pills' ? '6px' : '20px',
        borderBottom: variant === 'underline' ? '1px solid var(--border-hairline)' : 'none',
        ...style,
      }}
    >
      {items.map((tab) => {
        const isActive = tab.id === activeId;

        if (variant === 'pills') {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--bg-raised)' : 'transparent',
                border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderRadius: 'var(--radius-md)',
                cursor: tab.disabled ? 'not-allowed' : 'pointer',
                opacity: tab.disabled ? 0.5 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            style={{
              padding: '10px 0',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              opacity: tab.disabled ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all var(--transition-fast)',
              marginBottom: '-1px',
            }}
          >
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
};
