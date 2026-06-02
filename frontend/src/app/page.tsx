'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { LandingNav } from '@/components/landing/LandingNav';
import { HeroDropzone } from '@/components/landing/HeroDropzone';
import { MarketingFeatures } from '@/components/landing/MarketingFeatures';

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return null; // Or a loading skeleton while redirecting
  }

  return (
    <main className="min-h-screen flex flex-col">
      <LandingNav />
      <HeroDropzone />
      <MarketingFeatures />
    </main>
  );
}
