import { useState, useEffect, useRef } from 'react';
import { ExtractedRow } from '@/types/row';
import { rowsApi } from '@/lib/api/jobs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface EditableCellProps {
  initialValue: unknown;
  row: ExtractedRow;
  columnId: string;
  jobId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: (rowIndex: number, columnId: string, value: any) => void;
  rowIndex: number;
}

export function EditableCell({ initialValue, row, columnId, jobId, updateData, rowIndex }: EditableCellProps) {
  const [value, setValue] = useState<unknown>(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const onBlur = async () => {
    setIsEditing(false);
    if (value === initialValue) return;

    setIsSaving(true);
    setIsDirty(true);
    try {
      await rowsApi.updateRow(jobId, row.id, { [columnId]: value });
      updateData(rowIndex, columnId, value);
      
      // Simulate dirty dot fading out
      setTimeout(() => {
        setIsDirty(false);
      }, 1000);
      
    } catch {
      toast.error('Failed to save. Try again.');
      setValue(initialValue); // Revert
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setValue(initialValue);
      setIsEditing(false);
    }
  };

  const isNull = initialValue === null || initialValue === '' || initialValue === undefined;
  
  // Base styling depends on row status
  let cellBgClass = 'bg-transparent';
  if (row.extraction_status === 'FAILED') {
    cellBgClass = 'bg-table-failed';
  } else if (isNull) {
    cellBgClass = 'bg-table-null';
  }

  return (
    <div 
      className={`relative flex items-center w-full h-full min-h-[40px] px-3 py-2 cursor-pointer group hover:bg-primary/5 transition-colors ${cellBgClass}`}
      onClick={() => {
        if (row.extraction_status !== 'FAILED') {
          setIsEditing(true);
        }
      }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={(value as string) || ''}
          onChange={e => setValue(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-full bg-background border-2 border-primary shadow-[0_0_10px_rgba(99,102,241,0.2)] outline-none px-2 py-1.5 text-sm rounded-md font-mono text-foreground"
        />
      ) : (
        <span className={`truncate w-full text-sm font-mono ${isNull ? 'text-muted-foreground/50 italic' : 'text-foreground'}`}>
          {isNull ? 'null' : Array.isArray(value) ? value.join(', ') : String(value)}
        </span>
      )}

      {isSaving && (
        <div className="absolute top-1 right-1">
          <Loader2 className="h-3 w-3 animate-spin text-processing" />
        </div>
      )}
      
      {!isSaving && isDirty && (
        <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-processing animate-pulse" />
      )}
    </div>
  );
}
