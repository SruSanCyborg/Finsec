import React, { useEffect, useState } from 'react';

export interface ScoreRingProps {
  score: number; // 0 to max
  max?: number;
  size?: number;
  strokeWidth?: number;
  delta?: number;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  max = 100,
  size = 120,
  strokeWidth = 10,
  delta,
  ariaLabel = 'Compliance Score Ring',
  style,
}) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = Math.min(Math.max(score, 0), max);
    const duration = 500;
    const stepTime = 16;
    const steps = duration / stepTime;
    const increment = (end - start) / steps;

    const timer = setInterval(() => {
      start += increment;
      if ((increment > 0 && start >= end) || (increment < 0 && start <= end)) {
        setDisplayScore(end);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.round(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [score, max]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayScore / max) * circumference;

  const gradientId = `score-ring-grad-${size}-${score}`;

  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={max}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="50%" stopColor="var(--color-mint)" />
            <stop offset="100%" stopColor="var(--color-primary-deep)" />
          </linearGradient>
        </defs>
        {/* Background Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--color-border-subtle)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated Gradient Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
        />
      </svg>

      {/* Center Score Counter */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className="sirius-numeral-tabular"
          style={{
            fontSize: size >= 140 ? '36px' : size >= 100 ? '24px' : '18px',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            lineHeight: 1,
          }}
        >
          {displayScore}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 500 }}>
          / {max}
        </span>
        {delta !== undefined && (
          <span
            className="sirius-numeral-tabular"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: delta >= 0 ? 'var(--color-primary)' : 'var(--color-red)',
              marginTop: '4px',
            }}
          >
            {delta >= 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
    </div>
  );
};

export const PostureScoreRing: React.FC<ScoreRingProps> = (props) => (
  <ScoreRing ariaLabel="Posture Security Score Ring" {...props} />
);
