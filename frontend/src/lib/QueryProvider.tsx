'use client';

/**
 * React Query provider.
 * Wrap in a separate client component so the root layout (server component)
 * can import it without becoming a client component itself.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session — stable across hot-reloads in dev.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't retry on 4xx — those are definitive errors.
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
            // Re-fetch when the tab regains focus so users always see
            // up-to-date job status after switching tabs.
            refetchOnWindowFocus: true,
            staleTime: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
