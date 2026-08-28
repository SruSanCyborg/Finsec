import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '@sirius/types';
import { Card, StatusChip, Badge, MoneyTicker } from '@sirius/ui';
import { FolderGit2, GitBranch, Clock, ExternalLink, ArrowRight, ShieldAlert } from 'lucide-react';

export interface ProjectCardProps {
  project: Project;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  const navigate = useNavigate();

  const isAtRisk = (project.openFindingsCount?.critical ?? 0) > 0 || (project.complianceScore ?? 100) < 90;
  const criticalCount = project.openFindingsCount?.critical ?? 0;
  const highCount = project.openFindingsCount?.high ?? 0;

  return (
    <Card
      variant="surface"
      padding="lg"
      tabIndex={0}
      onClick={() => navigate(`/projects/${project.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/projects/${project.id}`);
        }
      }}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box',
        position: 'relative',
        outline: 'none',
        transition: 'all 200ms ease-out',
        borderLeft: isAtRisk ? '3.5px solid var(--color-red)' : '3.5px solid var(--color-primary)',
      }}
    >
      <div>
        {/* Header: Title, Repo & Status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <FolderGit2 size={18} color="var(--color-primary)" />
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {project.name}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}>
              <span>{project.repositoryUrl}</span>
              <ExternalLink size={11} color="var(--color-text-muted)" />
            </div>
          </div>

          <StatusChip status={isAtRisk ? 'AT RISK' : 'HEALTHY'} size="sm" />
        </div>

        {/* Posture Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            padding: '12px 14px',
            backgroundColor: 'var(--color-bg-surface-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
              SECURITY SCORE
            </div>
            <div className="sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 800, color: (project.complianceScore ?? 100) >= 90 ? 'var(--color-primary)' : 'var(--color-red)' }}>
              {project.complianceScore ?? 100}<span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>/100</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
              MONEY AT RISK
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>
              <MoneyTicker amountUSD={project.moneyAtRiskUSD ?? 0} durationMs={0} variant="compact" />
            </div>
          </div>
        </div>

        {/* Open Findings Summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {criticalCount > 0 && (
            <Badge variant="red" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ShieldAlert size={12} /> {criticalCount} Critical
            </Badge>
          )}
          {highCount > 0 && (
            <Badge variant="amber" size="sm">
              {highCount} High
            </Badge>
          )}
          {!criticalCount && !highCount && (
            <Badge variant="emerald" size="sm">
              Zero High/Critical Findings
            </Badge>
          )}
        </div>
      </div>

      {/* Footer: Branch, Last Scan & Arrow */}
      <div
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          paddingTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--color-text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-code)', fontWeight: 500 }}>
            <GitBranch size={12} color="var(--color-primary)" /> {project.branch}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> {new Date(project.lastScanTimestamp || project.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <ArrowRight size={15} color="var(--color-text-muted)" />
      </div>
    </Card>
  );
};
