import React from 'react';
import { WorkspaceSettings, Project } from '@sirius/types';
import { GlassCard, Badge } from '@sirius/ui';
import { FolderGit2, GitBranch, Shield } from 'lucide-react';

export interface ProjectSettingsProps {
  settings: WorkspaceSettings;
  projects: Project[];
}

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({ settings, projects }) => {
  const activeProject = projects.find((p) => p.id === settings.defaultProjectId) || projects[0];

  return (
    <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FolderGit2 size={20} color="var(--color-cyan)" />
          <h2 className="sirius-display" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            Project Default Configuration
          </h2>
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          View operational codebase configuration, target repositories, and active scan defaults.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '580px' }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeProject?.name ?? 'No project opened yet'}
            </div>
            <Badge variant="cyan" size="sm">
              ACTIVE WORKSPACE PROJECT
            </Badge>
          </div>

          <div style={{ fontSize: '13px', fontFamily: 'var(--font-code)', color: 'var(--text-secondary)' }}>
            Repository: {activeProject?.repositoryUrl ?? 'none'}
          </div>

          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <GitBranch size={13} color="var(--color-primary)" /> Default Branch: <strong>{activeProject?.branch ?? 'local'}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Shield size={13} color="var(--color-primary)" /> Score: <strong>{activeProject?.complianceScore ?? '—'}/100</strong>
            </span>
          </div>
        </div>

        <div className="sirius-caption" style={{ lineHeight: 1.5 }}>
          Note: Operational project changes, project creation, and branch targets can be managed directly inside the Projects View.
        </div>
      </div>
    </GlassCard>
  );
};
