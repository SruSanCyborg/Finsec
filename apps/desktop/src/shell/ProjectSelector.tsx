import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@sirius/state';
import { MOCK_PROJECTS } from '@sirius/mock-api';
import { Badge } from '@sirius/ui';
import { FolderGit2, GitBranch, Check, ChevronDown } from 'lucide-react';

export const ProjectSelector: React.FC = () => {
  const { activeProjectId, setActiveProject } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeProject = MOCK_PROJECTS.find((p) => p.id === activeProjectId) || MOCK_PROJECTS[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: 'var(--bg-raised)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'border-color var(--transition-fast)',
        }}
      >
        <FolderGit2 size={14} color="var(--color-cyan)" />
        <span>{activeProject.name}</span>
        <Badge variant="cyan" size="sm" style={{ padding: '1px 6px', fontSize: '10px' }}>
          <GitBranch size={9} style={{ marginRight: '3px' }} /> {activeProject.branch}
        </Badge>
        <ChevronDown size={14} color="var(--text-secondary)" />
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '6px',
            width: '260px',
            backgroundColor: 'rgba(18, 20, 28, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-raised)',
            padding: '6px',
            zIndex: 1000,
          }}
        >
          <div className="sirius-label" style={{ padding: '6px 8px' }}>
            Switch Active Project
          </div>
          {MOCK_PROJECTS.map((prj) => {
            const isSelected = prj.id === activeProject.id;
            return (
              <button
                key={prj.id}
                role="menuitem"
                onClick={() => {
                  setActiveProject(prj.id);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{prj.name}</div>
                  <div className="sirius-caption" style={{ fontSize: '10px' }}>
                    {prj.repositoryUrl}
                  </div>
                </div>
                {isSelected && <Check size={14} color="var(--color-cyan)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
