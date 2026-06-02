'use client';

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useUploadStore } from '@/lib/stores/uploadStore';
import { Button } from '@/components/ui/button';
import { formatBytes, cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, Play, RefreshCw, X, UploadCloud } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface StepUploadProps {
  jobId: string;
  onProcess: () => void;
}

export function StepUpload({ jobId, onProcess }: StepUploadProps) {
  const { items, addUploads, retryUpload, removeUpload, startProcessingJob } = useUploadStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const jobItems = items.filter(i => i.jobId === jobId);
  
  const allSuccess = jobItems.length > 0 && jobItems.every(i => i.status === 'SUCCESS');
  const hasErrors = jobItems.some(i => i.status === 'ERROR');
  const isUploading = jobItems.some(i =>
    ['PENDING', 'SIGNING', 'UPLOADING', 'REGISTERING'].includes(i.status)
  );
  const uploadClosed = allSuccess || isProcessing;

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      await startProcessingJob(jobId);
      onProcess(); // redirect to dashboard
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start extraction.');
      setIsProcessing(false);
    }
  };

  const addValidFiles = useCallback((files: File[]) => {
    if (uploadClosed) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ];

    const slotsLeft = Math.max(0, 100 - jobItems.length);
    const filesToAdd = files
      .filter(file => allowedTypes.includes(file.type))
      .slice(0, slotsLeft);

    if (filesToAdd.length > 0) {
      addUploads(jobId, filesToAdd);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addUploads, jobId, jobItems.length, uploadClosed]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addValidFiles(Array.from(event.dataTransfer.files));
  }, [addValidFiles]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addValidFiles(Array.from(event.target.files));
    }
  };

  return (
    <div className="space-y-8 bg-surface/30 backdrop-blur-md border border-white/5 p-6 sm:p-10 rounded-3xl shadow-xl mt-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-primary/10 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 -translate-x-1/4" />
      
      <div className="relative z-10">
        <h2 className="text-3xl font-heading font-bold mb-3 tracking-tight text-foreground">Upload & Process</h2>
        <p className="text-muted-foreground text-sm max-w-lg leading-relaxed">Securely upload your CV files. They will be processed automatically using the fields you just defined.</p>
      </div>

      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 relative z-10 backdrop-blur-sm",
          uploadClosed
            ? "border-white/5 bg-background/20 opacity-60 cursor-not-allowed"
            : isDragging
            ? "border-primary bg-primary/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]"
            : "border-white/10 bg-background/40 hover:border-primary/50 hover:bg-surface/80 shadow-inner"
        )}
        onClick={() => {
          if (!uploadClosed) fileInputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (uploadClosed) return;
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <motion.div 
          animate={isDragging ? { y: -5, scale: 1.1 } : { y: 0, scale: 1 }}
          className={cn("p-4 rounded-full mb-4", isDragging ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground")}
        >
          <UploadCloud className="h-8 w-8" />
        </motion.div>
        <p className="font-bold text-foreground text-lg mb-1 tracking-tight">Drop CV files here or click to browse</p>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Supports PDF, DOCX, JPG, PNG (Max 100 files)</p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          disabled={uploadClosed}
          onChange={handleFileChange}
        />
      </motion.div>

      <div className="bg-background/40 backdrop-blur-sm border border-white/5 rounded-2xl p-2 sm:p-4 max-h-[300px] overflow-y-auto space-y-2 relative z-10 custom-scrollbar shadow-inner">
        {jobItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/60">
            <div className="h-12 w-12 rounded-full border border-dashed border-white/10 flex items-center justify-center mb-3">
              <UploadCloud className="h-5 w-5 opacity-50" />
            </div>
            <p className="text-sm font-medium">No files added yet.</p>
          </div>
        )}
        <AnimatePresence>
          {jobItems.map((item) => (
            <motion.div 
              key={item.id} 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, height: 0, margin: 0, padding: 0 }}
              layout
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border border-white/5 rounded-xl bg-surface/50 hover:bg-surface hover:border-primary/30 transition-all shadow-sm group"
            >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 overflow-hidden flex-1">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
                item.status === 'SUCCESS' ? "bg-success/10 border-success/20 text-success" : 
                item.status === 'ERROR' ? "bg-destructive/10 border-destructive/20 text-destructive" :
                "bg-processing/10 border-processing/20 text-processing"
              )}>
                {item.status === 'SUCCESS' && <CheckCircle2 className="h-5 w-5" />}
                {item.status === 'ERROR' && <XCircle className="h-5 w-5" />}
                {['PENDING', 'SIGNING', 'UPLOADING', 'REGISTERING'].includes(item.status) && (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
              </div>
              
              <div className="truncate flex-1 min-w-0">
                <p className="font-semibold text-sm truncate text-foreground">{item.file.name}</p>
                <div className="flex items-center text-xs gap-2 mt-1 font-medium">
                  <span className="text-muted-foreground">{formatBytes(item.file.size)}</span>
                  {item.status === 'SIGNING' && (
                    <span className="text-processing bg-processing/10 px-2 rounded-full border border-processing/20">Signing</span>
                  )}
                  {item.status === 'UPLOADING' && (
                    <span className="text-processing bg-processing/10 px-2 rounded-full border border-processing/20">{item.progress}%</span>
                  )}
                  {item.status === 'REGISTERING' && (
                    <span className="text-processing bg-processing/10 px-2 rounded-full border border-processing/20">Registering</span>
                  )}
                  {item.status === 'SUCCESS' && (
                    <span className="text-success bg-success/10 px-2 rounded-full border border-success/20">Uploaded</span>
                  )}
                  {item.status === 'ERROR' && (
                    <span className="text-destructive bg-destructive/10 px-2 rounded-full border border-destructive/20 truncate">{item.error || 'Failed'}</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-3 sm:mt-0 ml-0 sm:ml-4 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                {item.status === 'UPLOADING' && (
                  <Progress value={item.progress} className="w-24 h-1.5 hidden sm:block bg-background border border-white/5" indicatorClassName="bg-primary shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                )}
                {item.status === 'ERROR' && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => retryUpload(item.id)} className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg">
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeUpload(item.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/20 rounded-lg transition-colors">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex justify-end pt-4 border-t border-white/5 relative z-10">
        <Button 
          size="lg" 
          onClick={handleProcess} 
          disabled={!allSuccess || hasErrors || isUploading || isProcessing}
          className="min-w-[220px] h-12 text-md font-medium bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 rounded-xl"
        >
          {isProcessing ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Initializing Engine...</>
          ) : (
            <><Play className="mr-2 h-5 w-5" /> Start Extraction</>
          )}
        </Button>
      </div>
    </div>
  );
}
