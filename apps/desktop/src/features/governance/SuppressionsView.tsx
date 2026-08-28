import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSuppressionsQuery,
  useCreateSuppressionMutation,
  useRevokeSuppressionMutation,
  useProjectsQuery,
} from '../../api/queries';
import { Suppression } from '@sirius/types';
import { GlassCard, Badge, Input, Button, LoadingState, ErrorState } from '@sirius/ui';
import { CreateSuppressionDialog } from './CreateSuppressionDialog';
import { ShieldAlert, Search, Plus, Trash2, Calendar, Layers } from 'lucide-react';


export const SuppressionsView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const paramId = searchParams.get('id');

  const { data: projects = [] } = useProjectsQuery();
  const activeProject = projects[0];

  const { data: suppressions = [], isLoading, isError, refetch } = useSuppressionsQuery(activeProject?.id);

  const createSuppressionMutation = useCreateSuppressionMutation();
  const revokeSuppressionMutation = useRevokeSuppressionMutation();

  const [selectedSuppressionId, setSelectedSuppressionId] = useState<string | null>(paramId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('active');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (paramId) {
      setSelectedSuppressionId(paramId);
    } else if (suppressions.length > 0 && !selectedSuppressionId) {
      setSelectedSuppressionId(suppressions[0].id);
    }
  }, [paramId, suppressions, selectedSuppressionId]);

  if (isLoading) {
    return <LoadingState label="Loading active suppression policies from FinSec Core..." />;
  }

  if (isError) {
    return <ErrorState title="Failed to Load Resource" description="Suppression policy data unavailable." onRetry={() => refetch()} />;
  }

  const filteredSuppressions = suppressions.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.id.toLowerCase().includes(q) ||
        item.ruleId.toLowerCase().includes(q) ||
        item.createdBy.toLowerCase().includes(q) ||
        (item.reasonText && item.reasonText.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedSuppression = filteredSuppressions.find((s) => s.id === selectedSuppressionId) || filteredSuppressions[0] || null;

  const handleSelectSuppression = (suppression: Suppression) => {
    setSelectedSuppressionId(suppression.id);
    const next = new URLSearchParams(searchParams);
    next.set('id', suppression.id);
    setSearchParams(next, { replace: true });
  };

  const handleRevoke = async (suppression: Suppression) => {
    if (confirm(`Revoke suppression policy for ${suppression.ruleId}? Matching findings will become actionable.`)) {
      await revokeSuppressionMutation.mutateAsync({ ruleId: suppression.ruleId, projectId: activeProject?.id });
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={22} color="var(--color-cyan)" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              GOVERNANCE
            </div>
            <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
              Finding Suppressions Policy
            </h1>
            <div className="sirius-caption">
              Manage security governance suppression rules and accepted temporary policy exceptions.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="gradient" size="sm" onClick={() => setIsCreateOpen(true)} leftIcon={<Plus size={14} />}>
            Create Suppression Policy
          </Button>

          <div style={{ width: '240px' }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rule ID, creator..."
              leftIcon={<Search size={14} />}
            />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', width: 'fit-content' }}>
        <Button variant={statusFilter === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusFilter('all')}>
          All Statuses
        </Button>
        <Button variant={statusFilter === 'active' ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusFilter('active')}>
          Active ({suppressions.filter((s) => s.status === 'active').length})
        </Button>
        <Button variant={statusFilter === 'revoked' ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusFilter('revoked')}>
          Revoked ({suppressions.filter((s) => s.status === 'revoked').length})
        </Button>
      </div>

      {/* Main Split View */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Column: Data Table */}
        <div style={{ flex: 1, minWidth: 0, backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
          {filteredSuppressions.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <ShieldAlert size={36} color="var(--color-cyan)" style={{ marginBottom: '12px', opacity: 0.7 }} />
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                No Suppression Policies Identified
              </div>
              <div className="sirius-caption" style={{ marginTop: '4px' }}>
                All findings remain actionable according to configured security policy.
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)', backgroundColor: 'rgba(15, 18, 26, 0.8)' }}>
                  <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>POLICY ID</th>
                  <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>RULE ID</th>
                  <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>SCOPE</th>
                  <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>STATUS</th>
                  <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>CREATED BY</th>
                  <th className="sirius-caption" style={{ padding: '12px 16px', fontWeight: 700 }}>EXPIRATION</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppressions.map((item) => {
                  const isSelected = selectedSuppressionId === item.id;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleSelectSuppression(item)}
                      style={{
                        borderBottom: '1px solid var(--border-hairline)',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                        transition: 'background-color var(--transition-fast)',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', fontWeight: 700, color: 'var(--color-cyan)' }}>
                        {item.id}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-code)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.ruleId}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant="cyan" size="sm">{item.scope.toUpperCase()}</Badge>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={item.status === 'active' ? 'emerald' : 'violet'} size="sm">
                          {item.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {item.createdBy}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
                        {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'No Expiry'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right Column: Suppression Inspector */}
        {selectedSuppression && (
          <GlassCard padding="lg" style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="sirius-caption" style={{ fontFamily: 'var(--font-code)', color: 'var(--color-cyan)', fontWeight: 700 }}>
                  {selectedSuppression.id}
                </span>
                <Badge variant={selectedSuppression.status === 'active' ? 'emerald' : 'violet'} size="sm">
                  {selectedSuppression.status.toUpperCase()}
                </Badge>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Rule: {selectedSuppression.ruleId}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
              <div className="sirius-caption" style={{ marginBottom: '4px' }}>JUSTIFICATION & REASON</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {selectedSuppression.reasonText || `Suppressed under reason: ${selectedSuppression.reason}`}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} color="var(--color-cyan)" /> CREATED
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-code)' }}>
                  {new Date(selectedSuppression.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div className="sirius-caption" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={12} color="var(--color-primary)" /> AFFECTED
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-code)' }}>
                  {selectedSuppression.affectedFindingIds.length} Findings
                </div>
              </div>
            </div>

            {selectedSuppression.status === 'active' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRevoke(selectedSuppression)}
                leftIcon={<Trash2 size={14} color="var(--color-red)" />}
                style={{ marginTop: 'auto' }}
              >
                Revoke Suppression Policy
              </Button>
            )}
          </GlassCard>
        )}
      </div>

      {/* Modal Dialog */}
      <CreateSuppressionDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (params) => {
          // No fake project id fallback: the daemon always lists its own
          // serving root first (see `server/projects.ts`), so `activeProject`
          // is real once `useProjectsQuery` has data. An empty id here means
          // that hasn't happened yet, and the request should fail honestly
          // rather than silently target a project that doesn't exist.
          if (!activeProject?.id) return;
          await createSuppressionMutation.mutateAsync({
            ...params,
            projectId: activeProject.id,
          });
        }}
      />
    </div>
  );
};
