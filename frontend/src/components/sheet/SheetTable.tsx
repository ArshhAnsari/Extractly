import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getFilteredRowModel, 
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Job } from '@/types/job';
import { ExtractedRow } from '@/types/row';
import { rowsApi } from '@/lib/api/jobs';
import { EditableCell } from './EditableCell';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, AlertCircle, Search } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ExportButton } from '../export/ExportButton';

interface SheetTableProps {
  job: Job;
}

export function SheetTable({ job }: SheetTableProps) {
  const [data, setData] = useState<ExtractedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    setFetchError(null);

    const fetchRows = async () => {
      try {
        const res = await rowsApi.getRows(job.id);
        if (res.success) {
          setData(res.data);
        } else {
          setFetchError(res.error.message);
        }
      } catch (err) {
        const error = err as { error?: { message?: string }; message?: string };
        setFetchError(error?.error?.message || error?.message || 'Failed to load rows.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRows();
  }, [job.id, retryCount]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData = (_rowIndex: number, columnId: string, value: any) => {
    setData(old =>
      old.map((row, index) => {
        if (index === _rowIndex) {
          return {
            ...row,
            data: {
              ...row.data,
              [columnId]: value,
            }
          };
        }
        return row;
      })
    );
  };

  const columns = useMemo<ColumnDef<ExtractedRow>[]>(() => {
    const baseCols: ColumnDef<ExtractedRow>[] = [
      {
        id: 'filename',
        header: 'File Name',
        accessorFn: row => row.original_filename,
        cell: info => {
          const row = info.row.original;
          const isFailed = row.extraction_status === 'FAILED';
          
          return (
            <div className={`flex items-center px-3 py-2 h-full w-full ${isFailed ? 'bg-table-failed border-l-2 border-destructive' : ''}`}>
              {isFailed && (
                <Tooltip>
                  <TooltipTrigger className="mr-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  </TooltipTrigger>
                  <TooltipContent>Extraction failed for this file</TooltipContent>
                </Tooltip>
              )}
              <span className="font-mono text-sm truncate" title={info.getValue() as string}>
                {info.getValue() as string}
              </span>
            </div>
          );
        },
        size: 250,
      }
    ];

    const dynamicCols: ColumnDef<ExtractedRow>[] = job.fields_snapshot.map((field) => ({
      id: field.key,
      header: field.label,
      accessorFn: (row) => row.data[field.key],
      cell: (info) => {
        const row = info.row.original;
        const initialValue = info.getValue();
        const isNull = initialValue === null || initialValue === '' || initialValue === undefined;
        
        const cellNode = (
          <EditableCell 
            initialValue={initialValue}
            row={row}
            columnId={field.key}
            jobId={job.id}
            updateData={updateData}
            rowIndex={info.row.index}
          />
        );

        if (isNull && row.extraction_status !== 'FAILED') {
          return (
            <Tooltip>
              <TooltipTrigger className="h-full w-full">
                {cellNode}
              </TooltipTrigger>
              <TooltipContent>Field not found in CV</TooltipContent>
            </Tooltip>
          );
        }

        return <div className="h-full w-full">{cellNode}</div>;
      },
      size: 200,
    }));

    return [...baseCols, ...dynamicCols];
  }, [job.fields_snapshot, job.id]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div className="w-full h-full border border-border rounded-xl overflow-hidden bg-surface flex flex-col">
        {/* Header Skeleton */}
        <div className="flex border-b border-border bg-muted/20">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-1 p-3">
              <Skeleton className="h-5 w-24 shimmer bg-muted" />
              <Skeleton className="h-8 w-full mt-2 shimmer bg-muted" />
            </div>
          ))}
        </div>
        {/* Rows Skeleton */}
        <div className="flex-1 p-0 m-0">
          {Array.from({ length: 12 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex border-b border-border/50">
              {[1, 2, 3, 4].map(cellIndex => (
                <div key={cellIndex} className="flex-1 p-3">
                  <Skeleton className="h-4 w-3/4 shimmer bg-muted/50" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-border rounded-xl bg-surface space-y-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{fetchError}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRetryCount(c => c + 1)}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface border border-border p-4 rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search all cells..." 
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-9 w-full sm:w-[250px] bg-background border-border focus-visible:ring-primary"
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium">{data.length} rows</span>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-table-failed border border-destructive" /> Failed
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-table-null border border-border" /> Null
            </div>
          </div>
        </div>
        <div className="shrink-0 w-full sm:w-auto flex justify-end">
          <ExportButton jobId={job.id} jobName={job.name} />
        </div>
      </div>

      <div className="flex flex-col flex-1 border border-border rounded-xl bg-surface overflow-hidden shadow-sm">
        <div 
          ref={tableContainerRef}
          className="flex-1 overflow-auto w-full custom-scrollbar"
        >
          <div 
            className="grid w-full"
            style={{ 
              minWidth: table.getTotalSize(),
            }}
          >
            {/* Headers */}
            <div className="sticky top-0 z-10 grid bg-surface-elevated border-b border-border shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <div key={headerGroup.id} className="flex w-full">
                {headerGroup.headers.map(header => (
                  <div 
                    key={header.id} 
                    className="flex flex-col justify-between p-2 border-r border-border last:border-r-0"
                    style={{ width: header.getSize() }}
                  >
                    <div 
                      className="flex items-center justify-between cursor-pointer group mb-2"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="font-semibold text-sm truncate" title={header.column.columnDef.header as string}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {/* Column Filter */}
                    <Input
                      placeholder="Filter..."
                      value={(header.column.getFilterValue() ?? '') as string}
                      onChange={e => header.column.setFilterValue(e.target.value)}
                      className="h-8 text-xs bg-background border-border"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Body */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">No rows match your search.</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => { setGlobalFilter(''); setColumnFilters([]); }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={row.id}
                    className="absolute top-0 left-0 flex w-full border-b border-border/50 hover:bg-white/5 transition-colors"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <div 
                        key={cell.id} 
                        className="h-full border-r border-border last:border-r-0 overflow-hidden"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
