import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderGit2, Plus, GitBranch, ShieldCheck, AlertCircle } from 'lucide-react';
import { Badge, Button } from '@sirius/ui';
import { useProjectsQuery } from '../../api/queries';

export const ActiveTargetsWidget: React.FC = () => {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjectsQuery();

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        padding: '18px 20px',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: 'var(--shadow-small)',
      }}
      className="sirius-active-targets-widget sirius-glass-card sirius-hover-lift"
    >
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderGit2 size={16} color="var(--color-primary)" />
          <span className="sirius-heading-3" style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>
            TARGET WORKSPACES
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={13} />}
          onClick={() => navigate('/scans')}
          style={{ borderRadius: 'var(--radius-pill)', padding: '4px 10px', fontSize: '11px' }}
        >
          New Scan
        </Button>
      </div>

      {/* Target Projects List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'center' }}>
        {projects.slice(0, 3).map((project) => {
          const isAtRisk = (project.openFindingsCount?.critical || 0) > 0;
          return (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="sirius-hover-lift"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-surface-elevated)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                transition: 'border-color var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isAtRisk ? 'rgba(225, 29, 72, 0.1)' : 'var(--color-primary-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isAtRisk ? <AlertCircle size={15} color="var(--color-red)" /> : <ShieldCheck size={15} color="var(--color-primary)" />}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {project.name}
                  </div>
                  <div className="sirius-caption" style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <GitBranch size={10} color="var(--color-primary)" /> {project.branch}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span className="sirius-numeral-tabular" style={{ fontSize: '12px', fontWeight: 700, color: isAtRisk ? 'var(--color-red)' : 'var(--color-primary)' }}>
                  {project.complianceScore}/100
                </span>
                <Badge variant={isAtRisk ? 'red' : 'primary'} size="sm">
                  {isAtRisk ? 'Action Required' : 'Compliant'}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
