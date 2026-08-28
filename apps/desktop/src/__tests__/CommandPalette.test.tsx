import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../shell/CommandPalette';
import { useUIStore } from '@sirius/state';

describe('CommandPalette Component', () => {
  it('renders command palette when open', () => {
    useUIStore.getState().setCommandPaletteOpen(true);

    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Go to Dashboard')).toBeTruthy();
  });
});
