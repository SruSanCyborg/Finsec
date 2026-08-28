import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, GradientButton, GhostButton } from '../primitives/Button';

describe('Button Components', () => {
  it('renders primary button and handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Run Scan</Button>);
    const btn = screen.getByText('Run Scan');
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables button when isLoading is true', () => {
    render(<GradientButton isLoading>Processing</GradientButton>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('disabled')).not.toBeNull();
  });

  it('renders ghost button variant', () => {
    render(<GhostButton>Cancel</GhostButton>);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
