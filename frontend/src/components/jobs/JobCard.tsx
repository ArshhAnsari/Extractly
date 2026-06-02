'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Job } from '@/types/job';
import { jobsApi } from '@/lib/api/jobs';
import { useJobPolling } from '@/lib/hooks/useJobPolling';
import { cn } from '@/lib/utils';
import { JobStatusPill } from './JobStatusPill';
import { MicroActivityLog } from './MicroActivityLog';
import { ExportButton } from '../export/ExportButton';
import { Progress } from '@/components/ui/progress';
import { Button, buttonVariants } from '@/components/ui/button';
import { MoreHorizontal, FileText, Calendar, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface JobCardProps {
  initialJob: Job;
  onUpdate?: (job: Job) => void;
  selected?: boolean;
  onSelect?: (jobId: string, checked: boolean) => void;
  selectionMode?: boolean;
}

export function JobCard({ initialJob, onUpdate, selected = false, onSelect, selectionMode = false }: JobCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const { job } = useJobPolling(initialJob, onUpdate);

  const formattedDate = new Date(job.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const isProcessing = job.status === 'PROCESSING' || job.status === 'QUEUED';
  const showActions = job.status === 'COMPLETE' || job.status === 'PARTIAL';
  
  const progressValue = job.total_files > 0 
    ? Math.round(((job.done_files + job.failed_files) / job.total_files) * 100) 
    : 0;

  const statusAccent: Record<string, string> = {
    COMPLETE: "border-t-success",
    PROCESSING: "border-t-processing",
    FAILED: "border-t-destructive",
    QUEUED: "border-t-warning",
    PARTIAL: "border-t-warning",
    DRAFT: "border-t-muted-foreground",
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this job? This will permanently remove all extracted data and files.')) return;
    
    setIsDeleting(true);
    try {
      await jobsApi.deleteJob(job.id);
      toast.success('Job deleted successfully');
      router.refresh(); // Refresh the Next.js cache to immediately remove the card from the grid
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      toast.error(e?.error?.message || e?.message || 'Failed to delete job. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <div 
      className={cn(
        "relative bg-surface border-x border-b border-t-4 rounded-xl p-5 flex flex-col h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group",
        statusAccent[job.status] || "border-t-border",
        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        isDeleting && "opacity-50 pointer-events-none"
      )}
    >
      {(showActions || selectionMode) && onSelect && (
        <div className={cn(
          "absolute top-4 left-4 z-10 transition-opacity",
          selected || selectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <Checkbox 
            checked={selected} 
            onCheckedChange={(c) => onSelect(job.id, c === true)}
            className="h-5 w-5 bg-background border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>
      )}
      
      <div className={cn("flex justify-between items-start mb-4", showActions ? "pl-8" : "")}>
        <JobStatusPill status={job.status} />
        
        <DropdownMenu>
          {/* FIX: Bypassed 'asChild' and applied buttonVariants directly to the trigger to guarantee ref-forwarding */}
          <DropdownMenuTrigger 
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }), 
              "h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border">
            <DropdownMenuItem 
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer font-medium"
            >
              Delete Job
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-6 flex-1">
        <h3 className="text-lg font-heading font-bold text-foreground mb-2 line-clamp-2" title={job.name}>
          {job.name}
        </h3>
        
        <div className="flex items-center text-sm text-muted-foreground gap-3">
          <div className="flex items-center">
            <FileText className="h-3 w-3 mr-1.5" />
            <span>{job.total_files} files</span>
          </div>
          <span>&middot;</span>
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-1.5" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="mt-auto pt-4 border-t border-border/50">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Progress</span>
            <span className="font-mono text-foreground">{job.done_files + job.failed_files} / {job.total_files}</span>
          </div>
          <Progress value={progressValue} className="h-2 bg-background [&>div]:bg-processing" />
          <MicroActivityLog status={job.status} doneFiles={job.done_files} />
        </div>
      )}

      {showActions && (
        <div className="mt-auto pt-4 flex items-center justify-between gap-3 border-t border-border/50">
          <Button variant="secondary" size="sm" asChild className="flex-1 bg-background hover:bg-muted border border-border">
            <Link href={`/jobs/${job.id}`}>View Sheet</Link>
          </Button>
          <ExportButton jobId={job.id} jobName={job.name} />
        </div>
      )}

      {job.status === 'FAILED' && (
        <div className="mt-auto pt-4 border-t border-border/50">
          <Button variant="destructive" size="sm" asChild className="w-full">
            <Link href="/jobs/create">Create New Job</Link>
          </Button>
        </div>
      )}

      {job.status === 'DRAFT' && (
        <div className="mt-auto pt-4 border-t border-border/50">
          <Button variant="secondary" size="sm" asChild className="w-full">
            <Link href="/jobs/create">Resume Setup</Link>
          </Button>
        </div>
      )}
    </div>
  );
}