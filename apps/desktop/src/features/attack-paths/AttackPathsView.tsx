import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAttackPathsQuery } from '../../api/queries';
import { AttackPath, AttackPathNode } from '@sirius/types';
import { Input, LoadingState, ErrorState } from '@sirius/ui';
import { AttackPathSummaryStrip } from './AttackPathSummaryStrip';
import { AttackPathGraphView } from './AttackPathGraphView';
import { AttackPathList } from './AttackPathList';
import { AttackPathInspector } from './AttackPathInspector';
import { GitCommit, Search } from 'lucide-react';

export const AttackPathsView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const paramPathId = searchParams.get('path');
  const paramFindingId = searchParams.get('finding');

  const { data: attackPaths = [], isLoading, isError, refetch } = useAttackPathsQuery();

  const [selectedPathId, setSelectedPathId] = useState<string | null>(paramPathId || null);
  const [selectedNode, setSelectedNode] = useState<AttackPathNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [isFocusedMode, setIsFocusedMode] = useState(true);

  // Sync selected path with query params or default to highest priority path
  useEffect(() => {
    if (paramPathId) {
      setSelectedPathId(paramPathId);
    } else if (paramFindingId && attackPaths.length > 0) {
      const match = attackPaths.find((p: AttackPath) => p.findingIds.includes(paramFindingId));
      if (match) setSelectedPathId(match.id);
    } else if (attackPaths.length > 0 && !selectedPathId) {
      setSelectedPathId(attackPaths[0].id);
    }
  }, [paramPathId, paramFindingId, attackPaths, selectedPathId]);


  if (isLoading) {
    return <LoadingState label="Loading attack path security graph from FinSec Core..." />;
  }

  if (isError) {
    return <ErrorState title="Failed to Load Resource" description="Failed to load attack path graph data." onRetry={() => refetch()} />;
  }

  // Filter paths
  const filteredPaths = attackPaths.filter((path: AttackPath) => {
    if (severityFilter && path.severity !== severityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        path.title.toLowerCase().includes(q) ||
        path.entryLabel.toLowerCase().includes(q) ||
        path.targetLabel.toLowerCase().includes(q) ||
        path.findingIds.some((id: string) => id.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedPath = filteredPaths.find((p: AttackPath) => p.id === selectedPathId) || filteredPaths[0] || null;


  const handleSelectPath = (path: AttackPath) => {
    setSelectedPathId(path.id);
    setSelectedNode(null);

    const next = new URLSearchParams(searchParams);
    next.set('path', path.id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 120px)' }}>
      {/* Workspace Header */}
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
            <GitCommit size={22} color="var(--color-primary)" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              ATTACK PATHS
            </div>
            <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
              Attack Paths & Security Graph
            </h1>
            <div className="sirius-caption">
              Trace how security weaknesses propagate through your environment and reach high-value financial assets.
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ width: '280px' }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search path, node, asset..."
            leftIcon={<Search size={14} />}
          />
        </div>
      </div>

      {/* Summary Strip */}
      <AttackPathSummaryStrip
        totalPaths={attackPaths.length}
        criticalCount={attackPaths.filter((p: AttackPath) => p.severity === 'critical').length}
        highCount={attackPaths.filter((p: AttackPath) => p.severity === 'high').length}
        affectedAssetsCount={2}
        entryPointsCount={2}
        selectedSeverityFilter={severityFilter}
        onSelectFilter={(sev) => setSeverityFilter(sev)}
      />


      {/* Main Split Workspace */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Left Column: Graph Viewport + Accessible Path List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Hero SVG Graph Viewport */}
          <AttackPathGraphView
            attackPath={selectedPath}
            selectedNodeId={selectedNode?.id}
            onSelectNode={(node) => setSelectedNode(node)}
            isFocusedMode={isFocusedMode}
            onToggleFocusMode={() => setIsFocusedMode((prev) => !prev)}
          />

          {/* Parallel Accessible Path List */}
          <AttackPathList
            paths={filteredPaths}
            selectedPathId={selectedPath?.id}
            onSelectPath={handleSelectPath}
          />
        </div>

        {/* Right Column: Path & Node Inspector */}
        <AttackPathInspector
          attackPath={selectedPath}
          selectedNode={selectedNode}
          onNavigateToFinding={(id) => navigate(`/findings?selected=${id}`)}
          onNavigateToCerebus={(id) => navigate(`/cerebus?finding=${id}`)}
        />
      </div>
    </div>
  );
};
