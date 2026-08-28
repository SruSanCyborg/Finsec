import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPulse } from '../sirius/StatusPulse';

describe('StatusPulse Component', () => {
  it('renders status pulse with label', () => {
    render(<StatusPulse status="Scanning" label="Live Scan Active" />);
    expect(screen.getByText('Live Scan Active')).toBeTruthy();
  });
});
