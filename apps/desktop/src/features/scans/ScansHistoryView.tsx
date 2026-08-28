import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScansQuery, useProjectsQuery } from '../../api/queries';
import {
  Input,
  Select,
  Tabs,
  Badge,
  StatusChip,
  Button,
  LoadingState,
  ErrorState,
  EmptyState,
  Skeleton,
  ListCard,
} from '@sirius/ui';
import { PlaySquare, Search, Plus, GitBranch, Clock, ArrowRight, X } from 'lucide-react';
import { motion } from 'framer-motion';

export const ScansHistoryView: React.FC = () => {
  const navigate = useNavigate();
  const { data: scans = [], isLoading, isError, refetch } = useScansQuery();
  const { data: projects = [] } = useProjectsQuery();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'findings' | 'duration'>('newest');

  if (isLoading) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <LoadingState label="Loading Security Scan Timeline..." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          <Skeleton height="72px" borderRadius="var(--radius-lg)" />
          <Skeleton height="72px" borderRadius="var(--radius-lg)" />
          <Skeleton height="72px" borderRadius="var(--radius-lg)" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: '48px 40px', maxWidth: '800px', margin: '0 auto' }}>
        <ErrorState
          title="SCANS UNAVAILABLE"
          description="Could not retrieve scan execution timeline logs from Core API."
          onRetry={refetch}
        />
      </div>
    );
  }

  // Filter & Sort Logic
  const filteredScans = scans.filter((scan) => {
    const project = projects.find((p) => p.id === scan.projectId);
    const matchesSearch =
      scan.id.toLowerCase().includes(search.toLowerCase()) ||
      (scan.commitHash && scan.commitHash.toLowerCase().includes(search.toLowerCase())) ||
      (project && project.name.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (activeTab === 'completed') return scan.status === 'completed';
    if (activeTab === 'running') return scan.status === 'running';
    if (activeTab === 'failed') return scan.status === 'failed';
    return true;
  });

  filteredScans.sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    if (sortBy === 'oldest') return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
    if (sortBy === 'findings') return (b.summary?.totalFindings || 0) - (a.summary?.totalFindings || 0);
    if (sortBy === 'duration') return (b.durationMs || 0) - (a.durationMs || 0);
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
            SCANS
          </div>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Security Scans
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '640px', lineHeight: 1.5 }}>
            Security analysis execution timeline and live streaming analysis across protected repository workspaces.
          </p>
        </div>

        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => navigate('/scans/new')}>
          Run Security Scan
        </Button>
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
              placeholder="Search by Scan ID, commit, or codebase..."
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
              { id: 'all', label: `All (${scans.length})` },
              { id: 'completed', label: 'Completed' },
              { id: 'running', label: 'Running' },
              { id: 'failed', label: 'Failed' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Sort by:</span>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'findings' | 'duration')}
            options={[
              { value: 'newest', label: 'Newest Execution First' },
              { value: 'oldest', label: 'Oldest Execution First' },
              { value: 'findings', label: 'Most Findings Discovered' },
              { value: 'duration', label: 'Longest Execution Duration' },
            ]}
          />
        </div>
      </div>

      {/* Active Filter Chips */}
      {(search || activeTab !== 'all') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '-16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Active Filters:</span>
          {search && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary-deep)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Search: "{search}" <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
            </span>
          )}
          {activeTab !== 'all' && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary-deep)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Status: {activeTab.toUpperCase()} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setActiveTab('all')} />
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

      {/* Scan History Timeline List */}
      {filteredScans.length === 0 ? (
        <EmptyState
          icon={<PlaySquare size={40} color="var(--color-primary)" />}
          title="NO MATCHING SCANS FOUND"
          description={`No scan executions matched query "${search}".`}
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredScans.map((scan) => {
            const project = projects.find((p) => p.id === scan.projectId);
            const statusType = scan.status === 'completed' ? 'COMPLETED' : scan.status === 'running' ? 'RUNNING' : 'FAILED';

            return (
              <ListCard
                key={scan.id}
                tabIndex={0}
                onClick={() => navigate(`/scans/${scan.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/scans/${scan.id}`);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 140ms ease-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <StatusChip status={statusType} size="sm" />

                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>{project?.name || 'PayKit Core API'}</span>
                      <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500 }}>
                        {`#${scan.id}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontFamily: 'var(--font-code)', fontWeight: 500 }}>
                        <GitBranch size={12} /> {scan.commitHash || 'main'}
                      </span>
                      <span>•</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> {(scan.durationMs ? scan.durationMs / 1000 : 42.3).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                      {(scan.summary?.critical || 0) > 0 && (
                        <Badge variant="violet" size="sm">
                          {scan.summary?.critical} Critical
                        </Badge>
                      )}
                      <Badge variant="cyan" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                        {scan.summary?.totalFindings || 27} Findings
                      </Badge>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      {new Date(scan.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>

                  <ArrowRight size={16} color="var(--color-text-muted)" />
                </div>
              </ListCard>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
