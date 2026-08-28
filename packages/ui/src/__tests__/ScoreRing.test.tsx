import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreRing } from '../sirius/ScoreRing';

describe('ScoreRing Component', () => {
  it('renders meter role with correct accessibility attributes', () => {
    render(<ScoreRing score={85} max={100} ariaLabel="Compliance Score" />);
    const meter = screen.getByRole('meter');
    expect(meter).toBeTruthy();
    expect(meter.getAttribute('aria-valuenow')).toBe('85');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
  });
});
