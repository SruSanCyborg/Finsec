import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAppStore, useScanStore } from '@sirius/state';
import { useProjectsQuery, useCreateScanMutation } from '../../api/queries';
import { FindingSeverity } from '@sirius/types';
import { GlassCard, Button, GradientButton, Select, Checkbox, SeverityChip } from '@sirius/ui';
import { Play, FolderGit2, ShieldCheck, GitBranch, ArrowLeft } from 'lucide-react';


export const ScanConfigView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProjectId } = useAppStore();
  const { data: projects = [] } = useProjectsQuery();
  const createScanMutation = useCreateScanMutation();

  const paramProjectId = searchParams.get('project') || activeProjectId || projects[0]?.id || 'prj-finsec-core-01';
  const [selectedProjectId, setSelectedProjectId] = useState<string>(paramProjectId);
  const [severityThreshold, setSeverityThreshold] = useState<FindingSeverity>('high');
  const [failOn, setFailOn] = useState<'all' | 'new' | 'verified-secrets'>('all');
  const [includeCompliance, setIncludeCompliance] = useState(true);
  const [includeMoneyRisk, setIncludeMoneyRisk] = useState(true);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const handleLaunchScan = async () => {
    try {
      // The daemon scans the project directory itself — there is no branch
      // concept for a local target, only whatever is on disk right now.
      const scan = await createScanMutation.mutateAsync({
        projectId: selectedProjectId,
        severityThreshold,
        failOn,
      });

      useScanStore.getState().setActiveScan(scan);
      navigate(`/scans/${scan.id}`);
    } catch (err) {
      console.error('Failed to launch scan:', err);
    }
  };


  const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/scans')}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: 0, marginBottom: '8px' }}
        >
          <ArrowLeft size={14} /> Back to Scan History
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Play size={20} color="var(--color-cyan)" />
          </div>
          <div>
            <h1 className="sirius-display" style={{ margin: 0, fontSize: '26px', fontWeight: 800 }}>
              New Security Scan Launcher
            </h1>
            <div className="sirius-caption">
              Configure target workspace, severity thresholds, and build gate predicates for AST rule evaluation.
            </div>
          </div>
        </div>
      </div>

      {/* Target Section */}
      <GlassCard padding="lg">
        <div className="sirius-heading-3" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderGit2 size={18} color="var(--color-cyan)" />
          Target Workspace & Repository
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="sirius-label" style={{ marginBottom: '6px', display: 'block' }}>Target Project</label>
            <Select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <div>
            <label className="sirius-label" style={{ marginBottom: '6px', display: 'block' }}>Branch Context</label>
            <div
              style={{
                height: '38px',
                backgroundColor: 'var(--bg-raised)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                gap: '6px',
              }}
            >
              <GitBranch size={14} color="var(--color-cyan)" /> {selectedProject?.branch || 'main'}
            </div>
          </div>
        </div>

        <div className="sirius-mono-sm" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
          Repository: {selectedProject?.repositoryUrl}
        </div>
      </GlassCard>

      {/* Severity Threshold Selector */}
      <GlassCard padding="lg">
        <div className="sirius-heading-3" style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--color-emerald)" />
          Severity Gate Threshold
        </div>
        <div className="sirius-caption" style={{ marginBottom: '16px' }}>
          Which severity levels count toward build gate blocking predicate?
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {severities.map((sev) => {
            const isSelected = severityThreshold === sev;
            return (
              <button
                key={sev}
                onClick={() => setSeverityThreshold(sev)}
                style={{
                  flex: 1,
                  minWidth: '100px',
                  padding: '10px 12px',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-surface)',
                  border: `1px solid ${isSelected ? 'var(--color-cyan)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <SeverityChip severity={sev} variant="compact" />
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Fail-On Predicate */}
      <GlassCard padding="lg">
        <div className="sirius-heading-3" style={{ marginBottom: '6px' }}>
          Fail-On Predicate
        </div>
        <div className="sirius-caption" style={{ marginBottom: '16px' }}>
          Determines finding evaluation logic for build pipeline pass/fail result.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { id: 'all', title: 'ALL FINDINGS', desc: 'Evaluate all matching findings against severity threshold.' },
            { id: 'new', title: 'NEW FINDINGS ONLY', desc: 'Evaluate only findings introduced relative to baseline commit.' },
            { id: 'verified-secrets', title: 'VERIFIED SECRETS ONLY', desc: 'Evaluate verified-live cryptographic secret leaks.' },
          ].map((opt) => {
            const isSelected = failOn === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setFailOn(opt.id as 'all' | 'new' | 'verified-secrets')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-surface)',
                  border: `1px solid ${isSelected ? 'var(--color-cyan)' : 'var(--border-hairline)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--color-cyan)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-cyan)' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{opt.title}</div>
                  <div className="sirius-caption">{opt.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Analysis Options */}
      <GlassCard padding="lg">
        <div className="sirius-heading-3" style={{ marginBottom: '16px' }}>Analysis Scope</div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <Checkbox
            label="Continuous PCI-DSS 4.0 & SOC2 Compliance Mapping"
            checked={includeCompliance}
            onChange={(e) => setIncludeCompliance(e.target.checked)}
          />
          <Checkbox
            label="Financial Exposure Valuation (Money at Risk)"
            checked={includeMoneyRisk}
            onChange={(e) => setIncludeMoneyRisk(e.target.checked)}
          />
        </div>
      </GlassCard>

      {/* Summary Card & Launch Action */}
      <GlassCard padding="lg" style={{ border: '1px solid rgba(56, 189, 248, 0.3)', boxShadow: 'var(--glow-cyan)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Scan Operations Summary</div>
            <div className="sirius-caption" style={{ display: 'flex', gap: '12px' }}>
              <span>Target: <strong style={{ color: 'var(--text-primary)' }}>{selectedProject?.name}</strong></span>
              <span>•</span>
              <span>Threshold: <strong style={{ color: 'var(--color-primary)' }}>{severityThreshold.toUpperCase()}+</strong></span>
              <span>•</span>
              <span>Fail On: <strong style={{ color: 'var(--color-amber)' }}>{failOn.toUpperCase()}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="ghost" onClick={() => navigate('/scans')}>Cancel</Button>
            <GradientButton
              size="lg"
              leftIcon={<Play size={18} />}
              isLoading={createScanMutation.isPending}
              onClick={handleLaunchScan}
            >
              Run Security Scan
            </GradientButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
