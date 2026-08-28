import React from 'react';
import { ScoreRing, Card, Badge } from '@sirius/ui';
import { ShieldCheck } from 'lucide-react';

export interface ComplianceCardProps {
  score?: number;
  delta?: number;
  frameworks?: Array<{ name: string; id: string }>;
}

export const ComplianceCard: React.FC<ComplianceCardProps> = ({
  score = 94,
  delta = 4.5,
  frameworks = [{ name: 'PCI-DSS 4.0', id: 'pci' }, { name: 'SOC2 Type II', id: 'soc2' }],
}) => {
  return (
    <Card variant="metric" padding="lg" style={{ height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--color-primary)" />
          <span className="sirius-heading-3" style={{ margin: 0 }}>Compliance Posture</span>
        </div>
        <Badge variant="emerald" size="sm">COMPLIANT</Badge>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px 0' }}>
        <ScoreRing score={score} size={140} strokeWidth={11} delta={delta} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
        {frameworks.map((fw) => (
          <Badge key={fw.id} variant="neutral" size="sm">
            {fw.name}
          </Badge>
        ))}
      </div>
    </Card>
  );
};
