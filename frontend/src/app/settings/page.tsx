'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SettingsRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const google = searchParams.get('google');
    if (google) {
      router.replace(`/dashboard/settings?google=${google}`);
    } else {
      router.replace('/dashboard/settings');
    }
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
      Redirecting...
    </div>
  );
}

export default function SettingsRedirect() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen" />}>
      <SettingsRedirectContent />
    </Suspense>
  );
}