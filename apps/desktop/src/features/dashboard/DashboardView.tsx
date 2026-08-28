import React from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@sirius/state';
import { useDashboardDataQuery } from '../../api/queries';
import { Skeleton, ErrorState, Button } from '@sirius/ui';
import { DashboardHeader } from './DashboardHeader';
import { TopKpiRow } from './TopKpiRow';
import { SecurityPostureChart } from './SecurityPostureChart';
import { CerebusActionWidget } from './CerebusActionWidget';
import { ActiveTargetsWidget } from './ActiveTargetsWidget';
import { RecentFindingsPanel } from './RecentFindingsPanel';
import { SecurityGaugeCard } from './SecurityGaugeCard';
import { RecommendationsPanel } from './RecommendationsPanel';
import { ShieldCheck, Play } from 'lucide-react';

const containerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
};

export const DashboardView: React.FC = () => {
  const { activeProjectId } = useAppStore();
  const { isLoading, isError, activeProject, scans, findings, moneyAtRisk, refetch } =
    useDashboardDataQuery(activeProjectId);

  // Skeleton Loading Layout
  if (isLoading) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton height="56px" borderRadius="var(--radius-lg)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <Skeleton height="130px" borderRadius="var(--radius-xl)" />
          <Skeleton height="130px" borderRadius="var(--radius-xl)" />
          <Skeleton height="130px" borderRadius="var(--radius-xl)" />
          <Skeleton height="130px" borderRadius="var(--radius-xl)" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <Skeleton height="220px" borderRadius="var(--radius-xl)" />
          <Skeleton height="220px" borderRadius="var(--radius-xl)" />
        </div>
      </div>
    );
  }

  // Error State Panel
  if (isError) {
    return (
      <div style={{ padding: '48px 36px', maxWidth: '840px', margin: '0 auto' }}>
        <ErrorState
          title="SECURITY DATA UNAVAILABLE"
          description="Unable to load the latest posture data from FinSec Core Gateway. Please check network connection."
          onRetry={refetch}
        />
      </div>
    );
  }

  // First-Use Empty State Handling
  const hasNoData = !activeProject && scans.length === 0;

  if (hasNoData) {
    return (
      <div style={{ padding: '64px 36px', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-pill)',
            backgroundColor: 'var(--color-primary-soft)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
          }}
        >
          <ShieldCheck size={28} color="var(--color-primary)" />
        </div>
        <h2 className="sirius-heading-1" style={{ marginBottom: '8px' }}>
          NO SECURITY DATA YET
        </h2>
        <p className="sirius-body" style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
          Connect a project repository and run your first security AST scan to generate security posture evaluations.
        </p>
        <Button variant="primary" size="lg" leftIcon={<Play size={16} />} onClick={() => refetch()}>
          Run First Security Scan
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      style={{
        padding: '24px 32px',
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
      className="sirius-dashboard-view"
    >
      {/* 1. Header Row */}
      <motion.div variants={itemVariants}>
        <DashboardHeader activeProject={activeProject} />
      </motion.div>

      {/* 2. Top Compact 4-Column KPI Grid */}
      <motion.div variants={itemVariants}>
        <TopKpiRow
          score={activeProject?.complianceScore ?? 0}
          moneyAtRiskUSD={activeProject?.moneyAtRiskUSD ?? moneyAtRisk?.totalUSD ?? 0}
          openFindingsCount={activeProject?.openFindingsCount}
          compliancePassRate={activeProject?.complianceScore ?? 0}
        />
      </motion.div>

      {/* 3. Primary Row: Analytics (50%) + Cerebus AI (50%) [Left 2/3] | Compliance Posture [Right 1/3] */}
      <motion.div
        variants={itemVariants}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {/* Left Sub-Grid (2/3 width split side-by-side) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: '100%' }}>
          <SecurityPostureChart />
          <CerebusActionWidget
            criticalCount={activeProject?.openFindingsCount?.critical ?? 0}
            highCount={activeProject?.openFindingsCount?.high ?? 0}
          />
        </div>

        {/* Right Column (1/3 width): Compliance Posture Gauge (Always Visible) */}
        <div style={{ height: '100%' }}>
          <SecurityGaugeCard score={activeProject?.complianceScore ?? 0} />
        </div>
      </motion.div>

      {/* 4. Secondary Row: Findings Stream (Left 2/3) | Target Workspaces (Right 1/3) */}
      <motion.div
        variants={itemVariants}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        <div>
          <RecentFindingsPanel findings={findings} />
        </div>
        <div>
          <ActiveTargetsWidget />
        </div>
      </motion.div>

      {/* 5. Next Actions */}
      <motion.div variants={itemVariants}>
        <RecommendationsPanel />
      </motion.div>
    </motion.div>
  );
};
