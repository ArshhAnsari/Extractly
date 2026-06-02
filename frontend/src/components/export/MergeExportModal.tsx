'use client';

import { useState } from 'react';
import { jobsApi } from '@/lib/api/jobs';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MergeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedJobIds: string[];
}

export function MergeExportModal({ isOpen, onClose, selectedJobIds }: MergeExportModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'sheets'>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [diffData, setDiffData] = useState<unknown>(null);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setDiffData(null);
    }, 300);
  };

  const handleExport = async (force = false) => {
    setIsExporting(true);
    try {
      if (format === 'sheets') {
        const result = await jobsApi.mergeExportToSheets(selectedJobIds, force);
        if (result.success) {
          toast.success('Exported to Google Sheets', {
            action: { label: 'Open', onClick: () => window.open(result.data.spreadsheet_url, '_blank') },
            duration: 8000,
          });
          handleClose();
        }
      } else {
        // Blob path for 'xlsx' | 'csv'
        const res = await jobsApi.mergeExport(selectedJobIds, format, force);
        if (res.status === 200) {
          const url = window.URL.createObjectURL(res.data);
          const a = document.createElement('a');
          a.href = url;
          a.download = `merged_export.${format}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
          toast.success('Merged export complete');
          handleClose();
        } else if (res.status === 409) {
          const text = await res.data.text();
          const data = JSON.parse(text);
          setDiffData(data.error?.data || data);
          setStep(2);
        } else {
          throw new Error('Export failed');
        }
      }
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      if (e?.error?.code === 'SNAPSHOT_MISMATCH') {
        // Sheets path mismatch arrives here as a thrown ApiError
        setDiffData(e.error.data || e.error);
        setStep(2);
      } else if (e?.error?.code === 'GOOGLE_NOT_CONNECTED') {
        toast.error('Google account not connected.', {
          description: 'Connect your account in Settings to export to Sheets.',
          action: {
            label: 'Settings',
            onClick: () => { window.location.href = '/dashboard/settings'; },
          },
          duration: 8000,
        });
      } else {
        toast.error(e?.error?.message || e?.message || 'Failed to export. Please try again.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] bg-surface border-border">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Merge & Export</DialogTitle>
              <DialogDescription>
                Export data from {selectedJobIds.length} jobs into a single file.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Export Format</label>
                <Select value={format} onValueChange={(v) => v && setFormat(v as 'xlsx' | 'csv' | 'sheets')}>
                  <SelectTrigger className="w-full bg-background border-border">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv">CSV (.csv)</SelectItem>
                    <SelectItem value="sheets">Google Sheets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => handleExport(false)} disabled={isExporting}>
                {isExporting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Download className="mr-2 h-4 w-4" />}
                {format === 'sheets' ? 'Export to Sheets' : 'Export Now'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center text-warning">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Schema Mismatch Detected
              </DialogTitle>
              <DialogDescription>
                The selected jobs have different extracted fields. Mismatched columns will appear empty for affected rows.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(diffData as any) && (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(diffData as any).common_fields?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Common fields (all jobs):</h4>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <p className="text-sm text-muted-foreground">{(diffData as any).common_fields.join(', ')}</p>
                    </div>
                  )}
                  {(() => {
                    const diffRecord = diffData as Record<string, unknown>;
                    return Object.entries(diffRecord)
                      .filter(([key]) => key.endsWith('_only'))
                      .map(([key, fields]) => {
                        const jobId = key.slice(4, -5);
                        const jobIndex = selectedJobIds.indexOf(jobId);
                        const label = jobIndex >= 0 ? `Job ${jobIndex + 1}` : jobId;
                        return (
                          <div key={label}>
                            <h4 className="text-sm font-medium mb-1">{label} only:</h4>
                            <p className="text-sm text-muted-foreground">{(fields as string[]).join(', ')}</p>
                          </div>
                        );
                      });
                  })()}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => handleExport(true)} disabled={isExporting}>
                {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Proceed Anyway
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}