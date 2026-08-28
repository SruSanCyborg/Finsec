import React from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, Terminal, Layers } from 'lucide-react';
import { getSiriusEnv } from '@sirius/utils';

export const FallbackScreen: React.FC = () => {
  const location = useLocation();
  const env = getSiriusEnv();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '40px 20px',
      backgroundColor: 'var(--bg-void)',
      color: 'var(--text-primary)'
    }}>
      <div className="sirius-glass-surface" style={{
        padding: '40px',
        maxWidth: '640px',
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid var(--border-hairline)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <ShieldCheck size={32} color="var(--color-cyan)" />
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              SIRIUS Security Command Center
            </h1>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Engineering Foundation Ready • finsec-lint Client
            </span>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: '6px',
          padding: '16px',
          marginBottom: '24px',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-teal)', marginBottom: '8px', fontWeight: 600 }}>
            <Terminal size={16} /> Route Active: <code className="sirius-numeral-tabular">{location.pathname}</code>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            You are viewing the route shell. The engineering foundation, domain types, API abstraction layer, state management stores, and visual identity tokens are successfully established. Feature screens will be implemented in subsequent phases.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          fontSize: '12px',
          color: 'var(--text-dim)'
        }}>
          <div style={{ background: 'var(--bg-raised)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--color-emerald)" /> API Client Mode
            </div>
            <strong style={{ color: 'var(--color-emerald)' }}>
              {env.VITE_USE_MOCK_API ? 'Mock Core API' : 'Live Core API'}
            </strong>
          </div>
          <div style={{ background: 'var(--bg-raised)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Environment</div>
            <strong style={{ color: 'var(--color-cyan)', textTransform: 'uppercase' }}>
              {env.VITE_APP_ENV}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
