import React from 'react';
import { motion } from 'framer-motion';
import { GradientButton, GhostButton, GlassCard, PixelGridBackground } from '@sirius/ui';
import { ShieldCheck, ShieldAlert, Cpu, DollarSign, ArrowRight } from 'lucide-react';

export interface WelcomeScreenProps {
  onNext: () => void;
  onExploreDemo: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNext, onExploreDemo }) => {
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
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}
        >
          {/* Badge Accent */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '9999px', color: 'var(--color-cyan)', fontSize: '12px', fontWeight: 600, marginBottom: '24px' }}>
            <ShieldCheck size={14} /> SIRIUS v0.1.0 • finsec-lint Desktop Command Center
          </div>

          {/* Main Headline */}
          <h1
            className="sirius-display-xl"
            style={{
              margin: '0 0 16px 0',
              fontSize: '44px',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
            }}
          >
            Security intelligence for <span className="sirius-gradient-text">fintech engineering</span>.
          </h1>

          <p
            className="sirius-body-lg"
            style={{
              color: 'var(--text-secondary)',
              maxWidth: '580px',
              margin: '0 auto 40px auto',
              fontSize: '16px',
              lineHeight: 1.6,
            }}
          >
            Detect high-risk vulnerabilities in cryptographic pipelines, track PCI-DSS compliance exposure, quantify financial money-at-risk, and fix safely with Cerebus.
          </p>

          {/* Value Prop Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginBottom: '40px',
              textAlign: 'left',
            }}
          >
            <GlassCard padding="md">
              <ShieldAlert size={20} color="var(--color-cyan)" style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Vulnerabilities</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>AST-driven secret leaks & auth bypass rules.</div>
            </GlassCard>

            <GlassCard padding="md">
              <ShieldCheck size={20} color="var(--color-emerald)" style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Compliance</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Continuous mapping to PCI-DSS 4.0 & SOC2.</div>
            </GlassCard>

            <GlassCard padding="md">
              <DollarSign size={20} color="var(--color-primary)" style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Money at Risk</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Quantified financial exposure valuations.</div>
            </GlassCard>

            <GlassCard padding="md">
              <Cpu size={20} color="var(--color-primary)" style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Cerebus Fix</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Verified automated PR remediation pipeline.</div>
            </GlassCard>
          </div>

          {/* CTA Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <GradientButton size="lg" rightIcon={<ArrowRight size={18} />} onClick={onNext}>
              Get Started
            </GradientButton>
            <GhostButton size="lg" onClick={onExploreDemo}>
              Explore Demo Environment
            </GhostButton>
          </div>
        </motion.div>
      </div>
    </PixelGridBackground>
  );
};
