import React, { useState } from 'react';
import { Button, GradientButton } from '@sirius/ui';
import { Send, RefreshCw } from 'lucide-react';

export interface CerebusComposerProps {
  /** Sends free text to Cerebus's Groq-backed Q&A route — see `engine/ask.ts`. */
  onAsk: (question: string) => void;
  onRerunFix: () => void;
  isAsking?: boolean;
  isBuildingFix?: boolean;
  hasFindingContext?: boolean;
}

const QUICK_PROMPTS = [
  'Explain why this matters in plain language',
  'Which compliance clause does this touch?',
  'What should I check before applying the fix?',
];

/**
 * A real chat input, backed by a real model. With a finding selected it hits
 * `/scans/:id/findings/:fid/ask`, grounded in that finding's own recorded
 * facts; with none selected it hits `/cerebus/ask`, grounded in the project's
 * most recent scan instead — either way a real answer, never blocked on
 * having something specific open (see `engine/ask.ts`). This used to be a
 * single "re-run" button because nothing downstream read free text; now it
 * does, and remembers what was already asked in this session.
 */
export const CerebusComposer: React.FC<CerebusComposerProps> = ({
  onAsk,
  onRerunFix,
  isAsking = false,
  isBuildingFix = false,
  hasFindingContext = false,
}) => {
  const [draft, setDraft] = useState('');
  const disabled = isAsking;

  const send = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || disabled) return;
    onAsk(trimmed);
    setDraft('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => send(prompt)}
            disabled={disabled}
            style={{
              fontSize: '11.5px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-surface)',
              color: 'var(--color-text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          disabled={disabled}
          placeholder={hasFindingContext ? 'Ask Cerebus about this finding…' : 'Ask Cerebus about this project…'}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '13px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: disabled ? 'var(--color-bg-surface-subtle)' : 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)',
          }}
        />
        <Button
          variant="primary"
          leftIcon={<Send size={14} />}
          disabled={disabled || !draft.trim()}
          isLoading={isAsking}
          onClick={() => send(draft)}
        >
          Ask
        </Button>
      </div>

      <GradientButton
        onClick={onRerunFix}
        disabled={!hasFindingContext || isBuildingFix}
        isLoading={isBuildingFix}
        leftIcon={<RefreshCw size={15} />}
      >
        {hasFindingContext ? 'Re-run fix for this finding' : 'Select a finding to build a fix'}
      </GradientButton>
    </div>
  );
};
