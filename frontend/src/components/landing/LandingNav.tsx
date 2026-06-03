'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export function LandingNav() {
  const handleStartExtracting = () => {
    const dropzone = document.getElementById('hero-dropzone');
    if (dropzone) {
      dropzone.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border/70 bg-background/75 backdrop-blur-xl transition-all">
      <div className="flex items-center space-x-3">
  <Link href="/" className="flex items-center">
    <Image
      src="/Extractly_logo.png"
      alt="Extractly Logo"
      width={250}
      height={80}
      className="w-36 sm:w-44 h-auto object-contain mix-blend-screen"
      priority
    />
  </Link>
</div>
      <div className="flex items-center space-x-4">
        <Button variant="ghost" asChild className="hover:bg-surface-elevated text-muted-foreground hover:text-foreground">
          <Link href="/login">Sign In</Link>
        </Button>
        <Button onClick={handleStartExtracting} className="group bg-primary hover:bg-primary-hover shadow-md hover:shadow-primary/20 transition-all hover:-translate-y-0.5">
          Start Extracting
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </nav>
  );
}
