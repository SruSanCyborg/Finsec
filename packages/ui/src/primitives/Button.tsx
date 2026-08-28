import React, { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'gradient' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      style,
      className = '',
      ...props
    },
    ref
  ) => {
    const isGradient = variant === 'gradient';
    const isGhost = variant === 'ghost';
    const isDanger = variant === 'danger';
    const isSecondary = variant === 'secondary';

    const getBaseStyles = (): React.CSSProperties => {
      let bg = 'var(--color-primary)';
      let color = 'var(--color-text-on-accent)';
      let border = 'none';
      let shadow = 'var(--shadow-small)';

      if (isGradient) {
        bg = 'var(--gradient-brand)';
        color = 'var(--color-text-on-accent)';
        shadow = 'var(--shadow-small)';
      } else if (isGhost) {
        bg = 'transparent';
        color = 'var(--color-text-primary)';
        border = '1px solid var(--color-border-subtle)';
        shadow = 'none';
      } else if (isSecondary) {
        bg = 'var(--color-bg-surface)';
        color = 'var(--color-text-primary)';
        border = '1px solid var(--color-border)';
        shadow = 'var(--shadow-small)';
      } else if (isDanger) {
        bg = 'rgba(239, 68, 68, 0.1)';
        color = 'var(--color-red)';
        border = '1px solid rgba(239, 68, 68, 0.3)';
        shadow = 'none';
      }

      const sizePadding =
        size === 'sm' ? '6px 14px' : size === 'lg' ? '12px 24px' : '8px 18px';
      const fontSize = size === 'sm' ? '12px' : size === 'lg' ? '15px' : '13px';

      return {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: fullWidth ? '100%' : 'auto',
        padding: sizePadding,
        fontSize,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        color,
        background: bg,
        border,
        borderRadius: 'var(--radius-md)',
        boxShadow: shadow,
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all var(--transition-fast)',
        userSelect: 'none',
        ...style,
      };
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={getBaseStyles()}
        className={`sirius-button sirius-button-${variant} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          leftIcon
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';

export const GradientButton = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <Button ref={ref} variant="gradient" {...props} />
));
GradientButton.displayName = 'GradientButton';

export const GhostButton = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <Button ref={ref} variant="ghost" {...props} />
));
GhostButton.displayName = 'GhostButton';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  ariaLabel: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'md', variant = 'ghost', ariaLabel, style, ...props }, ref) => {
    const dim = size === 'sm' ? '30px' : size === 'lg' ? '42px' : '36px';
    return (
      <Button
        ref={ref}
        variant={variant}
        aria-label={ariaLabel}
        style={{
          width: dim,
          height: dim,
          padding: 0,
          borderRadius: 'var(--radius-pill)',
          ...style,
        }}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);
IconButton.displayName = 'IconButton';
