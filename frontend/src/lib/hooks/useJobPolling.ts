import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Job, JobStatus } from '@/types/job';
import { jobsApi } from '@/lib/api/jobs';
import { toast } from 'sonner';

/** Statuses where polling must stop. */
const TERMINAL = new Set<JobStatus>([
  'COMPLETE',
  'PARTIAL',
  'FAILED',
  'DRAFT',
]);

const isTerminal = (s: JobStatus) => TERMINAL.has(s);

/**
 * Poll a job's status with React Query.
 *
 * - While the job is non-terminal, refetches every 3 s.
 * - Stops automatically once a terminal status is received.
 * - Refetches on window focus so status stays accurate after tab switches.
 * - Fires a toast exactly once when the job reaches a terminal state.
 * - Calls `onJobUpdate` whenever the polled data changes (for parent state sync).
 *
 * @param initialJob  The job object fetched server-side or by the parent component.
 * @param onJobUpdate Optional callback fired with the latest Job shape on every update.
 */
export function useJobPolling(initialJob: Job, onJobUpdate?: (job: Job) => void) {
  const queryClient = useQueryClient();
  const previousStatusRef = useRef<JobStatus>(initialJob.status);
  const onJobUpdateRef = useRef(onJobUpdate);

  // Keep the callback ref stable so we never re-trigger the effect below.
  useEffect(() => {
    onJobUpdateRef.current = onJobUpdate;
  }, [onJobUpdate]);

  const { data: statusData } = useQuery({
    queryKey: ['job-status', initialJob.id],
    queryFn: async () => {
      const res = await jobsApi.getJobStatus(initialJob.id);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    // Poll every 3 s while non-terminal; disable the interval once terminal.
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? initialJob.status;
      return isTerminal(status) ? false : 3000;
    },
    // Keep polling even when the window is blurred (e.g. a background tab).
    refetchIntervalInBackground: false,
    // Stop retrying on confirmed errors so we don't spam a broken endpoint.
    retry: 1,
    // Seed the cache with the initial job so the first render is instant.
    initialData: {
      job_id: initialJob.id,
      status: initialJob.status,
      done_files: initialJob.done_files,
      failed_files: initialJob.failed_files,
      total_files: initialJob.total_files,
    },
    // Never consider this data stale while it is being actively polled.
    staleTime: 0,
    enabled: !isTerminal(initialJob.status),
  });

  // Merge the polled status fields back into the full Job shape.
  const job: Job = {
    ...initialJob,
    status: statusData?.status ?? initialJob.status,
    done_files: statusData?.done_files ?? initialJob.done_files,
    failed_files: statusData?.failed_files ?? initialJob.failed_files,
    total_files: statusData?.total_files ?? initialJob.total_files,
  };

  // Fire toast and parent callback on status transitions.
  useEffect(() => {
    const currentStatus = job.status;
    if (currentStatus === previousStatusRef.current) return;

    if (currentStatus === 'COMPLETE' || currentStatus === 'PARTIAL') {
      toast.success(`Job complete: ${job.name}`);
      // Invalidate the jobs list so the dashboard refreshes automatically.
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } else if (currentStatus === 'FAILED') {
      toast.error(`Job failed: ${job.name}`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }

    previousStatusRef.current = currentStatus;
    onJobUpdateRef.current?.(job);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status]);

  return { job };
}
