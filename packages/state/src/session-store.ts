import { create } from 'zustand';
import { TeamMember } from '@sirius/types';

export interface SessionState {
  isAuthenticated: boolean;
  token: string | null;
  currentUser: TeamMember | null;
  setSession: (token: string, user: TeamMember) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  isAuthenticated: false,
  token: null,
  currentUser: null,
  setSession: (token, currentUser) => set({ isAuthenticated: true, token, currentUser }),
  clearSession: () => set({ isAuthenticated: false, token: null, currentUser: null }),
}));
