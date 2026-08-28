import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffPreviewCard } from '../features/cerebus/DiffPreviewCard';

describe('DiffPreviewCard Component', () => {
  it('renders read-only code diff with credential redaction', () => {
    const oldCode = 'const key = "sk_live_9921838194821095";';
    const newCode = 'const key = process.env.PROVIDER_KEY;';

    render(<DiffPreviewCard filePath="src/config/auth.ts" oldCode={oldCode} newCode={newCode} />);

    expect(screen.getByText(/Proposed Diff Preview: src\/config\/auth.ts/i)).toBeTruthy();
    expect(screen.queryByText('sk_live_9921838194821095')).toBeNull(); // Secret MUST be redacted!
    expect(screen.getByText('const key = "sk_live_••••••••";')).toBeTruthy();
    expect(screen.getByText('const key = process.env.PROVIDER_KEY;')).toBeTruthy();
  });
});
