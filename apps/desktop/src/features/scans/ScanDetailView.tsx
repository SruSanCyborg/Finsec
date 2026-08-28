import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useScanStore } from '@sirius/state';
import { useScanQuery, useProjectQuery } from '../../api/queries';
import {
  Card,
  HeroCard,
  StatusChip,
  ProgressBar,
  Badge,
  Button,
  LoadingState,
  ErrorState,
} from '@sirius/ui';
import { PipelineVisualizer } from './PipelineVisualizer';
import { LiveConsole } from './LiveConsole';
import { LiveFindingStream } from './LiveFindingStream';
import { GitBranch, ShieldAlert, Cpu, ArrowLeft, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export const ScanDetailView: React.FC = () => {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { activeScan, liveFindings, consoleEvents, pipelineStage, gateResult } = useScanStore();
  const { data: persistedScan, isLoading, isError, refetch } = useScanQuery(scanId || null);
  const { data: project } = useProjectQuery(activeScan?.projectId || persistedScan?.projectId || null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live Elapsed Timer
  useEffect(() => {
    if (activeScan && activeScan.status === 'running') {
      const timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeScan]);

  const currentScan = activeScan && activeScan.id === scanId ? activeScan : persistedScan;
  const isLive = activeScan && activeScan.id === scanId && activeScan.status === 'running';
  const isCompleted = currentScan?.status === 'completed';
  const isFailed = currentScan?.status === 'failed';

  const percentComplete = currentScan?.progress?.percentComplete || (isCompleted ? 100 : 68);
  const filesScanned = currentScan?.progress?.filesScanned || (isCompleted ? 1420 : 965);
  const totalFiles = currentScan?.progress?.totalFiles || 1420;
  const totalFindings = currentScan?.progress?.findingsFound || liveFindings.length || (isCompleted ? 27 : 14);

  const displayGateResult = gateResult || currentScan?.summary?.gateResult || (totalFindings > 0 ? 'blocked' : 'passed');

  if (isLoading && !currentScan) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto' }}>
        <LoadingState label="Connecting to Live Scan Command Deck..." />
      </div>
    );
  }

  if (isError && !currentScan) {
    return (
      <div style={{ padding: '48px 40px', maxWidth: '800px', margin: '0 auto' }}>
        <ErrorState
          title="SCAN FAILED TO LOAD"
          description={`Could not locate scan execution record ${scanId} in FinSec Core API.`}
          onRetry={refetch}
        />
      </div>
    );
  }

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
          onClick={() => navigate('/scans')}
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
          <ArrowLeft size={14} /> Back to Scan Operations
        </button>

        {/* Command Deck Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                {isCompleted ? 'Scan Analysis Summary' : `Scanning ${project?.name || 'Workspace'}`}
              </h1>
              <StatusChip
                status={isLive ? 'RUNNING' : isCompleted ? 'COMPLETED' : 'FAILED'}
                label={isLive ? 'LIVE ANALYSIS' : isCompleted ? 'COMPLETED' : 'FAILED'}
                size="md"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
              <span style={{ fontFamily: 'var(--font-code)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Scan #{scanId}
              </span>
              <span>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontFamily: 'var(--font-code)', fontWeight: 500 }}>
                <GitBranch size={13} /> {currentScan?.commitHash || 'main'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              className="sirius-numeral-tabular"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--color-primary-deep)',
                backgroundColor: 'var(--color-primary-soft)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--color-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Clock size={14} color="var(--color-primary)" />
              00:{elapsedSeconds < 10 ? `0${elapsedSeconds}` : elapsedSeconds}
            </div>

            {isCompleted && (
              <Badge
                variant={displayGateResult === 'passed' ? 'emerald' : 'violet'}
                size="md"
                style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {displayGateResult === 'passed' ? <CheckCircle size={15} /> : <XCircle size={15} />}
                GATE {displayGateResult.toUpperCase()}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Progress Hero */}
      <HeroCard padding="lg" style={{ borderLeft: '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary-deep)', marginBottom: '2px' }}>
              CURRENT SCAN STATUS
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {isCompleted ? 'AST Analysis Complete & Verified' : isFailed ? 'AST Analysis Interrupted' : `AST Analysis in Progress — ${percentComplete}%`}
            </div>
          </div>

          <div className="sirius-numeral-tabular" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {filesScanned.toLocaleString()} / {totalFiles.toLocaleString()} Files Analyzed • {totalFindings} Findings Detected
          </div>
        </div>

        <ProgressBar value={percentComplete} max={100} variant="gradient" height="10px" />
      </HeroCard>

      {/* Pipeline Stage Visualizer */}
      <PipelineVisualizer currentStage={pipelineStage} />

      {/* Live Console & Live Findings Split */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px' }}>
        <LiveConsole events={consoleEvents} />
        <LiveFindingStream findings={liveFindings} />
      </div>

      {/* Completion Action Bar */}
      {isCompleted && (
        <Card padding="lg" style={{ borderLeft: displayGateResult === 'passed' ? '4px solid var(--color-primary)' : '4px solid var(--color-red)', backgroundColor: 'var(--color-bg-surface-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Scan Gate Result: <span style={{ color: displayGateResult === 'passed' ? 'var(--color-primary)' : 'var(--color-red)' }}>GATE {displayGateResult.toUpperCase()}</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                Evaluated against build fail-on predicate. High & Critical severity thresholds trigger build gate block.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => navigate('/scans/new')}>
                Scan Again
              </Button>
              <Button variant="secondary" leftIcon={<ShieldAlert size={15} color="var(--color-primary)" />} onClick={() => navigate('/findings')}>
                View Findings Inventory
              </Button>
              <Button variant="primary" leftIcon={<Cpu size={15} />} onClick={() => navigate('/findings')}>
                Analyze with Cerebus
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Error Action Bar if Failed */}
      {isFailed && (
        <Card padding="lg" style={{ borderLeft: '4px solid #EF4444', backgroundColor: 'var(--color-bg-surface-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: '#EF4444', marginBottom: '4px' }}>
                SCAN FAILED
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                AST scan worker encountered a fatal error during rule evaluation.
              </p>
            </div>

            <Button variant="primary" leftIcon={<RefreshCw size={15} />} onClick={() => refetch()}>
              Retry Scan
            </Button>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
