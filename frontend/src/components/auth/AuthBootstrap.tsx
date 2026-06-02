'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { authApi } from '@/lib/api/auth';
let _bootstrapFired = false;

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { setToken, setBootstrapping } = useAuthStore();

  useEffect(() => {
    if (_bootstrapFired) return;
    _bootstrapFired = true;

    const bootstrap = async () => {
      try {
        const token = await authApi.refresh();
        if (token) setToken(token);
      } catch {
        // no session
      } finally {
        setBootstrapping(false);
      }
    };

    bootstrap();
  }, [setToken, setBootstrapping]);

  return <>{children}</>;
}