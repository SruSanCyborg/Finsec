import React, { useState } from 'react';
import {
  Button,
  GradientButton,
  GhostButton,
  IconButton,
  Input,
  TextArea,
  Select,
  Checkbox,
  Switch,
  Badge,
  Pill,
  Tooltip,
  GlassCard,
  GlassPanel,
  Divider,
  Tabs,
  Dropdown,
  GlassModal,
  Drawer,
  ProgressBar,
  Skeleton,
  toast,
  ToastContainer,
  Avatar,
  EmptyState,
  PixelGridBackground,
  SeverityChip,
  ScoreRing,
  MoneyTicker,
  StatusPulse,
} from '@sirius/ui';

import { ShieldCheck, Zap, Sparkles, Terminal, Play, Filter } from 'lucide-react';

export const DesignSystemShowcase: React.FC = () => {
  const [pixelGridEnabled, setPixelGridEnabled] = useState(true);
  const [gradientSweepActive, setGradientSweepActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);

  const triggerSweep = () => {
    setGradientSweepActive(true);
    setTimeout(() => setGradientSweepActive(false), 800);
  };

  return (
    <PixelGridBackground enabled={pixelGridEnabled}>
      <ToastContainer />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', color: 'var(--text-primary)' }}>
        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
          <div>
            <h1 className="sirius-display" style={{ margin: 0 }}>SIRIUS Design System Laboratory</h1>
            <p className="sirius-caption" style={{ marginTop: '4px' }}>
              Visual Identity, Tokens, Severity System & UI Primitives • Route: <code className="sirius-numeral-tabular">/design-system</code>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Switch label="Pixel Grid" checked={pixelGridEnabled} onChange={setPixelGridEnabled} />
            <GradientButton leftIcon={<Sparkles size={16} />} onClick={triggerSweep}>
              Trigger Spectrum Sweep
            </GradientButton>
          </div>
        </div>

        {/* Diagonal Spectrum Sweep Visual Bar */}
        {gradientSweepActive && (
          <div className="sirius-gradient-sweep-anim" style={{ height: '4px', borderRadius: '2px', marginBottom: '24px' }} />
        )}

        {/* Section 1: 5-Stop Primary Spectrum & Semantics */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>1. Five-Stop Spectrum & Semantic Mapping</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="sirius-glass-card" style={{ padding: '16px', borderLeft: '4px solid #4ADE80' }}>
              <div style={{ color: '#4ADE80', fontWeight: 700 }}>Emerald (#4ADE80)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Safe / Passed / Verified / Compliant</div>
            </div>
            <div className="sirius-glass-card" style={{ padding: '16px', borderLeft: '4px solid #2DD4BF' }}>
              <div style={{ color: '#2DD4BF', fontWeight: 700 }}>Teal (#2DD4BF)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Info / In-progress / Low Severity</div>
            </div>
            <div className="sirius-glass-card" style={{ padding: '16px', borderLeft: '4px solid #38BDF8' }}>
              <div style={{ color: '#38BDF8', fontWeight: 700 }}>Cyan (#38BDF8)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Primary Brand / Medium / Active</div>
            </div>
            <div className="sirius-glass-card" style={{ padding: '16px', borderLeft: '4px solid #818CF8' }}>
              <div style={{ color: '#818CF8', fontWeight: 700 }}>Indigo (#818CF8)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>High Severity / Secondary Accent</div>
            </div>
            <div className="sirius-glass-card" style={{ padding: '16px', borderLeft: '4px solid #A78BFA', boxShadow: 'var(--glow-violet)' }}>
              <div style={{ color: '#A78BFA', fontWeight: 700 }}>Violet (#A78BFA)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Critical / Cerebus AI / Money-at-Risk</div>
            </div>
          </div>
        </section>

        <Divider />

        {/* Section 2: SIRIUS-Specific Components */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>2. SIRIUS Security Components</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            {/* Severity Chips */}
            <GlassCard padding="lg">
              <h3 className="sirius-heading-3" style={{ marginTop: 0 }}>Severity Chips</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <SeverityChip severity="critical" />
                  <SeverityChip severity="high" />
                  <SeverityChip severity="medium" />
                  <SeverityChip severity="low" />
                  <SeverityChip severity="info" />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <SeverityChip severity="critical" variant="compact" />
                  <SeverityChip severity="critical" variant="small" />
                  <SeverityChip severity="critical" variant="medium" />
                  <SeverityChip severity="critical" variant="large" />
                </div>
              </div>
            </GlassCard>

            {/* Score Ring */}
            <GlassCard padding="lg" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 className="sirius-heading-3" style={{ marginTop: 0, alignSelf: 'flex-start' }}>ScoreRing</h3>
              <ScoreRing score={94} max={100} delta={4} size={110} />
            </GlassCard>

            {/* Money Ticker */}
            <GlassCard padding="lg">
              <h3 className="sirius-heading-3" style={{ marginTop: 0 }}>MoneyTicker</h3>
              <MoneyTicker amountUSD={1450000} variant="large" delta={120000} />
              <div style={{ marginTop: '16px' }}>
                <MoneyTicker amountUSD={3800000} variant="compact" />
              </div>
            </GlassCard>

            {/* Status Pulse */}
            <GlassCard padding="lg">
              <h3 className="sirius-heading-3" style={{ marginTop: 0 }}>StatusPulse</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <StatusPulse status="Online" label="FinSec Core API Online" />
                <StatusPulse status="Scanning" label="Live AST Scan Active" />
                <StatusPulse status="Degraded" label="High Latency Warning" />
                <StatusPulse status="Error" label="Cerebus Fix Failed" />
                <StatusPulse status="Offline" label="Mock Mode Offline" />
              </div>
            </GlassCard>
          </div>
        </section>

        <Divider />

        {/* Section 3: Typography & Monospace Numerals */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>3. Typography System & Tabular Numerals</h2>
          <GlassPanel padding="lg">
            <div className="sirius-display-xl" style={{ marginBottom: '8px' }}>Display XL Heading</div>
            <div className="sirius-heading-1" style={{ marginBottom: '8px' }}>Heading 1 Security Command</div>
            <div className="sirius-body" style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Body regular text for descriptions, remediation guidance, and finding summaries.
            </div>
            <div className="sirius-caption" style={{ marginBottom: '12px' }}>Caption / Metadata Label</div>
            <div style={{ display: 'flex', gap: '24px', fontSize: '18px', fontWeight: 700 }}>
              <div>Tabular Monospace Counter: <span className="sirius-numeral-tabular" style={{ color: 'var(--color-primary)' }}>1,420 / 1,420</span></div>
              <div>Money: <span className="sirius-numeral-tabular" style={{ color: 'var(--color-primary)' }}>$5,250,000</span></div>
            </div>
          </GlassPanel>
        </section>

        <Divider />

        {/* Section 4: Buttons & Actions */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>4. Buttons & Interactive Controls</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <GradientButton leftIcon={<Play size={16} />}>Start Core Scan</GradientButton>
            <Button variant="primary">Primary Action</Button>
            <Button variant="secondary">Secondary Action</Button>
            <GhostButton leftIcon={<Filter size={16} />}>Filter Findings</GhostButton>
            <Button variant="danger">Cancel Operation</Button>
            <Button isLoading>Scanning</Button>
            <Button disabled>Disabled Action</Button>
            <IconButton icon={<Zap size={18} />} ariaLabel="Quick Trigger" />
          </div>
        </section>

        <Divider />

        {/* Section 5: Inputs, Selects & Toggles */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>5. Form Primitives & Controls</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <Input label="Project Repository" placeholder="https://github.com/finsec/core.git" leftIcon={<Terminal size={16} />} />
            <Select
              label="Compliance Target"
              options={[
                { value: 'pci', label: 'PCI-DSS 4.0 Standard' },
                { value: 'soc2', label: 'SOC2 Type II Compliance' },
                { value: 'iso', label: 'ISO 27001 Security Audit' },
              ]}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
              <Checkbox label="Enable Live Scan WebSocket Stream" checked={checkboxChecked} onChange={(e) => setCheckboxChecked(e.target.checked)} />
              <Switch label="Auto-trigger Cerebus Patch Sandbox" checked={switchChecked} onChange={setSwitchChecked} />
            </div>
          </div>
          <div style={{ marginTop: '16px' }}>
            <TextArea label="Remediation Notes & Guidance" placeholder="Document triage decisions or false positive rationale..." />
          </div>
        </section>

        <Divider />

        {/* Section 6: Badges, Pills & Tooltips */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>6. Badges, Pills & Tooltips</h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge variant="emerald" icon={<ShieldCheck size={12} />}>Verified Pass</Badge>
            <Badge variant="cyan">AST Engine v2.4</Badge>
            <Badge variant="indigo">High Priority</Badge>
            <Badge variant="violet">Cerebus Sandbox</Badge>
            <Pill variant="teal">In Progress</Pill>
            <Tooltip content="Centralized API Client Base URL configuration" position="top">
              <Badge variant="neutral">Hover Tooltip</Badge>
            </Tooltip>
            <Avatar name="Sarah Jenkins" size="md" />
          </div>
        </section>

        <Divider />

        {/* Section 7: Tabs, Dropdowns & Modals */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>7. Tabs, Overlays, Modals & Toast Alerts</h2>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
            <Button variant="gradient" onClick={() => setIsModalOpen(true)}>Preview GlassModal</Button>
            <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>Preview GlassDrawer</Button>
            <Dropdown
              trigger={<Button variant="ghost">Dropdown Menu ▾</Button>}
              items={[
                { id: '1', label: 'Export SARIF Report' },
                { id: '2', label: 'Trigger Cerebus Fix Pipeline' },
                { id: '3', label: 'Revoke Access Token', danger: true },
              ]}
            />
            <Button variant="ghost" onClick={() => toast.success('Scan Completed', 'Discovered 1 Critical finding in auth.ts')}>
              Trigger Toast Notification
            </Button>
          </div>

          <Tabs
            activeId={activeTab}
            onChange={setActiveTab}
            items={[
              { id: 'overview', label: 'System Overview' },
              { id: 'findings', label: 'Active Findings', badge: <Badge variant="violet" size="sm">27</Badge> },
              { id: 'compliance', label: 'Compliance Audit' },
            ]}
          />
        </section>

        <Divider />

        {/* Section 8: Feedback & State Views */}
        <section style={{ marginBottom: '40px' }}>
          <h2 className="sirius-heading-2" style={{ marginBottom: '16px' }}>8. Feedback, Progress & State Views</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <GlassCard padding="lg">
              <h3 className="sirius-heading-3" style={{ marginTop: 0 }}>Progress & Skeleton</h3>
              <ProgressBar value={72} variant="gradient" showLabel />
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton width="100%" height="14px" />
                <Skeleton width="60%" height="14px" />
              </div>
            </GlassCard>

            <GlassCard padding="none">
              <EmptyState title="No Active Scans" description="Select a repository project to initiate AST rule evaluation." action={<Button variant="gradient">Select Project</Button>} />
            </GlassCard>
          </div>
        </section>

        {/* Modals & Drawers */}
        <GlassModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="SIRIUS GlassModal Container"
          footer={
            <>
              <GhostButton onClick={() => setIsModalOpen(false)}>Cancel</GhostButton>
              <GradientButton onClick={() => setIsModalOpen(false)}>Confirm Action</GradientButton>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            This shared <code style={{ color: 'var(--color-cyan)' }}>GlassModal</code> container is the canonical overlay dialog shell. It provides dark glass surfaces, backdrop blur, spring entrance animations, keyboard ESC key listeners, and accessible dialog semantics.
          </p>
        </GlassModal>

        <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title="Security Audit Inspector">
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Inspect detailed finding metadata, rule definitions, and attack path edges.
          </p>
        </Drawer>
      </div>
    </PixelGridBackground>
  );
};
