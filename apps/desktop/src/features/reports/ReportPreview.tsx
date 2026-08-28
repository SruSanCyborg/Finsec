import React, { useState } from 'react';
import { Report } from '@sirius/types';
import { GlassCard, Badge, MoneyTicker } from '@sirius/ui';
import { ShieldCheck, FileText } from 'lucide-react';

import { redactSensitiveText } from '@sirius/utils';

/** The `sirius.report/v1` document `GET /scans/:id/report?format=json` returns — the same bytes `sirius report --verify` checks. */
export interface SignedReportDocument {
  schema: string;
  scan_id: string;
  compliance_refs: string[];
  findings: {
    rule_id: string;
    severity: string;
    file: string;
    line: number;
    message?: string;
    compliance_ref: string[];
    money_at_risk_inr: number;
  }[];
}

export interface ReportPreviewProps {
  report: Report | null;
  /** The real signed document for `report`, fetched separately — undefined while still loading. */
  signedDoc?: SignedReportDocument;
}

export const ReportPreview: React.FC<ReportPreviewProps> = ({ report, signedDoc }) => {
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

  // `report.summary` always exists once a report is generated (see
  // `adapters.ts#toReport`) — this is a type-safety fallback, not a demo one.
  const summary = report.summary ?? {
    overallScore: 0,
    totalFindings: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    moneyAtRiskUSD: 0,
    passedControlsCount: 0,
    failedControlsCount: 0,
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
            Target Scan {report.scanId} · {new Date(report.generatedAt).toLocaleString()}
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
        </div>

        {/* Section 2: Technical Findings Evidence — from the signed document itself, not invented per-report copy */}
        <div id="section-findings" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            2. TECHNICAL FINDINGS EVIDENCE & SOURCE LOCATIONS
          </div>

          {!signedDoc && (
            <div className="sirius-caption" style={{ padding: '12px 0' }}>Loading signed evidence…</div>
          )}

          {signedDoc && signedDoc.findings.length === 0 && (
            <div className="sirius-caption" style={{ padding: '12px 0' }}>This scan reported no findings.</div>
          )}

          {signedDoc?.findings.slice(0, 8).map((f, idx) => (
            <div
              key={`${f.rule_id}-${f.file}-${f.line}-${idx}`}
              style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  {f.rule_id}
                </div>
                <Badge variant={f.severity === 'critical' ? 'violet' : f.severity === 'high' ? 'cyan' : 'teal'} size="sm">
                  {f.severity.toUpperCase()}
                </Badge>
              </div>
              <div className="sirius-caption" style={{ fontFamily: 'var(--font-code)' }}>
                Location: {f.file}:{f.line}
              </div>
              {f.message && (
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  {redactSensitiveText(f.message)}
                </div>
              )}
            </div>
          ))}

          {signedDoc && signedDoc.findings.length > 8 && (
            <div className="sirius-caption">+ {signedDoc.findings.length - 8} more in the full report.</div>
          )}
        </div>

        {/* Section 3: Attack Path Evidence — not part of the signed report document; nothing real to show here yet */}
        <div id="section-attack_paths" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            3. CRITICAL ATTACK PROPAGATION PATHS
          </div>
          <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div className="sirius-caption">
              Not part of this report format yet — see the Attack Paths view for what's derived from this scan.
            </div>
          </div>
        </div>

        {/* Section 4: Compliance clauses implicated by findings — from the signed document */}
        <div id="section-compliance" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            4. COMPLIANCE CLAUSES IMPLICATED BY THIS SCAN
          </div>

          {signedDoc && signedDoc.compliance_refs.length === 0 && (
            <div className="sirius-caption" style={{ padding: '12px 0' }}>No compliance clauses implicated — no findings mapped to one.</div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {signedDoc?.compliance_refs.map((ref) => (
              <Badge key={ref} variant="cyan" size="sm" style={{ fontFamily: 'var(--font-code)' }}>
                {ref}
              </Badge>
            ))}
          </div>
          {signedDoc && signedDoc.compliance_refs.length > 0 && (
            <div className="sirius-caption">
              Clauses a finding in this scan maps to — not a pass/fail audit verdict per control.
            </div>
          )}
        </div>

        {/* Section 5: Remediation — no fix-count data in this report; point at the real workspace instead of inventing one */}
        <div id="section-remediation" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div className="sirius-caption" style={{ color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            5. REMEDIATION
          </div>

          <div style={{ backgroundColor: 'var(--color-bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sirius-caption">
              Fix status isn't tracked in this report — open a finding's Remediation workspace for its verifier result.
            </div>
            <Badge variant="cyan" size="sm" icon={<ShieldCheck size={12} />}>
              SEE FINDINGS
            </Badge>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
