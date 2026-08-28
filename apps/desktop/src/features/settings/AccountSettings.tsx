import React from 'react';
import { useSessionStore } from '@sirius/state';
import { GlassCard, Badge, Button } from '@sirius/ui';
import { User, LogOut, ShieldCheck } from 'lucide-react';

export const AccountSettings: React.FC = () => {
  const { currentUser, clearSession } = useSessionStore();

  const handleLogout = () => {
    clearSession();
  };

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <User size={20} color="var(--color-cyan)" />
          <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            Account & Active Session
          </h2>
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          Inspect authenticated operator session credentials, backend authorization profile, and security permissions.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '540px' }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid var(--color-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: 'var(--color-cyan)',
              fontSize: '18px',
            }}
          >
            {currentUser?.name?.[0] || 'S'}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {currentUser?.name || 'Shivam Pandey'}
            </div>
            <div className="sirius-caption" style={{ fontFamily: 'var(--font-code)' }}>
              {currentUser?.email || 'shivam.pandey@finsec.dev'}
            </div>
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <Badge variant="violet" size="sm">
                ROLE: {currentUser?.role ? currentUser.role.toUpperCase() : 'LEAD DEVSECOPS'}
              </Badge>
              <Badge variant="emerald" size="sm" icon={<ShieldCheck size={12} />}>
                AUTHENTICATED
              </Badge>
            </div>
          </div>
        </div>


        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <div className="sirius-caption">READ-ONLY AUTHORIZATION DETAILS</div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Session ID: </span>
            <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-cyan)' }}>sess-991823-a1</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Auth Authority: </span>
            <span>FinSec Core K/S Token Authority</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Permissions: </span>
            <span>Scan Execution, Cerebus Remediation, Compliance Certification, Governance Admin</span>
          </div>
        </div>

        <div style={{ paddingTop: '10px' }}>
          <Button variant="secondary" onClick={handleLogout} leftIcon={<LogOut size={15} color="var(--color-red)" />}>
            Terminate Session & Log Out
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
