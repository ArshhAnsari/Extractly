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

  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setBootstrapping: (value: boolean) => void;
  logout: () => void;
}

/**
 * Frontend-only session indicator.
 *
 * NOT a JWT.
 * NOT sensitive.
 * Used only by Next.js middleware to determine
 * whether the user should access protected routes.
 */
const setSessionCookie = () => {
  if (typeof document === 'undefined') return;

  const isHttps = window.location.protocol === 'https:';

  document.cookie = [
    'cv_session=1',
    'Path=/',
    'SameSite=Strict',
    ...(isHttps ? ['Secure'] : []),
  ].join('; ');
};

const clearSessionCookie = () => {
  if (typeof document === 'undefined') return;

  const isHttps = window.location.protocol === 'https:';

  document.cookie = [
    'cv_session=',
    'Path=/',
    'Max-Age=0',
    'SameSite=Strict',
    ...(isHttps ? ['Secure'] : []),
  ].join('; ');
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      accessToken: null,
      user: null,
      isBootstrapping: true,

      setToken: (token) => {
        set({
          accessToken: token,
          isAuthenticated: !!token,
        });

        if (token) {
          setSessionCookie();
        } else {
          clearSessionCookie();
        }
      },

      setUser: (user) => {
        set({ user });
      },

      setBootstrapping: (value) => {
        set({ isBootstrapping: value });
      },

      logout: () => {
        clearSessionCookie();

        set({
          isAuthenticated: false,
          accessToken: null,
          user: null,
        });
      },
    }),
    {
      name: 'cv-extractor-auth',

      // Persist only user profile.
      // Access token stays memory-only.
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);