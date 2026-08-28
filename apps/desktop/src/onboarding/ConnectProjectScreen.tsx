import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, GlassCard, Badge, PixelGridBackground } from '@sirius/ui';
import { useAppStore } from '@sirius/state';
import { MOCK_PROJECTS } from '@sirius/mock-api';
import { FolderGit2, Check, ArrowRight, GitBranch } from 'lucide-react';

export interface ConnectProjectScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export const ConnectProjectScreen: React.FC<ConnectProjectScreenProps> = ({ onNext, onBack }) => {
  const { setActiveProject } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('prj-finsec-core-01');
  const [customRepoUrl, setCustomRepoUrl] = useState('');

  const handleContinue = () => {
    setActiveProject(selectedProjectId);
    onNext();
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
                <h2 className="sirius-heading-1" style={{ margin: 0 }}>Connect a Security Workspace Project</h2>
              </div>
              <div className="sirius-caption">
                Select a repository workspace for AST rule scanning, compliance audit, and Cerebus patches.
              </div>
            </div>

            {/* Seeded Mock Projects List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <label className="sirius-label">Available Workspaces</label>
              {MOCK_PROJECTS.map((prj) => {
                const isSelected = selectedProjectId === prj.id;
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

            {/* Custom Repo Input */}
            <div style={{ marginBottom: '28px' }}>
              <Input
                label="Or Connect External Git Repository"
                placeholder="https://github.com/organization/security-service.git"
                value={customRepoUrl}
                onChange={(e) => setCustomRepoUrl(e.target.value)}
                leftIcon={<FolderGit2 size={16} />}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Button variant="ghost" onClick={onBack}>
                Back
              </Button>
              <Button variant="gradient" size="lg" rightIcon={<ArrowRight size={18} />} onClick={handleContinue}>
                Continue to First Scan
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </PixelGridBackground>
  );
};
