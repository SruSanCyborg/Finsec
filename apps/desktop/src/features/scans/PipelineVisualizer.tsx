import React from 'react';
import { Check } from 'lucide-react';


export interface PipelineVisualizerProps {
  currentStage: string;
}

export const STAGES = ['Prepare', 'Index', 'Analyze', 'Map', 'Finalize'];

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ currentStage }) => {
  const currentIndex = STAGES.indexOf(currentStage) !== -1 ? STAGES.indexOf(currentStage) : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-hairline)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '20px',
      }}
    >
      {STAGES.map((stage, idx) => {
        const isDone = idx < currentIndex;
        const isCurrent = idx === currentIndex;

        return (
          <React.Fragment key={stage}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isDone
                    ? 'rgba(74, 222, 128, 0.15)'
                    : isCurrent
                    ? 'rgba(56, 189, 248, 0.2)'
                    : 'var(--bg-raised)',
                  border: `1px solid ${
                    isDone ? 'var(--color-emerald)' : isCurrent ? 'var(--color-cyan)' : 'var(--border-hairline)'
                  }`,
                  color: isDone ? 'var(--color-emerald)' : isCurrent ? 'var(--color-cyan)' : 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {isDone ? <Check size={13} /> : idx + 1}
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: isCurrent ? 700 : isDone ? 600 : 500,
                  color: isCurrent ? 'var(--color-cyan)' : isDone ? 'var(--text-primary)' : 'var(--text-dim)',
                }}
              >
                {stage}
              </span>
            </div>

            {idx < STAGES.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  backgroundColor: isDone ? 'var(--color-emerald)' : 'var(--bg-raised)',
                  margin: '0 12px',
                  borderRadius: '9999px',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
