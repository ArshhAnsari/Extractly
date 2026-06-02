'use client';

import { JobSetupWizard } from '@/components/wizard/JobSetupWizard';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CreateJobPage() {
  const router = useRouter();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md px-6 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-heading font-bold">Create New Job</h1>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-sm">
            <JobSetupWizard onComplete={() => {}} />
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
