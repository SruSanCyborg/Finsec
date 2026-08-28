import React, { useState } from 'react';
import { useProjectsQuery } from '../../api/queries';
import { Input, Select, Tabs, Skeleton, LoadingState, ErrorState, EmptyState, Button } from '@sirius/ui';
import { ProjectCard } from './ProjectCard';
import { Search, FolderGit2, Plus, X, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

export const ProjectsGridView: React.FC = () => {
  const { data: projects = [], isLoading, isError, refetch } = useProjectsQuery();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'compliance' | 'risk'>('compliance');

  if (isLoading) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <LoadingState label="Loading Protected Workspaces..." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px', marginTop: '16px' }}>
          <Skeleton height="260px" borderRadius="var(--radius-xl)" />
          <Skeleton height="260px" borderRadius="var(--radius-xl)" />
          <Skeleton height="260px" borderRadius="var(--radius-xl)" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: '48px 40px', maxWidth: '800px', margin: '0 auto' }}>
        <ErrorState
          title="PROJECTS UNAVAILABLE"
          description="Could not retrieve workspace repository list from Core API."
          onRetry={refetch}
        />
      </div>
    );
  }

  // Filter & Sort Projects Presentation Logic
  const filteredProjects = projects.filter((prj) => {
    const matchesSearch =
      prj.name.toLowerCase().includes(search.toLowerCase()) ||
      prj.repositoryUrl.toLowerCase().includes(search.toLowerCase());

    const isAtRisk = (prj.openFindingsCount?.critical ?? 0) > 0 || (prj.complianceScore ?? 100) < 90;

    if (!matchesSearch) return false;
    if (activeTab === 'healthy') return !isAtRisk;
    if (activeTab === 'at_risk') return isAtRisk;
    return true;
  });

  filteredProjects.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'compliance') return (a.complianceScore || 0) - (b.complianceScore || 0);
    if (sortBy === 'risk') return (b.moneyAtRiskUSD || 0) - (a.moneyAtRiskUSD || 0);
    return 0;
  });

  const clearFilters = () => {
    setSearch('');
    setActiveTab('all');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}
    >
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: '4px' }}>
            PROJECTS
          </div>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Projects & Workspaces
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '640px', lineHeight: 1.5 }}>
            Secured repository workspaces evaluated continuously by finsec-lint Core API for security vulnerabilities and compliance drift.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="secondary" leftIcon={<Upload size={15} />}>
            Import Workspace
          </Button>
          <Button variant="primary" leftIcon={<Plus size={15} />}>
            Connect Project
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          backgroundColor: 'var(--color-bg-surface)',
          padding: '14px 20px',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-small)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '300px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project name or repo URL..."
              leftIcon={<Search size={16} color="var(--color-primary)" />}
              style={{ width: '100%' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <Tabs
            activeId={activeTab}
            onChange={setActiveTab}
            variant="pills"
            items={[
              { id: 'all', label: `All (${projects.length})` },
              { id: 'at_risk', label: 'At Risk' },
              { id: 'healthy', label: 'Healthy' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Sort by:</span>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'compliance' | 'risk')}
            options={[
              { value: 'compliance', label: 'Security Score (Lowest First)' },
              { value: 'risk', label: 'Money at Risk (Highest First)' },
              { value: 'name', label: 'Project Name (A-Z)' },
            ]}
          />
        </div>
      </div>

      {/* Active Filter Bar if query or tab applied */}
      {(search || activeTab !== 'all') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '-16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Active Filters:</span>
          {search && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Search: "{search}" <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
            </span>
          )}
          {activeTab !== 'all' && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Status: {activeTab === 'at_risk' ? 'AT RISK' : 'HEALTHY'} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setActiveTab('all')} />
            </span>
          )}
          <button
            onClick={clearFilters}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: 0 }}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Projects Presentation Grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={40} color="var(--color-primary)" />}
          title="NO PROJECTS YET"
          description="SIRIUS needs a project/codebase before it can provide security posture evaluation."
          action={
            <Button variant="primary" leftIcon={<Plus size={15} />}>
              Connect First Project
            </Button>
          }
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={40} color="var(--color-primary)" />}
          title="NO MATCHING WORKSPACES FOUND"
          description={`No project matched search "${search}". Try clearing search filters.`}
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '24px' }}>
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </motion.div>
  );
};
