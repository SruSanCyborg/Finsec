import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, GlassCard, Tabs, PixelGridBackground, StatusPulse } from '@sirius/ui';
import { useSessionStore } from '@sirius/state';
import { ShieldCheck, Key, Lock, ArrowRight, Server } from 'lucide-react';

export interface AuthScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onNext, onBack }) => {
  const { setSession } = useSessionStore();
  const [activeTab, setActiveTab] = useState('apikey');
  const [apiKey, setApiKey] = useState('finsec_sk_live_89012a8f3b29c9d7e41a9');
  const [email, setEmail] = useState('sarah.jenkins@finsec.io');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthenticate = () => {
    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      setIsLoading(false);
      // Set session user profile
      setSession(apiKey || 'mock-jwt-token-xyz', {
        id: 'usr-8812',
        name: 'Sarah Jenkins',
        email: email || 'sarah.jenkins@finsec.io',
        role: 'security_engineer',
      });
      onNext();
    }, 600);
  };

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
          transition={{ duration: 0.3 }}
          style={{ maxWidth: '460px', width: '100%' }}
        >
          <GlassCard padding="lg" style={{ boxShadow: 'var(--shadow-modal)' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}
              >
                <Lock size={24} color="var(--color-cyan)" />
              </div>
              <h2 className="sirius-heading-1" style={{ margin: '0 0 6px 0' }}>Authenticate with Core API</h2>
              <div className="sirius-caption">Connect your workstation to FinSec Core Security Gateway</div>
            </div>

            {/* Status Pulse */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <StatusPulse status="Online" label="Core API Mock Gateway • Ready" />
            </div>

            {/* Auth Method Tabs */}
            <Tabs
              activeId={activeTab}
              onChange={setActiveTab}
              variant="pills"
              style={{ justifyContent: 'center', marginBottom: '24px' }}
              items={[
                { id: 'apikey', label: 'API Key' },
                { id: 'oauth', label: 'OAuth / Device' },
                { id: 'sso', label: 'Enterprise SSO' },
              ]}
            />

            {/* Form */}
            {activeTab === 'apikey' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input
                  label="Workstation Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  leftIcon={<ShieldCheck size={16} />}
                />
                <Input
                  label="FinSec Core API Key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="finsec_sk_live_..."
                  leftIcon={<Key size={16} />}
                />
              </div>
            )}

            {activeTab === 'oauth' && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Server size={32} color="var(--color-cyan)" style={{ marginBottom: '8px' }} />
                <div>Click authenticate to trigger workstation browser device code verification.</div>
              </div>
            )}

            {activeTab === 'sso' && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <div>Redirecting to Enterprise Identity Provider (Okta / Azure AD)...</div>
              </div>
            )}

            {error && (
              <div style={{ color: 'var(--color-red)', fontSize: '12px', marginTop: '12px', textAlign: 'center' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '28px' }}>
              <Button
                variant="gradient"
                fullWidth
                size="lg"
                isLoading={isLoading}
                rightIcon={<ArrowRight size={18} />}
                onClick={handleAuthenticate}
              >
                Authenticate Session
              </Button>
              <Button variant="ghost" fullWidth onClick={onBack}>
                Back
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </PixelGridBackground>
  );
};
