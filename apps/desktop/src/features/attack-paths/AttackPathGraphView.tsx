import React, { useMemo, useState } from 'react';
import { AttackPath, AttackPathNode } from '@sirius/types';
import { AttackPathNodeView, CARD_WIDTH } from './AttackPathNodeView';
import { ZoomIn, ZoomOut, Maximize2, Eye } from 'lucide-react';

export interface AttackPathGraphViewProps {
  attackPath: AttackPath | null;
  selectedNodeId?: string | null;
  onSelectNode?: (node: AttackPathNode) => void;
  isFocusedMode?: boolean;
  onToggleFocusMode?: () => void;
}

const GAP_X = 90;
const MARGIN_X = 70;
const ROW_Y = 110;
const VIEWBOX_HEIGHT = 220;

export const AttackPathGraphView: React.FC<AttackPathGraphViewProps> = ({
  attackPath,
  selectedNodeId,
  onSelectNode,
  isFocusedMode = false,
  onToggleFocusMode,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // The daemon never assigns pixel coordinates — a step chain has no
  // coordinates to assign, only an order — so this is the one place a
  // position exists at all: a plain left-to-right lane, one card per step,
  // in the order the daemon reported them. `node.x`/`node.y` (still on the
  // type, for a future non-linear graph) are deliberately not read here.
  const positions = useMemo(() => {
    if (!attackPath) return new Map<string, { x: number; y: number }>();
    const map = new Map<string, { x: number; y: number }>();
    attackPath.nodes.forEach((node, i) => {
      map.set(node.id, { x: MARGIN_X + CARD_WIDTH / 2 + i * (CARD_WIDTH + GAP_X), y: ROW_Y });
    });
    return map;
  }, [attackPath]);

  const viewBoxWidth = attackPath
    ? MARGIN_X * 2 + attackPath.nodes.length * CARD_WIDTH + Math.max(0, attackPath.nodes.length - 1) * GAP_X
    : 800;

  if (!attackPath) {
    return (
      <div
        style={{
          flex: 1,
          backgroundColor: 'var(--color-bg-technical)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-technical)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}
      >
        No attack path selected. Select an attack path to open graph.
      </div>
    );
  }

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.2, 2.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: 'var(--color-bg-technical)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-technical)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Viewport Control Bar — an overlay on the non-scrolling wrapper, so it
          stays pinned to the visible corner regardless of how far the chain
          below has been scrolled. */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 10,
          display: 'flex',
          gap: '6px',
          backgroundColor: 'rgba(15, 18, 26, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '4px',
        }}
      >
        {onToggleFocusMode && (
          <button
            onClick={onToggleFocusMode}
            style={{
              backgroundColor: isFocusedMode ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: isFocusedMode ? 'var(--color-cyan)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Eye size={13} /> {isFocusedMode ? 'Focused' : 'Focus'}
          </button>
        )}
        <button
          onClick={handleZoomIn}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px' }}
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={handleZoomOut}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px' }}
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={handleResetZoom}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px' }}
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Scrolls horizontally when the chain is wider than the panel; the
          control bar above is outside this, so it never scrolls with it. */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center' }}>
        <svg
          width={viewBoxWidth * zoomLevel}
          height={VIEWBOX_HEIGHT}
          viewBox={`0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}`}
          style={{ userSelect: 'none', flex: 'none', margin: '0 auto' }}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            </pattern>

            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-cyan)" opacity="0.9" />
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${panOffset.x}, ${panOffset.y})`}>
            {/* Edges — drawn from card edge to card edge, not centre to centre,
                so the line and arrowhead sit in the gap instead of running
                behind the boxes. */}
            {attackPath.edges.map((edge) => {
              const from = positions.get(edge.sourceNodeId);
              const to = positions.get(edge.targetNodeId);
              if (!from || !to) return null;

              const x1 = from.x + CARD_WIDTH / 2;
              const x2 = to.x - CARD_WIDTH / 2 - 8;

              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${from.y} C ${x1 + GAP_X / 2} ${from.y}, ${x2 - GAP_X / 2} ${to.y}, ${x2} ${to.y}`}
                  fill="none"
                  stroke="var(--color-cyan)"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                  style={{ opacity: isFocusedMode ? 0.9 : 0.45 }}
                />
              );
            })}

            {/* Nodes */}
            {attackPath.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              return (
                <AttackPathNodeView
                  key={node.id}
                  node={node}
                  x={pos.x}
                  y={pos.y}
                  isSelected={selectedNodeId === node.id}
                  isFocusedPath={isFocusedMode}
                  onClick={() => onSelectNode && onSelectNode(node)}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};
