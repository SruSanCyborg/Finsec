import React, { useState } from 'react';
import { AttackPath, AttackPathNode } from '@sirius/types';
import { AttackPathNodeView } from './AttackPathNodeView';
import { ZoomIn, ZoomOut, Maximize2, Eye } from 'lucide-react';


export interface AttackPathGraphViewProps {
  attackPath: AttackPath | null;
  selectedNodeId?: string | null;
  onSelectNode?: (node: AttackPathNode) => void;
  isFocusedMode?: boolean;
  onToggleFocusMode?: () => void;
}

export const AttackPathGraphView: React.FC<AttackPathGraphViewProps> = ({
  attackPath,
  selectedNodeId,
  onSelectNode,
  isFocusedMode = false,
  onToggleFocusMode,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

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
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.2, 0.6));
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
      {/* Viewport Control Bar */}
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

      {/* SVG Canvas */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 450"
        style={{ flex: 1, userSelect: 'none' }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
          </pattern>

          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-cyan)" opacity="0.8" />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
          {/* Edges */}
          {attackPath.edges.map((edge) => {
            const sourceNode = attackPath.nodes.find((n) => n.id === edge.sourceNodeId);
            const targetNode = attackPath.nodes.find((n) => n.id === edge.targetNodeId);

            if (!sourceNode || !targetNode) return null;

            const x1 = sourceNode.x || 100;
            const y1 = sourceNode.y || 100;
            const x2 = targetNode.x || 300;
            const y2 = targetNode.y || 100;

            return (
              <g key={edge.id}>
                {/* Edge Line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--color-cyan)"
                  strokeWidth="2.5"
                  strokeDasharray="6 3"
                  markerEnd="url(#arrow)"
                  style={{ opacity: isFocusedMode ? 0.9 : 0.4 }}
                />

                {/* Edge Relationship Label */}
                {edge.relationship && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    textAnchor="middle"
                    fill="var(--color-cyan)"
                    fontSize="10"
                    fontFamily="var(--font-code)"
                    fontWeight="600"
                    opacity="0.85"
                  >
                    {edge.relationship}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {attackPath.nodes.map((node) => (
            <AttackPathNodeView
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              isFocusedPath={isFocusedMode}
              onClick={() => onSelectNode && onSelectNode(node)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
