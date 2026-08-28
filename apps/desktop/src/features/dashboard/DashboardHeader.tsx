import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '@sirius/types';
import { Button, StatusPulse } from '@sirius/ui';
import { Play, ShieldAlert, Cpu, GitBranch } from 'lucide-react';

export interface DashboardHeaderProps {
  activeProject: Project | null;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ activeProject }) => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '16px',
      }}
      className="sirius-dashboard-header"
    >
      <div>
        <div
          className="sirius-label"
          style={{ color: 'var(--color-primary)', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '4px' }}
        >
          SECURITY COMMAND CENTER
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <h1 className="sirius-display" style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Security Command Dashboard
          </h1>
          <StatusPulse status="Online" label="Core Gateway" />
        </div>
        <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
          <span>Active Context:</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{activeProject?.name || 'finsec-core-gateway'}</span>
          <span>•</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontWeight: 500 }}>
            <GitBranch size={12} /> {activeProject?.branch || 'main'}
          </span>
          <span>•</span>
          <span>Understand risk, exposure, and remediation posture across your project</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Button
          variant="ghost"
          size="md"
          leftIcon={<Cpu size={15} color="var(--color-primary)" />}
          onClick={() => navigate('/findings')}
        >
          Ask Cerebus
        </Button>
        <Button
          variant="secondary"
          size="md"
          leftIcon={<ShieldAlert size={15} color="var(--color-primary)" />}
          onClick={() => navigate('/reports?type=executive')}
        >
          Generate Report
        </Button>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Play size={15} />}
          onClick={() => navigate('/scans')}
        >
          Run Security Scan
        </Button>
      </div>
    </div>
  );
};
