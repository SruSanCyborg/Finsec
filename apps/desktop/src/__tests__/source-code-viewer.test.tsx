import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceCodeViewer } from '../features/findings/SourceCodeViewer';

describe('SourceCodeViewer Component', () => {
  it('renders source code snippet and redacts sensitive credentials', () => {
    const rawCode = 'const secret = "sk_live_9921838194821095";';
    render(
      <SourceCodeViewer
        filePath="src/config/auth.ts"
        startLine={42}
        codeSnippet={rawCode}
      />
    );

    expect(screen.getByText('src/config/auth.ts')).toBeTruthy();
    expect(screen.getByText(':42')).toBeTruthy();
    expect(screen.queryByText('sk_live_9921838194821095')).toBeNull(); // Secret MUST be redacted!
    expect(screen.getByText('const secret = "sk_live_••••••••";')).toBeTruthy();
  });
});
