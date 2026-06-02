'use client';

import { useQuery } from '@tanstack/react-query';
import { Job } from '@/types/job';
import { jobsApi } from '@/lib/api/jobs';
import { JobCardGrid } from '@/components/jobs/JobCardGrid';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MergeExportModal } from '@/components/export/MergeExportModal';
import { Combine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function DashboardPage() {
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await jobsApi.getJobs();
      if (!res.success) throw new Error(res.error.message);
      // Sort newest-first
      return [...res.data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    // Refresh the list when the user returns to the tab.
    refetchOnWindowFocus: true,
  });

  // Called by JobCard when polling updates a job — merges into the cached list.
  const handleJobUpdate = (updatedJob: Job) => {
    // No-op: React Query invalidation in useJobPolling already triggers a
    // re-fetch of the 'jobs' query on terminal-status transition.
    // For intermediate (PROCESSING) updates we let each card manage its own
    // display via useJobPolling without touching the list cache.
    void updatedJob;
  };

  const handleSelectJob = (jobId: string, checked: boolean) => {
    setSelectedJobIds(prev =>
      checked ? [...prev, jobId] : prev.filter(id => id !== jobId)
    );
  };

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'COMPLETE').length;
  const processingJobs = jobs.filter(
    j => j.status === 'PROCESSING' || j.status === 'QUEUED'
  ).length;
  const failedJobs = jobs.filter(
    j => j.status === 'FAILED' || j.status === 'PARTIAL'
  ).length;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full relative min-h-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-heading font-bold text-foreground">Dashboard</h1>
        <Button
          asChild
          size="lg"
          className="bg-primary hover:bg-primary-hover shadow-md hover:shadow-primary/20 transition-all hover:-translate-y-0.5"
        >
          <Link href="/jobs/create">
            <Plus className="mr-2 h-4 w-4" /> Create New Job
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 rounded-xl bg-surface border border-border shimmer" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-64 rounded-xl bg-surface border border-border shimmer" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="panel p-5 rounded-xl flex flex-col">
              <span className="text-sm font-medium text-muted-foreground mb-1">Total Jobs</span>
              <span className="text-3xl font-bold text-foreground">{totalJobs}</span>
            </div>
            <div className="panel p-5 rounded-xl flex flex-col">
              <span className="text-sm font-medium text-muted-foreground mb-1">Completed</span>
              <span className="text-3xl font-bold text-success">{completedJobs}</span>
            </div>
            <div className="panel p-5 rounded-xl flex flex-col">
              <span className="text-sm font-medium text-muted-foreground mb-1">Processing</span>
              <span className="text-3xl font-bold text-processing">{processingJobs}</span>
            </div>
            <div className="panel p-5 rounded-xl flex flex-col">
              <span className="text-sm font-medium text-muted-foreground mb-1">Failed / Partial</span>
              <span className="text-3xl font-bold text-destructive">{failedJobs}</span>
            </div>
          </div>

          <JobCardGrid
            jobs={jobs}
            onJobUpdate={handleJobUpdate}
            selectedJobIds={selectedJobIds}
            onSelectJob={handleSelectJob}
          />
        </>
      )}

      {selectedJobIds.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-surface border border-border shadow-2xl rounded-full px-6 py-3 flex items-center space-x-6 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="font-medium text-sm">
            {selectedJobIds.length} jobs selected
          </span>
          <Button onClick={() => setIsMergeModalOpen(true)} className="rounded-full">
            <Combine className="mr-2 h-4 w-4" /> Merge &amp; Export
          </Button>
        </div>
      )}

      <MergeExportModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        selectedJobIds={selectedJobIds}
      />
    </div>
  );
}
