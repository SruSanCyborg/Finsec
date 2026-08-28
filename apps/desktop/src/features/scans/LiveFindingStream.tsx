import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Finding } from '@sirius/types';
import { GlassCard, SeverityChip, Badge } from '@sirius/ui';
import { liveFindingVariants } from '@sirius/design-system';
import { ShieldAlert, FileCode, CheckCircle2 } from 'lucide-react';

export interface LiveFindingStreamProps {
  findings: Finding[];
}

export const LiveFindingStream: React.FC<LiveFindingStreamProps> = ({ findings }) => {
  const navigate = useNavigate();

  return (
    <GlassCard padding="none" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stream Header */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={16} color="var(--color-red)" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Live Findings Stream</span>
        </div>
        <Badge variant="red" size="sm" style={{ fontFamily: 'var(--font-code)', fontSize: '10px' }}>
          {findings.length} DISCOVERED
        </Badge>
      </div>

      {/* Findings List */}
      <div
        style={{
          flex: 1,
          padding: '12px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '360px',
        }}
      >
        {findings.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
            No security findings detected so far...
          </div>
        ) : (
          findings.map((fnd) => (
            <motion.div
              key={fnd.id}
              variants={liveFindingVariants}
              initial="initial"
              animate="animate"
              onClick={() => navigate(`/findings?id=${fnd.id}`)}
              style={{
                border: `1px solid ${fnd.severity === 'critical' ? 'rgba(167, 139, 250, 0.35)' : 'var(--border-hairline)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SeverityChip severity={fnd.severity} variant="compact" />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{fnd.title}</span>
                </div>
                <Badge variant="cyan" size="sm">NEW</Badge>
              </div>

              <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Badge variant="neutral" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                  {fnd.ruleId}
                </Badge>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--font-code)' }}>
                  <FileCode size={10} color="var(--color-cyan)" /> {fnd.filePath}:{fnd.startLine}
                </span>
                {fnd.secretValidity?.status === 'valid' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--color-emerald)', fontWeight: 600 }}>
                    <CheckCircle2 size={10} /> VERIFIED LIVE
                  </span>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </GlassCard>
  );
};
