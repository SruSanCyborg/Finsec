import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CerebusComposer } from '../features/cerebus/CerebusComposer';

describe('CerebusComposer Component', () => {
  it('renders quick prompts and handles submission', () => {
    const handleSend = vi.fn();
    render(<CerebusComposer onSend={handleSend} hasFindingContext={true} />);

    expect(screen.getByText('Explain why this finding is critical')).toBeTruthy();

    const input = screen.getByPlaceholderText(/Ask Cerebus security analyst/i);
    fireEvent.change(input, { target: { value: 'How do I fix this?' } });

    const sendBtn = screen.getByText('Send');
    fireEvent.click(sendBtn);

    expect(handleSend).toHaveBeenCalledWith('How do I fix this?');
  });
});
