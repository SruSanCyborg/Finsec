import React, { useState } from 'react';
import { GlassModal, Button } from '@sirius/ui';
import { FileText, Layers } from 'lucide-react';

import { ReportType } from '@sirius/types';

export interface GenerateReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: {
    projectId: string;
    scanId: string;
    type: ReportType;
    frameworkId?: string;
  }) => Promise<void>;
  initialType?: ReportType;
  initialScanId?: string;
  initialProjectId?: string;
  initialFrameworkId?: string;
}

export const GenerateReportDialog: React.FC<GenerateReportDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialType = 'technical',
  initialScanId = 'scan-109283',
  initialProjectId = 'prj-finsec-core-01',
  initialFrameworkId = 'pci-dss-4.0',
}) => {
  const [type, setType] = useState<ReportType>(initialType);
  const [scanId, setScanId] = useState(initialScanId);
  const [frameworkId, setFrameworkId] = useState(initialFrameworkId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        projectId: initialProjectId,
        scanId,
        type,
        frameworkId: type === 'compliance' ? frameworkId : undefined,
      });
      onClose();
    } catch {
      // Handled
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Security Intelligence Report"
      maxWidth="540px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <FileText size={18} color="var(--color-cyan)" />
          <span>Generate audit-ready security evidence reflecting the authoritative backend scan assessment.</span>
        </div>

        {/* Report Type Selector */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>REPORT TYPE</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="button"
              variant={type === 'executive' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setType('executive')}
              style={{ flex: 1 }}
            >
              Executive Risk
            </Button>
            <Button
              type="button"
              variant={type === 'technical' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setType('technical')}
              style={{ flex: 1 }}
            >
              Technical SARIF
            </Button>
            <Button
              type="button"
              variant={type === 'compliance' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setType('compliance')}
              style={{ flex: 1 }}
            >
              Compliance Audit
            </Button>
          </div>
        </div>

        {/* Target Scan */}
        <div>
          <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>TARGET COMPLETED SCAN</label>
          <select
            value={scanId}
            onChange={(e) => setScanId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          >
            <option value="scan-109283">Scan 8F31 (PayKit Core API · main · 126 findings)</option>
            <option value="scan-109284">Scan 7A21 (Vault Key Service · release · 32 findings)</option>
          </select>
        </div>

        {/* Compliance Framework Selection if type === compliance */}
        {type === 'compliance' && (
          <div>
            <label className="sirius-caption" style={{ display: 'block', marginBottom: '6px' }}>TARGET COMPLIANCE FRAMEWORK</label>
            <select
              value={frameworkId}
              onChange={(e) => setFrameworkId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="pci-dss-4.0">PCI DSS 4.0 Standard</option>
              <option value="soc2-type2">SOC 2 Type II Security</option>
              <option value="iso27001">ISO 27001 ISMS</option>
            </select>
          </div>
        )}

        {/* Report Scope Card */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
          <div className="sirius-caption">REPORT SCOPE SUMMARY</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={14} color="var(--color-cyan)" /> PayKit Core API · {scanId} · {type.toUpperCase()}
          </div>
        </div>

        {/* Dialog Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gradient" type="submit" isLoading={isSubmitting}>
            Generate Security Report
          </Button>
        </div>
      </form>
    </GlassModal>
  );
};
