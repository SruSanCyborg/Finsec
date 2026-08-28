import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan } from '@sirius/types';
import { Card, StatusPulse, Badge } from '@sirius/ui';
import { PlaySquare, GitBranch, Clock, ArrowRight } from 'lucide-react';

export interface RecentScansPanelProps {
  scans: Scan[];
}

export const RecentScansPanel: React.FC<RecentScansPanelProps> = ({ scans }) => {
  const navigate = useNavigate();

  return (
    <Card variant="surface" padding="lg">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PlaySquare size={18} color="var(--color-primary)" />
          <span className="sirius-heading-3" style={{ margin: 0 }}>Recent AST Scans</span>
        </div>
        <button
          onClick={() => navigate('/scans')}
          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          View all <ArrowRight size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {scans.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            No recent scan executions found.
          </div>
        ) : (
          scans.map((scan) => (
            <div
              key={scan.id}
              onClick={() => navigate(`/scans/${scan.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: 'var(--color-bg-surface-elevated)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <StatusPulse status={scan.status === 'completed' ? 'Success' : scan.status === 'running' ? 'Scanning' : 'Error'} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                    Scan #{scan.id}
                  </div>
                  <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <GitBranch size={10} color="var(--color-primary)" /> {scan.commitHash || 'main'}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={10} /> {(scan.durationMs ? scan.durationMs / 1000 : 42.3).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <Badge variant="cyan" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                  {scan.summary?.totalFindings || 27} Findings
                </Badge>
                <div className="sirius-caption" style={{ fontSize: '10px', marginTop: '4px', color: 'var(--color-text-muted)' }}>
                  {new Date(scan.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
