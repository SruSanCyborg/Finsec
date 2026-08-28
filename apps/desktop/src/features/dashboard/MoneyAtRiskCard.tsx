import React from 'react';
import { Card, MoneyTicker, Badge } from '@sirius/ui';
import { DollarSign } from 'lucide-react';

export interface MoneyAtRiskCardProps {
  amountUSD?: number;
  deltaUSD?: number;
}

export const MoneyAtRiskCard: React.FC<MoneyAtRiskCardProps> = ({
  amountUSD = 1450000,
  deltaUSD = -150000,
}) => {
  return (
    <Card
      variant="metric"
      padding="lg"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      className="sirius-money-at-risk-card"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--color-primary-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DollarSign size={16} color="var(--color-primary)" />
          </div>
          <span className="sirius-heading-3" style={{ margin: 0 }}>Money at Risk</span>
        </div>
        <Badge variant="emerald" size="sm">ESTIMATED EXPOSURE</Badge>
      </div>

      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <MoneyTicker amountUSD={amountUSD} currencySymbol="$" variant="large" delta={deltaUSD} />
      </div>

      <div className="sirius-caption" style={{ textAlign: 'center', marginTop: '12px', color: 'var(--color-text-secondary)' }}>
        Quantified financial breach exposure from unhandled secret leaks & auth vulnerabilities.
      </div>
    </Card>
  );
};
