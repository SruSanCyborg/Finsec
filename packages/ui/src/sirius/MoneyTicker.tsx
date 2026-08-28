import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface MoneyTickerProps {
  /**
   * Named for the dollar figures this component was built to show; every
   * caller in this app now passes real rupees through it (see
   * `apps/desktop/src/api/adapters.ts`). Renaming the prop is a sweep through
   * every call site this component has — out of scope for wiring the daemon
   * in — so the default below and the compact-unit breakpoints are what
   * actually make the number on screen correct.
   */
  amountUSD: number;
  currencySymbol?: string;
  variant?: 'compact' | 'large';
  delta?: number;
  sparkline?: React.ReactNode;
  durationMs?: number;
  style?: React.CSSProperties;
}

export const MoneyTicker: React.FC<MoneyTickerProps> = ({
  amountUSD,
  currencySymbol = '₹',
  variant = 'compact',
  delta,
  sparkline,
  durationMs = 800,
  style,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = amountUSD;
    const stepTime = 16;
    const steps = durationMs / stepTime;
    const increment = (end - start) / steps;

    const timer = setInterval(() => {
      start += increment;
      if ((increment > 0 && start >= end) || (increment < 0 && start <= end)) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [amountUSD, durationMs]);

  // Lakh/crore compact units when the symbol is ₹ — sirius's money is always
  // rupees, so this is the branch every caller in this app actually takes.
  // M/K stays for the one caller (if any) that passes a genuinely different
  // currency in.
  const formatAmount = (val: number) => {
    if (currencySymbol === '₹') {
      const abs = Math.abs(val);
      if (abs >= 1_00_00_000) return `${currencySymbol}${(val / 1_00_00_000).toFixed(2)} Cr`;
      if (abs >= 1_00_000) return `${currencySymbol}${(val / 1_00_000).toFixed(1)} L`;
      return `${currencySymbol}${val.toLocaleString('en-IN')}`;
    }
    if (Math.abs(val) >= 1_000_000) return `${currencySymbol}${(val / 1_000_000).toFixed(2)}M`;
    if (Math.abs(val) >= 1_000) return `${currencySymbol}${(val / 1_000).toFixed(1)}K`;
    return `${currencySymbol}${val.toLocaleString()}`;
  };

  const isLarge = variant === 'large';

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: '4px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span
          className="sirius-numeral-tabular"
          style={{
            fontSize: isLarge ? '32px' : '20px',
            fontWeight: 700,
            color: 'var(--color-primary)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {formatAmount(displayValue)}
        </span>

        {delta !== undefined && (
          <span
            className="sirius-numeral-tabular"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: '12px',
              fontWeight: 600,
              color: delta > 0 ? 'var(--color-red)' : 'var(--color-emerald)',
            }}
          >
            {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {delta > 0 ? `+${formatAmount(delta)}` : formatAmount(delta)}
          </span>
        )}
      </div>

      {sparkline && <div style={{ marginTop: '4px' }}>{sparkline}</div>}
    </div>
  );
};
