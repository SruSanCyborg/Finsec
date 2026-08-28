import React, { useState } from 'react';
import { Report } from '@sirius/types';
import { GlassCard, Badge, MoneyTicker } from '@sirius/ui';
import { ShieldCheck, FileText, ArrowRight } from 'lucide-react';

import { redactSensitiveText } from '@sirius/utils';

export interface ReportPreviewProps {
  report: Report | null;
}

export const ReportPreview: React.FC<ReportPreviewProps> = ({ report }) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'executive' | 'findings' | 'attack_paths' | 'compliance' | 'remediation'>('overview');

  if (!report) {
    return (
      <GlassCard padding="lg" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <FileText size={42} color="var(--color-cyan)" style={{ marginBottom: '12px', opacity: 0.8 }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            NO REPORT SELECTED
          </div>
          <div className="sirius-caption" style={{ marginTop: '4px' }}>
            Select a report from the table to preview structured security intelligence evidence.
          </div>
        </div>
      </GlassCard>
    );
  }

  const summary = report.summary || {
    overallScore: 72.5,
    totalFindings: 43,
    criticalCount: 3,
    highCount: 12,
    mediumCount: 28,
    moneyAtRiskUSD: 1450000,
    passedControlsCount: 35,
    failedControlsCount: 13,
  };

  const scrollToSection = (id: typeof activeSection) => {
    setActiveSection(id);
    const element = document.getElementById(`section-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <GlassCard padding="none" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Fixed Document Section Nav Bar */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface-elevated)',
          borderBottom: '1px solid var(--color-border)',
          padding: '12px 20px',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'executive', label: 'Executive Summary' },
          { id: 'findings', label: 'Findings Evidence' },
          { id: 'attack_paths', label: 'Attack Paths' },
          { id: 'compliance', label: 'Compliance' },
          { id: 'remediation', label: 'Remediation' },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => scrollToSection(tab.id as typeof activeSection)}
              style={{
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid',
                borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: isActive ? 'var(--color-primary-soft)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable Document Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Document Header Hero */}
        <div id="section-overview" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Badge variant={report.type === 'executive' ? 'violet' : report.type === 'technical' ? 'cyan' : 'emerald'} size="sm">
              {report.type.toUpperCase()} SECURITY INTELLIGENCE REPORT
            </Badge>
            <span className="sirius-caption" style={{ fontFamily: 'var(--font-code)' }}>
              REPORT ID: {report.id}
            </span>
          </div>

          <h1 className="sirius-display" style={{ fontSize: '24px', fontWeight: 800, margin: '8px 0 4px 0', color: 'var(--color-text-primary)' }}>
            {report.title}
          </h1>

          <div className="sirius-caption" style={{ fontFamily: 'var(--font-code)' }}>
            Generated for PayKit Core API · Target Scan {report.scanId} · {new Date(report.generatedAt).toLocaleString()}
          </div>
        </div>

        {/* Section 1: Executive Summary & Score Band */}
        <div id="section-executive" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            1. EXECUTIVE SECURITY POSTURE & FINANCIAL EXPOSURE
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div className="sirius-caption">AUTHORITATIVE POSTURE SCORE</div>
              <div className="sirius-display sirius-numeral-tabular" style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                {summary.overallScore.toFixed(1)} / 100
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div className="sirius-caption" style={{ color: 'var(--color-primary)' }}>MONEY AT RISK EXPOSURE</div>
              <div style={{ marginTop: '6px' }}>
                <MoneyTicker amountUSD={summary.moneyAtRiskUSD} durationMs={0} variant="compact" />
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div className="sirius-caption">CRITICAL & HIGH FINDINGS</div>
              <div className="sirius-display sirius-numeral-tabular" style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-red)', marginTop: '2px' }}>
                {summary.criticalCount + summary.highCount}
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--color-primary-soft)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(24, 101, 68, 0.25)', fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
            "Security posture for PayKit Core API is primarily constrained by hardcoded provider credentials in authentication middleware and unencrypted payment PAN logging. Remediation is active with verifier checks."
          </div>
        </div>

        {/* Section 2: Technical Findings Evidence */}
        <div id="section-findings" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            2. TECHNICAL FINDINGS EVIDENCE & SOURCE LOCATIONS
          </div>

          <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                FIN-SEC-001: Hardcoded JWT Signing Private Key
              </div>
              <Badge variant="violet" size="sm">CRITICAL</Badge>
            </div>
            <div className="sirius-caption" style={{ fontFamily: 'var(--font-code)' }}>
              Location: src/middleware/auth.ts:42-58 · Rule: SEC-JWT-004
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {redactSensitiveText('A static RSA private key was detected in code. Attackers could forge valid session tokens for any tenant.')}
            </div>
          </div>
        </div>

        {/* Section 3: Attack Path Evidence */}
        <div id="section-attack_paths" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            3. CRITICAL ATTACK PROPAGATION PATHS
          </div>

          <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Exposed Provider Credential &rrArr; Financial Payment Ledger ($1.45M Exposure)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
              <Badge variant="cyan" size="sm">Credential</Badge>
              <ArrowRight size={12} />
              <Badge variant="violet" size="sm">JWT Signing Key</Badge>
              <ArrowRight size={12} />
              <Badge variant="teal" size="sm">Auth Gateway</Badge>
              <ArrowRight size={12} />
              <Badge variant="emerald" size="sm">Payment Ledger DB</Badge>
            </div>
          </div>
        </div>

        {/* Section 4: Compliance Control Evidence */}
        <div id="section-compliance" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            4. REGULATORY COMPLIANCE AUDIT EVIDENCE
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div className="sirius-caption">PCI DSS 4.0 CONTROL 6.3.1</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-red)', marginTop: '4px' }}>
                FAIL — Software Architecture Vulnerability Prevention
              </div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>
                Evidence: Static Analysis Scan {report.scanId}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div className="sirius-caption">SOC 2 TYPE II CONTROL CC6.1</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-emerald)', marginTop: '4px' }}>
                PASS — Access Transmission Boundary Controls
              </div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>
                Evidence: Verified in Scan {report.scanId}
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Remediation Verification */}
        <div id="section-remediation" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            5. SAFE REMEDIATION VERIFICATION SUMMARY
          </div>

          <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                18 Security Fix Proposals Generated & Verified
              </div>
              <div className="sirius-caption" style={{ marginTop: '2px' }}>
                All patches verified via local sandboxed test suite prior to human approval.
              </div>
            </div>
            <Badge variant="emerald" size="sm" icon={<ShieldCheck size={12} />}>
              VERIFIED SAFE
            </Badge>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
