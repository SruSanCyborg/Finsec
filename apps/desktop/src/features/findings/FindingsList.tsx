import React from 'react';
import { Finding } from '@sirius/types';
import { FindingRow } from './FindingRow';
import { EmptyState, Button } from '@sirius/ui';
import { FilterX } from 'lucide-react';

export interface FindingsListProps {
  findings: Finding[];
  selectedFindingId: string | null;
  groupBy: 'none' | 'severity' | 'category' | 'rule';
  onSelectFinding: (finding: Finding) => void;
  onClearFilters?: () => void;
}

export const FindingsList: React.FC<FindingsListProps> = ({
  findings,
  selectedFindingId,
  groupBy,
  onSelectFinding,
  onClearFilters,
}) => {
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={<FilterX size={36} color="var(--color-primary)" />}
        title="NO FINDINGS MATCH FILTER CONTEXT"
        description="Try adjusting or clearing your active search query and filter choices."
        action={
          onClearFilters ? (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Clear All Filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  // Ungrouped list
  if (groupBy === 'none') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {findings.map((fnd) => (
          <FindingRow
            key={fnd.id}
            finding={fnd}
            isSelected={selectedFindingId === fnd.id}
            onSelect={onSelectFinding}
          />
        ))}
      </div>
    );
  }

  // Grouped list
  const groups: Record<string, Finding[]> = {};
  findings.forEach((fnd) => {
    let key = 'Other Security Issues';
    if (groupBy === 'severity') key = fnd.severity.toUpperCase();
    else if (groupBy === 'category') key = fnd.category || 'General Security';
    else if (groupBy === 'rule') key = fnd.ruleId;

    if (!groups[key]) groups[key] = [];
    groups[key].push(fnd);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Object.entries(groups).map(([groupTitle, groupItems]) => (
        <div key={groupTitle}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-primary-deep)',
              letterSpacing: '0.06em',
              marginBottom: '8px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{groupTitle}</span>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}>({groupItems.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {groupItems.map((fnd) => (
              <FindingRow
                key={fnd.id}
                finding={fnd}
                isSelected={selectedFindingId === fnd.id}
                onSelect={onSelectFinding}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
