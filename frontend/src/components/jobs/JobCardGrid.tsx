'use client';

import { Job } from '@/types/job';
import { JobCard } from './JobCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FileStack } from 'lucide-react';

interface JobCardGridProps {
  jobs: Job[];
  onJobUpdate?: (job: Job) => void;
  selectedJobIds?: string[];
  onSelectJob?: (jobId: string, checked: boolean) => void;
}

export function JobCardGrid({ jobs, onJobUpdate, selectedJobIds = [], onSelectJob }: JobCardGridProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center h-full min-h-[60vh] max-w-4xl mx-auto">
        <div className="panel p-10 rounded-3xl flex flex-col items-center w-full relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
          
          <div className="bg-primary/10 border border-primary/20 h-20 w-20 rounded-2xl flex items-center justify-center mb-8 shadow-inner">
            <FileStack className="h-10 w-10 text-primary" />
          </div>
          
          <h2 className="text-3xl font-heading font-bold mb-4 text-foreground">Your workspace is ready</h2>
          <p className="text-lg text-muted-foreground max-w-lg mb-10 leading-relaxed">
            Upload CVs, define fields, and export clean structured data in minutes. No more manual entry.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-6 mb-12 text-sm font-medium text-muted-foreground w-full justify-center">
            <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-surface-elevated flex items-center justify-center border border-border"><span className="text-primary font-bold">1</span></div> Upload</div>
            <div className="h-px w-8 bg-border hidden sm:block" />
            <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-surface-elevated flex items-center justify-center border border-border"><span className="text-primary font-bold">2</span></div> Extract</div>
            <div className="h-px w-8 bg-border hidden sm:block" />
            <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-surface-elevated flex items-center justify-center border border-border"><span className="text-primary font-bold">3</span></div> Export</div>
          </div>

          <Button size="lg" asChild className="h-14 px-10 text-lg bg-primary hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all hover:-translate-y-1">
            <Link href="/jobs/create">
              Create Your First Job
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {jobs.map(job => (
        <JobCard 
          key={job.id} 
          initialJob={job} 
          onUpdate={onJobUpdate} 
          selected={selectedJobIds.includes(job.id)}
          onSelect={onSelectJob}
          selectionMode={selectedJobIds.length > 0}
        />
      ))}
    </div>
  );
}