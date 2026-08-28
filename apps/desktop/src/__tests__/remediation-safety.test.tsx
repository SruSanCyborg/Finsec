import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FixSafetyBanner } from '../features/remediation/FixSafetyBanner';

describe('Remediation Safety Rules', () => {
  it('displays blocked application warning when verifier fails', () => {
    render(<FixSafetyBanner verifierStatus="failed" />);
    expect(screen.getByText('APPLICATION BLOCKED: VERIFICATION FAILED.')).toBeTruthy();
  });

  it('displays blocked application warning when file is stale', () => {
    render(<FixSafetyBanner verifierStatus="passed" isStaleFile={true} />);
    expect(screen.getByText('APPLICATION BLOCKED: FILE CHANGED SINCE SCAN.')).toBeTruthy();
  });

  it('displays human approval notice when verifier passes', () => {
    render(<FixSafetyBanner verifierStatus="passed" isStaleFile={false} />);
    expect(screen.getByText('HUMAN APPROVAL REQUIRED.')).toBeTruthy();
  });
});
