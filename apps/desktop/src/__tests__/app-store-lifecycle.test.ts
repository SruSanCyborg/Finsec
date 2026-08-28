import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@sirius/state';

describe('useAppStore Onboarding Lifecycle & Sidebar State', () => {
  beforeEach(() => {
    useAppStore.getState().resetOnboarding();
  });

  it('initializes in onboarding_welcome phase', () => {
    expect(useAppStore.getState().lifecyclePhase).toBe('onboarding_welcome');
    expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
  });

  it('transitions lifecycle phases correctly', () => {
    useAppStore.getState().setLifecyclePhase('onboarding_auth');
    expect(useAppStore.getState().lifecyclePhase).toBe('onboarding_auth');

    useAppStore.getState().completeOnboarding();
    expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    expect(useAppStore.getState().lifecyclePhase).toBe('ready');
  });

  it('toggles sidebar collapse state', () => {
    expect(useAppStore.getState().isSidebarCollapsed).toBe(false);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().isSidebarCollapsed).toBe(true);
  });
});
