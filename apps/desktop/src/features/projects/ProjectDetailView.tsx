import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjectQuery, useScansQuery, useFindingsQuery } from '../../api/queries';
import {
  Button,
  StatusChip,
  LoadingState,
  ErrorState,
  Card,
  HeroCard,
  MoneyTicker,
} from '@sirius/ui';

import { ComplianceCard } from '../dashboard/ComplianceCard';
import { SeverityOverviewCard } from '../dashboard/SeverityOverviewCard';
import { MoneyAtRiskCard } from '../dashboard/MoneyAtRiskCard';
import { RecentScansPanel } from '../dashboard/RecentScansPanel';
import { RecentFindingsPanel } from '../dashboard/RecentFindingsPanel';
import { FolderGit2, GitBranch, Play, ShieldAlert, Settings, ArrowLeft, ExternalLink, FileText, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export const ProjectDetailView: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading: isProjectLoading, isError: isProjectError, refetch } = useProjectQuery(projectId || null);
  const { data: scans = [], isLoading: isScansLoading } = useScansQuery(projectId);
  const { data: findings = [], isLoading: isFindingsLoading } = useFindingsQuery(projectId);

  const [activeTab, setActiveTab] = useState<'overview' | 'scans' | 'findings'>('overview');

  if (isProjectLoading || isScansLoading || isFindingsLoading) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto' }}>
        <LoadingState label="Connecting to Protected Workspace Inspector..." />
      </div>
    );
  }

  if (isProjectError || !project) {
    return (
      <div style={{ padding: '48px 40px', maxWidth: '800px', margin: '0 auto' }}>
        <ErrorState
          title="WORKSPACE NOT FOUND"
          description={`Could not locate protected workspace ${projectId} in FinSec Core API.`}
          onRetry={refetch}
        />
      </div>
    );
  }

  const isAtRisk = (project.openFindingsCount?.critical ?? 0) > 0 || (project.complianceScore ?? 100) < 90;
  const criticalFindingsCount = project.openFindingsCount?.critical ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}
    >
      {/* Back Navigation Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button
          onClick={() => navigate('/projects')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            padding: 0,
            width: 'fit-content',
          }}
        >
          <ArrowLeft size={14} /> Back to Codebases
        </button>

        {/* Workspace Title & Actions Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <FolderGit2 size={24} color="var(--color-primary)" />
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                {project.name}
              </h1>
              <StatusChip status={isAtRisk ? 'AT RISK' : 'HEALTHY'} size="md" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}>
              <span>{project.repositoryUrl}</span>
              <ExternalLink size={12} />
              <span>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontWeight: 600 }}>
                <GitBranch size={13} /> {project.branch}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button variant="ghost" leftIcon={<Settings size={15} />} onClick={() => navigate('/settings')}>
              Settings
            </Button>
            <Button variant="secondary" leftIcon={<FileText size={15} />} onClick={() => navigate('/reports')}>
              Generate Report
            </Button>
            <Button variant="secondary" leftIcon={<ShieldAlert size={15} color="var(--color-primary)" />} onClick={() => navigate('/findings')}>
              View Findings
            </Button>
            <Button variant="primary" leftIcon={<Play size={15} />} onClick={() => navigate('/scans/new')}>
              Run Security Scan
            </Button>
          </div>
        </div>
      </div>

      {/* Project Posture Hero Anchor */}
      <HeroCard padding="xl" style={{ borderLeft: isAtRisk ? '4px solid var(--color-red)' : '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary-deep)', marginBottom: '4px' }}>
              SECURITY POSTURE ANCHOR
            </div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {isAtRisk ? 'Workspace Requires Security Remediation' : 'Workspace Posture Meets Compliance Baseline'}
            </h2>
            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text-secondary)', maxWidth: '600px', lineHeight: 1.5 }}>
              {isAtRisk
                ? `${criticalFindingsCount} critical finding requires immediate triage to satisfy SOC 2 & PCI DSS build policy gates.`
                : 'Zero critical findings detected across active codebase scans.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                SECURITY SCORE
              </div>
              <div className="sirius-numeral-tabular" style={{ fontSize: '36px', fontWeight: 800, color: isAtRisk ? 'var(--color-red)' : 'var(--color-primary)', lineHeight: 1 }}>
                {project.complianceScore ?? 100}<span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-muted)' }}>/100</span>
              </div>
            </div>

            <div style={{ height: '40px', width: '1px', backgroundColor: 'var(--color-border)' }} />

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                EXPOSURE
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1 }}>
                <MoneyTicker amountUSD={project.moneyAtRiskUSD ?? 0} durationMs={0} variant="compact" />
              </div>
            </div>

            <div style={{ height: '40px', width: '1px', backgroundColor: 'var(--color-border)' }} />

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                LAST SCAN
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} color="var(--color-primary)" />
                {new Date(project.lastScanTimestamp || project.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>
      </HeroCard>

      {/* Navigation Tabs Bar */}
      <div style={{ borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'scans', label: `Scans History (${scans.length})` },
          { id: 'findings', label: `Findings Inventory (${findings.length})` },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'scans' | 'findings')}
              style={{
                background: 'none',
                border: 'none',
                padding: '12px 4px',
                fontSize: '14px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                borderBottom: isActive ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
                marginBottom: '-1px',
                transition: 'all 140ms ease-out',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            <ComplianceCard score={project.complianceScore ?? 0} />
            <SeverityOverviewCard counts={project.openFindingsCount} />
            <MoneyAtRiskCard amountUSD={project.moneyAtRiskUSD ?? 0} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '24px' }}>
            <RecentScansPanel scans={scans} />
            <RecentFindingsPanel findings={findings} />
          </div>
        </div>
      )}

      {activeTab === 'scans' && (
        <Card padding="xl">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Workspace Scan History</h3>
          <RecentScansPanel scans={scans} />
        </Card>
      )}

      {activeTab === 'findings' && (
        <Card padding="xl">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Workspace Findings Inventory</h3>
          <RecentFindingsPanel findings={findings} />
        </Card>
      )}
    </motion.div>
  );
};
