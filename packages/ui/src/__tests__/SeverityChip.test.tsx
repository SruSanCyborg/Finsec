import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityChip } from '../sirius/SeverityChip';

describe('SeverityChip Component', () => {
  it('renders critical severity label correctly', () => {
    render(<SeverityChip severity="critical" />);
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('renders high severity chip without icon when showIcon is false', () => {
    render(<SeverityChip severity="high" showIcon={false} />);
    expect(screen.getByText('High')).toBeTruthy();
  });
});
