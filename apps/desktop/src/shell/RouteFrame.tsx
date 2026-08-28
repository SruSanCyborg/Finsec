import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GlassCard, Badge, Button } from '@sirius/ui';
import { ShieldCheck, Play, Terminal, ArrowRight } from 'lucide-react';

export interface RouteFrameProps {
  title: string;
  description: string;
  phaseLabel?: string;
}

export const RouteFrame: React.FC<RouteFrameProps> = ({
  title,
  description,
  phaseLabel = 'Future Feature Phase',
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 120px)',
        padding: '40px 24px',
        boxSizing: 'border-box',
      }}
    >
      <GlassCard padding="lg" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '9999px', color: 'var(--color-cyan)', fontSize: '11px', fontWeight: 600, marginBottom: '16px' }}>
          <ShieldCheck size={14} /> SIRIUS Application Frame • {phaseLabel}
        </div>

        <h2 className="sirius-heading-1" style={{ margin: '0 0 8px 0', fontSize: '24px' }}>
          {title}
        </h2>

        <p className="sirius-body" style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
          {description}
        </p>

        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            marginBottom: '24px',
            fontSize: '12px',
            color: 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Terminal size={14} color="var(--color-teal)" />
          <span>Active Route Shell:</span>
          <Badge variant="teal" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
            {location.pathname}
          </Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Button variant="ghost" onClick={() => navigate('/design-system')} leftIcon={<Play size={14} />}>
            Open Design System Lab
          </Button>
          <Button variant="gradient" onClick={() => navigate('/dashboard')} rightIcon={<ArrowRight size={14} />}>
            Back to Dashboard
          </Button>
        </div>
      </GlassCard>
    </div>
  );
};
