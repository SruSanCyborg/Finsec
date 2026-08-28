import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, TrendingUp, TrendingDown, ShieldCheck, DollarSign, ShieldAlert, CheckCircle2 } from 'lucide-react';

export interface TopKpiRowProps {
  score: number;
  moneyAtRiskUSD: number;
  openFindingsCount?: { critical: number; high: number; medium: number; low: number; info: number };
  compliancePassRate?: number;
}

export const TopKpiRow: React.FC<TopKpiRowProps> = ({
  score = 94,
  moneyAtRiskUSD = 1450000,
  openFindingsCount = { critical: 1, high: 2, medium: 4, low: 8, info: 12 },
  compliancePassRate = 94,
}) => {
  const navigate = useNavigate();
  const totalFindings =
    openFindingsCount.critical +
    openFindingsCount.high +
    openFindingsCount.medium +
    openFindingsCount.low +
    openFindingsCount.info;

  const formatMoney = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toLocaleString()}`;
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        width: '100%',
      }}
      className="sirius-top-kpi-row"
    >
      {/* KPI Card 1: Solid Signature Green Hero Card */}
      <div
        className="sirius-hover-lift"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: '#FFFFFF',
          padding: '16px 18px',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '130px',
          boxShadow: 'var(--shadow-medium)',
          position: 'relative',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/compliance')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.9 }}>
            SECURITY POSTURE
          </span>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={16} color="#FFFFFF" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '8px 0 6px 0' }}>
          <span className="sirius-numeral-tabular" style={{ fontSize: '38px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {score}
          </span>
          <span style={{ fontSize: '14px', opacity: 0.8, fontWeight: 600 }}>/ 100</span>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, opacity: 0.9 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: '2px 7px', borderRadius: 'var(--radius-pill)' }}>
            <TrendingUp size={12} /> +2.4 vs last scan
          </span>
        </div>
      </div>

      {/* KPI Card 2: Money at Risk */}
      <div
        className="sirius-glass-card sirius-hover-lift"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          padding: '16px 18px',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '130px',
          boxShadow: 'var(--shadow-small)',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/findings')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DollarSign size={15} color="var(--color-primary)" />
            <span className="sirius-label">Money at Risk</span>
          </div>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg-surface-elevated)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={15} color="var(--color-text-secondary)" />
          </div>
        </div>

        <div className="sirius-numeral-tabular" style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '8px 0 6px 0', lineHeight: 1 }}>
          {formatMoney(moneyAtRiskUSD)}
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', backgroundColor: 'var(--color-primary-soft)', padding: '2px 7px', borderRadius: 'var(--radius-pill)' }}>
            <TrendingDown size={12} /> -$150K exposure reduced
          </span>
        </div>
      </div>

      {/* KPI Card 3: Open Findings / Vulnerabilities */}
      <div
        className="sirius-glass-card sirius-hover-lift"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          padding: '16px 18px',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '130px',
          boxShadow: 'var(--shadow-small)',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/findings')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldAlert size={15} color="var(--color-red)" />
            <span className="sirius-label">Open Vulnerabilities</span>
          </div>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg-surface-elevated)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={15} color="var(--color-text-secondary)" />
          </div>
        </div>

        <div className="sirius-numeral-tabular" style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '8px 0 6px 0', lineHeight: 1 }}>
          {totalFindings}
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', gap: '8px' }}>
          <span style={{ color: 'var(--color-red)' }}>{openFindingsCount.critical} Crit</span>
          <span>·</span>
          <span style={{ color: 'var(--color-amber)' }}>{openFindingsCount.high} High</span>
          <span>·</span>
          <span>{openFindingsCount.medium} Med</span>
        </div>
      </div>

      {/* KPI Card 4: Compliance Pass Rate */}
      <div
        className="sirius-glass-card sirius-hover-lift"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          padding: '16px 18px',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '130px',
          boxShadow: 'var(--shadow-small)',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/compliance')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={15} color="var(--color-primary)" />
            <span className="sirius-label">COMPLIANCE RATE</span>
          </div>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg-surface-elevated)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={15} color="var(--color-text-secondary)" />
          </div>
        </div>

        <div className="sirius-numeral-tabular" style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '8px 0 6px 0', lineHeight: 1 }}>
          {compliancePassRate}%
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 size={13} color="var(--color-primary)" /> PCI-DSS 4.0 & SOC 2 verified
        </div>
      </div>
    </div>
  );
};
