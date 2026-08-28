import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffReviewer } from '../features/remediation/DiffReviewer';

describe('DiffReviewer Component', () => {
  it('renders diff stats, line numbers, and credential redaction', () => {
    const oldCode = 'const key = "sk_live_9921838194821095";';
    const newCode = 'const key = process.env.PROVIDER_KEY;';

    render(
      <DiffReviewer
        filePath="src/middleware/auth.ts"
        oldCode={oldCode}
        newCode={newCode}
        additionsCount={4}
        deletionsCount={2}
      />
    );

    expect(screen.getByText('src/middleware/auth.ts')).toBeTruthy();
    expect(screen.getByText('+4 additions')).toBeTruthy();
    expect(screen.getByText('-2 deletions')).toBeTruthy();
    expect(screen.queryByText('sk_live_9921838194821095')).toBeNull(); // Secret MUST be redacted!
    expect(screen.getByText('const key = "sk_live_••••••••";')).toBeTruthy();
  });
});
