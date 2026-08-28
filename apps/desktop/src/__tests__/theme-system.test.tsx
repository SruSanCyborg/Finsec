import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useUIStore } from '@sirius/state';
import { WorkspaceSettings } from '@sirius/types';
import { TopBar } from '../shell/TopBar';
import { GeneralSettings } from '../features/settings/GeneralSettings';

const mockWorkspaceSettings: WorkspaceSettings = {
  workspaceName: 'FinSec Production Core',
  defaultProjectId: 'prj-finsec-core-01',
  defaultBranch: 'main',
  timezone: 'UTC',
  dateFormat: 'YYYY-MM-DD',
  apiEndpoint: 'https://api.finsec.dev/v1',
  environment: 'production',
  apiKeyMasked: '••••••••••••3A9F',
  connectionStatus: 'connected',
  latencyMs: 18,
  policy: {
    severityThreshold: 'high',
    failOn: 'new',
  },
  notificationPreferences: {
    criticalAlerts: true,
    scanCompletion: true,
    complianceDegradation: true,
    securityBreach: true,
  },
};

describe('Theme System Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useUIStore.getState().setThemeMode('day');
    });
  });

  it('initializes with default day theme and updates document attribute', () => {
    expect(useUIStore.getState().themeMode).toBe('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });

  it('toggles theme state, localStorage, and document data-theme attribute', () => {
    act(() => {
      useUIStore.getState().toggleThemeMode();
    });

    expect(useUIStore.getState().themeMode).toBe('night');
    expect(localStorage.getItem('sirius_theme')).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');

    act(() => {
      useUIStore.getState().toggleThemeMode();
    });

    expect(useUIStore.getState().themeMode).toBe('day');
    expect(localStorage.getItem('sirius_theme')).toBe('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });

  it('toggles theme via TopBar theme button', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <TopBar />
      </MemoryRouter>
    );

    const themeButton = screen.getByLabelText('Switch to Night Mode');
    expect(themeButton).toBeTruthy();

    act(() => {
      fireEvent.click(themeButton);
    });

    expect(useUIStore.getState().themeMode).toBe('night');
    expect(screen.getByLabelText('Switch to Day Mode')).toBeTruthy();
  });

  it('synchronizes theme selection between Settings and TopBar (single source of truth)', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <div>
          <TopBar />
          <GeneralSettings settings={mockWorkspaceSettings} onSave={async () => {}} />
        </div>
      </MemoryRouter>
    );

    const nightButton = screen.getByText('Night Mode');
    act(() => {
      fireEvent.click(nightButton);
    });

    expect(useUIStore.getState().themeMode).toBe('night');
    expect(screen.getByLabelText('Switch to Day Mode')).toBeTruthy();
  });
});
