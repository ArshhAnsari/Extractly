import { Badge } from '@/components/ui/badge';
import { JobStatus } from '@/types/job';
import { cn } from '@/lib/utils';

export function JobStatusPill({ status, className }: { status: JobStatus; className?: string }) {
  const statusConfig: Record<JobStatus, { class: string; label: string }> = {
    DRAFT: { class: 'bg-muted text-muted-foreground hover:bg-muted', label: 'Draft' },
    QUEUED: { class: 'bg-warning/15 text-warning hover:bg-warning/20', label: 'Queued' },
    PROCESSING: { class: 'bg-processing/15 text-processing hover:bg-processing/20 shimmer', label: 'Processing' },
    COMPLETE: { class: 'bg-success/15 text-success hover:bg-success/20', label: 'Complete' },
    PARTIAL: { class: 'bg-warning/15 text-warning hover:bg-warning/20', label: 'Partial' },
    FAILED: { class: 'bg-destructive/15 text-destructive hover:bg-destructive/20', label: 'Failed' },
  };

  const config = statusConfig[status];

  return (
    <Badge 
      variant="outline" 
      className={cn("border-0 font-bold uppercase tracking-wider text-[10px] px-2.5 py-0.5", config.class, className)}
    >
      {config.label}
    </Badge>
  );
}
