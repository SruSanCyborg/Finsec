import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CerebusComposer } from '../features/cerebus/CerebusComposer';

describe('CerebusComposer Component', () => {
  it('renders quick prompts and handles submission', () => {
    const handleAsk = vi.fn();
    render(<CerebusComposer onAsk={handleAsk} onRerunFix={vi.fn()} hasFindingContext={true} />);

    expect(screen.getByText('Explain why this matters in plain language')).toBeTruthy();

    const input = screen.getByPlaceholderText(/Ask Cerebus about this finding/i);
    fireEvent.change(input, { target: { value: 'How do I fix this?' } });

    const sendBtn = screen.getByText('Ask');
    fireEvent.click(sendBtn);

    expect(handleAsk).toHaveBeenCalledWith('How do I fix this?');
  });
});
