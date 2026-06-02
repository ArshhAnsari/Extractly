export type ExtractionStatus = 'DONE' | 'FAILED';

export interface ExtractedRow {
  id: string;
  file_id: string;
  original_filename: string;
  extraction_status: ExtractionStatus;
  data: Record<string, string | number | string[] | null>;
  created_at?: string;
}
