import React from 'react';
import { Report } from '@sirius/types';
import { Badge } from '@sirius/ui';
import { FileText, Download } from 'lucide-react';


export interface ReportListProps {
  reports: Report[];
  selectedReportId?: string | null;
  onSelectReport: (report: Report) => void;
  onDownloadPdf?: (reportId: string) => void;
  onDownloadSarif?: (reportId: string) => void;
}

export const ReportList: React.FC<ReportListProps> = ({
  reports,
  selectedReportId,
  onSelectReport,
  onDownloadPdf,
  onDownloadSarif,
}) => {
  if (reports.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', color: 'var(--text-secondary)' }}>
        <FileText size={36} color="var(--color-cyan)" style={{ marginBottom: '12px', opacity: 0.7 }} />
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          NO REPORTS GENERATED YET
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          Generate a security report from a completed scan to export audit-ready evidence.
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', overflow: 'hidden', boxShadow: 'var(--shadow-small)' }} className="sirius-glass-card">
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-elevated)' }}>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700, width: '12%', color: 'var(--color-text-muted)' }}>REPORT ID</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700, width: '40%', color: 'var(--color-text-muted)' }}>TITLE & REPORT TYPE</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700, width: '18%', color: 'var(--color-text-muted)' }}>SCAN REFERENCE</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700, width: '10%', color: 'var(--color-text-muted)' }}>STATUS</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700, width: '10%', color: 'var(--color-text-muted)' }}>GENERATED</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700, width: '10%', textAlign: 'right', color: 'var(--color-text-muted)' }}>EXPORTS</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const isSelected = selectedReportId === report.id;

            return (
              <tr
                key={report.id}
                onClick={() => onSelectReport(report)}
                className="sirius-hover-lift"
                style={{
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-primary-soft)' : 'transparent',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                {/* ID */}
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', fontWeight: 700, color: 'var(--color-primary)' }}>
                  {report.id}
                </td>

                {/* Title & Type */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {report.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                    <Badge variant={report.type === 'executive' ? 'violet' : report.type === 'technical' ? 'cyan' : 'emerald'} size="sm">
                      {report.type.toUpperCase()}
                    </Badge>
                  </div>
                </td>

                {/* Scan */}
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', color: 'var(--color-text-secondary)' }}>
                  {report.scanId}
                </td>

                {/* Status */}
                <td style={{ padding: '12px 16px' }}>
                  <Badge variant={report.status === 'ready' ? 'emerald' : report.status === 'generating' ? 'cyan' : 'violet'} size="sm">
                    {report.status.toUpperCase()}
                  </Badge>
                </td>

                {/* Date */}
                <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-code)' }}>
                  {new Date(report.generatedAt).toLocaleDateString()}
                </td>

                {/* Export CTAs */}
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    {onDownloadPdf && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadPdf(report.id);
                        }}
                        className="sirius-button sirius-button-ghost"
                        style={{ padding: '4px 10px', fontSize: '11px', gap: '4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                      >
                        <Download size={12} /> PDF
                      </button>
                    )}
                    {onDownloadSarif && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadSarif(report.id);
                        }}
                        className="sirius-button sirius-button-ghost"
                        style={{ padding: '4px 10px', fontSize: '11px', gap: '4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                      >
                        <Download size={12} /> SARIF
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
