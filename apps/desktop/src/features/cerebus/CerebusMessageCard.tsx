import React from 'react';
import { CerebusMessage } from '@sirius/types';
import { GlassCard, Badge } from '@sirius/ui';
import { DiffPreviewCard } from './DiffPreviewCard';
import { VerificationStatusCard } from './VerificationStatusCard';
import { renderMarkdownLite } from './markdown-lite';
import { ShieldCheck, User, Cpu, AlertTriangle, Lightbulb, Shield, Layers } from 'lucide-react';

export interface CerebusMessageCardProps {
  message: CerebusMessage;
}

export const CerebusMessageCard: React.FC<CerebusMessageCardProps> = ({ message }) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <div
          style={{
            maxWidth: '75%',
            backgroundColor: 'var(--color-primary-soft)',
            border: '1px solid rgba(14, 107, 74, 0.2)',
            borderRadius: '16px 16px 4px 16px',
            padding: '12px 16px',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <div style={{ flex: 1 }}>{message.content}</div>
          <User size={16} color="var(--color-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
        </div>
      </div>
    );
  }

  const response = message.response;
  const sections = response?.sections;

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
      <GlassCard
        padding="lg"
        style={{
          maxWidth: '88%',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-small)',
          borderRadius: '4px 16px 16px 16px',
        }}
      >
        {/* Analyst Header — a fix build gets the engine badge, a plain answer doesn't claim to be one */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '10px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="var(--color-primary)" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {response ? 'Cerebus Fix Engine' : 'Cerebus'}
            </span>
          </div>
          {response && (
            <Badge variant="emerald" size="sm" style={{ fontSize: '10px' }}>
              TEMPLATE FIX
            </Badge>
          )}
        </div>

        {/* Primary Message */}
        <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.6, marginBottom: '12px' }}>
          {renderMarkdownLite(message.content)}
        </div>

        {/* Structured Sections */}
        {sections && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Analysis */}
            {sections.analysis && (
              <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={13} /> ANALYSIS & ROOT CAUSE
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                  {sections.analysis}
                </div>
              </div>
            )}

            {/* Impact */}
            {sections.impact && (
              <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-amber)', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={13} /> TECHNICAL IMPACT
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                  {sections.impact}
                </div>
              </div>
            )}

            {/* Recommendation */}
            {sections.recommendation && (
              <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lightbulb size={13} /> RECOMMENDED ACTION
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                  {sections.recommendation}
                </div>
              </div>
            )}

            {/* Compliance References */}
            {sections.references?.length && (
              <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={12} color="var(--color-primary)" /> Mapped Control References
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {sections.references.map((ref, idx) => (
                    <Badge key={idx} variant="emerald" size="sm">
                      {ref}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Proposed Remediation */}
        {response?.proposedRemediation && (
          <div style={{ marginTop: '14px', backgroundColor: 'var(--color-bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} /> PROPOSED REMEDIATION PLAN
            </div>

            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {response.proposedRemediation.title}
            </div>

            <div className="sirius-caption" style={{ marginBottom: '10px' }}>
              {response.proposedRemediation.summary}
            </div>

            <ol style={{ margin: '0 0 12px 18px', padding: 0, fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {response.proposedRemediation.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>

            {/* Read-Only Diff Preview */}
            {response.proposedRemediation.diff && (
              <DiffPreviewCard
                filePath={response.proposedRemediation.diff.filePath}
                oldCode={response.proposedRemediation.diff.oldCode}
                newCode={response.proposedRemediation.diff.newCode}
              />
            )}

            {/* Action CTA to Remediation Workspace */}
            {response.findingId && (
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <a
                  href={`/findings/${response.findingId}/remediation`}
                  className="sirius-btn sirius-btn-gradient"
                  style={{ textDecoration: 'none', fontSize: '12px', padding: '6px 14px', borderRadius: 'var(--radius-md)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  Review Fix in Remediation Workspace &rarr;
                </a>
              </div>
            )}
          </div>
        )}

        {/* Verification Card */}
        {response?.verifierStatus && (
          <VerificationStatusCard status={response.verifierStatus} />
        )}
      </GlassCard>
    </div>
  );
};

