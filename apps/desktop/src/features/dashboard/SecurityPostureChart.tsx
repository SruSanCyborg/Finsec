import React from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';

export interface SecurityPostureChartProps {
  dataPoints?: Array<{ label: string; count: number }>;
}

export const SecurityPostureChart: React.FC<SecurityPostureChartProps> = () => {
  // 18 High-Density Thin Bars with dynamic heights and color variants
  const barsData = [
    { height: 45, type: 'hatched' },
    { height: 60, type: 'solid-primary' },
    { height: 35, type: 'soft' },
    { height: 72, type: 'solid-mint' },
    { height: 50, type: 'solid-primary' },
    { height: 85, type: 'solid-deep' },
    { height: 65, type: 'hatched' },
    { height: 40, type: 'soft' },
    { height: 78, type: 'highlight', badge: '74%' }, // Active Peak Bar
    { height: 90, type: 'solid-deep' },
    { height: 55, type: 'solid-primary' },
    { height: 68, type: 'solid-mint' },
    { height: 42, type: 'hatched' },
    { height: 80, type: 'solid-primary' },
    { height: 60, type: 'soft' },
    { height: 48, type: 'hatched' },
    { height: 75, type: 'solid-mint' },
    { height: 58, type: 'solid-primary' },
  ];

  const barWidth = 11;
  const gap = 9;
  const startX = 14;

  const getBarFill = (type: string) => {
    switch (type) {
      case 'solid-primary':
        return 'var(--color-primary)';
      case 'solid-mint':
        return '#34D399';
      case 'solid-deep':
        return 'var(--color-primary-deep)';
      case 'highlight':
        return 'var(--color-primary)';
      case 'hatched':
        return 'url(#thinDiagHatch)';
      default:
        return 'url(#thinDiagHatchLight)';
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        padding: '16px 18px',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: '210px',
        boxSizing: 'border-box',
        boxShadow: 'var(--shadow-small)',
      }}
      className="sirius-security-posture-chart sirius-glass-card sirius-hover-lift"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={15} color="var(--color-primary)" />
          <span className="sirius-heading-3" style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>
            PROJECT ANALYTICS
          </span>
        </div>
        <span
          className="sirius-caption"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: 'var(--color-primary)',
            fontWeight: 600,
            backgroundColor: 'var(--color-primary-soft)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            fontSize: '11px',
          }}
        >
          <TrendingUp size={12} /> +14.2% Velocity
        </span>
      </div>

      {/* High-Density Thin-Bar Chart SVG Visualization */}
      <div style={{ height: '95px', width: '100%', position: 'relative', margin: '4px 0' }}>
        <svg width="100%" height="100%" viewBox="0 0 380 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          <defs>
            {/* Diagonal Hatch Stripe Pattern for Thin Bars */}
            <pattern id="thinDiagHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-primary)" strokeWidth="2" strokeOpacity="0.4" />
            </pattern>
            <pattern id="thinDiagHatchLight" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeOpacity="0.25" />
            </pattern>
          </defs>

          {/* Render 18 Thin Bars */}
          {barsData.map((bar, i) => {
            const x = startX + i * (barWidth + gap);
            const y = 92 - bar.height;
            const isHatching = bar.type === 'hatched' || bar.type === 'soft';

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={bar.height}
                  rx={5.5}
                  ry={5.5}
                  fill={getBarFill(bar.type)}
                  stroke={isHatching ? 'var(--color-primary)' : 'none'}
                  strokeWidth={isHatching ? '1' : '0'}
                  strokeOpacity={isHatching ? '0.5' : '0'}
                />

                {/* Floating Badge over Highlight Bar */}
                {bar.badge && (
                  <g>
                    <rect x={x - 8} y={y - 18} width="27" height="14" rx="4" fill="var(--color-bg-surface)" stroke="var(--color-border)" strokeWidth="1" />
                    <text x={x + 5.5} y={y - 8} fill="var(--color-text-primary)" fontSize="9" fontWeight="700" textAnchor="middle" className="sirius-numeral-tabular">
                      {bar.badge}
                    </text>
                    <line x1={x + 5.5} y1={y - 4} x2={x + 5.5} y2={y} stroke="var(--color-primary)" strokeWidth="1.5" />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Timeline Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', marginTop: '2px' }}>
        <span className="sirius-caption" style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          W1 (Scan #101-#105)
        </span>
        <span className="sirius-caption" style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          W2 (Scan #106-#109)
        </span>
        <span className="sirius-caption" style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 700 }}>
          W3 (Current #110-#112)
        </span>
      </div>
    </div>
  );
};
