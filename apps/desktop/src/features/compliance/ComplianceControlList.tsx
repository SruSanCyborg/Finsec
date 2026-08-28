import React from 'react';
import { ComplianceControl } from '@sirius/types';
import { Badge } from '@sirius/ui';
import { CheckCircle2, XCircle, AlertCircle, FileText, Layers } from 'lucide-react';

export interface ComplianceControlListProps {
  controls: ComplianceControl[];
  selectedControlId?: string | null;
  onSelectControl: (control: ComplianceControl) => void;
}

export const ComplianceControlList: React.FC<ComplianceControlListProps> = ({
  controls,
  selectedControlId,
  onSelectControl,
}) => {
  if (controls.length === 0) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-hairline)',
          color: 'var(--text-secondary)',
        }}
      >
        <CheckCircle2 size={36} color="var(--color-emerald)" style={{ marginBottom: '12px', opacity: 0.8 }} />
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          No Control Failures Identified
        </div>
        <div className="sirius-caption" style={{ marginTop: '4px' }}>
          All evaluated controls for this compliance framework meet passing security requirements.
        </div>
      </div>
    );
  }

  const renderStatusBadge = (status: ComplianceControl['status']) => {
    switch (status) {
      case 'pass':
        return (
          <Badge variant="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
            PASS
          </Badge>
        );
      case 'fail':
        return (
          <Badge variant="violet" size="sm" icon={<XCircle size={12} />}>
            FAIL
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="cyan" size="sm" icon={<AlertCircle size={12} />}>
            PARTIAL
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="sm">UNCHECKED</Badge>;
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-hairline)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-hairline)', backgroundColor: 'rgba(15, 18, 26, 0.8)' }}>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>CONTROL ID</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>SECTION & REQUIREMENT TITLE</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>STATUS</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>AFFECTED FINDINGS</th>
            <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>EVIDENCE PROVENANCE</th>
          </tr>
        </thead>
        <tbody>
          {controls.map((control) => {
            const isSelected = selectedControlId === control.id;

            return (
              <tr
                key={control.id}
                onClick={() => onSelectControl(control)}
                style={{
                  borderBottom: '1px solid var(--border-hairline)',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                {/* Control ID */}
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', fontWeight: 700, color: 'var(--color-cyan)' }}>
                  {control.id}
                </td>

                {/* Section & Title */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {control.title}
                  </div>
                  <div className="sirius-caption" style={{ marginTop: '2px' }}>
                    {control.section}
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: '12px 16px' }}>
                  {renderStatusBadge(control.status)}
                </td>

                {/* Affected Findings */}
                <td style={{ padding: '12px 16px' }}>
                  {control.affectedFindingIds.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-amber)' }}>
                      <Layers size={13} /> {control.affectedFindingIds.length} Finding{control.affectedFindingIds.length > 1 ? 's' : ''}
                    </div>
                  ) : (
                    <span className="sirius-caption">0 Findings</span>
                  )}
                </td>

                {/* Evidence Provenance */}
                <td style={{ padding: '12px 16px' }}>
                  {control.evidenceScanReference ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <FileText size={13} color="var(--color-cyan)" /> {control.evidenceScanReference}
                    </div>
                  ) : (
                    <span className="sirius-caption">Verified</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
