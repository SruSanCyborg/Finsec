import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';

import { useFindingsQuery, useProjectsQuery } from '../../api/queries';
import { FindingSeverity } from '@sirius/types';
import {
  Input,
  Select,
  Badge,
  StatusChip,
  Button,
  LoadingState,
  ErrorState,
} from '@sirius/ui';
import { FindingsList } from './FindingsList';
import { FindingDetailView } from './FindingDetailView';
import { Search, X, RefreshCw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

export const FindingsExplorerView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { findingId: routeFindingId } = useParams<{ findingId?: string }>();

  // Extract URL parameters
  const paramProjectId = searchParams.get('project') || undefined;
  const paramScanId = searchParams.get('scan') || undefined;
  const paramSeverity = searchParams.get('severity') as FindingSeverity | undefined;
  const paramBaseline = searchParams.get('baseline') || undefined;
  const paramValidity = searchParams.get('validity') || undefined;
  const paramSearch = searchParams.get('search') || '';
  const paramSelectedId = routeFindingId || searchParams.get('selected') || undefined;
  const paramSort = (searchParams.get('sortBy') as 'newest' | 'oldest' | 'severity' | 'rule' | 'file') || 'severity';
  const paramGroup = (searchParams.get('groupBy') as 'none' | 'severity' | 'category' | 'rule') || 'none';

  const { data: findings = [], isLoading, isError, refetch } = useFindingsQuery(paramProjectId, paramScanId);
  const { data: projects = [] } = useProjectsQuery();

  // Selected finding ID state synced with URL
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(paramSelectedId || null);

  useEffect(() => {
    if (paramSelectedId) {
      setSelectedFindingId(paramSelectedId);
    } else if (findings.length > 0 && !selectedFindingId) {
      setSelectedFindingId(findings[0].id);
    }
  }, [paramSelectedId, findings, selectedFindingId]);

  // Helper to update search params while keeping active params intact
  const updateQueryParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    const next = new URLSearchParams();
    if (paramProjectId) next.set('project', paramProjectId);
    if (paramScanId) next.set('scan', paramScanId);
    setSearchParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: '1600px', margin: '0 auto' }}>
        <LoadingState label="Loading Security Findings Inventory..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: '48px 40px', maxWidth: '800px', margin: '0 auto' }}>
        <ErrorState
          title="FINDINGS UNAVAILABLE"
          description="Could not retrieve security findings repository from Core API."
          onRetry={refetch}
        />
      </div>
    );
  }

  // Presentation Filtering & Sorting
  const filteredFindings = findings.filter((fnd) => {
    const matchesSearch =
      !paramSearch ||
      fnd.title.toLowerCase().includes(paramSearch.toLowerCase()) ||
      fnd.ruleId.toLowerCase().includes(paramSearch.toLowerCase()) ||
      fnd.filePath.toLowerCase().includes(paramSearch.toLowerCase()) ||
      (fnd.category && fnd.category.toLowerCase().includes(paramSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (paramSeverity && fnd.severity !== paramSeverity) return false;
    if (paramBaseline && fnd.baselineState !== paramBaseline) return false;
    if (paramValidity && fnd.secretValidity?.status !== paramValidity) return false;

    return true;
  });

  // Sorting logic
  filteredFindings.sort((a, b) => {
    if (paramSort === 'severity') {
      const order: Record<FindingSeverity, number> = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };
      return order[a.severity] - order[b.severity];
    }
    if (paramSort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (paramSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (paramSort === 'rule') return a.ruleId.localeCompare(b.ruleId);
    if (paramSort === 'file') return a.filePath.localeCompare(b.filePath);
    return 0;
  });

  const activeProject = projects.find((p) => p.id === paramProjectId);
  const selectedIndex = filteredFindings.findIndex((f) => f.id === selectedFindingId);
  const selectedFinding = filteredFindings[selectedIndex] || filteredFindings[0] || null;

  // Severity counts for summary strip
  const counts = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  // Keyboard navigation up/down
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && selectedIndex < filteredFindings.length - 1) {
      const nextFinding = filteredFindings[selectedIndex + 1];
      if (nextFinding) {
        setSelectedFindingId(nextFinding.id);
        updateQueryParam('selected', nextFinding.id);
      }
    } else if (e.key === 'ArrowUp' && selectedIndex > 0) {
      const prevFinding = filteredFindings[selectedIndex - 1];
      if (prevFinding) {
        setSelectedFindingId(prevFinding.id);
        updateQueryParam('selected', prevFinding.id);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ padding: '32px 40px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', outline: 'none' }}
    >
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: '4px' }}>
            FINDINGS
          </div>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Findings Explorer
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '640px', lineHeight: 1.5 }}>
            Investigate vulnerabilities, secret leak exposures, and software compliance findings across codebase.
            {activeProject && <span style={{ color: 'var(--color-primary)', fontWeight: 600, marginLeft: '6px' }}>• {activeProject.name}</span>}
            {paramScanId && <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-text-muted)', marginLeft: '6px' }}>• #{paramScanId}</span>}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="secondary" onClick={() => navigate('/reports?type=technical')} leftIcon={<FileText size={15} />}>
            Generate Technical Report
          </Button>
          <Button variant="ghost" leftIcon={<RefreshCw size={15} />} onClick={() => refetch()}>
            Refresh Inventory
          </Button>
        </div>
      </div>

      {/* Severity Summary Strip */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => updateQueryParam('severity', null)}
          style={{
            padding: '8px 16px',
            backgroundColor: !paramSeverity ? 'var(--color-primary-soft)' : 'var(--color-bg-surface)',
            border: `1px solid ${!paramSeverity ? 'var(--color-primary)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            fontSize: '12.5px',
            color: !paramSeverity ? 'var(--color-primary)' : 'var(--color-text-primary)',
            fontWeight: 700,
            transition: 'all 140ms ease-out',
          }}
        >
          All ({counts.total})
        </button>

        {[
          { id: 'critical', label: `Critical (${counts.critical})` },
          { id: 'high', label: `High (${counts.high})` },
          { id: 'medium', label: `Medium (${counts.medium})` },
          { id: 'low', label: `Low (${counts.low})` },
          { id: 'info', label: `Info (${counts.info})` },
        ].map((item) => {
          const isSelected = paramSeverity === item.id;
          return (
            <button
              key={item.id}
              onClick={() => updateQueryParam('severity', isSelected ? null : item.id)}
              style={{
                padding: '6px 12px',
                backgroundColor: isSelected ? 'var(--color-primary-soft)' : 'var(--color-bg-surface)',
                border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                transition: 'all 140ms ease-out',
              }}
            >
              <StatusChip status={item.id as FindingSeverity} label={item.label} size="sm" />
            </button>
          );
        })}
      </div>

      {/* Search & Filter Controls Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '320px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <Input
              value={paramSearch}
              onChange={(e) => updateQueryParam('search', e.target.value || null)}
              placeholder="Filter by title, rule ID (FIN-SEC-001), or file path..."
              leftIcon={<Search size={16} color="var(--color-primary)" />}
              style={{ width: '100%' }}
            />
            {paramSearch && (
              <button
                onClick={() => updateQueryParam('search', null)}
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

          <Select
            value={paramBaseline || ''}
            onChange={(e) => updateQueryParam('baseline', e.target.value || null)}
            options={[
              { value: '', label: 'All Baselines' },
              { value: 'new', label: 'Baseline: New Only' },
              { value: 'unchanged', label: 'Baseline: Unchanged' },
            ]}
          />

          <Select
            value={paramValidity || ''}
            onChange={(e) => updateQueryParam('validity', e.target.value || null)}
            options={[
              { value: '', label: 'All Secret Validity' },
              { value: 'valid', label: 'Verified Live Secrets' },
              { value: 'unknown', label: 'Unknown Validity' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Group:</span>
            <Select
              value={paramGroup}
              onChange={(e) => updateQueryParam('groupBy', e.target.value)}
              options={[
                { value: 'none', label: 'No Grouping' },
                { value: 'severity', label: 'By Severity' },
                { value: 'category', label: 'By Category' },
                { value: 'rule', label: 'By Rule ID' },
              ]}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Sort:</span>
            <Select
              value={paramSort}
              onChange={(e) => updateQueryParam('sortBy', e.target.value)}
              options={[
                { value: 'severity', label: 'Highest Severity' },
                { value: 'newest', label: 'Newest First' },
                { value: 'oldest', label: 'Oldest First' },
                { value: 'rule', label: 'Rule ID' },
                { value: 'file', label: 'File Location' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {(paramSeverity || paramBaseline || paramValidity || paramSearch) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '-12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Active Filters:</span>
          {paramSeverity && (
            <Badge variant="cyan" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Severity: {paramSeverity.toUpperCase()}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => updateQueryParam('severity', null)} />
            </Badge>
          )}
          {paramBaseline && (
            <Badge variant="violet" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Baseline: {paramBaseline.toUpperCase()}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => updateQueryParam('baseline', null)} />
            </Badge>
          )}
          {paramValidity && (
            <Badge variant="emerald" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Validity: VERIFIED
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => updateQueryParam('validity', null)} />
            </Badge>
          )}
          {paramSearch && (
            <Badge variant="neutral" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Search: "{paramSearch}"
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => updateQueryParam('search', null)} />
            </Badge>
          )}
          <button
            onClick={clearAllFilters}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: 0 }}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Master-Detail Split Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) 1fr', gap: '24px', minHeight: '640px' }}>
        {/* Left Inventory List */}
        <FindingsList
          findings={filteredFindings}
          selectedFindingId={selectedFinding?.id || null}
          groupBy={paramGroup}
          onSelectFinding={(fnd) => {
            setSelectedFindingId(fnd.id);
            updateQueryParam('selected', fnd.id);
          }}
          onClearFilters={clearAllFilters}
        />

        {/* Right Detail Inspector */}
        <FindingDetailView
          finding={selectedFinding}
          currentIndex={selectedIndex !== -1 ? selectedIndex : 0}
          totalCount={filteredFindings.length}
          onPrevious={() => {
            if (selectedIndex > 0) {
              const prev = filteredFindings[selectedIndex - 1];
              setSelectedFindingId(prev.id);
              updateQueryParam('selected', prev.id);
            }
          }}
          onNext={() => {
            if (selectedIndex < filteredFindings.length - 1) {
              const next = filteredFindings[selectedIndex + 1];
              setSelectedFindingId(next.id);
              updateQueryParam('selected', next.id);
            }
          }}
        />
      </div>
    </motion.div>
  );
};
