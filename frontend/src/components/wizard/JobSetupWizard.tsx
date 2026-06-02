'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { StepJobName } from './StepJobName';
import { StepFieldSelector } from './StepFieldSelector';
import { StepUpload } from './StepUpload';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldDefinition } from '@/types/job';
import { useGuestStore } from '@/lib/stores/guestStore';
import { useUploadStore } from '@/lib/stores/uploadStore';
import { jobsApi } from '@/lib/api/jobs';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface JobSetupWizardProps {
  onComplete?: () => void;
}

export function JobSetupWizard({ onComplete }: JobSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [jobName, setJobName] = useState('');
  const [activeJobId, setActiveJobId] = useState('');
  const { pendingFiles, clearFiles } = useGuestStore();
  const { addUploads } = useUploadStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleNameNext = (name: string) => {
    setJobName(name);
    setStep(2);
  };

  const handleFieldsNext = async (fields: FieldDefinition[]) => {
    // If we are on landing page flow, we have pending files. If on /jobs/create, maybe we show step 3 or let user upload later.
    // For now, prompt says "If triggered from landing: files are already in guestStore, skip to confirm. If from /jobs/create: show upload zone here."
    // But then "Upload flow kicks off using pendingFiles from guestStore. Redirect to /dashboard on process trigger"

    try {
      // 1. Create Job
      const jobRes = await jobsApi.createJob(jobName, fields);
      if (!jobRes.success) {
        throw new Error(jobRes.error.message);
      }

      const jobId = jobRes.data.id;

      toast.success("Job created successfully.");

      // If we have pending files (landing flow), we should trigger the upload process.
      // Usually, we'd fire an event or call an upload manager here.
      // For V1, we can redirect to the dashboard and let a global upload manager handle it, 
      // or handle the upload right here before redirecting. The prompt says: "Wait for Cloudinary webhooks... Redirect to /dashboard"
      // Wait, "Upload Toast Component... Drive-style. Fixed bottom-right... Appears as first file starts uploading..."
      // This suggests the upload happens in the background while the user is redirected, OR we show the toast immediately and redirect.

      // Start uploads
      if (pendingFiles.length > 0) {
        addUploads(jobId, pendingFiles);
        clearFiles();
      }

      setActiveJobId(jobId);
      setStep(3); // Go to upload step

    } catch (err: unknown) {
      const error = err as { error?: { message?: string }; message?: string };
      toast.error(error.error?.message || error.message || "Something went wrong.");
    }
  };

  const handleProcessFinish = () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    if (onComplete) onComplete();
    router.push('/dashboard');
  };

  const steps = [
    { id: 1, label: "Name" },
    { id: 2, label: "Fields" },
    { id: 3, label: "Upload" },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto w-full relative z-10">
      <div className="mb-10 w-full max-w-md mx-auto">
        <div className="flex items-start justify-between relative z-0">
          <div className="absolute left-0 top-5 transform -translate-y-1/2 w-full h-1 bg-surface-elevated/50 border border-white/5 rounded-full z-0 backdrop-blur-sm" />
          <div
            className="absolute left-0 top-5 transform -translate-y-1/2 h-1 bg-primary rounded-full z-0 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
          />

          {steps.map((s) => {
            const isCompleted = step > s.id;
            const isActive = step === s.id;

            return (
              <div key={s.id} className="relative z-10 flex flex-col items-center">
                <motion.div
                  initial={false}
                  animate={{
                    scale: isActive ? 1.15 : 1,
                    backgroundColor: isCompleted ? 'var(--primary)' : isActive ? 'transparent' : 'rgba(255,255,255,0.05)',
                    borderColor: isCompleted || isActive ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                  }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm border-2 backdrop-blur-md transition-shadow",
                    isCompleted ? "text-white shadow-lg shadow-primary/30" :
                      isActive ? "text-primary shadow-[0_0_20px_rgba(99,102,241,0.4)]" :
                        "text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : s.id}
                </motion.div>
                <span className={cn(
                  "mt-3 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <StepJobName onNext={handleNameNext} defaultName={jobName} />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <StepFieldSelector
                onNext={handleFieldsNext}
                onBack={() => setStep(1)}
              />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <StepUpload
                jobId={activeJobId}
                onProcess={handleProcessFinish}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
