import React, { useEffect, useState } from 'react';
import { bootstrapDaemon, currentApiUrl } from '../api/daemon';

type Status = 'waiting' | 'ready' | 'failed';

/**
 * Holds rendering until `bootstrapDaemon()` resolves.
 *
 * Every query hook in this app fires from a component mounted under `App`, so
 * a query that runs before the daemon's real URL and token are known would
 * fail loudly (403/401 against a wrong host) rather than simply not have run
 * yet. This is the one place that ordering is enforced — the query layer
 * itself doesn't know or need to know that a Tauri handshake happened first.
 */
export const DaemonGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status>('waiting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrapDaemon()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'ready') return <>{children}</>;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '12px',
        backgroundColor: '#0A0B10',
        color: '#E6E8EE',
        fontFamily: 'var(--font-body, system-ui)',
      }}
    >
      {status === 'waiting' && (
        <>
          <div className="sirius-spin" style={{ fontSize: '28px' }}>
            ⟳
          </div>
          <div style={{ fontSize: '13px', color: '#9CA3AF' }}>Starting the local engine…</div>
        </>
      )}
      {status === 'failed' && (
        <>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#F87171' }}>Couldn't reach sirius serve</div>
          <div style={{ fontSize: '12px', color: '#9CA3AF', maxWidth: '420px', textAlign: 'center', lineHeight: 1.5 }}>
            {error}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', fontFamily: 'var(--font-code, monospace)', marginTop: '8px' }}>
            expected at {currentApiUrl()}
          </div>
        </>
      )}
    </div>
  );
};
