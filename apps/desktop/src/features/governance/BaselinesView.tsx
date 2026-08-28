import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useBaselinesQuery,
  useCreateBaselineMutation,
  useProjectsQuery,
  useScansQuery,
} from '../../api/queries';
import { Baseline } from '@sirius/types';
import { GlassCard, Badge, Button, LoadingState, ErrorState } from '@sirius/ui';
import { CreateBaselineDialog } from './CreateBaselineDialog';
import { GitBranch, Plus, Calendar, Layers } from 'lucide-react';


export const BaselinesView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get('id');

  const { data: projects = [] } = useProjectsQuery();
  const activeProject = projects[0];

  const { data: baselines = [], isLoading, isError, refetch } = useBaselinesQuery(activeProject?.id);
  const { data: scans = [] } = useScansQuery(activeProject?.id);
  const latestCompletedScan = scans.find((scan) => scan.status === 'completed');
  const createBaselineMutation = useCreateBaselineMutation();

  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(paramId || null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (paramId) {
      setSelectedBaselineId(paramId);
    } else if (baselines.length > 0 && !selectedBaselineId) {
      setSelectedBaselineId(baselines[0].id);
    }
  }, [paramId, baselines, selectedBaselineId]);

  if (isLoading) {
    return <LoadingState label="Loading reference baselines from FinSec Core..." />;
  }

  if (isError) {
    return <ErrorState title="Failed to Load Resource" description="Baseline comparison data unavailable." onRetry={() => refetch()} />;
  }

  const activeBaseline = baselines.find((b) => b.status === 'active') || baselines[0];
  const selectedBaseline = baselines.find((b) => b.id === selectedBaselineId) || activeBaseline;

  const handleSelectBaseline = (baseline: Baseline) => {
    setSelectedBaselineId(baseline.id);
    const next = new URLSearchParams(searchParams);
    next.set('id', baseline.id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GitBranch size={22} color="var(--color-cyan)" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              GOVERNANCE
            </div>
            <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
              Repository Baselines & Delta Governance
            </h1>
            <div className="sirius-caption">
              Reference baseline states for distinguishing NEW, UNCHANGED, and ABSENT security findings.
            </div>
          </div>
        </div>

        <Button variant="gradient" size="sm" onClick={() => setIsCreateOpen(true)} leftIcon={<Plus size={14} />}>
          Capture Reference Baseline
        </Button>
      </div>

      {/* Active Baseline Hero strip */}
      {activeBaseline && (
        <GlassCard padding="lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GitBranch size={24} color="var(--color-emerald)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="sirius-caption" style={{ color: 'var(--color-emerald)', fontWeight: 700 }}>
                  CURRENT ACTIVE BASELINE
                </span>
                <Badge variant="emerald" size="sm">
                  {activeBaseline.branch.toUpperCase()}
                </Badge>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-code)' }}>
                Baseline {activeBaseline.id} (Scan {activeBaseline.scanId})
              </div>
              <div className="sirius-caption" style={{ marginTop: '2px' }}>
                Captured by {activeBaseline.createdBy} on {new Date(activeBaseline.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Comparison Metrics */}
          <div style={{ display: 'flex', gap: '16px', backgroundColor: 'var(--bg-surface)', padding: '14px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
            <div>
              <div className="sirius-caption" style={{ color: 'var(--color-amber)' }}>NEW FINDINGS</div>
              <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-amber)', marginTop: '2px' }}>
                {activeBaseline.newCount}
              </div>
            </div>

            <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-hairline)' }} />

            <div>
              <div className="sirius-caption">UNCHANGED</div>
              <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>
                {activeBaseline.unchangedCount}
              </div>
            </div>

            <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-hairline)' }} />

            <div>
              <div className="sirius-caption" style={{ color: 'var(--color-emerald)' }}>ABSENT / RESOLVED</div>
              <div className="sirius-heading-2 sirius-numeral-tabular" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-emerald)', marginTop: '2px' }}>
                {activeBaseline.absentCount}
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Main Split View */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Table */}
        <div style={{ flex: 1, minWidth: 0, backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-hairline)', backgroundColor: 'rgba(15, 18, 26, 0.8)' }}>
                <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>BASELINE ID</th>
                <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>BRANCH</th>
                <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>SCAN REFERENCE</th>
                <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>STATUS</th>
                <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>FINDINGS CAPTURED</th>
                <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>CREATED</th>

              </tr>
            </thead>
            <tbody>
              {baselines.map((item) => {
                const isSelected = selectedBaselineId === item.id;

                return (
                  <tr
                    key={item.id}
                    onClick={() => handleSelectBaseline(item)}
                    style={{
                      borderBottom: '1px solid var(--border-hairline)',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                      transition: 'background-color var(--transition-fast)',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', fontWeight: 700, color: 'var(--color-cyan)' }}>
                      {item.id}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.branch}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
                      {item.scanId}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={item.status === 'active' ? 'emerald' : 'neutral'} size="sm">
                        {item.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.findingCount}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Inspector */}
        {selectedBaseline && (
          <GlassCard padding="lg" style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="sirius-caption" style={{ fontFamily: 'var(--font-code)', color: 'var(--color-cyan)', fontWeight: 700 }}>
                  BASELINE {selectedBaseline.id}
                </span>
                <Badge variant={selectedBaseline.status === 'active' ? 'emerald' : 'neutral'} size="sm">
                  {selectedBaseline.status.toUpperCase()}
                </Badge>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Target Branch: {selectedBaseline.branch}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
              <div className="sirius-caption" style={{ marginBottom: '4px' }}>BASELINE AUTHOR & CONTEXT</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Captured by {selectedBaseline.createdBy} from Scan {selectedBaseline.scanId}.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={12} color="var(--color-cyan)" /> CAPTURED
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-code)' }}>
                  {selectedBaseline.findingCount} Findings
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} color="var(--color-cyan)" /> DATE
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-code)' }}>
                  {new Date(selectedBaseline.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            <a
              href="/findings?baseline=new"
              className="sirius-btn sirius-btn-gradient"
              style={{ textDecoration: 'none', fontSize: '12px', padding: '8px 14px', borderRadius: 'var(--radius-md)', textAlign: 'center', marginTop: 'auto' }}
            >
              View New Findings ({selectedBaseline.newCount})
            </a>
          </GlassCard>
        )}
      </div>

      {/* Modal Dialog */}
      <CreateBaselineDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        scanId={latestCompletedScan?.id}
        projectId={activeProject?.id}
        findingCount={latestCompletedScan?.summary?.totalFindings}
        onSubmit={async (params) => {
          await createBaselineMutation.mutateAsync(params);
        }}
      />
    </div>
  );
};
