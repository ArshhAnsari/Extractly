export type JobStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'PARTIAL'
  | 'FAILED';

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'list';
  is_custom: boolean;
  hint?: string;
}

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  fields_snapshot: FieldDefinition[];
  total_files: number;
  done_files: number;
  failed_files: number;
  created_at: string;
  completed_at: string | null;
}
