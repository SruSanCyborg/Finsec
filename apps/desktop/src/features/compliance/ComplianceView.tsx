import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  useComplianceSummaryQuery,
  useComplianceFrameworksQuery,
  useComplianceControlsQuery,
  useProjectsQuery,
} from '../../api/queries';
import { ComplianceFramework, ComplianceControl } from '@sirius/types';
import { Input, LoadingState, ErrorState, Button } from '@sirius/ui';
import { ComplianceHeroScore } from './ComplianceHeroScore';
import { ComplianceFrameworkCards } from './ComplianceFrameworkCards';
import { ComplianceControlList } from './ComplianceControlList';
import { ComplianceControlInspector } from './ComplianceControlInspector';
import { ShieldCheck, Search } from 'lucide-react';


export const ComplianceView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const paramFrameworkId = searchParams.get('framework');
  const paramControlId = searchParams.get('control');

  const { data: projects = [] } = useProjectsQuery();
  const activeProject = projects[0];

  const { data: summary, isLoading: isLoadingSummary, isError: isErrorSummary, refetch: refetchSummary } =
    useComplianceSummaryQuery(activeProject?.id);

  const { data: frameworks = [], isLoading: isLoadingFrameworks } = useComplianceFrameworksQuery();

  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(paramFrameworkId || 'pci-dss-4.0');

  const { data: controls = [], isLoading: isLoadingControls } = useComplianceControlsQuery(selectedFrameworkId || undefined);

  const [selectedControlId, setSelectedControlId] = useState<string | null>(paramControlId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'fail' | 'pass'>('all');

  // Sync selected framework & control with query params
  useEffect(() => {
    if (paramFrameworkId) {
      setSelectedFrameworkId(paramFrameworkId);
    } else if (frameworks.length > 0 && !selectedFrameworkId) {
      setSelectedFrameworkId(frameworks[0].id);
    }
  }, [paramFrameworkId, frameworks, selectedFrameworkId]);

  useEffect(() => {
    if (paramControlId) {
      setSelectedControlId(paramControlId);
    }
  }, [paramControlId]);

  if (isLoadingSummary || isLoadingFrameworks || isLoadingControls) {
    return <LoadingState label="Loading compliance & security posture scores from FinSec Core..." />;
  }

  if (isErrorSummary || !summary) {
    return <ErrorState title="Failed to Load Resource" description="Compliance posture data unavailable." onRetry={() => refetchSummary()} />;
  }

  const handleSelectFramework = (fw: ComplianceFramework) => {
    setSelectedFrameworkId(fw.id);
    setSelectedControlId(null);

    const next = new URLSearchParams(searchParams);
    next.set('framework', fw.id);
    next.delete('control');
    setSearchParams(next, { replace: true });
  };

  const handleSelectControl = (ctrl: ComplianceControl) => {
    setSelectedControlId(ctrl.id);

    const next = new URLSearchParams(searchParams);
    if (selectedFrameworkId) next.set('framework', selectedFrameworkId);
    next.set('control', ctrl.id);
    setSearchParams(next, { replace: true });
  };

  // Filter controls
  const filteredControls = controls.filter((ctrl) => {
    if (statusFilter === 'fail' && ctrl.status !== 'fail') return false;
    if (statusFilter === 'pass' && ctrl.status !== 'pass') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        ctrl.id.toLowerCase().includes(q) ||
        ctrl.title.toLowerCase().includes(q) ||
        ctrl.section.toLowerCase().includes(q) ||
        ctrl.affectedFindingIds.some((id) => id.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedControl = filteredControls.find((c) => c.id === selectedControlId) || filteredControls[0] || null;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Workspace Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-primary-soft)',
              border: '1px solid rgba(14, 107, 74, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={22} color="var(--color-primary)" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              COMPLIANCE
            </div>
            <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
              Compliance & Security Posture
            </h1>
            <div className="sirius-caption">
              Understand your security posture across the compliance frameworks that matter to your organization.
            </div>
          </div>
        </div>

        {/* Search, Status Filter & Generate Report CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/reports?type=compliance&framework=${selectedFrameworkId || 'pci-dss-4.0'}`)} leftIcon={<ShieldCheck size={14} />}>
            Generate Compliance Report
          </Button>

          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>

            <Button variant={statusFilter === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusFilter('all')}>
              All Controls
            </Button>
            <Button variant={statusFilter === 'fail' ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusFilter('fail')}>
              Failing Only
            </Button>
            <Button variant={statusFilter === 'pass' ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusFilter('pass')}>
              Passing Only
            </Button>
          </div>

          <div style={{ width: '260px' }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search control ID, requirement, finding..."
              leftIcon={<Search size={14} />}
            />
          </div>
        </div>
      </div>

      {/* Hero Score Section */}
      <ComplianceHeroScore
        score={summary.overallScore}
        trend={summary.trend}
        evaluatedCount={summary.evaluatedCount}
        passingCount={summary.passingCount}
        failingCount={summary.failingCount}
        partialCount={summary.partialCount}
        executiveNarrative={summary.executiveNarrative}
      />

      {/* Framework Selection Cards */}
      <ComplianceFrameworkCards
        frameworks={frameworks}
        selectedFrameworkId={selectedFrameworkId}
        onSelectFramework={handleSelectFramework}
      />

      {/* Main Split Workspace */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Column: Control List Data Table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ComplianceControlList
            controls={filteredControls}
            selectedControlId={selectedControl?.id}
            onSelectControl={handleSelectControl}
          />
        </div>

        {/* Right Column: Control & Evidence Inspector */}
        <ComplianceControlInspector
          control={selectedControl}
          onNavigateToFinding={(id) => navigate(`/findings?selected=${id}`)}
          onNavigateToCerebus={(_cId, fId) => navigate(fId ? `/cerebus?finding=${fId}` : '/cerebus')}
          onNavigateToRemediation={(id) => navigate(`/findings/${id}/remediation`)}
        />

      </div>
    </div>
  );
};
