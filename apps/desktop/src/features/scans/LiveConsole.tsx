import React, { useRef, useEffect, useState } from 'react';
import { ScanConsoleEvent } from '@sirius/types';
import { GlassCard, Badge } from '@sirius/ui';
import { Terminal, ArrowDown } from 'lucide-react';


export interface LiveConsoleProps {
  events: ScanConsoleEvent[];
}

export const LiveConsole: React.FC<LiveConsoleProps> = ({ events }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 30;
      setAutoScroll(isAtBottom);
    }
  };

  const filteredEvents = events.filter((e) => categoryFilter === 'ALL' || e.category === categoryFilter);

  return (
    <GlassCard padding="none" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Console Header */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={16} color="var(--color-cyan)" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Live Analysis Console</span>
          <Badge variant="neutral" size="sm" style={{ fontFamily: 'var(--font-code)', fontSize: '10px' }}>
            {events.length} LOGS
          </Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
              }}
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid var(--color-cyan)',
                color: 'var(--color-cyan)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ArrowDown size={11} /> Jump to latest
            </button>
          )}

          {['ALL', 'SYSTEM', 'RULE', 'FINDING', 'COMPLIANCE'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                background: categoryFilter === cat ? 'var(--bg-raised)' : 'transparent',
                border: 'none',
                color: categoryFilter === cat ? 'var(--color-cyan)' : 'var(--text-dim)',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Log Output Stream */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          padding: '12px 14px',
          overflowY: 'auto',
          fontFamily: 'var(--font-code)',
          fontSize: '12px',
          lineHeight: 1.6,
          backgroundColor: '#07080B',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          minHeight: '220px',
          maxHeight: '360px',
        }}
      >
        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center' }}>
            Waiting for AST scanner worker output stream...
          </div>
        ) : (
          filteredEvents.map((evt) => (
            <div key={evt.id} style={{ display: 'flex', gap: '10px', wordBreak: 'break-all' }}>
              <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span
                style={{
                  color:
                    evt.category === 'FINDING'
                      ? 'var(--color-red)'
                      : evt.category === 'RULE'
                      ? 'var(--color-primary)'
                      : evt.category === 'COMPLIANCE'
                      ? 'var(--color-emerald)'
                      : 'var(--text-secondary)',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                [{evt.category}]
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{evt.message}</span>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
};
