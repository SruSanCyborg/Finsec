import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@sirius/ui';
import { Sparkles, ArrowRight, Cpu } from 'lucide-react';

export const RecommendationsPanel: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Card variant="insight" padding="lg">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Sparkles size={18} color="var(--color-primary)" />
        <span className="sirius-heading-3" style={{ margin: 0 }}>Recommended Next Actions</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--color-bg-surface-elevated)',
            border: '1px solid rgba(14, 107, 74, 0.2)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                1 Critical Finding Requires Remediation
              </span>
              <Badge variant="violet" size="sm">CEREBUS READY</Badge>
            </div>
            <div className="sirius-caption" style={{ color: 'var(--color-text-secondary)' }}>
              Hardcoded JWT signing key detected in src/middleware/auth.ts:42.
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Cpu size={14} />}
            rightIcon={<ArrowRight size={14} />}
            onClick={() => navigate('/findings')}
          >
            Review & Apply Cerebus Fix
          </Button>
        </div>

        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--color-bg-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                PCI-DSS 4.0 Requirement 6.3.2 Non-Compliant
              </span>
              <Badge variant="cyan" size="sm">AUDIT REQUIREMENT</Badge>
            </div>
            <div className="sirius-caption" style={{ color: 'var(--color-text-secondary)' }}>
              Software architecture vulnerability prevention check requires remediation.
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            rightIcon={<ArrowRight size={14} />}
            onClick={() => navigate('/reports')}
          >
            Inspect Compliance Report
          </Button>
        </div>
      </div>
    </Card>
  );
};
