import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlassModal } from '../primitives/Modal';


describe('GlassModal Component', () => {
  it('renders modal dialog when isOpen is true', () => {
    render(
      <GlassModal isOpen={true} onClose={() => {}} title="Security Modal">
        <div>Modal Content</div>
      </GlassModal>
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Security Modal')).toBeTruthy();
    expect(screen.getByText('Modal Content')).toBeTruthy();
  });

  it('triggers onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <GlassModal isOpen={true} onClose={handleClose} title="Escape Test">
        <div>Content</div>
      </GlassModal>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
