import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntegrationsView } from '../features/settings/IntegrationsView';
import { Integration } from '@sirius/types';

const mockIntegrations: Integration[] = [
  {
    id: 'int-01',
    name: 'GitHub Cloud & Enterprise',
    type: 'github',
    category: 'source_control',
    description: 'Repository AST scanning, PR inline comments, and commit status checks.',
    status: 'connected',
  },
];

describe('IntegrationsView Component', () => {
  it('renders Integrations Control Center grid and CI/CD code snippet generator', () => {
    render(
      <IntegrationsView
        integrations={mockIntegrations}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );

    expect(screen.getByText('Integrations Control Center')).toBeTruthy();
    expect(screen.getByText('GitHub Cloud & Enterprise')).toBeTruthy();
    expect(screen.getByText('CI/CD AUTOMATION STEP SNIPPET')).toBeTruthy();
  });
});
