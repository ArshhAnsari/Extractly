'use client';

import { useState, useEffect } from 'react';
import { useUploadStore } from '@/lib/stores/uploadStore';
import { formatBytes, cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

export function UploadToast() {
  const { items, isMinimized, setMinimized, removeUpload, retryUpload } = useUploadStore();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (items.length > 0 && !shouldRender) {
      setShouldRender(true);
    }
    
    // Auto collapse after 3s if all complete or failed
    if (items.length > 0) {
      const allDone = items.every(i => i.status === 'SUCCESS' || i.status === 'ERROR');
      if (allDone && !isMinimized) {
        const timer = setTimeout(() => {
          setMinimized(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
    
    if (items.length === 0 && shouldRender) {
      setShouldRender(false);
    }
  }, [items, isMinimized, shouldRender, setMinimized]);

  if (!shouldRender || items.length === 0) return null;

  const uploadingCount = items.filter(i =>
    ['PENDING', 'SIGNING', 'UPLOADING', 'REGISTERING'].includes(i.status)
  ).length;
  const successCount = items.filter(i => i.status === 'SUCCESS').length;
  const errorCount = items.filter(i => i.status === 'ERROR').length;
  
  let headerText = 'Uploading files...';
  if (uploadingCount === 0) {
    if (errorCount > 0) headerText = `${successCount} uploaded, ${errorCount} failed`;
    else headerText = `${successCount} uploads complete`;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[340px] bg-surface-elevated border border-border rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col transition-all duration-500 ease-out translate-y-0">
      <div 
        className="bg-surface px-4 py-3 border-b border-border flex items-center justify-between cursor-pointer hover:bg-surface-elevated transition-colors"
        onClick={() => setMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
           {uploadingCount > 0 ? <Loader2 className="h-4 w-4 text-processing animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
           <span className="font-semibold text-sm text-foreground">{headerText}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
          {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {!isMinimized && (
        <div className="max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface transition-colors group">
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center shrink-0 border",
                  item.status === 'SUCCESS' ? "bg-success/10 border-success/20 text-success" : 
                  item.status === 'ERROR' ? "bg-destructive/10 border-destructive/20 text-destructive" :
                  "bg-processing/10 border-processing/20 text-processing"
                )}>
                  {item.status === 'SUCCESS' && <CheckCircle2 className="h-4 w-4" />}
                  {item.status === 'ERROR' && <XCircle className="h-4 w-4" />}
                  {['PENDING', 'SIGNING', 'UPLOADING', 'REGISTERING'].includes(item.status) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-foreground">{item.file.name}</p>
                  {item.status === 'UPLOADING' ? (
                    <Progress value={item.progress} className="h-1 mt-1.5 bg-background [&>div]:bg-processing" />
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{formatBytes(item.file.size)}</p>
                  )}
                </div>
              </div>
              
              {item.status === 'ERROR' && (
                <div className="flex flex-col gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); retryUpload(item.id); }} className="text-[10px] text-primary hover:underline font-medium">Retry</button>
                  <button onClick={(e) => { e.stopPropagation(); removeUpload(item.id); }} className="text-[10px] text-destructive hover:underline font-medium">Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
