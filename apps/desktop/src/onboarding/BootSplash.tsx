import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PixelGridBackground } from '@sirius/ui';
import { ShieldCheck } from 'lucide-react';

export interface BootSplashProps {
  onComplete: () => void;
  durationMs?: number;
}

export const BootSplash: React.FC<BootSplashProps> = ({ onComplete, durationMs = 1400 }) => {
  const [statusText, setStatusText] = useState('Initializing secure workspace...');
  const [sweepActive, setSweepActive] = useState(false);

  useEffect(() => {
    const statusTimer = setTimeout(() => {
      setStatusText('Connecting to FinSec Core API...');
      setSweepActive(true);
    }, 500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, durationMs);

    return () => {
      clearTimeout(statusTimer);
      clearTimeout(completeTimer);
    };
  }, [durationMs, onComplete]);

  return (
    <PixelGridBackground enabled opacity={0.04}>
      <div
        onClick={onComplete}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--color-bg-surface)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* SIRIUS Brand Area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              padding: '20px',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--color-primary-soft)',
              boxShadow: 'var(--shadow-medium)',
              border: '1px solid var(--color-border)',
            }}
          >
            <ShieldCheck size={48} color="var(--color-primary)" />
          </div>

          <h1
            className="sirius-display-xl"
            style={{
              margin: 0,
              fontSize: '42px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, var(--color-text-primary) 0%, var(--color-primary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SIRIUS
          </h1>

          <span
            className="sirius-label"
            style={{ fontSize: '12px', letterSpacing: '0.15em', color: 'var(--color-primary)', fontWeight: 700 }}
          >
            SECURITY COMMAND CENTER
          </span>

          {/* Sweep Line */}
          <div
            style={{
              width: '240px',
              height: '3px',
              backgroundColor: 'var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              overflow: 'hidden',
              marginTop: '12px',
            }}
          >
            {sweepActive && (
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.8, ease: 'easeInOut', repeat: Infinity }}
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'var(--color-primary)',
                }}
              />
            )}
          </div>
        </motion.div>

        {/* System Status Text */}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="sirius-mono-sm"
          style={{
            position: 'absolute',
            bottom: '40px',
            color: 'var(--color-text-secondary)',
            fontSize: '12px',
          }}
        >
          {statusText}
        </motion.span>
      </div>
    </PixelGridBackground>
  );
};
