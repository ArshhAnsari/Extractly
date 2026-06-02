'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobNameSchema } from '@/lib/validators/jobSchemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight } from 'lucide-react';

interface StepJobNameProps {
  onNext: (name: string) => void;
  defaultName?: string;
}

export function StepJobName({ onNext, defaultName = '' }: StepJobNameProps) {
  const form = useForm({
    resolver: zodResolver(jobNameSchema),
    defaultValues: { name: defaultName },
  });

  const onSubmit = (values: { name: string }) => {
    onNext(values.name);
  };

  return (
    <div className="space-y-8 bg-surface/30 backdrop-blur-md border border-white/5 p-6 sm:p-10 rounded-3xl shadow-xl mt-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4" />
      
      <div className="relative z-10">
        <h2 className="text-3xl font-heading font-bold mb-3 tracking-tight text-foreground">Name Your Job</h2>
        <p className="text-muted-foreground text-sm max-w-md leading-relaxed">Give this extraction job a descriptive name (e.g., <span className="text-foreground/80 font-medium">React Devs — March 2026</span>) to find it easily later.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 relative z-10">
        <div className="space-y-3">
          <Label htmlFor="jobName" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Job Name</Label>
          <Input 
            id="jobName" 
            placeholder="Enter job name..." 
            className="text-lg py-7 px-5 bg-background/50 border-white/10 focus-visible:ring-primary backdrop-blur-sm transition-all hover:bg-background/80 rounded-xl shadow-inner"
            autoFocus
            {...form.register('name')} 
          />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive mt-2">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-white/5">
          <Button type="submit" size="lg" className="h-12 px-8 text-md font-medium bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0 transition-all group rounded-xl">
            Continue <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </form>
    </div>
  );
}
