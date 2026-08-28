import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '../shell/TopBar';

describe('TopBar Component', () => {
  it('renders route breadcrumbs and StatusPulse', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <TopBar />
      </MemoryRouter>
    );

    expect(screen.getByText('SIRIUS')).toBeTruthy();
    expect(screen.getByText('Security Command Dashboard')).toBeTruthy();
    expect(screen.getByText('Core Gateway')).toBeTruthy();
  });
});
