import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface MoneyTickerProps {
  amountUSD: number;
  currencySymbol?: string;
  variant?: 'compact' | 'large';
  delta?: number; // USD change amount
  sparkline?: React.ReactNode;
  durationMs?: number;
  style?: React.CSSProperties;
}

export const MoneyTicker: React.FC<MoneyTickerProps> = ({
  amountUSD,
  currencySymbol = '$',
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

  const formatAmount = (val: number) => {
    if (val >= 1000000) {
      return `${currencySymbol}${(val / 1000000).toFixed(2)}M`;
    }
    if (val >= 1000) {
      return `${currencySymbol}${(val / 1000).toFixed(1)}K`;
    }
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
