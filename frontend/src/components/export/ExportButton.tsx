'use client';

import { useState } from 'react';
import { jobsApi } from '@/lib/api/jobs';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  jobId: string;
  jobName: string;
}

export function ExportButton({ jobId, jobName }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setIsExporting(true);
    try {
      const blob = await jobsApi.exportJob(jobId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${jobName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message || 'Failed to export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSheetsExport = async () => {
    setIsExporting(true);
    try {
      const result = await jobsApi.exportJobToSheets(jobId);
      
      if (result.success) {
        const url = result.data.spreadsheet_url;
        toast.success('Exported to Google Sheets', {
          action: { label: 'Open', onClick: () => window.open(url, '_blank') },
          duration: 8000,
        });
      }
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      if (e?.error?.code === 'GOOGLE_NOT_CONNECTED') {
        toast.error('Google account not connected.', {
          description: 'Connect your account in Settings to export to Sheets.',
          action: {
            label: 'Settings',
            onClick: () => { window.location.href = '/dashboard/settings'; },
          },
          duration: 8000,
        });
      } else {
        toast.error(e?.error?.message || 'Failed to export to Google Sheets.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isExporting}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'bg-surface hover:bg-card',
          isExporting && 'opacity-50 pointer-events-none'
        )}
      >
        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Export <ChevronDown className="ml-2 h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover border-border">
        <DropdownMenuItem onClick={() => handleExport('xlsx')} className="cursor-pointer">
          Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')} className="cursor-pointer">
          Export as CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSheetsExport} className="cursor-pointer">
          Export to Google Sheets
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}