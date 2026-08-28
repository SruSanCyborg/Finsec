import React, { useState } from 'react';
import { redactSensitiveText } from '@sirius/utils';
import { FileCode, Copy, Check } from 'lucide-react';

export interface SourceCodeViewerProps {
  filePath: string;
  startLine: number;
  codeSnippet?: string;
}

export const SourceCodeViewer: React.FC<SourceCodeViewerProps> = ({
  filePath,
  startLine,
  codeSnippet,
}) => {
  const [copied, setCopied] = useState(false);

  // Fallback snippet if backend snippet is concise
  const defaultSnippet = `// ${filePath}
const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization;
  // SECURITY FINDING: Hardcoded secret key detected on target line
  const signingKey = "sk_live_9921838194821095"; // CRITICAL: Credential exposure
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  return next();
};`;

  const rawSnippet = codeSnippet || defaultSnippet;
  const redactedSnippet = redactSensitiveText(rawSnippet);
  const lines = redactedSnippet.split('\n');

  const handleCopyPath = () => {
    navigator.clipboard.writeText(`${filePath}:${startLine}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        backgroundColor: '#07080B',
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-code)', fontSize: '12px', color: '#A0AEC0' }}>
          <FileCode size={14} color="var(--color-primary)" />
          <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{filePath}</span>
          <span style={{ color: '#718096' }}>:{startLine}</span>
        </div>

        <button
          onClick={handleCopyPath}
          style={{
            background: 'none',
            border: 'none',
            color: '#A0AEC0',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: 0,
          }}
        >
          {copied ? <Check size={13} color="var(--color-emerald)" /> : <Copy size={13} />}
          {copied ? 'Copied Location' : 'Copy Location'}
        </button>
      </div>

      {/* Code Snippet Lines Container */}
      <div
        style={{
          padding: '12px 0',
          fontFamily: 'var(--font-code)',
          fontSize: '12.5px',
          lineHeight: 1.6,
          overflowX: 'auto',
        }}
      >
        {lines.map((line, idx) => {
          const currentLineNum = startLine - 2 + idx;
          const isTargetLine = idx === 3 || line.includes('SECURITY FINDING') || line.includes('sk_live_');

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: isTargetLine ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                borderLeft: isTargetLine ? '3px solid var(--color-cyan)' : '3px solid transparent',
                padding: '0 14px',
              }}
            >
              {/* Line Number Gutter */}
              <span
                className="sirius-numeral-tabular"
                style={{
                  width: '40px',
                  color: isTargetLine ? 'var(--color-cyan)' : '#4A5568',
                  fontWeight: isTargetLine ? 700 : 400,
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                {currentLineNum > 0 ? currentLineNum : idx + 1}
              </span>

              {/* Line Content */}
              <span
                style={{
                  color: isTargetLine ? '#F7FAFC' : '#CBD5E0',
                  fontWeight: isTargetLine ? 600 : 400,
                  whiteSpace: 'pre',
                }}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
