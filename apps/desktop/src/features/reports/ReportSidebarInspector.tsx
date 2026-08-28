import React, { useState } from 'react';
import { Report } from '@sirius/types';
import { GlassCard, Badge, Button } from '@sirius/ui';
import { FileText, Download, ShieldCheck, Cpu, CheckCircle2 } from 'lucide-react';


export interface ReportSidebarInspectorProps {
  report: Report | null;
  onDownloadPdf?: (reportId: string) => Promise<void>;
  onDownloadSarif?: (reportId: string) => Promise<void>;
}

export const ReportSidebarInspector: React.FC<ReportSidebarInspectorProps> = ({
  report,
  onDownloadPdf,
  onDownloadSarif,
}) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingSarif, setDownloadingSarif] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  if (!report) {
    return (
      <GlassCard padding="lg" style={{ width: '360px', flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <FileText size={36} color="var(--color-cyan)" style={{ marginBottom: '10px', opacity: 0.7 }} />
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
            No Report Selected
          </div>
          <div className="sirius-caption">
            Select a report row to inspect metadata, verification certificates, and download PDF or SARIF 2.1.0 evidence artifacts.
          </div>
        </div>
      </GlassCard>
    );
  }

  const handleDownloadPdf = async () => {
    if (!onDownloadPdf) return;
    setDownloadingPdf(true);
    setDownloadToast('Preparing PDF artifact...');
    try {
      await onDownloadPdf(report.id);
      setDownloadToast('PDF downloaded successfully.');
    } catch {
      setDownloadToast('PDF export failed.');
    } finally {
      setDownloadingPdf(false);
      setTimeout(() => setDownloadToast(null), 3000);
    }
  };

  const handleDownloadSarif = async () => {
    if (!onDownloadSarif) return;
    setDownloadingSarif(true);
    setDownloadToast('Preparing SARIF 2.1.0 artifact...');
    try {
      await onDownloadSarif(report.id);
      setDownloadToast('SARIF downloaded successfully.');
    } catch {
      setDownloadToast('SARIF export failed.');
    } finally {
      setDownloadingSarif(false);
      setTimeout(() => setDownloadToast(null), 3000);
    }
  };

  return (
    <GlassCard padding="lg" style={{ width: '360px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span className="sirius-caption" style={{ fontFamily: 'var(--font-code)', color: 'var(--color-cyan)', fontWeight: 700 }}>
            {report.id}
          </span>
          <Badge variant={report.verificationStatus === 'verified' ? 'emerald' : 'cyan'} size="sm" icon={<ShieldCheck size={12} />}>
            REPORT VERIFIED
          </Badge>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {report.title}
        </div>
      </div>

      {/* Download Status Toast */}
      {downloadToast && (
        <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '12px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle2 size={13} /> {downloadToast}
        </div>
      )}

      {/* Report Metadata */}
      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
        <div className="sirius-caption">REPORT METADATA & ASSURANCE</div>
        <div>
          <span style={{ color: 'var(--text-dim)' }}>Project: </span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.projectId}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-dim)' }}>Target Scan: </span>
          <span className="sirius-mono-sm" style={{ color: 'var(--color-cyan)' }}>{report.scanId}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-dim)' }}>Created By: </span>
          <span style={{ color: 'var(--text-primary)' }}>{report.createdBy}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-dim)' }}>Date: </span>
          <span style={{ color: 'var(--text-primary)' }}>{new Date(report.generatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Verification Certificate */}
      {report.verification && (
        <div style={{ backgroundColor: 'rgba(74, 222, 128, 0.08)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-emerald)', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={13} /> CRYPTOGRAPHIC PROVENANCE SIGNATURE
          </div>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-code)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {report.verification.signature}
          </div>
          <div className="sirius-caption" style={{ marginTop: '4px' }}>
            Authority: {report.verification.verifierCertificate}
          </div>
        </div>
      )}

      {/* Export Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
        <Button
          variant="gradient"
          size="md"
          onClick={handleDownloadPdf}
          isLoading={downloadingPdf}
          leftIcon={<Download size={14} />}
          disabled={report.status !== 'ready'}
        >
          Download PDF Report Artifact
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={handleDownloadSarif}
          isLoading={downloadingSarif}
          leftIcon={<Download size={14} color="var(--color-cyan)" />}
          disabled={report.status !== 'ready'}
        >
          Download SARIF 2.1.0 Artifact
        </Button>

        <a
          href={`/cerebus?finding=fnd-88219`}
          className="sirius-btn sirius-btn-ghost"
          style={{ textDecoration: 'none', fontSize: '12px', padding: '8px 14px', borderRadius: 'var(--radius-md)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Cpu size={14} color="var(--color-primary)" /> Explain Report Context with Cerebus
        </a>
      </div>
    </GlassCard>
  );
};
