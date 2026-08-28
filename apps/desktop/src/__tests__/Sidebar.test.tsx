import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../shell/Sidebar';

describe('Sidebar Component', () => {
  it('renders primary navigation items', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByText('Scans')).toBeTruthy();
    expect(screen.getByText('Findings')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});
