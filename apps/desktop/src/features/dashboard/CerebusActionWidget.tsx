import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@sirius/ui';

export interface CerebusActionWidgetProps {
  criticalCount?: number;
  highCount?: number;
}

export const CerebusActionWidget: React.FC<CerebusActionWidgetProps> = ({
  criticalCount = 1,
  highCount = 2,
}) => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-surface-elevated)',
        border: '1px solid var(--color-border)',
        padding: '20px 22px',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: 'var(--shadow-small)',
      }}
      className="sirius-cerebus-action-widget sirius-glass-card sirius-hover-lift"
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={16} color="var(--color-primary)" />
          </div>
          <span className="sirius-label" style={{ color: 'var(--color-primary)' }}>
            CEREBUS AI ASSISTANT
          </span>
        </div>

        <h3
          className="sirius-heading-2"
          style={{
            margin: '0 0 6px 0',
            fontSize: '17px',
            color: 'var(--color-text-primary)',
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          Active Remediation Pipeline Ready
        </h3>

        <p
          className="sirius-body-sm"
          style={{
            margin: 0,
            color: 'var(--color-text-secondary)',
            fontSize: '13px',
            lineHeight: 1.45,
          }}
        >
          {criticalCount + highCount} high-impact findings analyzed with verifier checks and read-only PR diff proposals.
        </p>
      </div>

      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ShieldCheck size={13} color="var(--color-primary)" /> Verifier Passed
        </div>

        <Button
          variant="primary"
          size="sm"
          rightIcon={<ArrowRight size={14} />}
          onClick={() => navigate('/remediation')}
          style={{
            borderRadius: 'var(--radius-pill)',
            padding: '8px 18px',
            fontWeight: 600,
          }}
        >
          Run Verifier Fixes
        </Button>
      </div>
    </div>
  );
};
