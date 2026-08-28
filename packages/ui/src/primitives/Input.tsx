import React, { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, style, className = '', ...props }, ref) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && <label className="sirius-label">{label}</label>}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
          {leftIcon && (
            <div style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', display: 'flex' }}>
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            style={{
              width: '100%',
              padding: leftIcon ? '10px 12px 10px 38px' : '10px 12px',
              paddingRight: rightIcon ? '38px' : '12px',
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid ${error ? 'var(--color-red)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color var(--transition-fast)',
              ...style,
            }}
            className={`sirius-input ${className}`}
            {...props}
          />
          {rightIcon && (
            <div style={{ position: 'absolute', right: '12px', color: 'var(--text-secondary)', display: 'flex' }}>
              {rightIcon}
            </div>
          )}
        </div>
        {error && <span style={{ color: 'var(--color-red)', fontSize: '12px' }}>{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, style, className = '', ...props }, ref) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && <label className="sirius-label">{label}</label>}
        <textarea
          ref={ref}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid ${error ? 'var(--color-red)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            outline: 'none',
            minHeight: '80px',
            boxSizing: 'border-box',
            resize: 'vertical',
            ...style,
          }}
          className={`sirius-textarea ${className}`}
          {...props}
        />
        {error && <span style={{ color: 'var(--color-red)', fontSize: '12px' }}>{error}</span>}
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, style, className = '', ...props }, ref) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && <label className="sirius-label">{label}</label>}
        <select
          ref={ref}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            outline: 'none',
            cursor: 'pointer',
            boxSizing: 'border-box',
            ...style,
          }}
          className={`sirius-select ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-primary)' }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);
Select.displayName = 'Select';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, style, ...props }, ref) => {
    return (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', userSelect: 'none', ...style }}>
        <input
          type="checkbox"
          ref={ref}
          style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px', cursor: 'pointer' }}
          {...props}
        />
        {label && <span>{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled = false }) => {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: '36px',
          height: '20px',
          backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-bg-surface-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: '9999px',
          position: 'relative',
          padding: '2px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background-color var(--transition-fast)',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            backgroundColor: checked ? 'var(--color-text-on-accent)' : 'var(--color-text-secondary)',
            borderRadius: '50%',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform var(--transition-fast)',
          }}
        />
      </button>
      {label && <span style={{ fontSize: '13px' }}>{label}</span>}
    </label>
  );
};
