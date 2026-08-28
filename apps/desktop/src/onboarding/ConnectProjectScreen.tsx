import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, GlassCard, Badge, PixelGridBackground } from '@sirius/ui';
import { useAppStore } from '@sirius/state';
import { useProjectsQuery, useAddProjectMutation } from '../api/queries';
import { FolderGit2, Check, ArrowRight, GitBranch } from 'lucide-react';

export interface ConnectProjectScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export const ConnectProjectScreen: React.FC<ConnectProjectScreenProps> = ({ onNext, onBack }) => {
  const { setActiveProject } = useAppStore();
  const { data: projects = [] } = useProjectsQuery();
  const addProjectMutation = useAddProjectMutation();

  // The daemon always serves the directory it was started in — see
  // `sirius serve --root` — so that one is guaranteed to exist even before
  // anything else has been opened, and it's the sane default selection.
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [customPath, setCustomPath] = useState('');
  const [pathError, setPathError] = useState<string | null>(null);

  const effectiveSelection = selectedProjectId || projects[0]?.id || '';

  const handleContinue = () => {
    if (!effectiveSelection) return;
    setActiveProject(effectiveSelection);
    onNext();
  };

  const handleOpenPath = async () => {
    if (!customPath.trim()) return;
    setPathError(null);
    try {
      const project = await addProjectMutation.mutateAsync(customPath.trim());
      setSelectedProjectId(project.id);
      setCustomPath('');
    } catch (err) {
      setPathError(err instanceof Error ? err.message : 'Could not open that directory.');
    }
  };

  return (
    <PixelGridBackground enabled opacity={0.03}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 24px',
          boxSizing: 'border-box',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={{ maxWidth: '560px', width: '100%' }}
        >
          <GlassCard padding="lg" style={{ boxShadow: 'var(--shadow-modal)' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <FolderGit2 size={24} color="var(--color-cyan)" />
                <h2 className="sirius-heading-1" style={{ margin: 0 }}>Open a Workspace</h2>
              </div>
              <div className="sirius-caption">
                Pick a local directory for AST rule scanning, compliance audit, and template fixes — sirius scans what is on disk, not a remote clone.
              </div>
            </div>

            {/* Projects the daemon already knows about */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <label className="sirius-label">Available Workspaces</label>
              {projects.map((prj) => {
                const isSelected = effectiveSelection === prj.id;
                return (
                  <div
                    key={prj.id}
                    onClick={() => setSelectedProjectId(prj.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--color-cyan)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-lg)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{prj.name}</span>
                        <Badge variant="cyan" size="sm">
                          <GitBranch size={10} style={{ marginRight: '4px' }} /> {prj.branch}
                        </Badge>
                      </div>
                      <div className="sirius-mono-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {prj.repositoryUrl}
                      </div>
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-cyan)',
                          color: '#0A0B10',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={16} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Open another local directory */}
            <div style={{ marginBottom: '28px' }}>
              <Input
                label="Or Open Another Local Directory"
                placeholder="/path/to/a/project"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                leftIcon={<FolderGit2 size={16} />}
              />
              {pathError && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-red)' }}>{pathError}</div>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenPath}
                isLoading={addProjectMutation.isPending}
                style={{ marginTop: '10px' }}
              >
                Open
              </Button>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Button variant="ghost" onClick={onBack}>
                Back
              </Button>
              <Button variant="gradient" size="lg" rightIcon={<ArrowRight size={18} />} onClick={handleContinue} disabled={!effectiveSelection}>
                Continue to First Scan
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </PixelGridBackground>
  );
};
