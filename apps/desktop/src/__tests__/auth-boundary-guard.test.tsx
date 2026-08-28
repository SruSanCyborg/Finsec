import { describe, it, expect } from 'vitest';
import { useSessionStore } from '@sirius/state';
import { TeamMember } from '@sirius/types';

const mockUser: TeamMember = {
  id: 'usr-001',
  name: 'Shivam Pandey',
  email: 'shivam.pandey@finsec.dev',
  role: 'security_engineer',
};

describe('Authentication Boundary Guard Suite', () => {
  it('manages session store authentication lifecycle and token clearance cleanly', () => {
    const store = useSessionStore.getState();

    // 1. Initial State
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(useSessionStore.getState().token).toBeNull();
    expect(useSessionStore.getState().currentUser).toBeNull();

    // 2. Set Session
    store.setSession('token-abc-123', mockUser);
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useSessionStore.getState().token).toBe('token-abc-123');
    expect(useSessionStore.getState().currentUser?.name).toBe('Shivam Pandey');

    // 3. Clear Session
    store.clearSession();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(useSessionStore.getState().token).toBeNull();
    expect(useSessionStore.getState().currentUser).toBeNull();
  });
});
