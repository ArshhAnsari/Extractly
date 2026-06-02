import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  fullName: string;
}

interface AuthStore {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: User | null;
  isBootstrapping: boolean;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  setBootstrapping: (val: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      accessToken: null,
      user: null,
      isBootstrapping: true,
      setToken: (token) => set({ accessToken: token, isAuthenticated: !!token }),
      setUser: (user) => set({ user }),
      setBootstrapping: (val) => set({ isBootstrapping: val }),
      logout: () => set({ isAuthenticated: false, accessToken: null, user: null }),
    }),
    {
      name: 'cv-extractor-auth',
      partialize: (state) => ({ user: state.user }), // only user persists, token stays memory-only
    }
  )
);