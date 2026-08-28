import React from 'react';
import { motion } from 'framer-motion';
import { GradientButton, GhostButton, GlassCard, PixelGridBackground } from '@sirius/ui';
import { Code2, ShieldAlert, ShieldCheck, DollarSign, Cpu, Play } from 'lucide-react';

export interface FirstScanPrimerScreenProps {
  onRunFirstScan: () => void;
  onSkip: () => void;
}

export const FirstScanPrimerScreen: React.FC<FirstScanPrimerScreenProps> = ({ onRunFirstScan, onSkip }) => {
  return (
    <PixelGridBackground enabled opacity={0.03}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 24px',
          boxSizing: 'border-box',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          style={{ maxWidth: '780px', width: '100%', textAlign: 'center' }}
        >
          {/* Headline */}
          <h1 className="sirius-display" style={{ margin: '0 0 12px 0', fontSize: '32px' }}>
            What SIRIUS will produce for your workspace
          </h1>
          <p className="sirius-body" style={{ color: 'var(--text-secondary)', maxWidth: '540px', margin: '0 auto 36px auto' }}>
            Before triggering your initial AST scan, review the continuous security outputs SIRIUS generates from FinSec Core API evaluation.
          </p>

          {/* Educational Flow Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '40px' }}>
            <GlassCard padding="md" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Code2 size={24} color="var(--color-cyan)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>1. Code Base</div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>AST parsing</div>
            </GlassCard>

            <GlassCard padding="md" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <ShieldAlert size={24} color="var(--color-indigo)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>2. Findings</div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>Secrets & AST rules</div>
            </GlassCard>

            <GlassCard padding="md" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <ShieldCheck size={24} color="var(--color-emerald)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>3. Compliance</div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>PCI-DSS 4.0 map</div>
            </GlassCard>

            <GlassCard padding="md" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <DollarSign size={24} color="var(--color-primary)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>4. Money at Risk</div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>Financial exposure</div>
            </GlassCard>

            <GlassCard padding="md" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Cpu size={24} color="var(--color-primary)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>5. Cerebus Fix</div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>Verified PR patches</div>
            </GlassCard>
          </div>

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <GradientButton size="lg" leftIcon={<Play size={18} />} onClick={onRunFirstScan}>
              Run First Scan
            </GradientButton>
            <GhostButton size="lg" onClick={onSkip}>
              Skip to Dashboard Shell
            </GhostButton>
          </div>
        </motion.div>
      </div>
    </PixelGridBackground>
  );
};
