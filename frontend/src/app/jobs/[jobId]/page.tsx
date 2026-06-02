'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '@/lib/api/jobs';
import { SheetView } from '@/components/sheet/SheetView';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/export/ExportButton';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function JobSheetPage() {
  const { jobId } = useParams() as { jobId: string };
  const router = useRouter();

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const res = await jobsApi.getJob(jobId);
      if (!res.success) {
        // Redirect on 404 so we don't show a broken page.
        if (res.error.code === 'NOT_FOUND') {
          router.push('/dashboard');
        }
        throw new Error(res.error.message);
      }
      return res.data;
    },
    // Cache the job detail for 30 s — the sheet data rarely changes mid-view.
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="flex flex-col min-h-screen bg-background">
          <header className="h-16 border-b border-border px-6 flex items-center">
            <Skeleton className="h-6 w-32 shimmer bg-surface border border-border" />
          </header>
          <div className="p-6">
            <Skeleton className="h-[600px] w-full rounded-xl shimmer bg-surface border border-border" />
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (!job) return null;

  return (
    <AuthGuard>
      <div className="flex flex-col min-h-screen bg-background">
        <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-heading font-bold">{job.name}</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="secondary" onClick={() => router.push('/jobs/create')}>
              Create Job
            </Button>
            {(job.status === 'COMPLETE' || job.status === 'PARTIAL') && (
              <ExportButton jobId={job.id} jobName={job.name} />
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-6">
          <SheetView job={job} />
        </main>
      </div>
    </AuthGuard>
  );
}
