import React, { useState } from 'react';
import { GradientButton } from '@sirius/ui';
import { Send, Sparkles } from 'lucide-react';

export interface CerebusComposerProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  hasFindingContext?: boolean;
}

export const CerebusComposer: React.FC<CerebusComposerProps> = ({
  onSend,
  isLoading = false,
  hasFindingContext = false,
}) => {
  const [text, setText] = useState('');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isLoading) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const quickPrompts = hasFindingContext
    ? [
        'Explain why this finding is critical',
        'Show likely attack path & impact',
        'How should I remediate this?',
        'Which compliance controls are affected?',
      ]
    : [
        'What are the highest security risks in this project?',
        'What changed since the last scan?',
        'Explain current PCI DSS & SOC 2 posture',
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Quick Prompts */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => {
              setText(prompt);
              onSend(prompt);
            }}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Sparkles size={11} color="var(--color-primary)" /> {prompt}
          </button>
        ))}
      </div>

      {/* Composer Input Area */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Cerebus security analyst... (Shift+Enter for new line)"
          rows={2}
          disabled={isLoading}
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: 'var(--font-body)',
            resize: 'none',
            outline: 'none',
          }}
        />

        <GradientButton
          type="submit"
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading}
          isLoading={isLoading}
          leftIcon={<Send size={15} />}
          style={{ height: '48px' }}
        >
          Send
        </GradientButton>

      </form>
    </div>
  );
};
