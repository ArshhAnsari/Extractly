import { Job } from '@/types/job';
import { useJobPolling } from '@/lib/hooks/useJobPolling';
import { SheetTable } from '@/components/sheet/SheetTable';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileWarning } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

interface SheetViewProps {
  job: Job;
}

export function SheetView({ job: initialJob }: SheetViewProps) {
  const { job } = useJobPolling(initialJob);

  const isProcessing = job.status === 'PROCESSING' || job.status === 'QUEUED';
  const isFailed = job.status === 'FAILED';
  const showTable = job.status === 'COMPLETE' || job.status === 'PARTIAL';

  if (isProcessing) {
    const progressValue = job.total_files > 0 
      ? Math.round(((job.done_files + job.failed_files) / job.total_files) * 100) 
      : 0;

    return (
      <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6 pt-20">
        <div className="bg-processing/10 p-4 rounded-full">
          <Loader2 className="h-10 w-10 text-processing animate-spin" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">Extracting Data...</h2>
          <p className="text-muted-foreground">This job is still processing. We are analyzing the documents and extracting the requested fields.</p>
        </div>
        
        <div className="w-full space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Progress</span>
            <span>{job.done_files + job.failed_files} / {job.total_files} files</span>
          </div>
          <Progress value={progressValue} className="h-3" />
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6 pt-20">
        <div className="bg-destructive/10 p-4 rounded-full">
          <FileWarning className="h-10 w-10 text-destructive" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">All Extractions Failed</h2>
          <p className="text-muted-foreground mb-6">The files may be corrupted, password-protected, or unreadable. No data could be extracted for this job.</p>
          <Link href="/jobs/create" className={buttonVariants()}>
            Create a New Job
          </Link>
        </div>
      </div>
    );
  }

  if (showTable) {
    return <SheetTable job={job} />;
  }

  // Fallback for DRAFT or unknown states
  return null;
}
